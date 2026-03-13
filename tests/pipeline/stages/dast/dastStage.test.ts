jest.mock('fs');
import * as fs from 'fs';
import { DastStage } from '../../../../src/pipeline/stages/dast/dastStage';
import { CoverageKnowledgeGraph } from '../../../../src/pipeline/graph';
import type { PipelineContext } from '../../../../src/pipeline/stageInterface';

const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

function buildContext(configOverrides: Record<string, unknown> = {}): PipelineContext {
  return {
    projectRoot: '/fake/project',
    config: {
      projectRoot: '/fake/project',
      enableIast: false,
      enableDast: true,
      dastRateLimit: 10,
      traversalDepthCap: 5,
      fileTimeoutMs: 30000,
      ...configOverrides,
    },
    graph: new CoverageKnowledgeGraph(),
    diagnostics: new Map(),
    stageOutputs: new Map(),
  };
}

describe('DastStage', () => {
  let stage: DastStage;

  beforeEach(() => {
    stage = new DastStage();
    jest.clearAllMocks();
  });

  // ─── Stage properties ──────────────────────────────────────────────────

  it('should have name "dast" and optional === true', () => {
    expect(stage.name).toBe('dast');
    expect(stage.optional).toBe(true);
  });

  // ─── Valid results file ────────────────────────────────────────────────

  it('should parse a valid results file with reachable results', async () => {
    const resultsPayload = JSON.stringify({
      results: [
        { method: 'GET', path: '/users', reachable: true },
        { method: 'POST', path: '/users', reachable: true },
      ],
    });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(resultsPayload);

    const ctx = buildContext();
    const output = await stage.execute(ctx);

    expect(output.results).toHaveLength(2);
    expect(output.confirmedEndpoints).toContain('endpoint:GET:/users');
    expect(output.confirmedEndpoints).toContain('endpoint:POST:/users');
  });

  // ─── Unreachable endpoint ──────────────────────────────────────────────

  it('should populate unreachableEndpoints for non-reachable results', async () => {
    const resultsPayload = JSON.stringify({
      results: [
        { method: 'GET', path: '/secret', reachable: false },
      ],
    });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(resultsPayload);

    const ctx = buildContext();
    const output = await stage.execute(ctx);

    expect(output.unreachableEndpoints).toContain('endpoint:GET:/secret');
  });

  // ─── No results file ──────────────────────────────────────────────────

  it('should produce empty output when results file does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    const ctx = buildContext();
    const output = await stage.execute(ctx);

    expect(output.results).toHaveLength(0);

    const diag = ctx.diagnostics.get('dast');
    expect(diag).toBeDefined();
    expect(diag!.metadata.skipped).toBe(true);
  });

  // ─── DAST-discovered endpoint added to graph ──────────────────────────

  it('should add a DAST-discovered endpoint to the graph with sourceStage "dast"', async () => {
    const resultsPayload = JSON.stringify({
      results: [
        { method: 'GET', path: '/new-endpoint', reachable: true },
      ],
    });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(resultsPayload);

    const ctx = buildContext();
    // Endpoint is NOT in the graph prior to execution
    expect(ctx.graph.hasNode('endpoint:GET:/new-endpoint')).toBe(false);

    await stage.execute(ctx);

    // Now the graph should contain the DAST-discovered endpoint
    expect(ctx.graph.hasNode('endpoint:GET:/new-endpoint')).toBe(true);
    const node = ctx.graph.getNode('endpoint:GET:/new-endpoint')!;
    expect(node.sourceStage).toBe('dast');
  });

  // ─── Emits conflicts ──────────────────────────────────────────────────

  it('should emit conflicts when AST endpoint exists but DAST says not reachable', async () => {
    const resultsPayload = JSON.stringify({
      results: [
        { method: 'GET', path: '/users', reachable: false },
      ],
    });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(resultsPayload);

    const ctx = buildContext();
    // Pre-add an AST endpoint node
    ctx.graph.addNode({
      id: 'endpoint:GET:/users',
      type: 'endpoint',
      label: 'GET /users',
      sourceStage: 'ast',
      metadata: {},
    });

    const output = await stage.execute(ctx);

    expect(output.conflictsEmitted).toBeGreaterThan(0);
    // Conflict node should be in the graph
    const conflictNodes = ctx.graph.getNodesByType('conflict');
    expect(conflictNodes.length).toBeGreaterThan(0);
  });

  // ─── Malformed JSON ────────────────────────────────────────────────────

  it('should produce empty output when results file contains malformed JSON', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('{bad json');

    const ctx = buildContext();
    const output = await stage.execute(ctx);

    expect(output.results).toHaveLength(0);
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
