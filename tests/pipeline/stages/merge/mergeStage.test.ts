import { CoverageKnowledgeGraph } from '../../../../src/pipeline/graph';
import type { PipelineContext } from '../../../../src/pipeline/stageInterface';
import { MergeStage } from '../../../../src/pipeline/stages/merge/mergeStage';

function buildContext(graph: CoverageKnowledgeGraph): PipelineContext {
  return {
    projectRoot: '/tmp/test-project',
    config: {
      projectRoot: '/tmp/test-project',
      enableIast: false,
      enableDast: false,
      dastRateLimit: 10,
      traversalDepthCap: 5,
      fileTimeoutMs: 30_000,
    },
    graph,
    diagnostics: new Map(),
    stageOutputs: new Map(),
  };
}

function buildPopulatedGraph(): CoverageKnowledgeGraph {
  const graph = new CoverageKnowledgeGraph();

  // 2 endpoint nodes
  graph.addNode({
    id: 'endpoint:GET:/users',
    type: 'endpoint',
    label: 'GET /users',
    sourceStage: 'ast',
    metadata: { resolutionType: 'direct' },
  });
  graph.addNode({
    id: 'endpoint:POST:/orders',
    type: 'endpoint',
    label: 'POST /orders',
    sourceStage: 'ast',
    metadata: { resolutionType: 'direct' },
  });

  // 1 test file node
  graph.addNode({
    id: 'file:tests/users.test.ts',
    type: 'test-file',
    label: 'tests/users.test.ts',
    sourceStage: 'tia',
    metadata: {},
  });

  // tests edge: test file -> endpoint
  graph.addEdge({
    id: 'file:tests/users.test.ts->tests->endpoint:GET:/users',
    type: 'tests',
    sourceNodeId: 'file:tests/users.test.ts',
    targetNodeId: 'endpoint:GET:/users',
    sourceStage: 'tia',
    metadata: {},
  });

  return graph;
}

describe('MergeStage', () => {
  const stage = new MergeStage();

  // ─── Stage identity ───────────────────────────────────────────────────

  it('should have name "merge" and optional false', () => {
    expect(stage.name).toBe('merge');
    expect(stage.optional).toBe(false);
  });

  // ─── Produces PipelineOutput ──────────────────────────────────────────

  it('should produce a PipelineOutput with graph, sections, diagnostics, and summary', async () => {
    const graph = buildPopulatedGraph();
    const context = buildContext(graph);

    const output = await stage.execute(context);

    expect(output).toHaveProperty('graph');
    expect(output).toHaveProperty('sections');
    expect(output).toHaveProperty('diagnostics');
    expect(output).toHaveProperty('summary');
    expect(output.graph).toHaveProperty('nodes');
    expect(output.graph).toHaveProperty('edges');
  });

  // ─── Summary has correct counts ──────────────────────────────────────

  it('should produce summary with totalEndpoints matching endpoint nodes in graph', async () => {
    const graph = buildPopulatedGraph();
    const context = buildContext(graph);

    const output = await stage.execute(context);

    expect(output.summary.totalEndpoints).toBe(2);
  });

  // ─── Diagnostics recorded ─────────────────────────────────────────────

  it('should record merge diagnostics in context', async () => {
    const graph = buildPopulatedGraph();
    const context = buildContext(graph);

    await stage.execute(context);

    expect(context.diagnostics.has('merge')).toBe(true);
    const diag = context.diagnostics.get('merge')!;
    expect(diag.stageName).toBe('merge');
    expect(diag.metadata).toHaveProperty('totalMappings');
    expect(diag.metadata).toHaveProperty('isStaticOnlyMode');
  });

  // ─── Static-only mode ─────────────────────────────────────────────────

  it('should set isStaticOnlyMode when no IAST/DAST output', async () => {
    const graph = buildPopulatedGraph();
    const context = buildContext(graph);

    await stage.execute(context);

    const diag = context.diagnostics.get('merge')!;
    expect(diag.metadata.isStaticOnlyMode).toBe(true);
  });

  // ─── Sections organized ───────────────────────────────────────────────

  it('should place all endpoint mappings in sections.endpoints', async () => {
    const graph = buildPopulatedGraph();
    const context = buildContext(graph);

    const output = await stage.execute(context);

    // All mappings come from endpoint nodes, so they go into sections.endpoints
    expect(output.sections.endpoints.length).toBe(output.summary.totalEndpoints);
    const itemIds = output.sections.endpoints.map((m) => m.itemId);
    expect(itemIds).toContain('endpoint:GET:/users');
    expect(itemIds).toContain('endpoint:POST:/orders');
  });
});
