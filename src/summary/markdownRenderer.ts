/**
 * Summary engine – low-level markdown rendering utilities and shared types.
 *
 * This module owns the SummaryResult type and the building blocks used by
 * both generateBuildSummary and generatePrSummary.
 */

import type { CoverageResult } from '../reporting';
import type { QualityGateResult } from '../qualityGate';
import type { SecurityScanSummary, ScannerResult } from '../security/types';
import type { EvaluatedMetric, MetricStatus } from './summaryTypes';

// ─── Public types ─────────────────────────────────────────────────────────────

/** A single rendered section inside a summary */
export interface SummarySection {
  /** Stable machine-readable identifier (e.g. "endpoint", "security-scan") */
  id: string;
  /** Human-readable title shown as a Markdown heading */
  title: string;
  /** Whether this section was included in the final output */
  included: boolean;
  /** Whether a quality gate was configured and evaluated for this section */
  gateEvaluated: boolean;
  /** Gate pass/fail result – only present when gateEvaluated is true */
  passed?: boolean;
  /** The complete Markdown content for this section */
  markdown: string;
}

/**
 * The result returned by generateBuildSummary and generatePrSummary.
 *
 * markdown  – The full rendered Markdown document.
 * sections  – Per-section metadata (used for gate-aware inclusion checking).
 * json      – Machine-readable representation of the same data.
 */
export interface SummaryResult {
  markdown: string;
  sections: SummarySection[];
  json: unknown;
}

/** Input accepted by the summary generators */
export interface SummaryInput {
  /** Coverage results from all analysis passes that actually ran */
  results: CoverageResult[];
  /** Quality gate evaluation output */
  qualityGate?: QualityGateResult;
  /** Security scan summary (if the security-scan command ran) */
  securityScan?: SecurityScanSummary;
  /** Individual scanner results (needed for per-scanner detail) */
  scannerResults?: ScannerResult[];
  /** Configured thresholds per category */
  thresholds?: Record<string, number | undefined>;
  /** Summary module configuration */
  summaryConfig?: SummaryConfig;
  /** Project name shown in the header */
  projectName?: string;
  /** Branch name */
  branch?: string;
  /** Commit SHA */
  commitSha?: string;
  /** Build identifier */
  buildId?: string;
  /** Full URL to the published Pages / HTML report */
  pagesUrl?: string;
  /** Coverage Intelligence summary (if the intelligence engine ran) */
  intelligenceSummary?: {
    totalFindings: number;
    totalRecommendations: number;
    maxRiskScore: number;
    avgRiskScore: number;
    criticalUncoveredItems: number;
    unprotectedSecurityFindings: number;
    recommendationsByPriority: Record<string, number>;
    topRiskAreas: string[];
  };
}

/** Summary module configuration block (mirrors coverage.config.json "summary" key) */
export interface SummaryConfig {
  enabled?: boolean;
  generatePrSummary?: boolean;
  generateBuildSummary?: boolean;
  generateAiSummary?: boolean;
  includeOnlyEvaluatedSections?: boolean;
  publishPrComment?: boolean;
  publishGithubStepSummary?: boolean;
  publishJenkinsSummary?: boolean;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Map a coverage-type string to a human-readable title.
 */
export function coverageTypeTitle(type: string): string {
  const titles: Record<string, string> = {
    endpoint: 'Endpoint Coverage',
    parameter: 'Parameter Coverage',
    business: 'Business Rule Coverage',
    integration: 'Integration Flow Coverage',
    error: 'Error Handling Coverage',
    security: 'Security Control Coverage',
    performance: 'Performance Coverage',
    resilience: 'Resilience Coverage',
    compatibility: 'Compatibility & Contract Coverage',
  };
  return titles[type] ?? `${type.charAt(0).toUpperCase()}${type.slice(1)} Coverage`;
}

/**
 * Render a two-column Markdown table row.
 */
export function tableRow(label: string, value: string): string {
  return `| **${label}** | ${value} |`;
}

/**
 * Render a status badge string.
 * "PASS" or "FAIL" – explicit wording, no ambiguous icons.
 */
export function statusBadge(passed: boolean): string {
  return passed ? '✅ PASS' : '❌ FAIL';
}

/**
 * Render the coverage percentage with two decimal places.
 */
export function pct(value: number): string {
  return `${value.toFixed(2)}%`;
}

/**
 * Render the gap list items from a CoverageResult's details field.
 * Returns up to `limit` bullet items.
 */
export function extractGaps(result: CoverageResult, limit = 10): string[] {
  const uncovered = result.totalItems - result.coveredItems;
  if (uncovered <= 0) return [];

  const details = result.details as Record<string, unknown> | null | undefined;
  if (!details) return [`${uncovered} item(s) not covered`];

  // Try common detail shapes used by the various coverage modules
  const gapCandidates: string[] = [];

  // endpointCoverage: details.uncoveredEndpoints = [{method, path}]
  const uncoveredEndpoints = details['uncoveredEndpoints'];
  if (Array.isArray(uncoveredEndpoints)) {
    for (const ep of uncoveredEndpoints.slice(0, limit)) {
      if (typeof ep === 'object' && ep !== null) {
        const obj = ep as Record<string, unknown>;
        const method = String(obj['method'] ?? '').toUpperCase();
        const path = String(obj['path'] ?? obj['endpoint'] ?? '');
        if (method && path) {
          gapCandidates.push(`\`${method} ${path}\``);
        } else if (path) {
          gapCandidates.push(`\`${path}\``);
        }
      }
    }
  }

  // parameterCoverage / others: details.uncovered = string[]
  const uncoveredList = details['uncovered'];
  if (Array.isArray(uncoveredList) && gapCandidates.length === 0) {
    for (const item of uncoveredList.slice(0, limit)) {
      gapCandidates.push(`\`${String(item)}\``);
    }
  }

  // integrationCoverage: details.uncoveredFlows = string[]
  const uncoveredFlows = details['uncoveredFlows'];
  if (Array.isArray(uncoveredFlows) && gapCandidates.length === 0) {
    for (const flow of uncoveredFlows.slice(0, limit)) {
      gapCandidates.push(`\`${String(flow)}\``);
    }
  }

  if (gapCandidates.length === 0) {
    gapCandidates.push(`${uncovered} item(s) not covered`);
  }

  return gapCandidates.slice(0, limit);
}

/**
 * Render a full coverage section in the structured Markdown format required by
 * the problem spec (§2).
 *
 * @param result       Coverage result for this category.
 * @param threshold    Configured threshold for this category (may be undefined).
 * @param gateFailure  Whether the gate failed for this category.
 */
export function renderCoverageSection(
  result: CoverageResult,
  threshold: number | undefined,
  gateFailure: boolean,
): string {
  const title = coverageTypeTitle(result.type);
  const gateEvaluated = threshold !== undefined;
  const passed = gateEvaluated ? !gateFailure : undefined;

  const lines: string[] = [];
  lines.push(`## ${title}`);
  lines.push('');

  if (gateEvaluated && passed !== undefined) {
    lines.push(`**Status:** ${statusBadge(passed)}`);
  }
  lines.push(`**Gate:** ${gateEvaluated ? 'enabled' : 'not configured'}`);
  if (gateEvaluated) {
    lines.push(`**Threshold:** ${pct(threshold!)}`);
  }
  lines.push(`**Actual Coverage:** ${pct(result.coveragePercent)}`);
  lines.push('');

  lines.push('### Results');
  lines.push('');
  lines.push(`| | |`);
  lines.push(`|---|---|`);
  lines.push(tableRow('Total items', String(result.totalItems)));
  lines.push(tableRow('Covered items', String(result.coveredItems)));
  lines.push(tableRow('Uncovered items', String(result.totalItems - result.coveredItems)));
  lines.push(tableRow('Coverage', pct(result.coveragePercent)));
  if (gateEvaluated) {
    lines.push(tableRow('Threshold', pct(threshold!)));
    lines.push(tableRow('Gate result', gateEvaluated && passed !== undefined ? statusBadge(passed) : 'N/A'));
  }
  lines.push('');

  const gaps = extractGaps(result);
  if (gaps.length > 0) {
    lines.push('### Main Gaps');
    lines.push('');
    for (const gap of gaps) {
      lines.push(`- ${gap}`);
    }
    lines.push('');
  }

  lines.push('### Recommended Next Work');
  lines.push('');
  if (passed === false && gateEvaluated) {
    const needed = threshold! - result.coveragePercent;
    lines.push(
      `Increase **${result.type}** coverage by at least ${needed.toFixed(2)}% ` +
        `(currently ${pct(result.coveragePercent)}, required ${pct(threshold!)}).`,
    );
  } else if (result.coveragePercent < 100) {
    lines.push(`Increase **${result.type}** coverage toward 100% by covering the gaps listed above.`);
  } else {
    lines.push(`All ${result.type} items covered. Consider raising the threshold if it is below 100%.`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Render the security scanning section.
 */
export function renderSecurityScanSection(
  securityScan: SecurityScanSummary,
  scannerResults: ScannerResult[],
  gateEvaluated: boolean,
  gatePassed: boolean | undefined,
): string {
  const lines: string[] = [];
  lines.push('## Security Scanning');
  lines.push('');

  if (gateEvaluated && gatePassed !== undefined) {
    lines.push(`**Status:** ${statusBadge(gatePassed)}`);
  }
  lines.push(`**Gate:** ${gateEvaluated ? 'enabled' : 'not configured'}`);
  lines.push('');

  for (const sr of scannerResults) {
    lines.push(`### ${sr.scanner.charAt(0).toUpperCase()}${sr.scanner.slice(1)}`);
    lines.push('');

    const bySev = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0, ...countBySeverity(sr.findings) };
    lines.push(`| | |`);
    lines.push(`|---|---|`);
    lines.push(tableRow('Status', sr.success ? 'Ran successfully' : `Failed: ${sr.error ?? 'unknown error'}`));
    lines.push(tableRow('Findings', String(sr.findings.length)));
    lines.push(tableRow('Critical', String(bySev.CRITICAL)));
    lines.push(tableRow('High', String(bySev.HIGH)));
    lines.push(tableRow('Medium', String(bySev.MEDIUM)));
    lines.push(tableRow('Low', String(bySev.LOW)));
    lines.push('');
  }

  // Overall totals
  lines.push('### Overall Findings');
  lines.push('');
  lines.push(`| | |`);
  lines.push(`|---|---|`);
  lines.push(tableRow('Total findings', String(securityScan.totalFindings)));
  lines.push(tableRow('Critical', String(securityScan.bySeverity.CRITICAL)));
  lines.push(tableRow('High', String(securityScan.bySeverity.HIGH)));
  lines.push(tableRow('Medium', String(securityScan.bySeverity.MEDIUM)));
  lines.push(tableRow('Low', String(securityScan.bySeverity.LOW)));
  lines.push('');

  // Main blocking findings (high/critical)
  const blocking = securityScan.findings.filter(
    (f) => f.severity === 'HIGH' || f.severity === 'CRITICAL',
  ).slice(0, 5);

  if (blocking.length > 0) {
    lines.push('### Main Blocking Findings');
    lines.push('');
    for (const f of blocking) {
      const loc = f.filePath ? ` in \`${f.filePath}\`` : '';
      lines.push(`- **${f.severity}** ${f.title}${loc}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Count findings by severity from a findings array.
 */
function countBySeverity(
  findings: Array<{ severity: string }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  }
  return counts;
}

// ─── Evaluated-metric helpers (PASS / FAIL / SKIPPED / N/A) ──────────────────

/**
 * Render the status cell for a metric row in the coverage summary table.
 * These are the only four valid statuses — ⚠️ PASS does not exist.
 */
export function metricStatusCell(status: MetricStatus): string {
  switch (status) {
    case 'PASS':    return '✅ PASS';
    case 'FAIL':    return '❌ FAIL';
    case 'SKIPPED': return '⏭ SKIPPED';
    case 'N/A':     return '— N/A';
  }
}

/**
 * Render the "Summary Interpretation" section that explains what each metric
 * status means in plain language.  Suitable for AI agents and humans alike.
 */
export function renderInterpretationSection(metrics: EvaluatedMetric[]): string {
  const passed   = metrics.filter((m) => m.status === 'PASS');
  const failed   = metrics.filter((m) => m.status === 'FAIL');
  const skipped  = metrics.filter((m) => m.status === 'SKIPPED');
  const na       = metrics.filter((m) => m.status === 'N/A');
  const executed = metrics.filter((m) => m.executed);

  const lines: string[] = [];
  lines.push('## Summary Interpretation');
  lines.push('');

  if (executed.length > 0) {
    lines.push(`**Analyzed:** ${executed.map((m) => m.category).join(', ')}`);
  }
  if (passed.length > 0) {
    lines.push(`**Passed:** ${passed.map((m) => m.category).join(', ')}`);
  }
  if (failed.length > 0) {
    lines.push(`**Failed:** ${failed.map((m) => m.category).join(', ')}`);
  }
  if (na.length > 0) {
    lines.push(`**Not applicable:** ${na.map((m) => m.category).join(', ')}`);
  }
  if (skipped.length > 0) {
    lines.push(`**Skipped (did not run):** ${skipped.map((m) => m.category).join(', ')}`);
  }
  lines.push('');

  // Top gaps from failed metrics
  const allGaps: string[] = failed.flatMap((m) => m.topGaps);
  if (allGaps.length > 0) {
    lines.push('### Top Gaps');
    lines.push('');
    for (const gap of allGaps.slice(0, 5)) {
      lines.push(`- ${gap}`);
    }
    lines.push('');
  }

  // Recommended next actions
  lines.push('### Recommended Next Actions');
  lines.push('');
  if (failed.length > 0) {
    for (const m of failed) {
      const gap = (m.threshold! - m.coveragePercent).toFixed(2);
      lines.push(
        `- Increase **${m.category}** coverage by ${gap}% ` +
        `(currently ${m.coveragePercent.toFixed(2)}%, required ${m.threshold!.toFixed(2)}%)`,
      );
    }
  } else if (executed.length > 0) {
    lines.push('- All configured gates passed. Consider raising thresholds toward 100%.');
  }
  if (skipped.length > 0) {
    lines.push(
      `- Consider running: ${skipped.map((m) => m.category).join(', ')} analyzers to expand coverage visibility.`,
    );
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Render the AI-friendly summary markdown.
 * Optimized for consumption by AI agents (test generators, fixers, etc.)
 */
export function renderAiSummary(input: SummaryInput, sections: SummarySection[]): string {
  const lines: string[] = [];

  lines.push('# AI-Friendly Coverage Summary');
  lines.push('');
  lines.push('## Analyzed Inputs');
  lines.push('');
  lines.push(`| | |`);
  lines.push(`|---|---|`);
  if (input.projectName) lines.push(tableRow('Project', input.projectName));
  if (input.branch) lines.push(tableRow('Branch', input.branch));
  if (input.commitSha) lines.push(tableRow('Commit', `\`${input.commitSha}\``));
  if (input.buildId) lines.push(tableRow('Build ID', `\`${input.buildId}\``));
  lines.push(tableRow('Categories analyzed', String(input.results.length)));
  lines.push('');

  const failedSections = sections.filter((s) => s.included && s.gateEvaluated && s.passed === false);
  const passedSections = sections.filter((s) => s.included && s.gateEvaluated && s.passed === true);

  if (failedSections.length > 0) {
    lines.push('## Failed Gates');
    lines.push('');
    for (const s of failedSections) {
      lines.push(`- **${s.title}** — gate FAILED`);
    }
    lines.push('');
  }

  if (passedSections.length > 0) {
    lines.push('## Passed Gates');
    lines.push('');
    for (const s of passedSections) {
      lines.push(`- **${s.title}** — gate PASSED`);
    }
    lines.push('');
  }

  lines.push('## Coverage Details');
  lines.push('');
  for (const result of input.results) {
    const threshold = input.thresholds?.[result.type];
    const failure = input.qualityGate?.failures.find((f) => f.category === result.type);
    const uncovered = result.totalItems - result.coveredItems;
    lines.push(`### ${coverageTypeTitle(result.type)}`);
    lines.push('');
    lines.push(`- Coverage: ${pct(result.coveragePercent)}`);
    lines.push(`- Covered: ${result.coveredItems} / ${result.totalItems}`);
    lines.push(`- Uncovered items: ${uncovered}`);
    if (threshold !== undefined) {
      lines.push(`- Threshold: ${pct(threshold)}`);
      lines.push(`- Gate result: ${failure ? 'FAIL' : 'PASS'}`);
    } else {
      lines.push(`- Gate: not configured`);
    }
    const gaps = extractGaps(result, 5);
    if (gaps.length > 0) {
      lines.push(`- Top gaps: ${gaps.join(', ')}`);
    }
    lines.push('');
  }

  if (failedSections.length > 0) {
    lines.push('## Highest Priority Remediation Items');
    lines.push('');
    const sorted = [...input.results]
      .filter((r) => {
        const t = input.thresholds?.[r.type];
        return t !== undefined && r.coveragePercent < t;
      })
      .sort((a, b) => {
        const ta = input.thresholds?.[a.type] ?? 100;
        const tb = input.thresholds?.[b.type] ?? 100;
        return (ta - a.coveragePercent) - (tb - b.coveragePercent);
      })
      .reverse();

    for (const r of sorted) {
      const t = input.thresholds?.[r.type] ?? 100;
      const gap = (t - r.coveragePercent).toFixed(2);
      lines.push(`1. Increase **${r.type}** coverage by ${gap}% (from ${pct(r.coveragePercent)} to ${pct(t)})`);
    }
    lines.push('');
  }

  lines.push('## Recommended Next Steps');
  lines.push('');
  if (failedSections.length > 0) {
    lines.push('- Add tests to cover the gaps listed above in each failed category.');
    lines.push('- Re-run the coverage analysis after adding tests.');
    lines.push('- Consider raising thresholds once gaps are closed.');
  } else {
    lines.push('- All configured gates passed.');
    lines.push('- Consider raising thresholds to enforce higher coverage standards.');
    lines.push('- Review uncovered items and add tests to reach 100% where possible.');
  }
  lines.push('');

  // Intelligence summary section (if available)
  if (input.intelligenceSummary) {
    lines.push(renderIntelligenceSection(input.intelligenceSummary));
  }

  return lines.join('\n');
}

/**
 * Render a Coverage Intelligence section for inclusion in build/PR summaries.
 */
export function renderIntelligenceSection(
  intel: NonNullable<SummaryInput['intelligenceSummary']>,
): string {
  const lines: string[] = [];
  const p0 = intel.recommendationsByPriority['P0'] ?? 0;
  const p1 = intel.recommendationsByPriority['P1'] ?? 0;
  const p2 = intel.recommendationsByPriority['P2'] ?? 0;
  const p3 = intel.recommendationsByPriority['P3'] ?? 0;

  lines.push('## Coverage Intelligence');
  lines.push('');
  lines.push('| | |');
  lines.push('|---|---|');
  lines.push(tableRow('Functional findings', String(intel.totalFindings)));
  lines.push(tableRow('Missing test recommendations', String(intel.totalRecommendations)));
  lines.push(tableRow('Max risk score', String(intel.maxRiskScore)));
  lines.push(tableRow('Avg risk score', String(intel.avgRiskScore)));
  lines.push(tableRow('Critical uncovered items', String(intel.criticalUncoveredItems)));
  lines.push(tableRow('Unprotected security findings', String(intel.unprotectedSecurityFindings)));
  lines.push('');

  if (intel.totalRecommendations > 0) {
    lines.push('### Recommendations by Priority');
    lines.push('');
    lines.push('| Priority | Count |');
    lines.push('|---|---|');
    if (p0 > 0) lines.push(`| **P0** (Immediate) | ${p0} |`);
    if (p1 > 0) lines.push(`| **P1** (High) | ${p1} |`);
    if (p2 > 0) lines.push(`| **P2** (Medium) | ${p2} |`);
    if (p3 > 0) lines.push(`| **P3** (Low) | ${p3} |`);
    lines.push('');
  }

  if (intel.topRiskAreas.length > 0) {
    lines.push('### Top Risk Areas');
    lines.push('');
    for (const area of intel.topRiskAreas.slice(0, 5)) {
      lines.push(`- ${area}`);
    }
    lines.push('');
  }

  if (p0 > 0) {
    lines.push(`> ⚠️ **${p0} P0 recommendation(s) require immediate attention** before merging.`);
    lines.push('');
  }

  return lines.join('\n');
}
