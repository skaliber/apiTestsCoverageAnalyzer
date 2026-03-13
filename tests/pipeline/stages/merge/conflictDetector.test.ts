import { CoverageKnowledgeGraph } from '../../../../src/pipeline/graph';
import { detectConflicts } from '../../../../src/pipeline/stages/merge/conflictDetector';
import type { IastOutput } from '../../../../src/pipeline/stages/iast/types';
import type { DastOutput } from '../../../../src/pipeline/stages/dast/types';

function buildGraph(): CoverageKnowledgeGraph {
  return new CoverageKnowledgeGraph();
}

function addEndpointNode(
  graph: CoverageKnowledgeGraph,
  method: string,
  path: string,
): void {
  graph.addNode({
    id: `endpoint:${method}:${path}`,
    type: 'endpoint',
    label: `${method} ${path}`,
    sourceStage: 'ast',
    metadata: {},
  });
}

describe('detectConflicts', () => {
  // ─── No runtime data ──────────────────────────────────────────────────

  it('should return empty when no runtime data is present', () => {
    const graph = buildGraph();
    addEndpointNode(graph, 'GET', '/users');

    const conflicts = detectConflicts(graph, undefined, undefined);

    expect(conflicts).toHaveLength(0);
  });

  // ─── Runtime-unconfirmed ──────────────────────────────────────────────

  it('should detect runtime-unconfirmed when IAST has events but does not confirm endpoint', () => {
    const graph = buildGraph();
    addEndpointNode(graph, 'GET', '/users');

    const iastOutput: IastOutput = {
      events: [{ eventId: 'e1', method: 'GET', path: '/other' }],
      confirmedEndpoints: ['endpoint:GET:/other'],
      runtimeEventNodesCreated: 1,
    };

    const conflicts = detectConflicts(graph, iastOutput, undefined);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('runtime-unconfirmed');
    expect(conflicts[0].nodeId).toBe('endpoint:GET:/users');
  });

  // ─── No conflict when confirmed ──────────────────────────────────────

  it('should return empty when IAST confirms the endpoint', () => {
    const graph = buildGraph();
    addEndpointNode(graph, 'GET', '/users');

    const iastOutput: IastOutput = {
      events: [{ eventId: 'e1', method: 'GET', path: '/users' }],
      confirmedEndpoints: ['endpoint:GET:/users'],
      runtimeEventNodesCreated: 1,
    };

    const conflicts = detectConflicts(graph, iastOutput, undefined);

    expect(conflicts).toHaveLength(0);
  });

  // ─── Multiple unconfirmed ─────────────────────────────────────────────

  it('should detect multiple unconfirmed endpoints', () => {
    const graph = buildGraph();
    addEndpointNode(graph, 'GET', '/users');
    addEndpointNode(graph, 'POST', '/orders');
    addEndpointNode(graph, 'DELETE', '/items');

    const iastOutput: IastOutput = {
      events: [{ eventId: 'e1', method: 'GET', path: '/users' }],
      confirmedEndpoints: ['endpoint:GET:/users'],
      runtimeEventNodesCreated: 1,
    };

    const conflicts = detectConflicts(graph, iastOutput, undefined);

    expect(conflicts).toHaveLength(2);
    const nodeIds = conflicts.map((c) => c.nodeId);
    expect(nodeIds).toContain('endpoint:POST:/orders');
    expect(nodeIds).toContain('endpoint:DELETE:/items');
    expect(conflicts.every((c) => c.type === 'runtime-unconfirmed')).toBe(true);
  });
});
