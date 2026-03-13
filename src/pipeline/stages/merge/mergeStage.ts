/**
 * Merge Stage — Stage 6 (final) of the coverage pipeline.
 *
 * Responsibilities:
 * 1. Run conflict detection across all stage outputs
 * 2. Build coverage mappings for every endpoint
 * 3. Compute the final pipeline summary
 * 4. Produce the `PipelineOutput` with graph, sections, diagnostics, summary
 */

import type { PipelineStage, PipelineContext } from '../../stageInterface';
import type {
  StageDiagnostics,
  PipelineOutput,
  PipelineSections,
  PipelineSummary,
  CoverageMapping,
  GraphNode,
  StageName,
} from '../../types';
import type { TiaOutput } from '../tia/types';
import type { IastOutput } from '../iast/types';
import type { DastOutput } from '../dast/types';
import { detectConflicts } from './conflictDetector';
import { buildCoverageMappings } from './coverageMappingBuilder';
import { computeSummary } from './summaryComputer';

/**
 * Output of the merge stage is the full `PipelineOutput`.
 */
export class MergeStage implements PipelineStage<PipelineOutput> {
  readonly name = 'merge' as const;
  readonly optional = false;

  async execute(context: PipelineContext): Promise<PipelineOutput> {
    const startTime = Date.now();

    // Retrieve upstream stage outputs
    const tiaOutput = context.stageOutputs.get('tia') as TiaOutput | undefined;
    const iastOutput = context.stageOutputs.get('iast') as IastOutput | undefined;
    const dastOutput = context.stageOutputs.get('dast') as DastOutput | undefined;

    // Determine if we're in static-only mode (no IAST/DAST data)
    const isStaticOnlyMode =
      (iastOutput?.events.length ?? 0) === 0 && (dastOutput?.results.length ?? 0) === 0;

    // 1. Detect conflicts
    const conflicts = detectConflicts(context.graph, iastOutput, dastOutput);

    // Add conflict nodes to graph
    for (const conflict of conflicts) {
      if (!context.graph.hasNode(conflict.conflictId)) {
        const node: GraphNode = {
          id: conflict.conflictId,
          type: 'conflict',
          label: `Conflict: ${conflict.type}`,
          sourceStage: 'merge',
          metadata: {
            conflictType: conflict.type,
            stages: conflict.stages,
            detail: conflict.detail,
            suggestedAction: conflict.suggestedAction,
            severity: conflict.severity,
          },
        };
        context.graph.addNode(node);

        // Link to affected node
        if (context.graph.hasNode(conflict.nodeId)) {
          context.graph.addEdge({
            id: `${conflict.conflictId}->conflicts-with->${conflict.nodeId}`,
            type: 'conflicts-with',
            sourceNodeId: conflict.conflictId,
            targetNodeId: conflict.nodeId,
            sourceStage: 'merge',
            metadata: {},
          });
        }
      }
    }

    // 2. Build coverage mappings
    const allMappings = buildCoverageMappings(
      context.graph,
      tiaOutput,
      iastOutput,
      dastOutput,
      isStaticOnlyMode,
    );

    // 3. Organize into sections
    const sections = organizeSections(allMappings, context.graph);

    // 4. Compute summary
    const summary = computeSummary(allMappings, tiaOutput);

    // 5. Serialize graph
    const graphSerialized = context.graph.toSerializable();

    // 6. Collect diagnostics
    const diagnosticsRecord: Record<string, StageDiagnostics> = {};
    for (const [stageName, diag] of context.diagnostics) {
      diagnosticsRecord[stageName] = diag;
    }

    // Add merge diagnostics
    const mergeDiagnostics: StageDiagnostics = {
      stageName: 'merge',
      filesScanned: [],
      filesSkipped: [],
      durationMs: Date.now() - startTime,
      metadata: {
        totalMappings: allMappings.length,
        conflictsDetected: conflicts.length,
        isStaticOnlyMode,
        graphNodeCount: graphSerialized.nodes.length,
        graphEdgeCount: graphSerialized.edges.length,
      },
    };
    context.diagnostics.set('merge', mergeDiagnostics);
    diagnosticsRecord['merge'] = mergeDiagnostics;

    // 7. Build final output
    const output: PipelineOutput = {
      graph: graphSerialized,
      sections,
      diagnostics: diagnosticsRecord as Record<StageName, StageDiagnostics>,
      summary,
    };

    context.stageOutputs.set('merge', output);
    return output;
  }
}

/**
 * Organize coverage mappings into the 6 output sections.
 */
function organizeSections(
  mappings: CoverageMapping[],
  graph: import('../../graph').CoverageKnowledgeGraph,
): PipelineSections {
  const endpoints: CoverageMapping[] = [];
  const parameters: CoverageMapping[] = [];
  const integrationFlows: CoverageMapping[] = [];
  const security: CoverageMapping[] = [];
  const errorHandling: CoverageMapping[] = [];
  const performance: CoverageMapping[] = [];

  for (const mapping of mappings) {
    switch (mapping.itemType) {
      case 'endpoint':
        endpoints.push(mapping);
        break;
      case 'service':
        integrationFlows.push(mapping);
        break;
      case 'error-branch':
        errorHandling.push(mapping);
        break;
      case 'security-path':
        security.push(mapping);
        break;
      case 'validation-rule':
        parameters.push(mapping);
        break;
      default:
        endpoints.push(mapping);
    }
  }

  return {
    endpoints,
    parameters,
    integrationFlows,
    security,
    errorHandling,
    performance,
  };
}
