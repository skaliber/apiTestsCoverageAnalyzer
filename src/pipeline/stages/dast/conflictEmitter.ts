/**
 * DAST conflict emitter — detects conflicts between DAST probe results and
 * AST-declared endpoints.
 *
 * Conflict rules from spec §7:
 *
 * | DAST Result              | AST Declared          | Conflict Type                      |
 * |--------------------------|-----------------------|------------------------------------|
 * | Not reachable            | Endpoint exists       | dast-unreachable                   |
 * | Reachable, no auth check | @Secured present      | security-annotation-not-enforced   |
 * | Returns 500              | No error handler      | unhandled-server-error             |
 * | New endpoint found       | Not in AST            | undeclared-endpoint                |
 */

import type { ConflictNode, ConflictType, ConflictSeverity } from '../../types';
import type { CoverageKnowledgeGraph } from '../../graph';
import type { DastProbeResult } from './types';

/**
 * Emit conflicts by comparing DAST results with the AST-declared graph.
 *
 * @param results - DAST probe results
 * @param graph - Current coverage knowledge graph
 * @returns Array of conflict nodes to be added to the graph
 */
export function emitDastConflicts(
  results: DastProbeResult[],
  graph: CoverageKnowledgeGraph,
): ConflictNode[] {
  const conflicts: ConflictNode[] = [];
  const astEndpointIds = new Set(
    graph.getNodesByType('endpoint').map((n) => n.id),
  );

  for (const result of results) {
    const endpointPath = result.normalizedPath ?? result.path;
    const endpointId = `endpoint:${result.method.toUpperCase()}:${endpointPath}`;
    const existsInAst = astEndpointIds.has(endpointId);

    // Rule 1: DAST can't reach an AST-declared endpoint
    if (!result.reachable && existsInAst) {
      conflicts.push({
        conflictId: `conflict:dast-unreachable:${endpointId}`,
        nodeId: endpointId,
        type: 'dast-unreachable',
        stages: ['ast', 'dast'],
        stageOutputs: { ast: 'endpoint-declared', dast: 'not-reachable' },
        detail: `DAST could not reach ${result.method} ${result.path}, but AST declares it as an endpoint.`,
        suggestedAction: 'Verify the endpoint is deployed and accessible in the test environment. Check for routing middleware that may block access.',
        severity: 'warning',
      });
    }

    // Rule 2: DAST reaches endpoint without auth, but AST shows security annotation
    if (result.reachable && result.authBypass && existsInAst) {
      const endpointNode = graph.getNode(endpointId);
      const hasSecurityAnnotation = endpointNode?.metadata?.securityAnnotation != null;

      if (hasSecurityAnnotation || result.authRequired === false) {
        conflicts.push({
          conflictId: `conflict:security-not-enforced:${endpointId}`,
          nodeId: endpointId,
          type: 'security-annotation-not-enforced',
          stages: ['ast', 'dast'],
          stageOutputs: { ast: 'security-annotation-present', dast: 'auth-bypass-detected' },
          detail: `DAST accessed ${result.method} ${result.path} without authentication, but security annotation is present in code.`,
          suggestedAction: 'Review security configuration. Ensure authentication middleware is applied to this endpoint and annotations are enforced at runtime.',
          severity: 'error',
        });
      }
    }

    // Rule 3: DAST gets 500 error, indicating unhandled server error
    if (result.reachable && result.serverError && existsInAst) {
      conflicts.push({
        conflictId: `conflict:unhandled-error:${endpointId}`,
        nodeId: endpointId,
        type: 'unhandled-server-error',
        stages: ['ast', 'dast'],
        stageOutputs: { ast: 'endpoint-declared', dast: 'server-error-500' },
        detail: `DAST received a 500 error from ${result.method} ${result.path}. This may indicate unhandled exceptions.`,
        suggestedAction: 'Add error handling for this endpoint. Review exception handling middleware and ensure all error paths return appropriate status codes.',
        severity: 'warning',
      });
    }

    // Rule 4: DAST finds an endpoint not declared in AST
    if (result.reachable && !existsInAst) {
      conflicts.push({
        conflictId: `conflict:undeclared-endpoint:${endpointId}`,
        nodeId: endpointId,
        type: 'undeclared-endpoint',
        stages: ['dast'],
        stageOutputs: { dast: 'endpoint-reachable' },
        detail: `DAST discovered ${result.method} ${result.path} which is not declared in any AST-analyzed source file.`,
        suggestedAction: 'Check if this endpoint is generated dynamically, comes from a third-party library, or is defined in code not included in the analysis scope.',
        severity: 'info',
      });
    }
  }

  return conflicts;
}
