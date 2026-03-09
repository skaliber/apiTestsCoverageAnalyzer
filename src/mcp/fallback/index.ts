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

// ─── Intelligence fallback ────────────────────────────────────────────────────

export interface FallbackIntelligenceInput {
  totalFindings: number;
  totalRecommendations: number;
  maxRiskScore: number;
  avgRiskScore: number;
  criticalUncoveredItems: number;
  unprotectedSecurityFindings: number;
  recommendationsByPriority: Record<string, number>;
  topRiskAreas?: string[];
  languages?: string[];
  frameworks?: string[];
}

/**
 * Generate a deterministic AI-style intelligence analysis without MCP.
 */
export function generateFallbackIntelligenceAnalysis(
  input: FallbackIntelligenceInput,
): NormalizedAiAnalysis {
  const hasIssues = input.totalFindings > 0 || input.criticalUncoveredItems > 0;
  const p0Count = input.recommendationsByPriority['P0'] ?? 0;
  const p1Count = input.recommendationsByPriority['P1'] ?? 0;

  const summary = hasIssues
    ? `Coverage Intelligence identified ${input.totalFindings} functional finding(s) and ` +
      `${input.totalRecommendations} missing test recommendation(s). ` +
      `Maximum risk score: ${input.maxRiskScore}. ` +
      (p0Count > 0 ? `${p0Count} P0 action(s) require immediate attention.` : '')
    : `No functional findings detected. All analyzed coverage areas appear to be adequately tested.`;

  const keyFindings: string[] = [
    `Functional findings: ${input.totalFindings}`,
    `Missing test recommendations: ${input.totalRecommendations}`,
    `Max risk score: ${input.maxRiskScore} (avg: ${input.avgRiskScore})`,
    `Critical uncovered items: ${input.criticalUncoveredItems}`,
    `Unprotected security findings: ${input.unprotectedSecurityFindings}`,
  ];

  const topRisks: string[] = [];
  if (p0Count > 0) topRisks.push(`${p0Count} P0 recommendation(s) require urgent action`);
  if (p1Count > 0) topRisks.push(`${p1Count} P1 recommendation(s) should be addressed soon`);
  if (input.unprotectedSecurityFindings > 0) {
    topRisks.push(`${input.unprotectedSecurityFindings} security finding(s) lack test protection`);
  }
  if (input.criticalUncoveredItems > 0) {
    topRisks.push(`${input.criticalUncoveredItems} critical flow(s) have zero test coverage`);
  }
  if (input.topRiskAreas && input.topRiskAreas.length > 0) {
    topRisks.push(...input.topRiskAreas.slice(0, 3).map((a) => `High-risk area: ${a}`));
  }

  const missingCoverageAreas: string[] = [];
  if (input.criticalUncoveredItems > 0) {
    missingCoverageAreas.push(`${input.criticalUncoveredItems} critical endpoint(s)/flow(s) with no test coverage`);
  }
  if (input.unprotectedSecurityFindings > 0) {
    missingCoverageAreas.push(`${input.unprotectedSecurityFindings} security finding(s) unprotected by tests`);
  }

  const frameworkHint = (input.frameworks ?? []).length > 0
    ? ` using ${(input.frameworks!).slice(0, 2).join(' or ')}`
    : '';

  const recommendedActions: string[] = [];
  if (p0Count > 0) recommendedActions.push(`Address ${p0Count} P0 recommendation(s) immediately${frameworkHint}`);
  if (p1Count > 0) recommendedActions.push(`Schedule ${p1Count} P1 recommendation(s) for next sprint${frameworkHint}`);
  if (input.unprotectedSecurityFindings > 0) {
    recommendedActions.push('Add security-focused tests to cover unprotected scanner findings');
  }
  if (recommendedActions.length === 0) {
    recommendedActions.push('Review intelligence report and schedule remaining recommendations');
  }
  recommendedActions.push('Re-run intelligence analysis after adding recommended tests');

  return {
    summary,
    keyFindings,
    topRisks,
    recommendedActions,
    missingCoverageAreas,
    confidence: 'high',
    isFallback: true,
    category: 'intelligence',
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
