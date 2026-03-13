/**
 * DAST Stage — Stage 5 of the coverage pipeline (optional).
 *
 * Reads dast-results.json if present, processes probe results,
 * emits conflicts, and records endpoint reachability confirmations.
 *
 * When this stage is skipped (no DAST data), the pipeline continues
 * without DAST confirmation (confidence cannot reach 'verified').
 */

import * as fs from 'fs';
import * as path from 'path';
import type { PipelineStage, PipelineContext } from '../../stageInterface';
import type { StageDiagnostics, GraphNode } from '../../types';
import type { DastOutput, DastResultsFile } from './types';
import { emitDastConflicts } from './conflictEmitter';

export class DastStage implements PipelineStage<DastOutput> {
  readonly name = 'dast' as const;
  readonly optional = true;

  async execute(context: PipelineContext): Promise<DastOutput> {
    const startTime = Date.now();
    const filesScanned: string[] = [];
    const filesSkipped: Array<{ file: string; reason: string }> = [];

    const output: DastOutput = {
      results: [],
      confirmedEndpoints: [],
      unreachableEndpoints: [],
      conflictsEmitted: 0,
    };

    // Determine the DAST results file path
    const resultsPath = context.config.dastResultsPath
      ?? path.join(context.projectRoot, 'dast-results.json');

    // Try to read the results file
    if (!fs.existsSync(resultsPath)) {
      context.diagnostics.set('dast', {
        stageName: 'dast',
        filesScanned,
        filesSkipped: [{ file: resultsPath, reason: 'file-not-found' }],
        durationMs: Date.now() - startTime,
        metadata: { skipped: true, reason: 'no-dast-results-file' },
      });
      context.stageOutputs.set('dast', output);
      return output;
    }

    filesScanned.push(resultsPath);

    let resultsFile: DastResultsFile;
    try {
      const content = fs.readFileSync(resultsPath, 'utf-8');
      resultsFile = JSON.parse(content) as DastResultsFile;
    } catch (err) {
      filesSkipped.push({
        file: resultsPath,
        reason: `parse-error: ${err instanceof Error ? err.message : String(err)}`,
      });
      context.diagnostics.set('dast', {
        stageName: 'dast',
        filesScanned,
        filesSkipped,
        durationMs: Date.now() - startTime,
        metadata: { skipped: true, reason: 'parse-error' },
      });
      context.stageOutputs.set('dast', output);
      return output;
    }

    if (!resultsFile.results || !Array.isArray(resultsFile.results)) {
      filesSkipped.push({ file: resultsPath, reason: 'invalid-format: missing results array' });
      context.diagnostics.set('dast', {
        stageName: 'dast',
        filesScanned,
        filesSkipped,
        durationMs: Date.now() - startTime,
        metadata: { skipped: true, reason: 'invalid-format' },
      });
      context.stageOutputs.set('dast', output);
      return output;
    }

    output.results = resultsFile.results;

    // Categorize results
    for (const result of resultsFile.results) {
      const endpointPath = result.normalizedPath ?? result.path;
      const endpointId = `endpoint:${result.method.toUpperCase()}:${endpointPath}`;

      if (result.reachable) {
        if (!output.confirmedEndpoints.includes(endpointId)) {
          output.confirmedEndpoints.push(endpointId);
        }
      } else {
        if (!output.unreachableEndpoints.includes(endpointId)) {
          output.unreachableEndpoints.push(endpointId);
        }
      }
    }

    // Add DAST-discovered endpoints that don't exist in the graph (RULE-09: don't override types)
    for (const result of resultsFile.results) {
      if (!result.reachable) continue;

      const endpointPath = result.normalizedPath ?? result.path;
      const endpointId = `endpoint:${result.method.toUpperCase()}:${endpointPath}`;

      if (!context.graph.hasNode(endpointId)) {
        // New endpoint discovered by DAST — add it as a DAST-sourced node
        const node: GraphNode = {
          id: endpointId,
          type: 'endpoint',
          label: `${result.method.toUpperCase()} ${endpointPath}`,
          sourceStage: 'dast',
          metadata: {
            method: result.method.toUpperCase(),
            path: endpointPath,
            statusCode: result.statusCode,
            discoveredBy: 'dast',
          },
        };
        context.graph.addNode(node);
      }
    }

    // Emit conflicts (spec §7)
    const conflicts = emitDastConflicts(resultsFile.results, context.graph);
    output.conflictsEmitted = conflicts.length;

    // Add conflict nodes to graph
    for (const conflict of conflicts) {
      const conflictNodeId = conflict.conflictId;
      if (!context.graph.hasNode(conflictNodeId)) {
        const node: GraphNode = {
          id: conflictNodeId,
          type: 'conflict',
          label: `Conflict: ${conflict.type}`,
          sourceStage: 'dast',
          metadata: {
            conflictType: conflict.type,
            stages: conflict.stages,
            detail: conflict.detail,
            suggestedAction: conflict.suggestedAction,
            severity: conflict.severity,
          },
        };
        context.graph.addNode(node);

        // Link conflict to the affected endpoint
        if (context.graph.hasNode(conflict.nodeId)) {
          context.graph.addEdge({
            id: `${conflictNodeId}->conflicts-with->${conflict.nodeId}`,
            type: 'conflicts-with',
            sourceNodeId: conflictNodeId,
            targetNodeId: conflict.nodeId,
            sourceStage: 'dast',
            metadata: { conflictType: conflict.type },
          });
        }
      }
    }

    // Record diagnostics
    const diagnostics: StageDiagnostics = {
      stageName: 'dast',
      filesScanned,
      filesSkipped,
      durationMs: Date.now() - startTime,
      metadata: {
        totalResults: output.results.length,
        confirmedEndpoints: output.confirmedEndpoints.length,
        unreachableEndpoints: output.unreachableEndpoints.length,
        conflictsEmitted: output.conflictsEmitted,
      },
    };
    context.diagnostics.set('dast', diagnostics);

    context.stageOutputs.set('dast', output);
    return output;
  }
}
