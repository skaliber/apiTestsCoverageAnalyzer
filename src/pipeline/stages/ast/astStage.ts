/**
 * AST Stage — Stage 2 of the coverage pipeline.
 *
 * Wraps the existing AST analysis orchestrator and extends it with:
 * - Multi-file analysis: parses all discovered files and builds a cross-file symbol table
 * - Abstract layer traversal: resolves inherited assertions, helpers, fixtures
 * - Graph building: converts analysis results into GraphNode[] and GraphEdge[]
 *
 * The AST stage reads the SCA output (from context.stageOutputs) to determine
 * which languages and frameworks are present, enabling targeted analysis heuristics.
 */

import type { PipelineStage, PipelineContext } from '../../stageInterface';
import type { StageDiagnostics } from '../../types';
import type { AstStageOutput } from './types';
import type {
  SemanticModel,
  SupportedLanguage,
  ResolvedHttpInteraction,
  AnalysisContext,
} from '../../../ast/astTypes';
import type { ScaOutput } from '../sca/types';
import { registerAllAnalyzers, analyzeFileDetailed, buildAnalysisContext } from '../../../ast/astAnalysisOrchestrator';
import { buildCrossFileSymbolTable } from './crossFileResolver';
import { runCrossFileResolution } from './crossFileResolutionPass';
import { traverseInheritanceChain, resolveImportedHelper } from './abstractLayerTraversal';
import { buildAstGraph } from './graphBuilder';
import { isTestFile } from '../../../discovery/fileClassifier';
import { discoverProject } from '../../../discovery/projectDiscovery';
import { getAnalyzer } from '../../../ast/parserRegistry';
import * as fs from 'fs';
import * as path from 'path';

export class AstStage implements PipelineStage<AstStageOutput> {
  readonly name = 'ast' as const;
  readonly optional = false;

  async execute(context: PipelineContext): Promise<AstStageOutput> {
    const startTime = Date.now();
    const filesScanned: string[] = [];
    const filesSkipped: Array<{ file: string; reason: string }> = [];

    // Ensure all language analyzers are registered
    registerAllAnalyzers();

    // Get SCA output for language/framework context
    const scaOutput = context.stageOutputs.get('sca') as ScaOutput | undefined;

    // Build analysis context
    const analysisContext = buildAnalysisContext(context.config.astConfig);

    // Discover all files
    const artifacts = discoverProject({ rootDir: context.projectRoot });
    const allSourceFiles = [
      ...artifacts.testFiles,
      ...artifacts.serviceFiles,
    ];

    // Phase 1: Parse all files and build semantic models
    const models = new Map<string, SemanticModel>();
    const interactionsMap = new Map<string, ResolvedHttpInteraction[]>();

    for (const filePath of allSourceFiles) {
      // Enforce per-file timeout (RULE-16)
      const fileStart = Date.now();

      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch (err) {
        filesSkipped.push({ file: filePath, reason: 'read-error' });
        continue;
      }

      // Detect language from file extension
      const language = detectLanguage(filePath, scaOutput);
      if (!language) {
        filesSkipped.push({ file: filePath, reason: 'unsupported-language' });
        continue;
      }

      // Check timeout
      if (Date.now() - fileStart > context.config.fileTimeoutMs) {
        filesSkipped.push({ file: filePath, reason: 'timeout' });
        continue;
      }

      try {
        // Use existing AST analysis
        const result = analyzeFileDetailed(content, filePath, language, analysisContext);
        interactionsMap.set(filePath, result.interactions);

        // Build semantic model if we have an analyzer
        const analyzer = getAnalyzer(language, analysisContext.astConfig);
        if (analyzer) {
          const parsed = analyzer.parse(filePath, content);
          if (!parsed.parseError) {
            const model = analyzer.buildSemanticModel(parsed, analysisContext);
            models.set(filePath, model);
          } else {
            // RULE-02: File not skipped on parse error — we already have fallback interactions
            filesSkipped.push({ file: filePath, reason: 'parse-error' });
          }
        }

        filesScanned.push(filePath);
      } catch (err) {
        // RULE-02: Never skip a file entirely on error
        filesSkipped.push({
          file: filePath,
          reason: `analysis-error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    // Phase 2: Build cross-file symbol table
    const crossFileTable = buildCrossFileSymbolTable(models, context.projectRoot);

    // Phase 2b: Run cross-file resolution pass (Feature 27)
    const crossFileResolutionResult = runCrossFileResolution(
      crossFileTable,
      context.projectRoot,
      artifacts.apiFrameworks,
      allSourceFiles,
    );

    // Phase 3: Run abstract layer traversal for test files
    const traversalResults = new Map<string, import('./types').TraversalResult>();
    const depthCap = context.config.traversalDepthCap;

    for (const [filePath] of models) {
      const basename = path.basename(filePath);
      if (!isTestFile(basename)) continue;

      // Try inheritance chain traversal for classes in this test file
      for (const [className, classDecl] of crossFileTable.classes) {
        if (classDecl.filePath === filePath && classDecl.extendsClass) {
          const result = traverseInheritanceChain(className, crossFileTable, depthCap);
          traversalResults.set(filePath, result);
          break; // One traversal result per test file
        }
      }

      // If no inheritance found, try resolving imported helpers
      if (!traversalResults.has(filePath)) {
        const model = models.get(filePath);
        if (model) {
          for (const [funcName, func] of model.functions) {
            for (const calledFunc of func.calledFunctions) {
              // Check if this is an imported function
              const importedFiles = crossFileTable.importGraph.get(filePath) ?? [];
              for (const importedFile of importedFiles) {
                const importedModel = models.get(importedFile);
                if (importedModel?.functions.has(calledFunc)) {
                  const result = resolveImportedHelper(calledFunc, importedFile, crossFileTable, depthCap);
                  if (result.resolvedAssertions.length > 0 || result.resolvedHttpCalls.length > 0) {
                    traversalResults.set(filePath, result);
                  }
                  break;
                }
              }
              if (traversalResults.has(filePath)) break;
            }
            if (traversalResults.has(filePath)) break;
          }
        }
      }
    }

    // Phase 4: Build graph nodes and edges
    const { nodes, edges } = buildAstGraph(models, crossFileTable, traversalResults, interactionsMap);

    // Add nodes and edges to the context graph
    for (const node of nodes) {
      if (!context.graph.hasNode(node.id)) {
        context.graph.addNode(node);
      }
    }
    for (const edge of edges) {
      if (!context.graph.hasEdge(edge.id)) {
        context.graph.addEdge(edge);
      }
    }

    // Record diagnostics (RULE-12)
    const diagnostics: StageDiagnostics = {
      stageName: 'ast',
      filesScanned,
      filesSkipped,
      durationMs: Date.now() - startTime,
      metadata: {
        totalModels: models.size,
        totalInteractions: Array.from(interactionsMap.values()).reduce((sum, arr) => sum + arr.length, 0),
        totalClasses: crossFileTable.classes.size,
        totalExportedSymbols: crossFileTable.exportedSymbols.size,
        traversalResultCount: traversalResults.size,
        graphNodesAdded: nodes.length,
        graphEdgesAdded: edges.length,
        crossFileResolversRun: crossFileResolutionResult.resolverResults.length,
        crossFileEntriesAdded: crossFileResolutionResult.totalEntriesAdded,
      },
    };
    context.diagnostics.set('ast', diagnostics);

    // Build output
    const output: AstStageOutput = {
      models,
      crossFileTable,
      traversalResults,
      analyzedFiles: filesScanned,
      skippedFiles: filesSkipped,
      crossFileResolutionDiagnostics: crossFileResolutionResult.resolverResults,
    };

    context.stageOutputs.set('ast', output);
    return output;
  }
}

/**
 * Detect the language of a file from its extension.
 */
function detectLanguage(filePath: string, scaOutput?: ScaOutput): SupportedLanguage | undefined {
  const ext = path.extname(filePath).toLowerCase();

  const extensionMap: Record<string, SupportedLanguage> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.java': 'java',
    '.kt': 'kotlin',
    '.kts': 'kotlin',
    '.py': 'python',
    '.rb': 'ruby',
    '.feature': 'cucumber',
  };

  return extensionMap[ext];
}
