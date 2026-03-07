/**
 * Coverage Intelligence – AI-Friendly Markdown Reporter.
 *
 * Generates structured, concise markdown and JSON reports from
 * IntelligenceReport data.  All outputs are deterministic.
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  IntelligenceReport,
  FunctionalFinding,
  MissingTestRecommendation,
  IntelligenceSummary,
  Severity,
  RecommendationPriority,
} from './types';
import { scoreToRiskBand } from './riskScoring';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityEmoji(s: Severity): string {
  switch (s) {
    case 'CRITICAL': return '🔴';
    case 'HIGH':     return '🟠';
    case 'MEDIUM':   return '🟡';
    default:         return '🔵';
  }
}

function priorityEmoji(p: RecommendationPriority): string {
  switch (p) {
    case 'P0': return '🚨';
    case 'P1': return '🔴';
    case 'P2': return '🟠';
    default:   return '🟡';
  }
}

function riskBandEmoji(score: number): string {
  const band = scoreToRiskBand(score);
  switch (band) {
    case 'Critical':  return '🔴 Critical';
    case 'High':      return '🟠 High';
    case 'Moderate':  return '🟡 Moderate';
    default:          return '🔵 Low';
  }
}

function formatEndpoint(ep?: { method?: string; path?: string }): string {
  if (!ep) return 'N/A';
  return `\`${ep.method ?? 'GET'} ${ep.path ?? '/'}\``;
}

// ─── Coverage Intelligence Summary ───────────────────────────────────────────

export function renderCoverageIntelligenceMd(report: IntelligenceReport): string {
  const { summary, findings, recommendations } = report;
  const topFindings = findings.slice(0, 10);
  const topRecs = recommendations.slice(0, 10);

  const lines: string[] = [
    `# Coverage Intelligence Report`,
    ``,
    `> Generated: ${report.generatedAt}  `,
    `> Project: **${report.projectName}**`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Findings | ${summary.totalFindings} |`,
    `| Total Recommendations | ${summary.totalRecommendations} |`,
    `| Max Risk Score | ${summary.maxRiskScore} (${scoreToRiskBand(summary.maxRiskScore)}) |`,
    `| Avg Risk Score | ${summary.avgRiskScore} |`,
    `| Critical Uncovered Items | ${summary.criticalUncoveredItems} |`,
    `| Unprotected Security Findings | ${summary.unprotectedSecurityFindings} |`,
    ``,
    `### Findings by Severity`,
    ``,
    `| Severity | Count |`,
    `|----------|-------|`,
    ...(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Severity[]).map(
      (s) => `| ${severityEmoji(s)} ${s} | ${summary.findingsBySeverity[s] ?? 0} |`,
    ),
    ``,
    `### Recommendations by Priority`,
    ``,
    `| Priority | Count |`,
    `|----------|-------|`,
    ...(['P0', 'P1', 'P2', 'P3'] as RecommendationPriority[]).map(
      (p) => `| ${priorityEmoji(p)} ${p} | ${summary.recommendationsByPriority[p] ?? 0} |`,
    ),
    ``,
    `## Top Functional Findings`,
    ``,
  ];

  if (topFindings.length === 0) {
    lines.push('_No findings detected._', '');
  } else {
    topFindings.forEach((f, i) => {
      lines.push(
        `### ${i + 1}. ${severityEmoji(f.severity)} ${f.title}`,
        ``,
        `- **Category:** ${f.category}`,
        `- **Source:** ${f.source}`,
        `- **Severity:** ${f.severity}`,
        `- **Endpoint:** ${formatEndpoint(f.endpoint)}`,
        `- **Description:** ${f.description}`,
        f.missingTestTypes?.length
          ? `- **Missing Tests:** ${f.missingTestTypes.join(', ')}`
          : '',
        f.frameworkHints?.length
          ? `- **Framework Hints:** ${f.frameworkHints.join(', ')}`
          : '',
        ``,
      );
    });
  }

  lines.push(`## Top Missing Test Recommendations`, ``);

  if (topRecs.length === 0) {
    lines.push('_No recommendations._', '');
  } else {
    topRecs.forEach((r, i) => {
      lines.push(
        `### ${i + 1}. ${priorityEmoji(r.priority)} ${r.title}`,
        ``,
        `| Field | Value |`,
        `|-------|-------|`,
        `| **Priority** | ${r.priority} |`,
        `| **Risk Score** | ${r.riskScore} (${riskBandEmoji(r.riskScore)}) |`,
        `| **Test Type** | ${r.recommendedTestType} |`,
        `| **Endpoint** | ${formatEndpoint(r.endpoint)} |`,
        `| **Framework** | ${r.likelyFramework ?? 'N/A'} |`,
        `| **Language** | ${r.likelyLanguage ?? 'N/A'} |`,
        `| **Confidence** | ${r.confidence} |`,
        ``,
        `**Rationale:** ${r.rationale}`,
        ``,
        `**Linked Findings:** ${r.linkedFindingIds.join(', ')}`,
        ``,
      );
    });
  }

  if (summary.topRiskAreas.length > 0) {
    lines.push(
      `## Highest-Risk Areas`,
      ``,
      ...summary.topRiskAreas.map((a) => `- ${a}`),
      ``,
    );
  }

  return lines.filter((l) => l !== undefined).join('\n');
}

// ─── Missing Test Recommendations report ─────────────────────────────────────

export function renderMissingTestsMd(report: IntelligenceReport): string {
  const { recommendations } = report;
  const lines: string[] = [
    `# Missing Test Recommendations`,
    ``,
    `> Generated: ${report.generatedAt}  `,
    `> Project: **${report.projectName}**`,
    ``,
    `Total: **${recommendations.length}** recommendations`,
    ``,
  ];

  if (recommendations.length === 0) {
    lines.push('_No missing test recommendations at this time._', '');
    return lines.join('\n');
  }

  for (const r of recommendations) {
    lines.push(
      `## ${priorityEmoji(r.priority)} [${r.priority}] ${r.title}`,
      ``,
      `| Field | Value |`,
      `|-------|-------|`,
      `| **Priority** | \`${r.priority}\` |`,
      `| **Risk Score** | ${r.riskScore} — ${riskBandEmoji(r.riskScore)} |`,
      `| **Test Type** | \`${r.recommendedTestType}\` |`,
      `| **Endpoint** | ${formatEndpoint(r.endpoint)} |`,
      `| **Language** | ${r.likelyLanguage ?? '_undetected_'} |`,
      `| **Framework** | ${r.likelyFramework ?? '_undetected_'} |`,
      `| **Confidence** | ${r.confidence} |`,
      ``,
      `> ${r.rationale}`,
      ``,
      `**Linked Findings:** ${r.linkedFindingIds.join(', ')}`,
      ``,
      `---`,
      ``,
    );
  }

  return lines.join('\n');
}

// ─── Risk Prioritization report ───────────────────────────────────────────────

export function renderRiskPrioritizationMd(report: IntelligenceReport): string {
  const { findings, recommendations } = report;

  const criticalRecs = recommendations.filter((r) => scoreToRiskBand(r.riskScore) === 'Critical');
  const highRecs     = recommendations.filter((r) => scoreToRiskBand(r.riskScore) === 'High');

  const byCategory = new Map<string, MissingTestRecommendation[]>();
  for (const r of recommendations) {
    const f = findings.find((ff) => r.linkedFindingIds.includes(ff.id));
    const cat = f?.category ?? 'unknown';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(r);
  }

  const lines: string[] = [
    `# Risk Prioritization Report`,
    ``,
    `> Generated: ${report.generatedAt}  `,
    `> Project: **${report.projectName}**`,
    ``,
    `## Critical Risks (Score ≥ 75)`,
    ``,
  ];

  if (criticalRecs.length === 0) {
    lines.push('_No critical-risk items detected._', '');
  } else {
    criticalRecs.forEach((r) => {
      lines.push(
        `- 🔴 **[${r.priority}]** ${r.title} — Score: ${r.riskScore}`,
      );
    });
    lines.push('');
  }

  lines.push(`## High Risks (Score 50–74)`, ``);
  if (highRecs.length === 0) {
    lines.push('_No high-risk items detected._', '');
  } else {
    highRecs.forEach((r) => {
      lines.push(`- 🟠 **[${r.priority}]** ${r.title} — Score: ${r.riskScore}`);
    });
    lines.push('');
  }

  lines.push(`## Risks by Category`, ``);
  for (const [cat, recs] of byCategory.entries()) {
    lines.push(`### ${cat}`, ``);
    recs.forEach((r) => {
      lines.push(`- ${priorityEmoji(r.priority)} **[${r.priority}]** ${r.title} — Score: ${r.riskScore}`);
    });
    lines.push('');
  }

  const byEndpoint = new Map<string, MissingTestRecommendation[]>();
  for (const r of recommendations) {
    if (!r.endpoint?.path) continue;
    const key = `${r.endpoint.method ?? 'GET'} ${r.endpoint.path}`;
    if (!byEndpoint.has(key)) byEndpoint.set(key, []);
    byEndpoint.get(key)!.push(r);
  }

  if (byEndpoint.size > 0) {
    lines.push(`## Risks by Endpoint`, ``);
    for (const [ep, recs] of byEndpoint.entries()) {
      lines.push(`### \`${ep}\``, ``);
      recs.forEach((r) => {
        lines.push(`- ${priorityEmoji(r.priority)} **[${r.priority}]** ${r.title} — Score: ${r.riskScore}`);
      });
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ─── Write reports to disk ────────────────────────────────────────────────────

export function writeIntelligenceReports(
  report: IntelligenceReport,
  outDir: string,
): void {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // coverage-intelligence.json
  fs.writeFileSync(
    path.join(outDir, 'coverage-intelligence.json'),
    JSON.stringify(report, null, 2),
    'utf-8',
  );

  // coverage-intelligence.md
  fs.writeFileSync(
    path.join(outDir, 'coverage-intelligence.md'),
    renderCoverageIntelligenceMd(report),
    'utf-8',
  );

  // missing-tests-recommendations.json
  fs.writeFileSync(
    path.join(outDir, 'missing-tests-recommendations.json'),
    JSON.stringify({ generatedAt: report.generatedAt, recommendations: report.recommendations }, null, 2),
    'utf-8',
  );

  // missing-tests-recommendations.md
  fs.writeFileSync(
    path.join(outDir, 'missing-tests-recommendations.md'),
    renderMissingTestsMd(report),
    'utf-8',
  );

  // risk-prioritization.json
  fs.writeFileSync(
    path.join(outDir, 'risk-prioritization.json'),
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        summary: report.summary,
        recommendations: report.recommendations,
      },
      null,
      2,
    ),
    'utf-8',
  );

  // risk-prioritization.md
  fs.writeFileSync(
    path.join(outDir, 'risk-prioritization.md'),
    renderRiskPrioritizationMd(report),
    'utf-8',
  );
}
