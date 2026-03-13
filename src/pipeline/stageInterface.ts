/**
 * Pipeline stage interface and execution context.
 *
 * Every stage in the 6-stage pipeline (SCA → AST → TIA → IAST → DAST → Merge)
 * implements `PipelineStage`. The `PipelineContext` is threaded through all
 * stages and accumulates the knowledge graph, diagnostics, and stage outputs.
 */

import type { CoverageKnowledgeGraph } from './graph';
import type { StageName, StageDiagnostics } from './types';
import type { AstAnalysisConfig } from '../config/types';

// ─── Pipeline configuration ──────────────────────────────────────────────────

export interface PipelineConfig {
  projectRoot: string;
  enableIast: boolean;
  enableDast: boolean;
  /** DAST probing rate limit in requests/second. Default: 10. (RULE-17) */
  dastRateLimit: number;
  /** Abstract layer traversal depth cap. Default: 5. (RULE-05) */
  traversalDepthCap: number;
  /** Per-file timeout in ms. Default: 30000. (RULE-16) */
  fileTimeoutMs: number;
  /** Path to IAST events file. Default: 'iast-events.json' in project root. */
  iastEventsPath?: string;
  /** Path to DAST results file. Default: 'dast-results.json' in project root. */
  dastResultsPath?: string;
  /** Existing AST analysis config (passed through to analyzers). */
  astConfig?: AstAnalysisConfig;
}

export const DEFAULT_PIPELINE_CONFIG: Omit<PipelineConfig, 'projectRoot'> = {
  enableIast: false,
  enableDast: false,
  dastRateLimit: 10,
  traversalDepthCap: 5,
  fileTimeoutMs: 30_000,
};

// ─── Pipeline context (threaded through all stages) ──────────────────────────

export interface PipelineContext {
  projectRoot: string;
  config: PipelineConfig;
  graph: CoverageKnowledgeGraph;
  diagnostics: Map<StageName, StageDiagnostics>;
  /** Accumulated output from each completed stage. */
  stageOutputs: Map<StageName, unknown>;
}

// ─── Pipeline stage interface ────────────────────────────────────────────────

export interface PipelineStage<TOutput = unknown> {
  /** Stage identifier. */
  readonly name: StageName;
  /** If true, the pipeline continues even if this stage is skipped or fails. */
  readonly optional: boolean;
  /** Execute the stage, enriching the context's graph and diagnostics. */
  execute(context: PipelineContext): Promise<TOutput>;
}
