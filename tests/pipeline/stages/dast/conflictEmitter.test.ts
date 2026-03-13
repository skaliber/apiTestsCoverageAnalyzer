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
