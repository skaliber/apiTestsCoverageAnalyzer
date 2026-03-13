/**
 * IAST Stage — Stage 4 of the coverage pipeline (optional).
 *
 * Reads iast-events.json if present, creates runtime-event nodes in the graph,
 * and upgrades confidence for confirmed endpoints.
 *
 * When this stage is skipped (no IAST data), the pipeline continues
 * in static-only mode with confidence capped at medium.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { PipelineStage, PipelineContext } from '../../stageInterface';
import type { StageDiagnostics, GraphNode, GraphEdge } from '../../types';
import type { IastOutput, IastEvent, IastEventsFile } from './types';

export class IastStage implements PipelineStage<IastOutput> {
  readonly name = 'iast' as const;
  readonly optional = true;

  async execute(context: PipelineContext): Promise<IastOutput> {
    const startTime = Date.now();
    const filesScanned: string[] = [];
    const filesSkipped: Array<{ file: string; reason: string }> = [];

    const output: IastOutput = {
      events: [],
      confirmedEndpoints: [],
      runtimeEventNodesCreated: 0,
    };

    // Determine the IAST events file path
    const eventsPath = context.config.iastEventsPath
      ?? path.join(context.projectRoot, 'iast-events.json');

    // Try to read the events file
    if (!fs.existsSync(eventsPath)) {
      // No IAST data — stage produces empty output (pipeline continues in static-only mode)
      context.diagnostics.set('iast', {
        stageName: 'iast',
        filesScanned,
        filesSkipped: [{ file: eventsPath, reason: 'file-not-found' }],
        durationMs: Date.now() - startTime,
        metadata: { skipped: true, reason: 'no-iast-events-file' },
      });
      context.stageOutputs.set('iast', output);
      return output;
    }

    filesScanned.push(eventsPath);

    let eventsFile: IastEventsFile;
    try {
      const content = fs.readFileSync(eventsPath, 'utf-8');
      eventsFile = JSON.parse(content) as IastEventsFile;
    } catch (err) {
      filesSkipped.push({
        file: eventsPath,
        reason: `parse-error: ${err instanceof Error ? err.message : String(err)}`,
      });
      context.diagnostics.set('iast', {
        stageName: 'iast',
        filesScanned,
        filesSkipped,
        durationMs: Date.now() - startTime,
        metadata: { skipped: true, reason: 'parse-error' },
      });
      context.stageOutputs.set('iast', output);
      return output;
    }

    if (!eventsFile.events || !Array.isArray(eventsFile.events)) {
      filesSkipped.push({ file: eventsPath, reason: 'invalid-format: missing events array' });
      context.diagnostics.set('iast', {
        stageName: 'iast',
        filesScanned,
        filesSkipped,
        durationMs: Date.now() - startTime,
        metadata: { skipped: true, reason: 'invalid-format' },
      });
      context.stageOutputs.set('iast', output);
      return output;
    }

    output.events = eventsFile.events;

    // Process each event: create runtime-event nodes and link to endpoints
    for (const event of eventsFile.events) {
      if (!event.method || !event.path) continue;

      const endpointPath = event.normalizedPath ?? event.path;
      const endpointId = `endpoint:${event.method.toUpperCase()}:${endpointPath}`;
      const nodeId = `runtime-event:iast:${event.eventId ?? `${event.method}:${event.path}`}`;

      // Create runtime-event node
      if (!context.graph.hasNode(nodeId)) {
        const node: GraphNode = {
          id: nodeId,
          type: 'runtime-event',
          label: `IAST: ${event.method} ${event.path}`,
          sourceStage: 'iast',
          filePath: event.handlerFile,
          metadata: {
            method: event.method,
            path: event.path,
            normalizedPath: event.normalizedPath,
            statusCode: event.statusCode,
            testId: event.testId,
            timestamp: event.timestamp,
          },
        };
        context.graph.addNode(node);
        output.runtimeEventNodesCreated++;
      }

      // Link to endpoint node if it exists
      if (context.graph.hasNode(endpointId)) {
        const edgeId = `${nodeId}->observed-by->${endpointId}`;
        if (!context.graph.hasEdge(edgeId)) {
          context.graph.addEdge({
            id: edgeId,
            type: 'observed-by',
            sourceNodeId: nodeId,
            targetNodeId: endpointId,
            sourceStage: 'iast',
            metadata: { statusCode: event.statusCode },
          });
        }

        if (!output.confirmedEndpoints.includes(endpointId)) {
          output.confirmedEndpoints.push(endpointId);
        }
      }

      // Link to test file if known
      if (event.testId) {
        const testFileId = `file:${event.testId}`;
        if (context.graph.hasNode(testFileId)) {
          const edgeId = `${testFileId}->executes->${nodeId}`;
          if (!context.graph.hasEdge(edgeId)) {
            context.graph.addEdge({
              id: edgeId,
              type: 'executes',
              sourceNodeId: testFileId,
              targetNodeId: nodeId,
              sourceStage: 'iast',
              metadata: {},
            });
          }
        }
      }
    }

    // Record diagnostics
    const diagnostics: StageDiagnostics = {
      stageName: 'iast',
      filesScanned,
      filesSkipped,
      durationMs: Date.now() - startTime,
      metadata: {
        totalEvents: output.events.length,
        confirmedEndpoints: output.confirmedEndpoints.length,
        runtimeEventNodesCreated: output.runtimeEventNodesCreated,
      },
    };
    context.diagnostics.set('iast', diagnostics);

    context.stageOutputs.set('iast', output);
    return output;
  }
}
