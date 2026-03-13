/**
 * SCA (Software Composition Analysis) stage — Stage 1 of the coverage pipeline.
 *
 * Wraps the existing discovery engine and adds:
 * - Manifest file parsing for dependency extraction
 * - Dependency classification into categories
 * - CI platform detection
 * - Graph population with `dependency` nodes and `depends-on` edges
 *
 * This stage runs first so that downstream stages (AST, TIA) can use the
 * ScaOutput to select correct analysis heuristics (e.g. which HTTP client
 * patterns to detect, which assertion libraries to recognize).
 */

import type { PipelineStage, PipelineContext } from '../../stageInterface';
import type { StageDiagnostics, GraphNode, GraphEdge } from '../../types';
import type { ScaOutput, ParsedDependency } from './types';
import { detectDependencies } from './dependencyDetector';
import { classifyDependency } from './dependencyClassification';
import { detectCiPlatform } from './ciDetector';
import { discoverProject } from '../../../discovery/projectDiscovery';

export class ScaStage implements PipelineStage<ScaOutput> {
  readonly name = 'sca' as const;
  readonly optional = false;

  async execute(context: PipelineContext): Promise<ScaOutput> {
    const startTime = Date.now();
    const filesScanned: string[] = [];
    const filesSkipped: Array<{ file: string; reason: string }> = [];

    // 1. Run the existing discovery engine
    const artifacts = discoverProject({ rootDir: context.projectRoot });

    // 2. Parse manifest files for dependencies
    const depResult = detectDependencies(context.projectRoot);
    filesScanned.push(...depResult.manifestFiles);

    // 3. Classify dependencies by category
    const httpClients: string[] = [];
    const testFrameworks: string[] = [];
    const assertionLibraries: string[] = [];
    const mockingLibraries: string[] = [];
    const securityLibraries: string[] = [];
    const performanceTools: string[] = [];
    const e2eFrameworks: string[] = [];
    const frameworksDeps: string[] = [];
    const dependencyVersions: Record<string, string> = {};

    for (const dep of depResult.dependencies) {
      // Store version (use short name for display, e.g. artifactId for Maven)
      const shortName = getShortDependencyName(dep);
      dependencyVersions[shortName] = dep.version;

      // Classify
      const category = classifyDependency(shortName);

      switch (category) {
        case 'httpClient':
          addUnique(httpClients, shortName);
          break;
        case 'testFramework':
          addUnique(testFrameworks, shortName);
          break;
        case 'assertionLibrary':
          addUnique(assertionLibraries, shortName);
          break;
        case 'mockingLibrary':
          addUnique(mockingLibraries, shortName);
          break;
        case 'securityLibrary':
          addUnique(securityLibraries, shortName);
          break;
        case 'performanceTool':
          addUnique(performanceTools, shortName);
          break;
        case 'e2eFramework':
          addUnique(e2eFrameworks, shortName);
          break;
        case 'framework':
          addUnique(frameworksDeps, shortName);
          break;
      }
    }

    // 4. Merge discovery-detected languages and frameworks with dependency-detected ones
    // DetectedLanguage and DetectedFramework are string literal unions, not objects
    const languages = artifacts.languages as string[];
    const frameworks = mergeStrings(
      artifacts.frameworks as string[],
      frameworksDeps,
    );

    // Also enrich test frameworks from discovery's framework detection
    for (const f of artifacts.frameworks) {
      const name = (f as string).toLowerCase();
      if (
        ['jest', 'mocha', 'pytest', 'unittest', 'junit', 'testng', 'rspec', 'minitest'].includes(name)
      ) {
        addUnique(testFrameworks, name);
      }
      if (['cypress', 'playwright', 'cucumber', 'selenium'].includes(name)) {
        addUnique(e2eFrameworks, name);
      }
    }

    // 5. Detect CI platform
    const ciPlatform = detectCiPlatform(context.projectRoot);

    // 6. Populate the graph with dependency nodes
    for (const dep of depResult.dependencies) {
      const shortName = getShortDependencyName(dep);
      const nodeId = `dep:${shortName}`;

      // Skip if already added (avoid duplicates from different manifest files)
      if (context.graph.hasNode(nodeId)) continue;

      const node: GraphNode = {
        id: nodeId,
        type: 'dependency',
        label: shortName,
        sourceStage: 'sca',
        metadata: {
          version: dep.version,
          scope: dep.scope,
          category: classifyDependency(shortName),
          sourceFile: dep.sourceFile,
          fullName: dep.name,
        },
      };
      context.graph.addNode(node);
    }

    // Add file-level nodes for each manifest
    for (const manifest of depResult.manifestFiles) {
      const fileNodeId = `file:${manifest}`;
      if (!context.graph.hasNode(fileNodeId)) {
        const fileNode: GraphNode = {
          id: fileNodeId,
          type: 'file',
          label: manifest,
          sourceStage: 'sca',
          filePath: manifest,
          metadata: { fileType: 'manifest' },
        };
        context.graph.addNode(fileNode);
      }

      // Add depends-on edges from manifest to each dependency declared in it
      for (const dep of depResult.dependencies) {
        if (dep.sourceFile !== manifest) continue;
        const shortName = getShortDependencyName(dep);
        const depNodeId = `dep:${shortName}`;
        const edgeId = `${fileNodeId}->depends-on->${depNodeId}`;
        if (!context.graph.hasEdge(edgeId)) {
          const edge: GraphEdge = {
            id: edgeId,
            type: 'depends-on',
            sourceNodeId: fileNodeId,
            targetNodeId: depNodeId,
            sourceStage: 'sca',
            metadata: { scope: dep.scope },
          };
          context.graph.addEdge(edge);
        }
      }
    }

    // 7. Record diagnostics
    const diagnostics: StageDiagnostics = {
      stageName: 'sca',
      filesScanned,
      filesSkipped,
      durationMs: Date.now() - startTime,
      metadata: {
        totalDependencies: depResult.dependencies.length,
        manifestFiles: depResult.manifestFiles,
        ciPlatform,
        discoveredLanguages: languages,
        discoveredFrameworks: frameworks,
      },
    };
    context.diagnostics.set('sca', diagnostics);

    // 8. Build and return output
    const output: ScaOutput = {
      languages,
      frameworks,
      httpClients,
      testFrameworks,
      assertionLibraries,
      securityLibraries,
      performanceTools,
      mockingLibraries,
      e2eFrameworks,
      dependencyVersions,
      ciPlatform,
    };

    context.stageOutputs.set('sca', output);
    return output;
  }
}

/**
 * Extract a short dependency name for classification and display.
 * For Maven-style names (group:artifact), returns just the artifact.
 * For npm scoped packages (@scope/name), returns the full scoped name.
 */
function getShortDependencyName(dep: ParsedDependency): string {
  const name = dep.name;

  // Maven: "org.mockito:mockito-core" → "mockito-core"
  if (name.includes(':')) {
    const parts = name.split(':');
    return parts[parts.length - 1];
  }

  return name;
}

function addUnique(arr: string[], item: string): void {
  if (!arr.includes(item)) {
    arr.push(item);
  }
}

function mergeStrings(a: string[], b: string[]): string[] {
  const set = new Set<string>(a);
  for (const item of b) set.add(item);
  return Array.from(set);
}
