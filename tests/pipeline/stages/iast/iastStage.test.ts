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
});
