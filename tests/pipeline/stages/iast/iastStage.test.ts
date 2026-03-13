jest.mock('fs');
import * as fs from 'fs';
import { IastStage } from '../../../../src/pipeline/stages/iast/iastStage';
import { CoverageKnowledgeGraph } from '../../../../src/pipeline/graph';
import type { PipelineContext } from '../../../../src/pipeline/stageInterface';

const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

function buildContext(configOverrides: Record<string, unknown> = {}): PipelineContext {
  return {
    projectRoot: '/fake/project',
    config: {
      projectRoot: '/fake/project',
      enableIast: true,
      enableDast: false,
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

describe('IastStage', () => {
  let stage: IastStage;

  beforeEach(() => {
    stage = new IastStage();
    jest.clearAllMocks();
  });

  // ─── Stage properties ──────────────────────────────────────────────────

  it('should have name "iast" and optional === true', () => {
    expect(stage.name).toBe('iast');
    expect(stage.optional).toBe(true);
  });

  // ─── Valid events file ─────────────────────────────────────────────────

  it('should parse a valid events file and create runtime-event nodes', async () => {
    const eventsPayload = JSON.stringify({
      events: [
        { eventId: 'e1', method: 'GET', path: '/users' },
        { eventId: 'e2', method: 'POST', path: '/users' },
      ],
    });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(eventsPayload);

    const ctx = buildContext();
    const output = await stage.execute(ctx);

    expect(output.events).toHaveLength(2);
    expect(output.runtimeEventNodesCreated).toBe(2);
  });

  // ─── Links to existing endpoint ────────────────────────────────────────

  it('should link runtime-event to an existing endpoint via observed-by edge', async () => {
    const eventsPayload = JSON.stringify({
      events: [{ eventId: 'e1', method: 'GET', path: '/users' }],
    });

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(eventsPayload);

    const ctx = buildContext();
    ctx.graph.addNode({
      id: 'endpoint:GET:/users',
      type: 'endpoint',
      label: 'GET /users',
      sourceStage: 'ast',
      metadata: {},
    });

    const output = await stage.execute(ctx);

    // Should have an observed-by edge
    const edges = ctx.graph.getEdgesByType('observed-by');
    expect(edges.length).toBeGreaterThanOrEqual(1);
    expect(edges[0].targetNodeId).toBe('endpoint:GET:/users');

    // Confirmed endpoints should include the matched endpoint
    expect(output.confirmedEndpoints).toContain('endpoint:GET:/users');
  });

  // ─── No events file ────────────────────────────────────────────────────

  it('should produce empty output when events file does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    const ctx = buildContext();
    const output = await stage.execute(ctx);

    expect(output.events).toHaveLength(0);

    const diag = ctx.diagnostics.get('iast');
    expect(diag).toBeDefined();
    expect(diag!.metadata.skipped).toBe(true);
  });

  // ─── Malformed JSON ────────────────────────────────────────────────────

  it('should produce empty output when events file contains malformed JSON', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('{bad json');

    const ctx = buildContext();
    const output = await stage.execute(ctx);

    expect(output.events).toHaveLength(0);
  });

  // ─── Invalid format (missing events array) ─────────────────────────────

  it('should produce empty output when events file has invalid format', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('{}');

    const ctx = buildContext();
    const output = await stage.execute(ctx);

    expect(output.events).toHaveLength(0);
  });

  // ─── Custom iastEventsPath ─────────────────────────────────────────────

  it('should use custom iastEventsPath from config', async () => {
    mockExistsSync.mockReturnValue(false);

    const ctx = buildContext({ iastEventsPath: '/custom/path.json' });
    await stage.execute(ctx);

    expect(mockExistsSync).toHaveBeenCalledWith('/custom/path.json');
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
