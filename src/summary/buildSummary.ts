/**
 * Summary engine – build/CI summary generator.
 *
 * Generates PR/CI build summaries that include only the sections that actually
 * ran or had gates evaluated (gate-aware inclusion).
 *
 * Public API:
 *   generateBuildSummary(input): Promise<SummaryResult>
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  SummaryInput,
  SummaryResult,
  SummarySection,
  coverageTypeTitle,
  renderCoverageSection,
  renderSecurityScanSection,
  renderAiSummary,
  renderIntelligenceSection,
  statusBadge,
  pct,
  tableRow,
  metricStatusCell,
  renderInterpretationSection,
} from './markdownRenderer';
import { evaluateMetrics } from './evaluateMetrics';

// ─── Build summary generator ──────────────────────────────────────────────────

/**
 * Generate a full build/CI summary from analysis results.
 *
 * Gate-aware inclusion rules:
 *  - A section is included when: the analyzer ran (results present) OR the gate
 *    was explicitly configured for that category.
 *  - A section is omitted when: neither results nor gate configuration exist.
 *  - Security scanning section is included only when securityScan is provided.
 *
 * @param input     All analysis results and configuration.
 * @param outDir    Optional directory to write output files to (e.g. "reports").
 *                  When provided, writes pr-summary.md, build-summary.md,
 *                  summary.json, ai-summary.md, and ai-summary.json.
 */
export async function generateBuildSummary(
  input: SummaryInput,
  outDir?: string,
): Promise<SummaryResult> {
  const sections = buildSections(input);
  const included = sections.filter((s) => s.included);

  const headerLines = buildHeader(input, 'build');
  const bodyLines: string[] = [];

  for (const section of included) {
    bodyLines.push(section.markdown);
  }

  const footer = buildFooter(input);
  const markdown = [...headerLines, '', ...bodyLines, footer].join('\n');

  const aiMarkdown = renderAiSummary(input, sections);

  const json = buildJsonSummary(input, sections);

  if (outDir) {
    await writeOutputFiles(outDir, markdown, aiMarkdown, json);
  }

  return { markdown, sections, json };
}

// ─── Internals ────────────────────────────────────────────────────────────────

function buildHeader(input: SummaryInput, mode: 'build' | 'pr'): string[] {
  const overallPassed = input.qualityGate?.passed ?? true;
  const statusEmoji = overallPassed ? '✅' : '❌';
  const title = mode === 'pr'
    ? `${statusEmoji} API Coverage — ${overallPassed ? 'PASSED' : 'FAILED'}`
    : `## ${statusEmoji} API Coverage Report — ${overallPassed ? 'PASSED' : 'FAILED'}`;

  const lines: string[] = [title, ''];
  lines.push('| | |');
  lines.push('|---|---|');
  if (input.projectName) lines.push(tableRow('Project', input.projectName));
  if (input.branch) lines.push(tableRow('Branch', input.branch));
  if (input.commitSha) lines.push(tableRow('Commit', `\`${input.commitSha}\``));
  if (input.buildId) lines.push(tableRow('Build ID', `\`${input.buildId}\``));
  lines.push('');

  // Coverage summary table — uses evaluated metrics for correct PASS/FAIL/N/A/SKIPPED
  if (input.results.length > 0) {
    const evaluatedMetrics = evaluateMetrics(
      input.results,
      input.thresholds ?? {},
      input.qualityGate,
    );
    lines.push('### Coverage Summary');
    lines.push('');
    lines.push('| Category | Total | Covered | Coverage | Status |');
    lines.push('|---|---|---|---|---|');
    for (const m of evaluatedMetrics) {
      const totalCell    = m.applicable ? String(m.totalItems) : '—';
      const coveredCell  = m.applicable ? String(m.coveredItems) : '—';
      const coverageCell = m.applicable ? pct(m.coveragePercent) : '—';
      lines.push(`| ${m.category} | ${totalCell} | ${coveredCell} | ${coverageCell} | ${metricStatusCell(m.status)} |`);
    }
    lines.push('');
  }

  return lines;
}

function buildSections(input: SummaryInput): SummarySection[] {
  const sections: SummarySection[] = [];
  const thresholds = input.thresholds ?? {};
  const onlyEvaluated = input.summaryConfig?.includeOnlyEvaluatedSections ?? false;

  // Coverage sections – one per result
  for (const result of input.results) {
    const threshold = thresholds[result.type];
    const gateEvaluated = threshold !== undefined;
    const failure = input.qualityGate?.failures.find((f) => f.category === result.type);
    const passed = gateEvaluated ? failure === undefined : undefined;

    // Gate-aware inclusion: include if results ran, unless onlyEvaluated forces us to skip
    const included = onlyEvaluated ? gateEvaluated : true;

    sections.push({
      id: result.type,
      title: coverageTypeTitle(result.type),
      included,
      gateEvaluated,
      passed,
      markdown: included
        ? renderCoverageSection(result, threshold, failure !== undefined)
        : '',
    });
  }

  // Security scanning section
  if (input.securityScan) {
    const scannerResults = input.scannerResults ?? [];
    const gatePassed = input.securityScan.gateResult?.passed;
    const sectionGateEvaluated = input.securityScan.gateResult !== undefined;
    const included = !onlyEvaluated || sectionGateEvaluated;

    sections.push({
      id: 'security-scan',
      title: 'Security Scanning',
      included,
      gateEvaluated: sectionGateEvaluated,
      passed: gatePassed,
      markdown: included
        ? renderSecurityScanSection(
            input.securityScan,
            scannerResults,
            sectionGateEvaluated,
            gatePassed,
          )
        : '',
    });
  }

  // Coverage Intelligence section
  if (input.intelligenceSummary) {
    sections.push({
      id: 'coverage-intelligence',
      title: 'Coverage Intelligence',
      included: true,
      gateEvaluated: false,
      passed: undefined,
      markdown: renderIntelligenceSection(input.intelligenceSummary),
    });
  }

  return sections;
}

function buildFooter(input: SummaryInput): string {
  const lines: string[] = [];

  // Failed gates summary
  if (input.qualityGate && input.qualityGate.failures.length > 0) {
    lines.push('### Failed Gates');
    lines.push('');
    for (const f of input.qualityGate.failures) {
      lines.push(
        `- **${f.category}**: expected ≥ ${pct(f.expected)}, actual ${pct(f.actual)}, gap **${pct(f.gap)}**`,
      );
    }
    lines.push('');
  }

  // Interpretation section
  if (input.results.length > 0) {
    const evaluatedMetrics = evaluateMetrics(
      input.results,
      input.thresholds ?? {},
      input.qualityGate,
    );
    lines.push(renderInterpretationSection(evaluatedMetrics));
  }

  // Links
  if (input.pagesUrl) {
    lines.push(`📊 **[View Full Report](${input.pagesUrl})**`);
    lines.push('');
  }

  return lines.join('\n');
}

function buildJsonSummary(input: SummaryInput, sections: SummarySection[]): unknown {
  return {
    generatedAt: new Date().toISOString(),
    projectName: input.projectName,
    branch: input.branch,
    commitSha: input.commitSha,
    buildId: input.buildId,
    overallPassed: input.qualityGate?.passed ?? true,
    coverage: input.results.map((r) => ({
      type: r.type,
      totalItems: r.totalItems,
      coveredItems: r.coveredItems,
      coveragePercent: r.coveragePercent,
      threshold: input.thresholds?.[r.type],
      passed: !input.qualityGate?.failures.some((f) => f.category === r.type),
    })),
    failedGates: input.qualityGate?.failures ?? [],
    sections: sections.map((s) => ({
      id: s.id,
      title: s.title,
      included: s.included,
      gateEvaluated: s.gateEvaluated,
      passed: s.passed,
    })),
    securityScan: input.securityScan
      ? {
          totalFindings: input.securityScan.totalFindings,
          bySeverity: input.securityScan.bySeverity,
          scannersRun: input.securityScan.scannersRun,
          gatePassed: input.securityScan.gateResult?.passed,
        }
      : undefined,
    intelligence: input.intelligenceSummary
      ? {
          totalFindings: input.intelligenceSummary.totalFindings,
          totalRecommendations: input.intelligenceSummary.totalRecommendations,
          maxRiskScore: input.intelligenceSummary.maxRiskScore,
          avgRiskScore: input.intelligenceSummary.avgRiskScore,
          criticalUncoveredItems: input.intelligenceSummary.criticalUncoveredItems,
          unprotectedSecurityFindings: input.intelligenceSummary.unprotectedSecurityFindings,
          recommendationsByPriority: input.intelligenceSummary.recommendationsByPriority,
          topRiskAreas: input.intelligenceSummary.topRiskAreas,
        }
      : undefined,
  };
}

async function writeOutputFiles(
  outDir: string,
  buildMarkdown: string,
  aiMarkdown: string,
  json: unknown,
): Promise<void> {
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(path.join(outDir, 'build-summary.md'), buildMarkdown, 'utf-8');
  fs.writeFileSync(path.join(outDir, 'ai-summary.md'), aiMarkdown, 'utf-8');
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(json, null, 2), 'utf-8');
  fs.writeFileSync(
    path.join(outDir, 'ai-summary.json'),
    JSON.stringify({ aiSummary: aiMarkdown, ...((json as Record<string, unknown>) ?? {}) }, null, 2),
    'utf-8',
  );
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export type { SummaryInput, SummaryResult, SummarySection, SummaryConfig } from './markdownRenderer';
export { renderIntelligenceSection } from './markdownRenderer';
