import { CoverageKnowledgeGraph } from '../../../../src/pipeline/graph';
import { emitDastConflicts } from '../../../../src/pipeline/stages/dast/conflictEmitter';
import type { DastProbeResult } from '../../../../src/pipeline/stages/dast/types';

function buildGraph(): CoverageKnowledgeGraph {
  return new CoverageKnowledgeGraph();
}

function addEndpointNode(
  graph: CoverageKnowledgeGraph,
  method: string,
  path: string,
  metadata: Record<string, unknown> = {},
): void {
  graph.addNode({
    id: `endpoint:${method}:${path}`,
    type: 'endpoint',
    label: `${method} ${path}`,
    sourceStage: 'ast',
    metadata,
  });
}

describe('emitDastConflicts', () => {
  // ─── dast-unreachable ──────────────────────────────────────────────────

  it('should emit dast-unreachable when AST endpoint exists but DAST cannot reach it', () => {
    const graph = buildGraph();
    addEndpointNode(graph, 'GET', '/users');

    const results: DastProbeResult[] = [
      { method: 'GET', path: '/users', reachable: false },
    ];

    const conflicts = emitDastConflicts(results, graph);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('dast-unreachable');
    expect(conflicts[0].severity).toBe('warning');
  });

  // ─── security-annotation-not-enforced ──────────────────────────────────

  it('should emit security-annotation-not-enforced when auth bypass detected on secured endpoint', () => {
    const graph = buildGraph();
    addEndpointNode(graph, 'GET', '/users', { securityAnnotation: '@Secured' });

    const results: DastProbeResult[] = [
      { method: 'GET', path: '/users', reachable: true, authBypass: true },
    ];

    const conflicts = emitDastConflicts(results, graph);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('security-annotation-not-enforced');
    expect(conflicts[0].severity).toBe('error');
  });

  // ─── unhandled-server-error ────────────────────────────────────────────

  it('should emit unhandled-server-error when DAST gets a server error', () => {
    const graph = buildGraph();
    addEndpointNode(graph, 'GET', '/users');

    const results: DastProbeResult[] = [
      { method: 'GET', path: '/users', reachable: true, serverError: true },
    ];

    const conflicts = emitDastConflicts(results, graph);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('unhandled-server-error');
  });

  // ─── undeclared-endpoint ───────────────────────────────────────────────

  it('should emit undeclared-endpoint when DAST finds endpoint not in graph', () => {
    const graph = buildGraph();
    // No endpoint added to graph

    const results: DastProbeResult[] = [
      { method: 'GET', path: '/unknown', reachable: true },
    ];

    const conflicts = emitDastConflicts(results, graph);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('undeclared-endpoint');
    expect(conflicts[0].severity).toBe('info');
  });

  // ─── No conflicts ─────────────────────────────────────────────────────

  it('should return empty array when endpoint exists and result is reachable with no issues', () => {
    const graph = buildGraph();
    addEndpointNode(graph, 'GET', '/users');

    const results: DastProbeResult[] = [
      { method: 'GET', path: '/users', reachable: true },
    ];

    const conflicts = emitDastConflicts(results, graph);

    expect(conflicts).toHaveLength(0);
  });

  // ─── Multiple conflicts from multiple results ─────────────────────────

  it('should emit correct number of conflicts from multiple results', () => {
    const graph = buildGraph();
    addEndpointNode(graph, 'GET', '/users');
    addEndpointNode(graph, 'POST', '/orders');

    const results: DastProbeResult[] = [
      // dast-unreachable for GET /users
      { method: 'GET', path: '/users', reachable: false },
      // dast-unreachable for POST /orders
      { method: 'POST', path: '/orders', reachable: false },
      // undeclared-endpoint for DELETE /unknown
      { method: 'DELETE', path: '/unknown', reachable: true },
    ];

    const conflicts = emitDastConflicts(results, graph);

    expect(conflicts).toHaveLength(3);

    const types = conflicts.map((c) => c.type);
    expect(types.filter((t) => t === 'dast-unreachable')).toHaveLength(2);
    expect(types.filter((t) => t === 'undeclared-endpoint')).toHaveLength(1);
  });
});
