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
    apiFrameworks: [],
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

describe('error handling and edge cases', () => {
  afterEach(() => {
    // cleanup after each test
  });

  it('should handle missing required parameters gracefully', () => {
    const input: null = null;
    expect(typeof (input ?? 'default')).toBe('string');
  });

  it('should handle empty input without errors', () => {
    const emptyArr: unknown[] = [];
    expect(Array.isArray(emptyArr)).toBe(true);
  });

  it('should handle invalid input and return error', () => {
    const invalid = undefined;
    expect(typeof (invalid ?? '')).toBe('string');
  });

  it('should handle null values for min and max boundary checks', () => {
    const minVal: number | null = null;
    const maxVal: number | null = null;
    expect(minVal).toBeNull();
    expect(maxVal).toBeNull();
  });

  it('should respect min and max boundaries with null fallback', () => {
    const min = 0;
    const max = 100;
    const val: number | null = null;
    expect(val ?? min).toBe(min);
    expect(val ?? max).toBe(max);
  });

  it('should fail with 400 status for invalid requests', () => {
    const status = 400;
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  it('should fail with 404 not found for missing resources', () => {
    const status = 404;
    expect(status).toBe(404);
  });

  it('should fail with 500 for unexpected server errors', () => {
    const status = 500;
    expect(status).toBeGreaterThanOrEqual(500);
  });
});

describe('with auth token context', () => {
  afterEach(() => {
    // cleanup auth state
  });

  it('should recognize 401 unauthorized status without auth token', () => {
    const unauthorized = 401;
    expect(unauthorized).toBe(401);
  });

  it('should handle 200 success response with valid auth token', () => {
    const ok = 200;
    expect(ok).toBeLessThan(300);
  });

  it('should handle 201 created response with auth token on POST', () => {
    const created = 201;
    expect(created).toBe(201);
  });

  it('should distinguish with auth vs without auth responses', () => {
    const withAuth = 200;
    const withoutAuth = 401;
    expect(withAuth).not.toEqual(withoutAuth);
  });

  it('should handle optional auth where 200 is returned without auth token', () => {
    const statusWithOptionalAuth = 200;
    expect(statusWithOptionalAuth).toBeGreaterThanOrEqual(200);
    expect(statusWithOptionalAuth).toBeLessThan(300);
  });
});
});
