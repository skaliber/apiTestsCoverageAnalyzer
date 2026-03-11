/**
 * Pipeline module — Cascaded Multi-Stage Coverage Mapping Engine.
 *
 * Public API for the 6-stage pipeline: SCA → AST → TIA → IAST → DAST → Merge.
 */

// ─── Core types ──────────────────────────────────────────────────────────────
export type {
  PipelineConfidence,
  StageName,
  TestLayer,
  CoverageClass,
  AssertionSource,
  UrlResolution,
  ConflictType,
  ConflictSeverity,
  GraphNodeType,
  GraphEdgeType,
  GraphNode,
  GraphEdge,
  MockType,
  MockBoundary,
  ConflictNode,
  CoverageMapping,
  CoverageMappingItemType,
  StageDiagnostics,
  SkippedFile,
  PipelineSummary,
  PipelineSections,
  PipelineOutput,
  ConfidenceEvidence,
} from './types';

// ─── Stage interface ─────────────────────────────────────────────────────────
export type { PipelineConfig, PipelineContext, PipelineStage } from './stageInterface';
export { DEFAULT_PIPELINE_CONFIG } from './stageInterface';

// ─── Graph ───────────────────────────────────────────────────────────────────
export { CoverageKnowledgeGraph } from './graph';

// ─── Confidence ──────────────────────────────────────────────────────────────
export {
  computeConfidence,
  computeBaseConfidence,
  applyConfidenceCaps,
  capConfidence,
  compareConfidence,
  minConfidence,
  hasMockBoundaryOnPath,
  hasPartialResolution,
  buildConfidenceEvidence,
} from './confidence';

// ─── Orchestrator ────────────────────────────────────────────────────────────
export { runPipeline, createPipelineContext } from './orchestrator';
export type { PipelineRunOptions, PipelineRunResult } from './orchestrator';

// ─── Stage classes ───────────────────────────────────────────────────────────
export { ScaStage } from './stages/sca/scaStage';
export { AstStage } from './stages/ast/astStage';
export { TiaStage } from './stages/tia/tiaStage';
export { IastStage } from './stages/iast/iastStage';
export { DastStage } from './stages/dast/dastStage';
export { MergeStage } from './stages/merge/mergeStage';

// ─── Stage-specific types ────────────────────────────────────────────────────
export type { ScaOutput } from './stages/sca/types';
export type { AstStageOutput } from './stages/ast/types';
export type { TiaOutput } from './stages/tia/types';
export type { IastOutput, IastEvent } from './stages/iast/types';
export type { DastOutput, DastProbeResult } from './stages/dast/types';
