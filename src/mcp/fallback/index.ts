/**
 * MCP integration – fallback AI interpreter.
 *
 * When MCP is disabled or unavailable this module generates a deterministic,
 * rule-based NormalizedAiAnalysis so that pipelines never break.
 *
 * Outputs are fully deterministic given the same inputs, making them suitable
 * for snapshot testing.
 */

import type { NormalizedAiAnalysis } from '../types';
import type { CoverageResult } from '../../reporting';
import type { SecurityScanSummary } from '../../security/types';

// ─── Coverage fallback ────────────────────────────────────────────────────────

export interface FallbackCoverageInput {
  results: CoverageResult[];
  thresholds?: Record<string, number | undefined>;
  gatePassed?: boolean;
  failedCategories?: string[];
}

/**
 * Generate a deterministic AI-style coverage summary without MCP.
 */
export function generateFallbackCoverageAnalysis(
  input: FallbackCoverageInput,
): NormalizedAiAnalysis {
  const failed = input.failedCategories ?? [];
  const allPass = failed.length === 0;

  const summary = allPass
    ? `All ${input.results.length} coverage categories meet or exceed their configured thresholds. ` +
      `The overall quality gate has passed.`
    : `${failed.length} of ${input.results.length} coverage categories failed their quality gate. ` +
      `Immediate attention is required for: ${failed.join(', ')}.`;

  const keyFindings: string[] = input.results.map((r) => {
    const threshold = input.thresholds?.[r.type];
    const status = threshold !== undefined
      ? r.coveragePercent >= threshold ? 'meets threshold' : 'below threshold'
      : 'no threshold configured';
    return `${r.type}: ${r.coveragePercent.toFixed(1)}% (${status})`;
  });

  const topRisks: string[] = failed.map((cat) => {
    const r = input.results.find((x) => x.type === cat);
    const threshold = input.thresholds?.[cat] ?? 0;
    if (!r) return `${cat}: gate failed`;
    const gap = threshold - r.coveragePercent;
    return `${cat} coverage is ${gap.toFixed(1)}% below the required threshold`;
  });

  const missingCoverageAreas: string[] = input.results
    .filter((r) => r.totalItems > r.coveredItems)
    .map((r) => `${r.type}: ${r.totalItems - r.coveredItems} uncovered item(s)`);

  const recommendedActions: string[] = allPass
    ? [
        'All gates passed — consider raising thresholds to enforce stricter coverage.',
        'Review uncovered items and add targeted tests to reach 100%.',
      ]
    : [
        ...failed.map((cat) => `Add tests to improve ${cat} coverage above the configured threshold.`),
        'Re-run the coverage analysis after adding tests.',
        'Consider adding coverage for critical paths first.',
      ];

  return {
    summary,
    keyFindings,
    topRisks,
    recommendedActions,
    missingCoverageAreas,
    confidence: 'high',
    isFallback: true,
    category: 'coverage',
  };
}

// ─── Security fallback ────────────────────────────────────────────────────────

export interface FallbackSecurityInput {
  scanSummary: SecurityScanSummary;
}

/**
 * Generate a deterministic AI-style security analysis without MCP.
 */
export function generateFallbackSecurityAnalysis(
  input: FallbackSecurityInput,
): NormalizedAiAnalysis {
  const s = input.scanSummary;
  const criticalHigh = s.bySeverity.CRITICAL + s.bySeverity.HIGH;
  const gatePassed = s.gateResult?.passed ?? true;

  const summary = gatePassed
    ? `Security scan completed with ${s.totalFindings} finding(s). ` +
      `No critical or high findings exceed gate thresholds.`
    : `Security gate FAILED. ${criticalHigh} critical/high severity finding(s) require ` +
      `immediate remediation before this change can be merged.`;

  const keyFindings: string[] = [
    `Total findings: ${s.totalFindings}`,
    `Critical: ${s.bySeverity.CRITICAL}`,
    `High: ${s.bySeverity.HIGH}`,
    `Medium: ${s.bySeverity.MEDIUM}`,
    `Low: ${s.bySeverity.LOW}`,
    `Scanners run: ${s.scannersRun.join(', ')}`,
  ];

  const topRisks: string[] = [];
  if (s.bySeverity.CRITICAL > 0) {
    topRisks.push(`${s.bySeverity.CRITICAL} CRITICAL finding(s) must be fixed immediately`);
  }
  if (s.bySeverity.HIGH > 0) {
    topRisks.push(`${s.bySeverity.HIGH} HIGH finding(s) pose significant risk`);
  }
  if (s.bySeverity.MEDIUM > 0) {
    topRisks.push(`${s.bySeverity.MEDIUM} MEDIUM finding(s) should be addressed soon`);
  }

  const likelyRootCauses: string[] = [];
  const cats = Object.entries(s.byCategory ?? {})
    .filter(([, count]) => count > 0)
    .map(([cat]) => cat);
  if (cats.length > 0) {
    likelyRootCauses.push(`Findings span categories: ${cats.join(', ')}`);
  }

  const recommendedActions: string[] = gatePassed
    ? [
        'Review all remaining findings and assign remediation owners.',
        'Consider tightening gate thresholds to catch more issues.',
      ]
    : [
        'Fix all CRITICAL and HIGH findings before merging.',
        'Re-run security scan to confirm fixes.',
        'Review scanner configurations to reduce false positives.',
      ];

  return {
    summary,
    keyFindings,
    topRisks,
    recommendedActions,
    likelyRootCauses,
    confidence: 'high',
    isFallback: true,
    category: 'security',
  };
}

// ─── Generic fallback ─────────────────────────────────────────────────────────

/**
 * Generate a minimal deterministic AI analysis for any coverage category.
 */
export function generateFallbackAnalysis(
  category: string,
  coveragePercent: number,
  threshold?: number,
): NormalizedAiAnalysis {
  const gatePassed = threshold === undefined || coveragePercent >= threshold;
  const summary = gatePassed
    ? `${category} analysis passed with ${coveragePercent.toFixed(1)}% coverage.`
    : `${category} coverage is ${coveragePercent.toFixed(1)}%, below the required ${threshold!.toFixed(1)}%.`;

  return {
    summary,
    keyFindings: [`Coverage: ${coveragePercent.toFixed(1)}%`],
    topRisks: gatePassed ? [] : [`Coverage gap of ${(threshold! - coveragePercent).toFixed(1)}%`],
    recommendedActions: gatePassed
      ? ['Maintain current coverage level.']
      : ['Add tests to close the coverage gap.'],
    confidence: 'high',
    isFallback: true,
    category,
  };
}
