/**
 * TIA (Test Impact Analysis) stage — Stage 3 of the pipeline.
 *
 * Implements:
 * - Test layer classification (7 layers)
 * - Mock boundary detection
 * - Parameterized test expansion
 * - Test-to-endpoint mapping
 *
 * The TIA stage reads the AST stage output from context.stageOutputs
 * to get semantic models and the knowledge graph.
 */

import type { PipelineStage, PipelineContext } from '../../stageInterface';
import type { StageDiagnostics, GraphNode, GraphEdge } from '../../types';
import type { TiaOutput } from './types';
import type { AstStageOutput } from '../ast/types';
import type { ScaOutput } from '../sca/types';
import { classifyTestLayer } from './testLayerClassifier';
import { detectMockBoundaries } from './mockBoundaryDetector';
import { expandParameterizedTests } from './parameterizedTestExpander';
import { mapTestsToEndpoints } from './testEndpointMapper';
import { isTestFile } from '../../../discovery/fileClassifier';
import * as fs from 'fs';
import * as path from 'path';

export class TiaStage implements PipelineStage<TiaOutput> {
  readonly name = 'tia' as const;
  readonly optional = false;

  async execute(context: PipelineContext): Promise<TiaOutput> {
    const startTime = Date.now();
    const filesScanned: string[] = [];
    const filesSkipped: Array<{ file: string; reason: string }> = [];

    // Get upstream outputs
    const astOutput = context.stageOutputs.get('ast') as AstStageOutput | undefined;
    const scaOutput = context.stageOutputs.get('sca') as ScaOutput | undefined;

    // Collect test files from AST models or discover
    const testFiles: string[] = [];
    if (astOutput) {
      for (const [filePath] of astOutput.models) {
        if (isTestFile(path.basename(filePath))) {
          testFiles.push(filePath);
        }
      }
    }

    const output: TiaOutput = {
      classifications: [],
      mockBoundaries: [],
      parameterizedTests: [],
      testEndpointMappings: [],
    };

    // 1. Classify test layers
    for (const testFile of testFiles) {
      let content: string | undefined;
      try {
        content = fs.readFileSync(testFile, 'utf-8');
      } catch {
        filesSkipped.push({ file: testFile, reason: 'read-error' });
        continue;
      }

      filesScanned.push(testFile);
      const classification = classifyTestLayer(testFile, content);
      output.classifications.push(classification);

      // 2. Detect mock boundaries
      const language = detectLanguageFromPath(testFile);
      const boundaries = detectMockBoundaries(testFile, content, language);
      output.mockBoundaries.push(...boundaries);

      // 3. Expand parameterized tests (RULE-07)
      const paramTests = expandParameterizedTests(testFile, content, language);
      output.parameterizedTests.push(...paramTests);
    }

    // 4. Map tests to endpoints
    output.testEndpointMappings = mapTestsToEndpoints(context.graph, testFiles);

    // 5. Populate graph with TIA-discovered nodes

    // Add mock-boundary nodes
    for (const boundary of output.mockBoundaries) {
      const nodeId = `mock-boundary:${boundary.testFilePath}:${boundary.mockedTarget}:${boundary.line ?? 0}`;
      if (!context.graph.hasNode(nodeId)) {
        const node: GraphNode = {
          id: nodeId,
          type: 'mock-boundary',
          label: `Mock: ${boundary.mockedTarget}`,
          sourceStage: 'tia',
          filePath: boundary.testFilePath,
          line: boundary.line,
          metadata: {
            mockingLibrary: boundary.mockingLibrary,
            mockType: boundary.mockType,
            mockedTarget: boundary.mockedTarget,
          },
        };
        context.graph.addNode(node);

        // Add 'mocks' edge from test file to mock boundary
        const fileNodeId = `file:${boundary.testFilePath}`;
        if (context.graph.hasNode(fileNodeId)) {
          const edgeId = `${fileNodeId}->mocks->${nodeId}`;
          if (!context.graph.hasEdge(edgeId)) {
            context.graph.addEdge({
              id: edgeId,
              type: 'mocks',
              sourceNodeId: fileNodeId,
              targetNodeId: nodeId,
              sourceStage: 'tia',
              metadata: { mockType: boundary.mockType },
            });
          }
        }
      }
    }

    // Add param-variant nodes (RULE-07: counted as N variants, not 1)
    for (const paramTest of output.parameterizedTests) {
      const nodeId = `param-variant:${paramTest.testFilePath}:${paramTest.testName}`;
      if (!context.graph.hasNode(nodeId)) {
        const node: GraphNode = {
          id: nodeId,
          type: 'param-variant',
          label: `${paramTest.testName} (${paramTest.variantCount} variants)`,
          sourceStage: 'tia',
          filePath: paramTest.testFilePath,
          line: paramTest.line,
          metadata: {
            variantCount: paramTest.variantCount,
            pattern: paramTest.pattern,
          },
        };
        context.graph.addNode(node);

        // Add 'param-expands-to' edge from test file
        const fileNodeId = `file:${paramTest.testFilePath}`;
        if (context.graph.hasNode(fileNodeId)) {
          const edgeId = `${fileNodeId}->param-expands-to->${nodeId}`;
          if (!context.graph.hasEdge(edgeId)) {
            context.graph.addEdge({
              id: edgeId,
              type: 'param-expands-to',
              sourceNodeId: fileNodeId,
              targetNodeId: nodeId,
              sourceStage: 'tia',
              metadata: {},
            });
          }
        }
      }
    }

    // Record diagnostics (RULE-12)
    const diagnostics: StageDiagnostics = {
      stageName: 'tia',
      filesScanned,
      filesSkipped,
      durationMs: Date.now() - startTime,
      metadata: {
        testFilesClassified: output.classifications.length,
        mockBoundariesDetected: output.mockBoundaries.length,
        parameterizedTestsExpanded: output.parameterizedTests.length,
        testEndpointMappings: output.testEndpointMappings.length,
        layerDistribution: countByLayer(output.classifications),
      },
    };
    context.diagnostics.set('tia', diagnostics);

    context.stageOutputs.set('tia', output);
    return output;
  }
}

function detectLanguageFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript',
    '.java': 'java', '.kt': 'kotlin', '.kts': 'kotlin',
    '.py': 'python', '.rb': 'ruby',
  };
  return map[ext] ?? 'unknown';
}

function countByLayer(
  classifications: Array<{ layer: string }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of classifications) {
    counts[c.layer] = (counts[c.layer] ?? 0) + 1;
  }
  return counts;
}
