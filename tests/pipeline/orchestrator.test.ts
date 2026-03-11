jest.mock('../../src/discovery/projectDiscovery');
jest.mock('fs');

import * as fs from 'fs';
import { discoverProject } from '../../src/discovery/projectDiscovery';
import { runPipeline, createPipelineContext } from '../../src/pipeline/orchestrator';

const mockDiscoverProject = discoverProject as jest.MockedFunction<typeof discoverProject>;
const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;
const mockStatSync = fs.statSync as jest.MockedFunction<typeof fs.statSync>;

// ─── shared setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  mockDiscoverProject.mockReturnValue({
    projectRoot: '/fake/project',
    allFiles: [],
    specs: [],
    testFiles: [],
    featureFiles: [],
    contractFiles: [],
    performanceFiles: [],
    securityReportFiles: [],
    serviceFiles: [],
    languages: [],
    frameworks: [],
    discoverySource: {
      specs: 'discovered',
      testFiles: 'discovered',
      featureFiles: 'discovered',
      contractFiles: 'discovered',
      performanceFiles: 'discovered',
      securityReportFiles: 'discovered',
      serviceFiles: 'discovered',
    },
  });

  // No manifest files, no IAST/DAST files on disk
  mockExistsSync.mockReturnValue(false);
});

// ─── createPipelineContext ────────────────────────────────────────────────────

describe('createPipelineContext', () => {
  it('returns a valid context with required fields', () => {
    const ctx = createPipelineContext('/fake/project');

    expect(ctx.projectRoot).toBe('/fake/project');
    expect(ctx.config).toBeDefined();
    expect(ctx.graph).toBeDefined();
    expect(ctx.diagnostics).toBeInstanceOf(Map);
    expect(ctx.stageOutputs).toBeInstanceOf(Map);
  });

  it('merges overrides while preserving other defaults', () => {
    const ctx = createPipelineContext('/fake/project', { traversalDepthCap: 10 });

    expect(ctx.config.traversalDepthCap).toBe(10);
    // Other defaults are preserved
    expect(ctx.config.enableIast).toBe(false);
    expect(ctx.config.enableDast).toBe(false);
    expect(ctx.config.dastRateLimit).toBe(10);
    expect(ctx.config.fileTimeoutMs).toBe(30_000);
  });
});

// ─── runPipeline ─────────────────────────────────────────────────────────────

describe('runPipeline', () => {
  it('executes all mandatory stages and returns expected output shape', async () => {
    const result = await runPipeline({ projectRoot: '/fake/project', silent: true });

    expect(result.output).toBeDefined();
    expect(result.output.graph).toBeDefined();
    expect(result.output.sections).toBeDefined();
    expect(result.output.diagnostics).toBeDefined();
    expect(result.output.summary).toBeDefined();
  });

  it('records diagnostics for each mandatory stage', async () => {
    const result = await runPipeline({ projectRoot: '/fake/project', silent: true });

    const diagKeys = Object.keys(result.output.diagnostics);
    expect(diagKeys).toContain('sca');
    expect(diagKeys).toContain('ast');
    expect(diagKeys).toContain('tia');
    expect(diagKeys).toContain('merge');
  });

  it('skips IAST/DAST diagnostics when not enabled', async () => {
    const result = await runPipeline({ projectRoot: '/fake/project', silent: true });

    const diagKeys = Object.keys(result.output.diagnostics);
    expect(diagKeys).not.toContain('iast');
    expect(diagKeys).not.toContain('dast');
  });

  it('includes IAST/DAST diagnostics when enabled', async () => {
    const result = await runPipeline({
      projectRoot: '/fake/project',
      silent: true,
      config: { enableIast: true, enableDast: true },
    });

    const diagKeys = Object.keys(result.output.diagnostics);
    expect(diagKeys).toContain('iast');
    expect(diagKeys).toContain('dast');
  });

  it('returns timing information', async () => {
    const result = await runPipeline({ projectRoot: '/fake/project', silent: true });

    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.stagesDurationMs).toBeDefined();
    expect(Object.keys(result.stagesDurationMs).length).toBeGreaterThan(0);
  });

  it('returns a well-formed PipelineOutput', async () => {
    const result = await runPipeline({ projectRoot: '/fake/project', silent: true });

    const { output } = result;

    // Graph shape
    expect(Array.isArray(output.graph.nodes)).toBe(true);
    expect(Array.isArray(output.graph.edges)).toBe(true);

    // Sections shape
    expect(Array.isArray(output.sections.endpoints)).toBe(true);

    // Summary shape
    expect(typeof output.summary.totalEndpoints).toBe('number');
  });
});
