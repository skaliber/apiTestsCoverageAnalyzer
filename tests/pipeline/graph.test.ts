import { CoverageKnowledgeGraph } from '../../src/pipeline/graph';
import type {
  GraphNode,
  GraphEdge,
  GraphNodeType,
  GraphEdgeType,
  StageName,
} from '../../src/pipeline/types';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode(
  id: string,
  type: GraphNodeType = 'endpoint',
  stage: StageName = 'ast',
  metadata: Record<string, unknown> = {},
): GraphNode {
  return { id, type, label: `Label for ${id}`, sourceStage: stage, metadata };
}

function makeEdge(
  id: string,
  type: GraphEdgeType = 'calls',
  source: string = 'a',
  target: string = 'b',
  stage: StageName = 'ast',
  metadata: Record<string, unknown> = {},
): GraphEdge {
  return {
    id,
    type,
    sourceNodeId: source,
    targetNodeId: target,
    sourceStage: stage,
    metadata,
  };
}

// ─── Node operations ─────────────────────────────────────────────────────────

describe('CoverageKnowledgeGraph — node operations', () => {
  let graph: CoverageKnowledgeGraph;

  beforeEach(() => {
    graph = new CoverageKnowledgeGraph();
  });

  describe('addNode / getNode', () => {
    it('stores a node and retrieves it by id', () => {
      const node = makeNode('n1', 'endpoint');
      graph.addNode(node);
      expect(graph.getNode('n1')).toEqual(node);
    });

    it('returns undefined for a non-existent node', () => {
      expect(graph.getNode('missing')).toBeUndefined();
    });

    it('overwrites a node when the same id is added again', () => {
      graph.addNode(makeNode('n1', 'endpoint'));
      const updated = makeNode('n1', 'controller');
      graph.addNode(updated);
      expect(graph.getNode('n1')!.type).toBe('controller');
    });
  });

  describe('hasNode', () => {
    it('returns true when node exists', () => {
      graph.addNode(makeNode('n1'));
      expect(graph.hasNode('n1')).toBe(true);
    });

    it('returns false when node does not exist', () => {
      expect(graph.hasNode('missing')).toBe(false);
    });
  });

  describe('removeNode', () => {
    it('removes an existing node and returns true', () => {
      graph.addNode(makeNode('n1'));
      expect(graph.removeNode('n1')).toBe(true);
      expect(graph.hasNode('n1')).toBe(false);
    });

    it('returns false when removing a non-existent node', () => {
      expect(graph.removeNode('missing')).toBe(false);
    });
  });

  describe('nodeCount', () => {
    it('returns 0 for an empty graph', () => {
      expect(graph.nodeCount).toBe(0);
    });

    it('reflects the number of added nodes', () => {
      graph.addNode(makeNode('a'));
      graph.addNode(makeNode('b'));
      graph.addNode(makeNode('c'));
      expect(graph.nodeCount).toBe(3);
    });

    it('decreases after removal', () => {
      graph.addNode(makeNode('a'));
      graph.addNode(makeNode('b'));
      graph.removeNode('a');
      expect(graph.nodeCount).toBe(1);
    });
  });
});

// ─── Edge operations ─────────────────────────────────────────────────────────

describe('CoverageKnowledgeGraph — edge operations', () => {
  let graph: CoverageKnowledgeGraph;

  beforeEach(() => {
    graph = new CoverageKnowledgeGraph();
  });

  describe('addEdge / getEdge', () => {
    it('stores an edge and retrieves it by id', () => {
      const edge = makeEdge('e1', 'calls', 'a', 'b');
      graph.addEdge(edge);
      expect(graph.getEdge('e1')).toEqual(edge);
    });

    it('returns undefined for a non-existent edge', () => {
      expect(graph.getEdge('missing')).toBeUndefined();
    });
  });

  describe('hasEdge', () => {
    it('returns true when edge exists', () => {
      graph.addEdge(makeEdge('e1'));
      expect(graph.hasEdge('e1')).toBe(true);
    });

    it('returns false when edge does not exist', () => {
      expect(graph.hasEdge('missing')).toBe(false);
    });
  });

  describe('removeEdge', () => {
    it('removes an existing edge and returns true', () => {
      graph.addEdge(makeEdge('e1'));
      expect(graph.removeEdge('e1')).toBe(true);
      expect(graph.hasEdge('e1')).toBe(false);
    });

    it('returns false when removing a non-existent edge', () => {
      expect(graph.removeEdge('missing')).toBe(false);
    });
  });

  describe('edgeCount', () => {
    it('returns 0 for an empty graph', () => {
      expect(graph.edgeCount).toBe(0);
    });

    it('reflects the number of added edges', () => {
      graph.addEdge(makeEdge('e1'));
      graph.addEdge(makeEdge('e2'));
      expect(graph.edgeCount).toBe(2);
    });
  });
});

// ─── Query methods ───────────────────────────────────────────────────────────

describe('CoverageKnowledgeGraph — query methods', () => {
  let graph: CoverageKnowledgeGraph;

  beforeEach(() => {
    graph = new CoverageKnowledgeGraph();
  });

  describe('getNodesByType', () => {
    it('returns only nodes of the specified type', () => {
      graph.addNode(makeNode('n1', 'endpoint'));
      graph.addNode(makeNode('n2', 'controller'));
      graph.addNode(makeNode('n3', 'endpoint'));
      graph.addNode(makeNode('n4', 'test-case'));

      const endpoints = graph.getNodesByType('endpoint');
      expect(endpoints).toHaveLength(2);
      expect(endpoints.map((n) => n.id).sort()).toEqual(['n1', 'n3']);
    });

    it('returns an empty array when no nodes match', () => {
      graph.addNode(makeNode('n1', 'endpoint'));
      expect(graph.getNodesByType('controller')).toEqual([]);
    });
  });

  describe('getNodesByStage', () => {
    it('returns only nodes from the specified stage', () => {
      graph.addNode(makeNode('n1', 'endpoint', 'ast'));
      graph.addNode(makeNode('n2', 'endpoint', 'tia'));
      graph.addNode(makeNode('n3', 'controller', 'ast'));

      const astNodes = graph.getNodesByStage('ast');
      expect(astNodes).toHaveLength(2);
      expect(astNodes.map((n) => n.id).sort()).toEqual(['n1', 'n3']);
    });

    it('returns an empty array when no nodes match the stage', () => {
      graph.addNode(makeNode('n1', 'endpoint', 'ast'));
      expect(graph.getNodesByStage('dast')).toEqual([]);
    });
  });

  describe('getEdgesFrom', () => {
    it('returns edges originating from a given node', () => {
      graph.addEdge(makeEdge('e1', 'calls', 'a', 'b'));
      graph.addEdge(makeEdge('e2', 'calls', 'a', 'c'));
      graph.addEdge(makeEdge('e3', 'calls', 'b', 'c'));

      const fromA = graph.getEdgesFrom('a');
      expect(fromA).toHaveLength(2);
      expect(fromA.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
    });

    it('returns an empty array when no edges originate from the node', () => {
      graph.addEdge(makeEdge('e1', 'calls', 'a', 'b'));
      expect(graph.getEdgesFrom('c')).toEqual([]);
    });
  });

  describe('getEdgesTo', () => {
    it('returns edges pointing to a given node', () => {
      graph.addEdge(makeEdge('e1', 'calls', 'a', 'c'));
      graph.addEdge(makeEdge('e2', 'calls', 'b', 'c'));
      graph.addEdge(makeEdge('e3', 'calls', 'a', 'b'));

      const toC = graph.getEdgesTo('c');
      expect(toC).toHaveLength(2);
      expect(toC.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
    });

    it('returns an empty array when no edges point to the node', () => {
      graph.addEdge(makeEdge('e1', 'calls', 'a', 'b'));
      expect(graph.getEdgesTo('z')).toEqual([]);
    });
  });

  describe('getEdgesBetween', () => {
    it('returns edges between two nodes in both directions', () => {
      graph.addEdge(makeEdge('e1', 'calls', 'a', 'b'));
      graph.addEdge(makeEdge('e2', 'tests', 'b', 'a'));
      graph.addEdge(makeEdge('e3', 'calls', 'a', 'c'));

      const between = graph.getEdgesBetween('a', 'b');
      expect(between).toHaveLength(2);
      expect(between.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
    });

    it('returns an empty array when no edges connect the nodes', () => {
      graph.addEdge(makeEdge('e1', 'calls', 'a', 'b'));
      expect(graph.getEdgesBetween('x', 'y')).toEqual([]);
    });

    it('is symmetric — getEdgesBetween(a,b) equals getEdgesBetween(b,a)', () => {
      graph.addEdge(makeEdge('e1', 'calls', 'a', 'b'));
      graph.addEdge(makeEdge('e2', 'tests', 'b', 'a'));

      const ab = graph.getEdgesBetween('a', 'b');
      const ba = graph.getEdgesBetween('b', 'a');
      expect(ab).toEqual(ba);
    });
  });

  describe('getEdgesByType', () => {
    it('returns only edges of the specified type', () => {
      graph.addEdge(makeEdge('e1', 'calls', 'a', 'b'));
      graph.addEdge(makeEdge('e2', 'tests', 'c', 'd'));
      graph.addEdge(makeEdge('e3', 'calls', 'e', 'f'));

      const callEdges = graph.getEdgesByType('calls');
      expect(callEdges).toHaveLength(2);
      expect(callEdges.map((e) => e.id).sort()).toEqual(['e1', 'e3']);
    });

    it('returns an empty array when no edges match', () => {
      graph.addEdge(makeEdge('e1', 'calls', 'a', 'b'));
      expect(graph.getEdgesByType('mocks')).toEqual([]);
    });
  });
});

// ─── Traversal ───────────────────────────────────────────────────────────────

describe('CoverageKnowledgeGraph — traversal', () => {
  let graph: CoverageKnowledgeGraph;

  beforeEach(() => {
    graph = new CoverageKnowledgeGraph();
  });

  describe('getReachableNodes', () => {
    it('returns all nodes reachable from a start node via BFS', () => {
      // a -> b -> c -> d
      graph.addNode(makeNode('a'));
      graph.addNode(makeNode('b'));
      graph.addNode(makeNode('c'));
      graph.addNode(makeNode('d'));
      graph.addEdge(makeEdge('e1', 'calls', 'a', 'b'));
      graph.addEdge(makeEdge('e2', 'calls', 'b', 'c'));
      graph.addEdge(makeEdge('e3', 'calls', 'c', 'd'));

      const reachable = graph.getReachableNodes('a');
      expect(reachable.map((n) => n.id)).toEqual(['b', 'c', 'd']);
    });

    it('does not include the start node itself', () => {
      graph.addNode(makeNode('a'));
      graph.addNode(makeNode('b'));
      graph.addEdge(makeEdge('e1', 'calls', 'a', 'b'));

      const reachable = graph.getReachableNodes('a');
      expect(reachable.map((n) => n.id)).not.toContain('a');
    });

    it('handles cycles without infinite loops', () => {
      // a -> b -> c -> a (cycle)
      graph.addNode(makeNode('a'));
      graph.addNode(makeNode('b'));
      graph.addNode(makeNode('c'));
      graph.addEdge(makeEdge('e1', 'calls', 'a', 'b'));
      graph.addEdge(makeEdge('e2', 'calls', 'b', 'c'));
      graph.addEdge(makeEdge('e3', 'calls', 'c', 'a'));

      const reachable = graph.getReachableNodes('a');
      expect(reachable).toHaveLength(2);
      expect(reachable.map((n) => n.id).sort()).toEqual(['b', 'c']);
    });

    it('returns empty array when start node has no outgoing edges', () => {
      graph.addNode(makeNode('a'));
      expect(graph.getReachableNodes('a')).toEqual([]);
    });

    it('filters by edge type when edgeTypes is provided', () => {
      // a --calls--> b --tests--> c --calls--> d
      graph.addNode(makeNode('a'));
      graph.addNode(makeNode('b'));
      graph.addNode(makeNode('c'));
      graph.addNode(makeNode('d'));
      graph.addEdge(makeEdge('e1', 'calls', 'a', 'b'));
      graph.addEdge(makeEdge('e2', 'tests', 'b', 'c'));
      graph.addEdge(makeEdge('e3', 'calls', 'c', 'd'));

      // Only follow 'calls' edges: a -> b, but b -> c is 'tests', so stops at b
      const reachable = graph.getReachableNodes('a', ['calls']);
      expect(reachable.map((n) => n.id)).toEqual(['b']);
    });

    it('follows multiple edge types when multiple types specified', () => {
      graph.addNode(makeNode('a'));
      graph.addNode(makeNode('b'));
      graph.addNode(makeNode('c'));
      graph.addEdge(makeEdge('e1', 'calls', 'a', 'b'));
      graph.addEdge(makeEdge('e2', 'tests', 'b', 'c'));

      const reachable = graph.getReachableNodes('a', ['calls', 'tests']);
      expect(reachable.map((n) => n.id)).toEqual(['b', 'c']);
    });

    it('returns BFS order (breadth-first)', () => {
      //   a -> b -> d
      //   a -> c -> e
      graph.addNode(makeNode('a'));
      graph.addNode(makeNode('b'));
      graph.addNode(makeNode('c'));
      graph.addNode(makeNode('d'));
      graph.addNode(makeNode('e'));
      graph.addEdge(makeEdge('e1', 'calls', 'a', 'b'));
      graph.addEdge(makeEdge('e2', 'calls', 'a', 'c'));
      graph.addEdge(makeEdge('e3', 'calls', 'b', 'd'));
      graph.addEdge(makeEdge('e4', 'calls', 'c', 'e'));

      const reachable = graph.getReachableNodes('a');
      // BFS: b and c at depth 1, then d and e at depth 2
      expect(reachable.map((n) => n.id)).toEqual(['b', 'c', 'd', 'e']);
    });
  });

  describe('hasNodeTypeOnPath', () => {
    it('returns true when an interior node matches the given type', () => {
      // start -> mock -> end
      graph.addNode(makeNode('start', 'test-case'));
      graph.addNode(makeNode('mock', 'mock-boundary'));
      graph.addNode(makeNode('end', 'endpoint'));
      graph.addEdge(makeEdge('e1', 'calls', 'start', 'mock'));
      graph.addEdge(makeEdge('e2', 'calls', 'mock', 'end'));

      expect(graph.hasNodeTypeOnPath('start', 'end', 'mock-boundary')).toBe(true);
    });

    it('returns false when no interior node matches the given type', () => {
      // start -> mid -> end (mid is a controller, not mock-boundary)
      graph.addNode(makeNode('start', 'test-case'));
      graph.addNode(makeNode('mid', 'controller'));
      graph.addNode(makeNode('end', 'endpoint'));
      graph.addEdge(makeEdge('e1', 'calls', 'start', 'mid'));
      graph.addEdge(makeEdge('e2', 'calls', 'mid', 'end'));

      expect(graph.hasNodeTypeOnPath('start', 'end', 'mock-boundary')).toBe(false);
    });

    it('does not check start or end nodes — only interior nodes', () => {
      // start(mock-boundary) -> end
      graph.addNode(makeNode('start', 'mock-boundary'));
      graph.addNode(makeNode('end', 'mock-boundary'));
      graph.addEdge(makeEdge('e1', 'calls', 'start', 'end'));

      // Direct edge from start to end: path is [start, end], no interior nodes
      expect(graph.hasNodeTypeOnPath('start', 'end', 'mock-boundary')).toBe(false);
    });

    it('returns false when no path exists between start and end', () => {
      graph.addNode(makeNode('start', 'test-case'));
      graph.addNode(makeNode('end', 'endpoint'));
      // No edges connecting them

      expect(graph.hasNodeTypeOnPath('start', 'end', 'mock-boundary')).toBe(false);
    });

    it('handles cycles on the path without infinite loops', () => {
      // start -> a -> b -> a (cycle), b -> end
      graph.addNode(makeNode('start', 'test-case'));
      graph.addNode(makeNode('a', 'controller'));
      graph.addNode(makeNode('b', 'mock-boundary'));
      graph.addNode(makeNode('end', 'endpoint'));
      graph.addEdge(makeEdge('e1', 'calls', 'start', 'a'));
      graph.addEdge(makeEdge('e2', 'calls', 'a', 'b'));
      graph.addEdge(makeEdge('e3', 'calls', 'b', 'a'));
      graph.addEdge(makeEdge('e4', 'calls', 'b', 'end'));

      expect(graph.hasNodeTypeOnPath('start', 'end', 'mock-boundary')).toBe(true);
    });
  });
});

// ─── Merge ───────────────────────────────────────────────────────────────────

describe('CoverageKnowledgeGraph — merge', () => {
  it('merges nodes and edges from another graph', () => {
    const g1 = new CoverageKnowledgeGraph();
    const g2 = new CoverageKnowledgeGraph();

    g1.addNode(makeNode('a', 'endpoint', 'ast'));
    g2.addNode(makeNode('b', 'controller', 'tia'));
    g2.addEdge(makeEdge('e1', 'calls', 'b', 'a', 'tia'));

    const conflicts = g1.merge(g2);
    expect(conflicts).toEqual([]);
    expect(g1.nodeCount).toBe(2);
    expect(g1.edgeCount).toBe(1);
    expect(g1.hasNode('b')).toBe(true);
    expect(g1.hasEdge('e1')).toBe(true);
  });

  it('detects type conflicts (stage-disagreement) for same node id with different types', () => {
    const g1 = new CoverageKnowledgeGraph();
    const g2 = new CoverageKnowledgeGraph();

    g1.addNode(makeNode('x', 'endpoint', 'ast'));
    g2.addNode(makeNode('x', 'controller', 'tia'));

    const conflicts = g1.merge(g2);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('stage-disagreement');
    expect(conflicts[0].nodeId).toBe('x');
    expect(conflicts[0].stages).toContain('ast');
    expect(conflicts[0].stages).toContain('tia');
    expect(conflicts[0].severity).toBe('warning');
  });

  it('produces no conflicts when same node id has the same type', () => {
    const g1 = new CoverageKnowledgeGraph();
    const g2 = new CoverageKnowledgeGraph();

    g1.addNode(makeNode('x', 'endpoint', 'ast'));
    g2.addNode(makeNode('x', 'endpoint', 'tia'));

    const conflicts = g1.merge(g2);
    expect(conflicts).toEqual([]);
  });

  it('merges metadata from the newer stage into the existing node', () => {
    const g1 = new CoverageKnowledgeGraph();
    const g2 = new CoverageKnowledgeGraph();

    g1.addNode(makeNode('x', 'endpoint', 'ast', { method: 'GET' }));
    g2.addNode(makeNode('x', 'endpoint', 'tia', { linked: true }));

    g1.merge(g2);
    const merged = g1.getNode('x')!;
    expect(merged.metadata).toEqual({ method: 'GET', linked: true });
  });

  it('does not duplicate edges that already exist', () => {
    const g1 = new CoverageKnowledgeGraph();
    const g2 = new CoverageKnowledgeGraph();

    g1.addEdge(makeEdge('e1', 'calls', 'a', 'b'));
    g2.addEdge(makeEdge('e1', 'calls', 'a', 'b'));

    g1.merge(g2);
    expect(g1.edgeCount).toBe(1);
  });

  it('detects multiple conflicts across several nodes', () => {
    const g1 = new CoverageKnowledgeGraph();
    const g2 = new CoverageKnowledgeGraph();

    g1.addNode(makeNode('x', 'endpoint', 'ast'));
    g1.addNode(makeNode('y', 'service', 'ast'));
    g2.addNode(makeNode('x', 'controller', 'tia'));
    g2.addNode(makeNode('y', 'repository', 'tia'));

    const conflicts = g1.merge(g2);
    expect(conflicts).toHaveLength(2);
    expect(conflicts.map((c) => c.nodeId).sort()).toEqual(['x', 'y']);
  });

  it('assigns unique conflictIds to each conflict', () => {
    const g1 = new CoverageKnowledgeGraph();
    const g2 = new CoverageKnowledgeGraph();

    g1.addNode(makeNode('x', 'endpoint', 'ast'));
    g1.addNode(makeNode('y', 'service', 'ast'));
    g2.addNode(makeNode('x', 'controller', 'tia'));
    g2.addNode(makeNode('y', 'repository', 'tia'));

    const conflicts = g1.merge(g2);
    const ids = conflicts.map((c) => c.conflictId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── Serialization ───────────────────────────────────────────────────────────

describe('CoverageKnowledgeGraph — serialization', () => {
  it('round-trips through toSerializable / fromSerializable', () => {
    const original = new CoverageKnowledgeGraph();
    original.addNode(makeNode('a', 'endpoint', 'ast'));
    original.addNode(makeNode('b', 'controller', 'tia'));
    original.addEdge(makeEdge('e1', 'calls', 'a', 'b'));

    const serialized = original.toSerializable();
    const restored = CoverageKnowledgeGraph.fromSerializable(serialized);

    expect(restored.nodeCount).toBe(2);
    expect(restored.edgeCount).toBe(1);
    expect(restored.getNode('a')).toEqual(original.getNode('a'));
    expect(restored.getNode('b')).toEqual(original.getNode('b'));
    expect(restored.getEdge('e1')).toEqual(original.getEdge('e1'));
  });

  it('toSerializable returns nodes and edges arrays', () => {
    const graph = new CoverageKnowledgeGraph();
    graph.addNode(makeNode('a'));
    graph.addEdge(makeEdge('e1'));

    const data = graph.toSerializable();
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(Array.isArray(data.edges)).toBe(true);
    expect(data.nodes).toHaveLength(1);
    expect(data.edges).toHaveLength(1);
  });

  it('fromSerializable produces an empty graph when given empty arrays', () => {
    const graph = CoverageKnowledgeGraph.fromSerializable({ nodes: [], edges: [] });
    expect(graph.nodeCount).toBe(0);
    expect(graph.edgeCount).toBe(0);
  });

  it('preserves all node and edge properties through serialization', () => {
    const original = new CoverageKnowledgeGraph();
    const node: GraphNode = {
      id: 'n1',
      type: 'test-case',
      label: 'My Test',
      sourceStage: 'tia',
      filePath: '/tests/foo.test.ts',
      line: 42,
      metadata: { framework: 'jest', slow: true },
    };
    const edge: GraphEdge = {
      id: 'e1',
      type: 'validates',
      sourceNodeId: 'n1',
      targetNodeId: 'n2',
      sourceStage: 'tia',
      metadata: { depth: 3 },
    };
    original.addNode(node);
    original.addEdge(edge);

    const restored = CoverageKnowledgeGraph.fromSerializable(original.toSerializable());
    expect(restored.getNode('n1')).toEqual(node);
    expect(restored.getEdge('e1')).toEqual(edge);
  });
});

// ─── Clear ───────────────────────────────────────────────────────────────────

describe('CoverageKnowledgeGraph — clear', () => {
  it('empties all nodes and edges', () => {
    const graph = new CoverageKnowledgeGraph();
    graph.addNode(makeNode('a'));
    graph.addNode(makeNode('b'));
    graph.addEdge(makeEdge('e1', 'calls', 'a', 'b'));

    graph.clear();

    expect(graph.nodeCount).toBe(0);
    expect(graph.edgeCount).toBe(0);
    expect(graph.hasNode('a')).toBe(false);
    expect(graph.hasEdge('e1')).toBe(false);
  });

  it('allows adding new items after clearing', () => {
    const graph = new CoverageKnowledgeGraph();
    graph.addNode(makeNode('a'));
    graph.clear();
    graph.addNode(makeNode('b'));

    expect(graph.nodeCount).toBe(1);
    expect(graph.hasNode('b')).toBe(true);
    expect(graph.hasNode('a')).toBe(false);
  });
});
