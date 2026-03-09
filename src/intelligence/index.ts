/**
 * Coverage Intelligence – Main Engine & Public API.
 *
 * Orchestrates the linkage engine, risk scorer, summary builder, and markdown
 * reporter to produce a complete IntelligenceReport from coverage inputs.
 */

export * from './types';
export * from './riskScoring';
export { runLinkageEngine, buildRecommendationFromFinding } from './linkageEngine';
export {
  renderCoverageIntelligenceMd,
  renderMissingTestsMd,
  renderRiskPrioritizationMd,
  writeIntelligenceReports,
} from './markdownReporter';

import type {
  IntelligenceInput,
  IntelligenceReport,
  IntelligenceSummary,
  Severity,
  RecommendationPriority,
} from './types';
import { runLinkageEngine } from './linkageEngine';
import { writeIntelligenceReports } from './markdownReporter';

// ─── Summary builder ──────────────────────────────────────────────────────────

function buildSummary(
  findings: IntelligenceReport['findings'],
  recommendations: IntelligenceReport['recommendations'],
): IntelligenceSummary {
  const findingsBySeverity: Record<Severity, number> = {
    LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0,
  };
  for (const f of findings) {
    findingsBySeverity[f.severity] = (findingsBySeverity[f.severity] ?? 0) + 1;
  }

  const recommendationsByPriority: Record<RecommendationPriority, number> = {
    P0: 0, P1: 0, P2: 0, P3: 0,
  };
  for (const r of recommendations) {
    recommendationsByPriority[r.priority] = (recommendationsByPriority[r.priority] ?? 0) + 1;
  }

  const scores = recommendations.map((r) => r.riskScore);
  const maxRiskScore = scores.length ? Math.max(...scores) : 0;
  const avgRiskScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  const criticalUncoveredItems =
    (findingsBySeverity.CRITICAL ?? 0) + (findingsBySeverity.HIGH ?? 0);

  const unprotectedSecurityFindings = findings.filter(
    (f) =>
      f.source === 'security-scan' ||
      f.category === 'security-finding-unprotected' ||
      f.category === 'missing-auth-test',
  ).length;

  // Top risk areas = endpoints / rules with highest-scored recommendations
  const topRiskAreas = recommendations
    .slice(0, 5)
    .map((r) =>
      r.endpoint
        ? `${r.endpoint.method ?? 'GET'} ${r.endpoint.path} (score ${r.riskScore})`
        : `${r.title} (score ${r.riskScore})`,
    );

  return {
    totalFindings: findings.length,
    findingsBySeverity,
    totalRecommendations: recommendations.length,
    recommendationsByPriority,
    maxRiskScore,
    avgRiskScore,
    criticalUncoveredItems,
    unprotectedSecurityFindings,
    topRiskAreas,
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run the full Coverage Intelligence engine.
 *
 * Inspects all coverage results and security findings, produces functional
 * findings, missing-test recommendations, risk scores, and (optionally) writes
 * AI-friendly reports to disk.
 */
export function runIntelligenceEngine(
  input: IntelligenceInput,
): IntelligenceReport {
  const { findings, recommendations } = runLinkageEngine(input);

  const summary = buildSummary(findings, recommendations);

  const report: IntelligenceReport = {
    generatedAt: new Date().toISOString(),
    projectName: input.projectName ?? 'unknown',
    findings,
    recommendations,
    summary,
  };

  if (input.outDir) {
    writeIntelligenceReports(report, input.outDir);
  }

  return report;
}
