/**
 * Conflict detector — detects stage disagreements and structural conflicts
 * in the knowledge graph after all stages have run.
 *
 * Detects:
 * - Runtime-unconfirmed: AST+TIA say covered, but IAST/DAST disagree
 * - Stage disagreement: Two stages assign different types to the same node
 */

import type { ConflictNode, ConflictType, StageName } from '../../types';
import type { CoverageKnowledgeGraph } from '../../graph';
import type { IastOutput } from '../iast/types';
import type { DastOutput } from '../dast/types';

/**
 * Detect conflicts across all stages.
 */
export function detectConflicts(
  graph: CoverageKnowledgeGraph,
  iastOutput: IastOutput | undefined,
  dastOutput: DastOutput | undefined,
): ConflictNode[] {
  const conflicts: ConflictNode[] = [];

  // 1. Runtime-unconfirmed: endpoints that AST found but neither IAST nor DAST confirmed
  const endpointNodes = graph.getNodesByType('endpoint');
  const iastConfirmed = new Set(iastOutput?.confirmedEndpoints ?? []);
  const dastConfirmed = new Set(dastOutput?.confirmedEndpoints ?? []);
  const dastUnreachable = new Set(dastOutput?.unreachableEndpoints ?? []);

  const hasRuntimeData = (iastOutput?.events.length ?? 0) > 0 || (dastOutput?.results.length ?? 0) > 0;

  if (hasRuntimeData) {
    for (const node of endpointNodes) {
      // Only check endpoints from static stages (AST/TIA)
      if (node.sourceStage !== 'ast' && node.sourceStage !== 'sca') continue;

      const confirmed = iastConfirmed.has(node.id) || dastConfirmed.has(node.id);
      const unreachable = dastUnreachable.has(node.id);

      if (!confirmed && !unreachable) {
        conflicts.push({
          conflictId: `conflict:runtime-unconfirmed:${node.id}`,
          nodeId: node.id,
          type: 'runtime-unconfirmed',
          stages: getRuntimeStages(iastOutput, dastOutput),
          stageOutputs: {
            ast: 'endpoint-declared',
            iast: iastConfirmed.has(node.id) ? 'confirmed' : 'not-observed',
            dast: dastConfirmed.has(node.id) ? 'confirmed' : 'not-probed',
          },
          detail: `${node.label} was found by static analysis but not confirmed by any runtime stage.`,
          suggestedAction: 'Check if the endpoint is covered by integration/e2e tests that produce IAST events or DAST probes.',
          severity: 'info',
        });
      }
    }
  }

  // 2. Stage disagreement: same node ID added by multiple stages with different types
  // (This is handled by the graph merge(), which already returns ConflictNode[])

  return conflicts;
}

function getRuntimeStages(
  iastOutput: IastOutput | undefined,
  dastOutput: DastOutput | undefined,
): StageName[] {
  const stages: StageName[] = ['ast'];
  if (iastOutput && iastOutput.events.length > 0) stages.push('iast');
  if (dastOutput && dastOutput.results.length > 0) stages.push('dast');
  return stages;
}
