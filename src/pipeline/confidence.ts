/**
 * Confidence scoring for the Coverage Knowledge Graph.
 *
 * Implements all confidence rules from spec §10:
 *
 * | Evidence                                      | Confidence |
 * |-----------------------------------------------|------------|
 * | AST only (no TIA link)                        | low        |
 * | AST + TIA                                     | medium     |
 * | AST + TIA + (IAST or DAST)                    | high       |
 * | AST + TIA + IAST + DAST + assertion confirmed | verified   |
 * | Any mock-boundary on path                     | Cap medium |
 * | Any resolution: partial                       | Cap medium |
 * | Any url-resolution: symbolic                  | Cap medium |
 * | Static-only mode (no IAST/DAST)               | Cap medium |
 */

import type { PipelineConfidence, ConfidenceEvidence, StageName } from './types';
import type { CoverageKnowledgeGraph } from './graph';

/**
 * Ordered confidence levels from lowest to highest.
 * Used for comparison and capping operations.
 */
const CONFIDENCE_ORDER: PipelineConfidence[] = ['low', 'medium', 'high', 'verified'];

function confidenceRank(level: PipelineConfidence): number {
  return CONFIDENCE_ORDER.indexOf(level);
}

/**
 * Compute the base confidence level from the evidence present.
 * Does NOT apply caps — use `applyConfidenceCaps` for that.
 */
export function computeBaseConfidence(evidence: ConfidenceEvidence): PipelineConfidence {
  const hasAst = evidence.sourceStages.includes('ast');
  const hasTia = evidence.sourceStages.includes('tia');
  const hasIast = evidence.hasIastConfirmation;
  const hasDast = evidence.hasDastConfirmation;
  const hasAssertion = evidence.hasAssertionConfirmation;

  // Highest: all stages + assertion confirmed
  if (hasAst && hasTia && hasIast && hasDast && hasAssertion) {
    return 'verified';
  }

  // High: static + at least one runtime stage
  if (hasAst && hasTia && (hasIast || hasDast)) {
    return 'high';
  }

  // Medium: AST + TIA agree
  if (hasAst && hasTia) {
    return 'medium';
  }

  // Low: AST only or no evidence
  return 'low';
}

/**
 * Apply all confidence caps based on evidence.
 * Caps are applied after the base level is computed.
 *
 * | Condition                    | Cap     |
 * |------------------------------|---------|
 * | Mock boundary on path        | medium  |
 * | Partial resolution           | medium  |
 * | Symbolic URL                 | medium  |
 * | Static-only mode             | medium  |
 */
export function applyConfidenceCaps(
  baseLevel: PipelineConfidence,
  evidence: ConfidenceEvidence,
): PipelineConfidence {
  let capped = baseLevel;

  if (evidence.hasMockBoundary) {
    capped = capConfidence(capped, 'medium');
  }

  if (evidence.hasPartialResolution) {
    capped = capConfidence(capped, 'medium');
  }

  if (evidence.hasSymbolicUrl) {
    capped = capConfidence(capped, 'medium');
  }

  if (evidence.isStaticOnlyMode) {
    capped = capConfidence(capped, 'medium');
  }

  return capped;
}

/**
 * Full confidence computation: base level + caps.
 * This is the primary entry point for confidence scoring.
 */
export function computeConfidence(evidence: ConfidenceEvidence): PipelineConfidence {
  const base = computeBaseConfidence(evidence);
  return applyConfidenceCaps(base, evidence);
}

/**
 * Cap a confidence level to at most `maxLevel`.
 * Returns the minimum of `current` and `maxLevel`.
 */
export function capConfidence(
  current: PipelineConfidence,
  maxLevel: PipelineConfidence,
): PipelineConfidence {
  const currentRank = confidenceRank(current);
  const maxRank = confidenceRank(maxLevel);
  return currentRank <= maxRank ? current : maxLevel;
}

/**
 * Compare two confidence levels.
 * Returns negative if a < b, zero if equal, positive if a > b.
 */
export function compareConfidence(
  a: PipelineConfidence,
  b: PipelineConfidence,
): number {
  return confidenceRank(a) - confidenceRank(b);
}

/**
 * Return the minimum (weakest) confidence level from an array.
 * Implements RULE-06: confidence reflects the worst contributor.
 */
export function minConfidence(levels: PipelineConfidence[]): PipelineConfidence {
  if (levels.length === 0) return 'low';
  let min: PipelineConfidence = levels[0];
  for (let i = 1; i < levels.length; i++) {
    if (confidenceRank(levels[i]) < confidenceRank(min)) {
      min = levels[i];
    }
  }
  return min;
}

/**
 * Check whether any node on a path in the graph is of type `mock-boundary`.
 * Used to determine if a coverage path is mock-limited.
 */
export function hasMockBoundaryOnPath(
  graph: CoverageKnowledgeGraph,
  pathNodeIds: string[],
): boolean {
  for (const nodeId of pathNodeIds) {
    const node = graph.getNode(nodeId);
    if (node?.type === 'mock-boundary') return true;
  }
  return false;
}

/**
 * Check whether any node on a path has `resolution: partial` in its metadata.
 */
export function hasPartialResolution(
  graph: CoverageKnowledgeGraph,
  pathNodeIds: string[],
): boolean {
  for (const nodeId of pathNodeIds) {
    const node = graph.getNode(nodeId);
    if (node?.metadata?.resolution === 'partial') return true;
  }
  return false;
}

/**
 * Build a ConfidenceEvidence object from a coverage path in the graph.
 * Inspects the nodes and their source stages to determine what evidence exists.
 *
 * Optional `iastConfirmed` and `dastConfirmed` flags allow the caller to
 * inject runtime confirmation state that may not be discoverable by walking
 * `pathNodeIds` alone (e.g. when IAST/DAST nodes are not directly on the
 * endpoint→test path in the graph).
 */
export function buildConfidenceEvidence(
  graph: CoverageKnowledgeGraph,
  pathNodeIds: string[],
  isStaticOnlyMode: boolean,
  iastConfirmed?: boolean,
  dastConfirmed?: boolean,
): ConfidenceEvidence {
  const sourceStages = new Set<StageName>();
  let hasIastConfirmation = false;
  let hasDastConfirmation = false;
  let hasAssertionConfirmation = false;
  let hasMockBoundary = false;
  let hasPartial = false;
  let hasSymbolicUrl = false;

  for (const nodeId of pathNodeIds) {
    const node = graph.getNode(nodeId);
    if (!node) continue;

    sourceStages.add(node.sourceStage);

    if (node.type === 'runtime-event' && node.sourceStage === 'iast') {
      hasIastConfirmation = true;
    }
    if (node.sourceStage === 'dast') {
      hasDastConfirmation = true;
    }
    if (node.type === 'assertion') {
      hasAssertionConfirmation = true;
    }
    if (node.type === 'mock-boundary') {
      hasMockBoundary = true;
    }
    if (node.metadata?.resolution === 'partial') {
      hasPartial = true;
    }
    if (node.metadata?.urlResolution === 'symbolic') {
      hasSymbolicUrl = true;
    }
  }

  return {
    sourceStages: Array.from(sourceStages),
    hasIastConfirmation: hasIastConfirmation || (iastConfirmed ?? false),
    hasDastConfirmation: hasDastConfirmation || (dastConfirmed ?? false),
    hasAssertionConfirmation,
    hasMockBoundary,
    hasPartialResolution: hasPartial,
    hasSymbolicUrl,
    isStaticOnlyMode,
  };
}
