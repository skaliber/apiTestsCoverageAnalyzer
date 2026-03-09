/**
 * Shared types for the metric evaluation model.
 *
 * MetricStatus encodes the four possible outcomes for a metric row:
 *   PASS     – ran, has items, gate configured, threshold met
 *   FAIL     – ran, has items, gate configured, threshold missed
 *   N/A      – ran but totalItems === 0 (nothing to measure), OR no threshold
 *   SKIPPED  – did not run at all (not present in coverage-summary.json)
 *
 * Critical invariant: totalItems === 0 → always N/A, never PASS.
 * ⚠️ PASS does not exist anywhere in the codebase.
 */

export type MetricStatus = 'PASS' | 'FAIL' | 'SKIPPED' | 'N/A';

export interface EvaluatedMetric {
  /** Coverage type identifier, e.g. "endpoint", "error" */
  category: string;
  /** True when this type appeared in coverage-summary.json */
  executed: boolean;
  /** True when executed AND totalItems > 0 */
  applicable: boolean;
  totalItems: number;
  coveredItems: number;
  coveragePercent: number;
  threshold: number | undefined;
  /** True when a threshold is configured for this type */
  gateEvaluated: boolean;
  status: MetricStatus;
  /** Human-readable explanation of the status */
  reason: string;
  /** Up to 5 uncovered item descriptions (for FAIL / low coverage) */
  topGaps: string[];
}

/** Canonical ordered list of all built-in metric types. */
export const KNOWN_METRIC_TYPES: string[] = [
  'endpoint',
  'parameter',
  'business',
  'integration',
  'error',
  'security',
  'performance',
  'resilience',
  'compatibility',
];
