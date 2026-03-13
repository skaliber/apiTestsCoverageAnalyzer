import { mapTestsToEndpoints } from '../../../../src/pipeline/stages/tia/testEndpointMapper';
import { CoverageKnowledgeGraph } from '../../../../src/pipeline/graph';
import type { GraphNode, GraphEdge } from '../../../../src/pipeline/types';

/**
 * Helper to create a graph node with sensible defaults.
 */
function makeNode(overrides: Partial<GraphNode> & Pick<GraphNode, 'id' | 'type'>): GraphNode {
  return {
    label: overrides.id,
    sourceStage: 'ast',
    metadata: {},
    ...overrides,
  };
}

/**
 * Helper to create a graph edge with sensible defaults.
 */
function makeEdge(
  overrides: Partial<GraphEdge> & Pick<GraphEdge, 'id' | 'type' | 'sourceNodeId' | 'targetNodeId'>,
): GraphEdge {
  return {
    sourceStage: 'ast',
    metadata: {},
    ...overrides,
  };
}

describe('mapTestsToEndpoints', () => {
  // ─── tests edge mapping ─────────────────────────────────────────────────────

  it('should map via "tests" edge with evidenceType explicit-url', () => {
    const graph = new CoverageKnowledgeGraph();

    graph.addNode(makeNode({ id: 'file:test.spec.ts', type: 'test-file' }));
    graph.addNode(makeNode({ id: 'endpoint:GET:/users', type: 'endpoint' }));
    graph.addEdge(makeEdge({
      id: 'edge-1',
      type: 'tests',
      sourceNodeId: 'file:test.spec.ts',
      targetNodeId: 'endpoint:GET:/users',
    }));

    const result = mapTestsToEndpoints(graph, ['test.spec.ts']);

    expect(result).toHaveLength(1);
    expect(result[0].testFilePath).toBe('test.spec.ts');
    expect(result[0].endpointId).toBe('endpoint:GET:/users');
    expect(result[0].evidenceType).toBe('explicit-url');
  });

  // ─── asserts edge mapping ──────────────────────────────────────────────────

  it('should map via "asserts" edge with high confidence', () => {
    const graph = new CoverageKnowledgeGraph();

    graph.addNode(makeNode({ id: 'file:auth.spec.ts', type: 'test-file' }));
    graph.addNode(makeNode({ id: 'endpoint:POST:/login', type: 'endpoint' }));
    graph.addEdge(makeEdge({
      id: 'edge-1',
      type: 'asserts',
      sourceNodeId: 'file:auth.spec.ts',
      targetNodeId: 'endpoint:POST:/login',
    }));

    const result = mapTestsToEndpoints(graph, ['auth.spec.ts']);

    expect(result).toHaveLength(1);
    expect(result[0].evidenceType).toBe('explicit-url');
    expect(result[0].confidence).toBe('high');
  });

  // ─── import graph mapping ──────────────────────────────────────────────────

  it('should map via import graph with medium confidence', () => {
    const graph = new CoverageKnowledgeGraph();

    graph.addNode(makeNode({ id: 'file:api.test.ts', type: 'test-file' }));
    graph.addNode(makeNode({ id: 'file:helper.ts', type: 'helper' }));
    graph.addNode(makeNode({ id: 'endpoint:GET:/items', type: 'endpoint' }));

    // Test file imports a helper
    graph.addEdge(makeEdge({
      id: 'edge-import',
      type: 'imports-helper',
      sourceNodeId: 'file:api.test.ts',
      targetNodeId: 'file:helper.ts',
    }));

    // The helper defines the endpoint
    graph.addEdge(makeEdge({
      id: 'edge-defines',
      type: 'defines',
      sourceNodeId: 'file:helper.ts',
      targetNodeId: 'endpoint:GET:/items',
    }));

    const result = mapTestsToEndpoints(graph, ['api.test.ts']);

    expect(result).toHaveLength(1);
    expect(result[0].evidenceType).toBe('import-graph');
    expect(result[0].confidence).toBe('medium');
  });

  // ─── No endpoints ──────────────────────────────────────────────────────────

  it('should return empty mappings when graph has no endpoint nodes', () => {
    const graph = new CoverageKnowledgeGraph();

    graph.addNode(makeNode({ id: 'file:test.spec.ts', type: 'test-file' }));

    const result = mapTestsToEndpoints(graph, ['test.spec.ts']);
    expect(result).toEqual([]);
  });

  // ─── No duplicate mappings ────────────────────────────────────────────────

  it('should not produce duplicates when same endpoint is linked via tests and asserts', () => {
    const graph = new CoverageKnowledgeGraph();

    graph.addNode(makeNode({ id: 'file:dup.spec.ts', type: 'test-file' }));
    graph.addNode(makeNode({ id: 'endpoint:DELETE:/items/1', type: 'endpoint' }));

    graph.addEdge(makeEdge({
      id: 'edge-tests',
      type: 'tests',
      sourceNodeId: 'file:dup.spec.ts',
      targetNodeId: 'endpoint:DELETE:/items/1',
    }));
    graph.addEdge(makeEdge({
      id: 'edge-asserts',
      type: 'asserts',
      sourceNodeId: 'file:dup.spec.ts',
      targetNodeId: 'endpoint:DELETE:/items/1',
    }));

    const result = mapTestsToEndpoints(graph, ['dup.spec.ts']);

    const endpointMappings = result.filter((m) => m.endpointId === 'endpoint:DELETE:/items/1');
    expect(endpointMappings).toHaveLength(1);
  });

  // ─── Multiple endpoints ────────────────────────────────────────────────────

  it('should map a test file to multiple endpoints', () => {
    const graph = new CoverageKnowledgeGraph();

    graph.addNode(makeNode({ id: 'file:crud.spec.ts', type: 'test-file' }));
    graph.addNode(makeNode({ id: 'endpoint:GET:/users', type: 'endpoint' }));
    graph.addNode(makeNode({ id: 'endpoint:POST:/users', type: 'endpoint' }));
    graph.addNode(makeNode({ id: 'endpoint:DELETE:/users/:id', type: 'endpoint' }));

    graph.addEdge(makeEdge({
      id: 'edge-1',
      type: 'tests',
      sourceNodeId: 'file:crud.spec.ts',
      targetNodeId: 'endpoint:GET:/users',
    }));
    graph.addEdge(makeEdge({
      id: 'edge-2',
      type: 'tests',
      sourceNodeId: 'file:crud.spec.ts',
      targetNodeId: 'endpoint:POST:/users',
    }));
    graph.addEdge(makeEdge({
      id: 'edge-3',
      type: 'tests',
      sourceNodeId: 'file:crud.spec.ts',
      targetNodeId: 'endpoint:DELETE:/users/:id',
    }));

    const result = mapTestsToEndpoints(graph, ['crud.spec.ts']);

    expect(result).toHaveLength(3);
    const endpointIds = result.map((m) => m.endpointId);
    expect(endpointIds).toContain('endpoint:GET:/users');
    expect(endpointIds).toContain('endpoint:POST:/users');
    expect(endpointIds).toContain('endpoint:DELETE:/users/:id');
  });
});
