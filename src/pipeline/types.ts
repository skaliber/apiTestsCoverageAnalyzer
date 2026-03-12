/**
 * Pipeline types — Coverage Knowledge Graph, nodes, edges, confidence,
 * conflict, coverage mapping, diagnostics, and output schema.
 *
 * These are the canonical types consumed by every stage in the 6-stage
 * cascaded pipeline (SCA → AST → TIA → IAST → DAST → Graph Merge).
 */

// Re-export existing types for interoperability
export type { ResolutionType } from '../coverage/deep-analysis/types';
export type { SupportedLanguage, AssertionType, SemanticModel } from '../ast/astTypes';

// ─── Confidence ──────────────────────────────────────────────────────────────

/**
 * Extended confidence level. Adds `verified` to the existing 3-level model.
 *
 * - `low`      — Only static AST evidence; no test linkage
 * - `medium`   — AST + TIA agree; no runtime confirmation
 * - `high`     — Static + at least one runtime stage (IAST or DAST) confirm
 * - `verified` — All stages confirm + assertion is traced and confirmed
 */
export type PipelineConfidence = 'low' | 'medium' | 'high' | 'verified';

// ─── Pipeline stage names ────────────────────────────────────────────────────

export type StageName = 'sca' | 'ast' | 'tia' | 'iast' | 'dast' | 'merge';

// ─── Test layer classification ───────────────────────────────────────────────

export type TestLayer =
  | 'unit'
  | 'component'
  | 'integration'
  | 'api'
  | 'e2e'
  | 'performance'
  | 'security';

// ─── Coverage class ──────────────────────────────────────────────────────────

export type CoverageClass =
  | 'unit-covered'
  | 'component-covered'
  | 'integration-covered'
  | 'api-covered'
  | 'e2e-covered'
  | 'mock-covered'
  | 'uncovered';

// ─── Assertion source resolution ─────────────────────────────────────────────

export type AssertionSource =
  | 'direct'
  | 'inherited'
  | 'fixture'
  | 'helper'
  | 'unresolved';

// ─── URL resolution status ───────────────────────────────────────────────────

export type UrlResolution = 'literal' | 'symbolic' | 'unresolved';

// ─── Conflict types ──────────────────────────────────────────────────────────

export type ConflictType =
  | 'dast-unreachable'
  | 'runtime-unconfirmed'
  | 'stage-disagreement'
  | 'security-annotation-not-enforced'
  | 'unhandled-server-error'
  | 'undeclared-endpoint';

export type ConflictSeverity = 'info' | 'warning' | 'error';

// ─── Graph node types ────────────────────────────────────────────────────────

export type GraphNodeType =
  // Production code nodes
  | 'endpoint'
  | 'parameter'
  | 'controller'
  | 'service'
  | 'repository'
  | 'model'
  | 'exception-branch'
  | 'route'
  | 'file'
  | 'class'
  | 'function'
  // Test nodes
  | 'test-file'
  | 'test-suite'
  | 'test-case'
  | 'assertion'
  | 'fixture'
  | 'helper'
  | 'base-test-class'
  // Derived / enrichment nodes
  | 'mock-boundary'
  | 'param-variant'
  | 'conflict'
  | 'runtime-event'
  | 'dependency';

// ─── Graph edge types ────────────────────────────────────────────────────────

export type GraphEdgeType =
  | 'defines'
  | 'calls'
  | 'validates'
  | 'throws'
  | 'handles'
  | 'tests'
  | 'asserts'
  | 'extends'
  | 'imports-helper'
  | 'mocks'
  | 'resolves-to'
  | 'param-expands-to'
  | 'depends-on'
  | 'observed-by'
  | 'executes'
  | 'conflicts-with'
  | 'router-mount'
  | 'injects'
  | 'implements';

// ─── Graph node ──────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  sourceStage: StageName;
  filePath?: string;
  line?: number;
  metadata: Record<string, unknown>;
}

// ─── Graph edge ──────────────────────────────────────────────────────────────

export interface GraphEdge {
  id: string;
  type: GraphEdgeType;
  sourceNodeId: string;
  targetNodeId: string;
  sourceStage: StageName;
  metadata: Record<string, unknown>;
}

// ─── Mock boundary ───────────────────────────────────────────────────────────

export type MockType =
  | 'return-value'
  | 'exception'
  | 'spy'
  | 'partial'
  | 'timer'
  | 'env';

export interface MockBoundary {
  testId: string;
  mockedNodeId: string;
  mockingLibrary: string;
  mockType: MockType;
  effect: 'coverage-limited';
}

// ─── Conflict node ───────────────────────────────────────────────────────────

export interface ConflictNode {
  conflictId: string;
  nodeId: string;
  type: ConflictType;
  stages: StageName[];
  stageOutputs: Record<string, unknown>;
  detail: string;
  suggestedAction: string;
  severity: ConflictSeverity;
}

// ─── Coverage mapping ────────────────────────────────────────────────────────

export type CoverageMappingItemType =
  | 'endpoint'
  | 'service'
  | 'repository'
  | 'error-branch'
  | 'security-path'
  | 'validation-rule';

export interface CoverageMapping {
  itemId: string;
  itemType: CoverageMappingItemType;
  linkedTests: string[];
  sourceStages: StageName[];
  confidence: PipelineConfidence;
  coverageClass: CoverageClass;
  mockBoundaries: string[];
  assertionSource: AssertionSource;
  assertionConfirmed: boolean;
  dastReachable: boolean | 'not-probed';
  runtimeConfirmed: boolean;
  urlResolution: UrlResolution;
  conflicts: string[];
  traversalDepth: number;
}

// ─── Stage diagnostics ───────────────────────────────────────────────────────

export interface SkippedFile {
  file: string;
  reason: string;
}

export interface StageDiagnostics {
  stageName: StageName;
  filesScanned: string[];
  filesSkipped: SkippedFile[];
  durationMs: number;
  metadata: Record<string, unknown>;
}

// ─── Pipeline summary ────────────────────────────────────────────────────────

export interface PipelineSummary {
  totalEndpoints: number;
  coveredEndpoints: number;
  verifiedEndpoints: number;
  uncoveredEndpoints: number;
  mockLimitedPaths: number;
  unresolvedAbstractions: number;
  conflictCount: number;
  coverageByLayer: Record<TestLayer, number>;
}

// ─── Pipeline output schema (spec §11) ───────────────────────────────────────

export interface PipelineSections {
  endpoints: CoverageMapping[];
  parameters: CoverageMapping[];
  integrationFlows: CoverageMapping[];
  security: CoverageMapping[];
  errorHandling: CoverageMapping[];
  performance: CoverageMapping[];
}

export interface PipelineOutput {
  graph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  sections: PipelineSections;
  diagnostics: Record<StageName, StageDiagnostics>;
  summary: PipelineSummary;
}

// ─── Confidence evidence (input to scorer) ───────────────────────────────────

export interface ConfidenceEvidence {
  sourceStages: StageName[];
  hasIastConfirmation: boolean;
  hasDastConfirmation: boolean;
  hasAssertionConfirmation: boolean;
  hasMockBoundary: boolean;
  hasPartialResolution: boolean;
  hasSymbolicUrl: boolean;
  isStaticOnlyMode: boolean;
}
