/**
 * Pipeline orchestrator — chains the 6 stages (SCA → AST → TIA → IAST → DAST → Merge)
 * and executes them in sequence, threading the PipelineContext through each stage.
 *
 * Optional stages (IAST, DAST) are skipped gracefully when disabled or when
 * their data files are missing. The orchestrator catches per-stage errors
 * and records them in diagnostics (RULE-02: never skip a file entirely on error).
 */

import type { PipelineConfig, PipelineContext, PipelineStage } from './stageInterface';
import type { PipelineOutput, StageName, StageDiagnostics } from './types';
import { CoverageKnowledgeGraph } from './graph';
import { DEFAULT_PIPELINE_CONFIG } from './stageInterface';
import { ScaStage } from './stages/sca/scaStage';
import { AstStage } from './stages/ast/astStage';
import { TiaStage } from './stages/tia/tiaStage';
import { IastStage } from './stages/iast/iastStage';
import { DastStage } from './stages/dast/dastStage';
import { MergeStage } from './stages/merge/mergeStage';

/**
 * Options for running the pipeline.
 */
export interface PipelineRunOptions {
  /** Project root directory */
  projectRoot: string;
  /** Pipeline configuration (partial — defaults are merged) */
  config?: Partial<Omit<PipelineConfig, 'projectRoot'>>;
  /** If true, suppress console output */
  silent?: boolean;
}

/**
 * Result of a pipeline run.
 */
export interface PipelineRunResult {
  output: PipelineOutput;
  context: PipelineContext;
  durationMs: number;
  stagesDurationMs: Record<StageName, number>;
}

/**
 * Run the full 6-stage coverage pipeline.
 *
 * @param options - Pipeline run options
 * @returns PipelineRunResult with the final output, context, and timing information
 */
export async function runPipeline(options: PipelineRunOptions): Promise<PipelineRunResult> {
  const startTime = Date.now();

  // Build full config with defaults
  const config: PipelineConfig = {
    projectRoot: options.projectRoot,
    ...DEFAULT_PIPELINE_CONFIG,
    ...options.config,
  };

  // Initialize context
  const context: PipelineContext = {
    projectRoot: options.projectRoot,
    config,
    graph: new CoverageKnowledgeGraph(),
    diagnostics: new Map(),
    stageOutputs: new Map(),
  };

  // Build stage pipeline
  const stages: PipelineStage[] = [
    new ScaStage(),
    new AstStage(),
    new TiaStage(),
  ];

  // IAST and DAST are optional
  if (config.enableIast) {
    stages.push(new IastStage());
  }
  if (config.enableDast) {
    stages.push(new DastStage());
  }

  // Merge is always last
  stages.push(new MergeStage());

  const stagesDurationMs: Record<string, number> = {};

  // Execute stages in sequence
  for (const stage of stages) {
    const stageStart = Date.now();

    if (!options.silent) {
      // Log stage name — caller can capture stdout if needed
    }

    try {
      await stage.execute(context);
    } catch (err) {
      // Record error in diagnostics but don't fail the pipeline for optional stages
      const errorMsg = err instanceof Error ? err.message : String(err);

      if (!context.diagnostics.has(stage.name)) {
        context.diagnostics.set(stage.name, {
          stageName: stage.name,
          filesScanned: [],
          filesSkipped: [],
          durationMs: Date.now() - stageStart,
          metadata: { error: errorMsg, failed: true },
        });
      }

      if (!stage.optional) {
        throw new Error(`Pipeline stage '${stage.name}' failed: ${errorMsg}`);
      }
      // Optional stages are swallowed — continue pipeline
    }

    stagesDurationMs[stage.name] = Date.now() - stageStart;
  }

  // Get the merge output
  const mergeOutput = context.stageOutputs.get('merge') as PipelineOutput;
  if (!mergeOutput) {
    throw new Error('Pipeline merge stage did not produce output');
  }

  return {
    output: mergeOutput,
    context,
    durationMs: Date.now() - startTime,
    stagesDurationMs: stagesDurationMs as Record<StageName, number>,
  };
}

/**
 * Create a pipeline context for testing or manual usage.
 */
export function createPipelineContext(
  projectRoot: string,
  configOverrides?: Partial<Omit<PipelineConfig, 'projectRoot'>>,
): PipelineContext {
  const config: PipelineConfig = {
    projectRoot,
    ...DEFAULT_PIPELINE_CONFIG,
    ...configOverrides,
  };

  return {
    projectRoot,
    config,
    graph: new CoverageKnowledgeGraph(),
    diagnostics: new Map(),
    stageOutputs: new Map(),
  };
}
