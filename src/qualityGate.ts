import type { CoverageResult } from './reporting';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Details of a single category that failed its threshold check */
export interface QualityGateFailure {
  category: string;
  expected: number;
  actual: number;
  gap: number;
}

/** Structured result of a quality gate evaluation */
export interface QualityGateResult {
  passed: boolean;
  /** The effective threshold applied (global scalar or per-category map) */
  threshold: number | Record<string, number>;
  /** Actual coverage per category */
  actual: Record<string, number>;
  /** Details of every category that did not meet its threshold */
  failures: QualityGateFailure[];
}

/** Configuration accepted by evaluateQualityGate */
export interface QualityGateConfig {
  /** Per-category thresholds; a 'global' key sets the default for all categories */
  thresholds?: Record<string, number | undefined>;
  /** Branch-aware thresholds keyed by branch glob (e.g. "main", "feature/*") */
  thresholdsByBranch?: Record<string, Record<string, number | undefined>>;
  qualityGate?: {
    enabled?: boolean;
    failBuildOnThresholdMiss?: boolean;
    /** "strict" = all categories must pass; "warn" = log but do not fail */
    mode?: 'strict' | 'warn';
  };
}

// ─── Branch matching ──────────────────────────────────────────────────────────

/**
 * Determine whether a branch name matches a glob-style pattern.
 * Supports `*` (single segment) and `**` (any segments).
 */
export function matchesBranchPattern(branchName: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.+')
    .replace(/\*/g, '[^/]+');
  return new RegExp(`^${regexStr}$`).test(branchName);
}

/**
 * Resolve the effective threshold map for the given branch, merging
 * branch-aware overrides on top of the global threshold config.
 */
export function resolveThresholdsForBranch(
  config: QualityGateConfig,
  branchName?: string,
): Record<string, number> {
  const baseThresholds: Record<string, number> = {};

  // Start from the global thresholds config
  if (config.thresholds) {
    for (const [key, value] of Object.entries(config.thresholds)) {
      if (value !== undefined) {
        baseThresholds[key] = value;
      }
    }
  }

  // Apply branch-aware overrides if a branch is specified
  if (branchName && config.thresholdsByBranch) {
    for (const [pattern, overrides] of Object.entries(config.thresholdsByBranch)) {
      if (matchesBranchPattern(branchName, pattern)) {
        for (const [key, value] of Object.entries(overrides)) {
          if (value !== undefined) {
            baseThresholds[key] = value;
          }
        }
        break; // first matching pattern wins
      }
    }
  }

  return baseThresholds;
}

/**
 * Compute the effective per-category threshold for a given category,
 * using the 'global' key as the default when no category-specific value exists.
 */
export function effectiveThresholdForCategory(
  thresholds: Record<string, number>,
  category: string,
): number | undefined {
  if (thresholds[category] !== undefined) return thresholds[category];
  if (thresholds['global'] !== undefined) return thresholds['global'];
  return undefined;
}

// ─── Core evaluation ──────────────────────────────────────────────────────────

/**
 * Evaluate all coverage results against configured thresholds.
 *
 * Default behaviour when no thresholds are configured: every category must
 * reach 100% (spec requirement: "default threshold = 100%").
 *
 * @param results      Coverage results from one or more analysis passes.
 * @param config       Quality-gate / threshold configuration.
 * @param branchName   Current git branch name (used for branch-aware thresholds).
 */
export function evaluateQualityGate(
  results: CoverageResult[],
  config: QualityGateConfig,
  branchName?: string,
): QualityGateResult {
  const gateEnabled = config.qualityGate?.enabled !== false; // default enabled
  const mode = config.qualityGate?.mode ?? 'strict';

  const resolvedThresholds = resolveThresholdsForBranch(config, branchName);

  const actual: Record<string, number> = {};
  for (const r of results) {
    actual[r.type] = r.coveragePercent;
  }

  const failures: QualityGateFailure[] = [];

  if (gateEnabled) {
    for (const result of results) {
      const category = result.type;
      let threshold: number;

      if (Object.keys(resolvedThresholds).length > 0) {
        const t = effectiveThresholdForCategory(resolvedThresholds, category);
        if (t === undefined) continue; // no threshold for this category
        threshold = t;
      } else {
        // No threshold config at all → default to 100%
        threshold = 100;
      }

      if (result.coveragePercent < threshold) {
        failures.push({
          category,
          expected: threshold,
          actual: result.coveragePercent,
          gap: Number((threshold - result.coveragePercent).toFixed(2)),
        });
      }
    }
  }

  // In "warn" mode we still compute failures but mark as passed
  const passed = mode === 'warn' ? true : failures.length === 0;

  // Determine the threshold representation for the result
  const thresholdForResult: number | Record<string, number> =
    Object.keys(resolvedThresholds).length === 1 && resolvedThresholds['global'] !== undefined
      ? resolvedThresholds['global']
      : Object.keys(resolvedThresholds).length > 0
        ? (resolvedThresholds as Record<string, number>)
        : 100;

  return {
    passed,
    threshold: thresholdForResult,
    actual,
    failures,
  };
}
