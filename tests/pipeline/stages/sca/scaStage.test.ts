jest.mock('../../../../src/discovery/projectDiscovery');
jest.mock('../../../../src/pipeline/stages/sca/dependencyDetector');
jest.mock('../../../../src/pipeline/stages/sca/ciDetector');

import { ScaStage } from '../../../../src/pipeline/stages/sca/scaStage';
import { CoverageKnowledgeGraph } from '../../../../src/pipeline/graph';
import type { PipelineContext } from '../../../../src/pipeline/stageInterface';
import type { ScaOutput, ParsedDependency, DependencyParseResult } from '../../../../src/pipeline/stages/sca/types';
import { discoverProject } from '../../../../src/discovery/projectDiscovery';
import type { DetectedLanguage, DetectedFramework } from '../../../../src/discovery/projectDiscovery';
import { detectDependencies } from '../../../../src/pipeline/stages/sca/dependencyDetector';
import { detectCiPlatform } from '../../../../src/pipeline/stages/sca/ciDetector';

const mockDiscoverProject = discoverProject as jest.MockedFunction<typeof discoverProject>;
const mockDetectDependencies = detectDependencies as jest.MockedFunction<typeof detectDependencies>;
const mockDetectCiPlatform = detectCiPlatform as jest.MockedFunction<typeof detectCiPlatform>;

function buildContext(): PipelineContext {
  return {
    projectRoot: '/fake/project',
    config: {
      projectRoot: '/fake/project',
      enableIast: false,
      enableDast: false,
      dastRateLimit: 10,
      traversalDepthCap: 5,
      fileTimeoutMs: 30000,
    },
    graph: new CoverageKnowledgeGraph(),
    diagnostics: new Map(),
    stageOutputs: new Map(),
  };
}

function buildDiscoveryResult(
  languages: DetectedLanguage[] = [],
  frameworks: DetectedFramework[] = [],
) {
  return {
    projectRoot: '/fake/project',
    allFiles: [],
    specs: [],
    testFiles: [],
    featureFiles: [],
    contractFiles: [],
    performanceFiles: [],
    securityReportFiles: [],
    serviceFiles: [],
    languages,
    frameworks,
    discoverySource: {
      specs: 'discovered' as const,
      testFiles: 'discovered' as const,
      featureFiles: 'discovered' as const,
      contractFiles: 'discovered' as const,
      performanceFiles: 'discovered' as const,
      securityReportFiles: 'discovered' as const,
      serviceFiles: 'discovered' as const,
    },
  };
}

function makeDep(
  name: string,
  version: string,
  scope: ParsedDependency['scope'],
  sourceFile: string,
): ParsedDependency {
  return { name, version, scope, sourceFile };
}

describe('ScaStage', () => {
  let stage: ScaStage;

  beforeEach(() => {
    stage = new ScaStage();
    jest.clearAllMocks();
  });

  // ─── Stage properties ──────────────────────────────────────────────────

  describe('stage properties', () => {
    it('should have name "sca"', () => {
      expect(stage.name).toBe('sca');
    });

    it('should not be optional', () => {
      expect(stage.optional).toBe(false);
    });
  });

  // ─── Node.js project ──────────────────────────────────────────────────

  describe('Node.js project', () => {
    it('should produce correct ScaOutput for a JavaScript/TypeScript project', async () => {
      mockDiscoverProject.mockReturnValue(
        buildDiscoveryResult(['javascript', 'typescript'], ['jest']),
      );
      mockDetectDependencies.mockReturnValue({
        dependencies: [
          makeDep('express', '^4.18.0', 'production', 'package.json'),
          makeDep('jest', '^29.0.0', 'development', 'package.json'),
          makeDep('axios', '^1.6.0', 'production', 'package.json'),
          makeDep('supertest', '^6.3.0', 'development', 'package.json'),
          makeDep('cypress', '^13.0.0', 'development', 'package.json'),
        ],
        manifestFiles: ['package.json'],
      });
      mockDetectCiPlatform.mockReturnValue('github-actions');

      const ctx = buildContext();
      const output = await stage.execute(ctx);

      expect(output.languages).toContain('javascript');
      expect(output.languages).toContain('typescript');
      expect(output.frameworks).toContain('express');
      expect(output.httpClients).toContain('axios');
      expect(output.testFrameworks).toContain('jest');
      expect(output.testFrameworks).toContain('supertest');
      expect(output.e2eFrameworks).toContain('cypress');
      expect(output.ciPlatform).toBe('github-actions');
      expect(output.dependencyVersions['express']).toBe('^4.18.0');
      expect(output.dependencyVersions['axios']).toBe('^1.6.0');
    });
  });

  // ─── Java project ─────────────────────────────────────────────────────

  describe('Java project', () => {
    it('should produce correct ScaOutput for a Java/Maven project', async () => {
      mockDiscoverProject.mockReturnValue(
        buildDiscoveryResult(['java'], ['junit']),
      );
      mockDetectDependencies.mockReturnValue({
        dependencies: [
          makeDep('org.springframework.boot:spring-boot-starter-web', '3.1.0', 'production', 'pom.xml'),
          makeDep('org.mockito:mockito-core', '5.3.0', 'test', 'pom.xml'),
          makeDep('org.assertj:assertj-core', '3.24.0', 'test', 'pom.xml'),
        ],
        manifestFiles: ['pom.xml'],
      });
      mockDetectCiPlatform.mockReturnValue('jenkins');

      const ctx = buildContext();
      const output = await stage.execute(ctx);

      expect(output.languages).toContain('java');
      expect(output.frameworks).toContain('spring-boot-starter-web');
      expect(output.mockingLibraries).toContain('mockito-core');
      expect(output.assertionLibraries).toContain('assertj-core');
      expect(output.ciPlatform).toBe('jenkins');
      expect(output.testFrameworks).toContain('junit');
      expect(output.dependencyVersions['spring-boot-starter-web']).toBe('3.1.0');
    });
  });

  // ─── Graph population ─────────────────────────────────────────────────

  describe('graph population', () => {
    it('should add dependency nodes and depends-on edges to the graph', async () => {
      mockDiscoverProject.mockReturnValue(
        buildDiscoveryResult(['javascript'], []),
      );
      mockDetectDependencies.mockReturnValue({
        dependencies: [
          makeDep('express', '^4.18.0', 'production', 'package.json'),
          makeDep('jest', '^29.0.0', 'development', 'package.json'),
        ],
        manifestFiles: ['package.json'],
      });
      mockDetectCiPlatform.mockReturnValue('none');

      const ctx = buildContext();
      await stage.execute(ctx);

      // Check dependency nodes exist
      expect(ctx.graph.hasNode('dep:express')).toBe(true);
      expect(ctx.graph.hasNode('dep:jest')).toBe(true);

      // Check file node exists
      expect(ctx.graph.hasNode('file:package.json')).toBe(true);

      // Check dependency node metadata
      const expressNode = ctx.graph.getNode('dep:express')!;
      expect(expressNode.type).toBe('dependency');
      expect(expressNode.sourceStage).toBe('sca');
      expect(expressNode.metadata.version).toBe('^4.18.0');
      expect(expressNode.metadata.scope).toBe('production');

      // Check depends-on edges
      const edges = ctx.graph.getEdgesByType('depends-on');
      expect(edges.length).toBeGreaterThanOrEqual(2);

      const expressEdge = edges.find((e) => e.targetNodeId === 'dep:express')!;
      expect(expressEdge).toBeDefined();
      expect(expressEdge.sourceNodeId).toBe('file:package.json');
      expect(expressEdge.type).toBe('depends-on');
    });
  });

  // ─── Diagnostics ──────────────────────────────────────────────────────

  describe('diagnostics', () => {
    it('should populate context.diagnostics with SCA entry', async () => {
      mockDiscoverProject.mockReturnValue(
        buildDiscoveryResult(['typescript'], ['jest']),
      );
      mockDetectDependencies.mockReturnValue({
        dependencies: [
          makeDep('express', '^4.18.0', 'production', 'package.json'),
        ],
        manifestFiles: ['package.json'],
      });
      mockDetectCiPlatform.mockReturnValue('github-actions');

      const ctx = buildContext();
      await stage.execute(ctx);

      expect(ctx.diagnostics.has('sca')).toBe(true);

      const diag = ctx.diagnostics.get('sca')!;
      expect(diag.stageName).toBe('sca');
      expect(diag.filesScanned).toContain('package.json');
      expect(typeof diag.durationMs).toBe('number');
      expect(diag.durationMs).toBeGreaterThanOrEqual(0);
      expect(diag.metadata.totalDependencies).toBe(1);
      expect(diag.metadata.ciPlatform).toBe('github-actions');
      expect(diag.metadata.manifestFiles).toEqual(['package.json']);
      expect(diag.metadata.discoveredLanguages).toContain('typescript');
    });
  });

  // ─── Empty project ────────────────────────────────────────────────────

  describe('empty project', () => {
    it('should return valid output with empty arrays when no deps found', async () => {
      mockDiscoverProject.mockReturnValue(
        buildDiscoveryResult([], []),
      );
      mockDetectDependencies.mockReturnValue({
        dependencies: [],
        manifestFiles: [],
      });
      mockDetectCiPlatform.mockReturnValue('none');

      const ctx = buildContext();
      const output = await stage.execute(ctx);

      expect(output.languages).toEqual([]);
      expect(output.frameworks).toEqual([]);
      expect(output.httpClients).toEqual([]);
      expect(output.testFrameworks).toEqual([]);
      expect(output.assertionLibraries).toEqual([]);
      expect(output.mockingLibraries).toEqual([]);
      expect(output.securityLibraries).toEqual([]);
      expect(output.performanceTools).toEqual([]);
      expect(output.e2eFrameworks).toEqual([]);
      expect(output.dependencyVersions).toEqual({});
      expect(output.ciPlatform).toBe('none');
    });
  });

  // ─── stageOutputs registration ────────────────────────────────────────

  describe('stageOutputs registration', () => {
    it('should store the output in context.stageOutputs under "sca"', async () => {
      mockDiscoverProject.mockReturnValue(
        buildDiscoveryResult([], []),
      );
      mockDetectDependencies.mockReturnValue({
        dependencies: [],
        manifestFiles: [],
      });
      mockDetectCiPlatform.mockReturnValue('none');

      const ctx = buildContext();
      const output = await stage.execute(ctx);

      expect(ctx.stageOutputs.has('sca')).toBe(true);
      expect(ctx.stageOutputs.get('sca')).toBe(output);
    });
  });
});
