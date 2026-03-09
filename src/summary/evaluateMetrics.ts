/**
 * Canonical metric evaluation model.
 *
 * evaluateMetrics() maps raw CoverageResult[] + thresholds → EvaluatedMetric[]
 * with well-defined PASS / FAIL / SKIPPED / N/A semantics.
 *
 * Status rules (applied in priority order):
 *  1. !executed                                    → SKIPPED
 *  2. executed && totalItems === 0                 → N/A  (nothing measurable)
 *  3. executed && applicable && !gateEvaluated     → N/A  (no threshold set)
 *  4. executed && gateEvaluated && passes          → PASS
 *  5. executed && gateEvaluated && fails           → FAIL
 *
 * Critical invariant: totalItems === 0 → always N/A, never PASS.
 */

import type { CoverageResult } from '../reporting';
import type { QualityGateResult } from '../qualityGate';
import { extractGaps } from './markdownRenderer';
import { type EvaluatedMetric, type MetricStatus, KNOWN_METRIC_TYPES } from './summaryTypes';

export { KNOWN_METRIC_TYPES } from './summaryTypes';
export type { EvaluatedMetric, MetricStatus } from './summaryTypes';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate all metrics and return EvaluatedMetric[] in KNOWN_METRIC_TYPES order,
 * with any additional (plugin) types appended at the end.
 *
 * @param results        Coverage results that actually ran.
 * @param thresholds     Per-type threshold map (may contain undefined values).
 * @param qualityGate    Quality gate result (may be undefined when no gate ran).
 * @param knownTypes     Ordered list of expected types (defaults to KNOWN_METRIC_TYPES).
 */
export function evaluateMetrics(
  results: CoverageResult[],
  thresholds: Record<string, number | undefined>,
  qualityGate: QualityGateResult | undefined,
  knownTypes: string[] = KNOWN_METRIC_TYPES,
): EvaluatedMetric[] {
  const resultByType = new Map<string, CoverageResult>();
  for (const r of results) {
    resultByType.set(r.type, r);
  }

  const evaluated: EvaluatedMetric[] = [];

  // Process known types in canonical order
  for (const type of knownTypes) {
    evaluated.push(buildMetric(type, resultByType, thresholds, qualityGate));
  }

  // Append any plugin-added types not in knownTypes
  for (const r of results) {
    if (!knownTypes.includes(r.type)) {
      evaluated.push(buildMetric(r.type, resultByType, thresholds, qualityGate));
    }
  }

  return evaluated;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildMetric(
  type: string,
  resultByType: Map<string, CoverageResult>,
  thresholds: Record<string, number | undefined>,
  qualityGate: QualityGateResult | undefined,
): EvaluatedMetric {
  const result = resultByType.get(type);
  const executed = result !== undefined;
  const totalItems = result?.totalItems ?? 0;
  const coveredItems = result?.coveredItems ?? 0;
  const coveragePercent = result?.coveragePercent ?? 0;
  const applicable = executed && totalItems > 0;
  const threshold = thresholds[type];
  const gateEvaluated = threshold !== undefined;

  const { status, reason } = computeStatus({
    executed,
    applicable,
    totalItems,
    coveragePercent,
    threshold,
    gateEvaluated,
    qualityGate,
    type,
  });

  const topGaps: string[] = result && applicable
    ? extractGaps(result, 5)
    : [];

  return {
    category: type,
    executed,
    applicable,
    totalItems,
    coveredItems,
    coveragePercent,
    threshold,
    gateEvaluated,
    status,
    reason,
    topGaps,
  };
}

function computeStatus(opts: {
  executed: boolean;
  applicable: boolean;
  totalItems: number;
  coveragePercent: number;
  threshold: number | undefined;
  gateEvaluated: boolean;
  qualityGate: QualityGateResult | undefined;
  type: string;
}): { status: MetricStatus; reason: string } {
  const { executed, applicable, totalItems, coveragePercent, threshold, gateEvaluated, qualityGate, type } = opts;

  if (!executed) {
    return { status: 'SKIPPED', reason: 'Analyzer did not run for this type' };
  }

  if (totalItems === 0) {
    return { status: 'N/A', reason: 'No items found to measure' };
  }

  if (!gateEvaluated) {
    return { status: 'N/A', reason: 'No threshold configured — gate not evaluated' };
  }

  if (!applicable) {
    // Should not reach here given totalItems > 0 implies applicable, but guard anyway
    return { status: 'N/A', reason: 'Not applicable' };
  }

  const gateFailed = qualityGate?.failures.some((f) => f.category === type) ?? false;

  if (gateFailed) {
    const gap = threshold! - coveragePercent;
    return {
      status: 'FAIL',
      reason: `Coverage ${coveragePercent.toFixed(2)}% is below threshold ${threshold!.toFixed(2)}% (gap: ${gap.toFixed(2)}%)`,
    };
  }

  return {
    status: 'PASS',
    reason: `Coverage ${coveragePercent.toFixed(2)}% meets threshold ${threshold!.toFixed(2)}%`,
  };
}
