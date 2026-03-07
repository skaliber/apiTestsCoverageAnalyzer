/**
 * Summary engine – PR comment summary generator.
 *
 * Generates concise PR comment markdown from analysis results.
 * Uses the same gate-aware inclusion logic as generateBuildSummary
 * but produces a shorter format suitable for PR comments.
 *
 * Public API:
 *   generatePrSummary(input): Promise<SummaryResult>
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
  statusBadge,
  pct,
  tableRow,
} from './markdownRenderer';

// ─── PR summary generator ─────────────────────────────────────────────────────

/**
 * Generate a concise PR comment summary from analysis results.
 *
 * The PR summary is shorter than the build summary – it shows the key status
 * table and links to the full report, while still honouring gate-aware
 * inclusion rules.
 *
 * @param input     All analysis results and configuration.
 * @param outDir    Optional directory to write pr-summary.md to.
 */
export async function generatePrSummary(
  input: SummaryInput,
  outDir?: string,
): Promise<SummaryResult> {
  const sections = buildPrSections(input);
  const included = sections.filter((s) => s.included);

  const lines: string[] = [];

  const overallPassed = input.qualityGate?.passed ?? true;
  const statusEmoji = overallPassed ? '✅' : '❌';
  lines.push(`${statusEmoji} **API Coverage: ${overallPassed ? 'PASSED' : 'FAILED'}**`);
  if (input.buildId) lines.push(`Build \`${input.buildId}\``);
  lines.push('');

  // Compact coverage table
  if (input.results.length > 0) {
    lines.push('| Category | Coverage | Status |');
    lines.push('|---|---|---|');
    for (const r of input.results) {
      const threshold = input.thresholds?.[r.type];
      const gateEvaluated = threshold !== undefined;
      const failed = input.qualityGate?.failures.some((f) => f.category === r.type) ?? false;
      const zeroCoverage = r.coveragePercent === 0;
      const status = !gateEvaluated
        ? '—'
        : failed
          ? '❌ FAIL'
          : zeroCoverage
            ? '⚠️ PASS'
            : '✅ PASS';
      lines.push(`| ${r.type} | ${pct(r.coveragePercent)} | ${status} |`);
    }
    lines.push('');
  }

  // Security scan summary row if present
  if (input.securityScan) {
    const gatePassed = input.securityScan.gateResult?.passed;
    const gateStatus =
      gatePassed === undefined ? '—' : gatePassed ? '✅ PASS' : '❌ FAIL';
    lines.push(`**Security scan findings:** ${input.securityScan.totalFindings} total`);
    lines.push(`**Security gate:** ${gateStatus}`);
    lines.push('');
  }

  // Failed gates detail
  if (input.qualityGate && input.qualityGate.failures.length > 0) {
    lines.push('**Failed gates:**');
    for (const f of input.qualityGate.failures) {
      lines.push(`- ${f.category}: ${pct(f.actual)} < ${pct(f.expected)} (gap: ${pct(f.gap)})`);
    }
    lines.push('');
  }

  if (input.pagesUrl) {
    lines.push(`[📊 View full report](${input.pagesUrl})`);
    lines.push('');
  }

  // Include per-section detail for included sections (collapsed)
  const detailSections = included.filter(
    (s) => s.gateEvaluated && s.passed === false,
  );
  if (detailSections.length > 0) {
    lines.push('<details>');
    lines.push('<summary>Failed gate details</summary>');
    lines.push('');
    for (const s of detailSections) {
      lines.push(s.markdown);
    }
    lines.push('</details>');
    lines.push('');
  }

  const markdown = lines.join('\n');
  const aiMarkdown = renderAiSummary(input, sections);
  const json = buildPrJsonSummary(input, sections);

  if (outDir) {
    await writePrOutputFiles(outDir, markdown, aiMarkdown, json);
  }

  return { markdown, sections, json };
}

// ─── Internals ────────────────────────────────────────────────────────────────

function buildPrSections(input: SummaryInput): SummarySection[] {
  const sections: SummarySection[] = [];
  const thresholds = input.thresholds ?? {};
  const onlyEvaluated = input.summaryConfig?.includeOnlyEvaluatedSections ?? false;

  for (const result of input.results) {
    const threshold = thresholds[result.type];
    const gateEvaluated = threshold !== undefined;
    const failure = input.qualityGate?.failures.find((f) => f.category === result.type);
    const passed = gateEvaluated ? failure === undefined : undefined;
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

  if (input.securityScan) {
    const scannerResults = input.scannerResults ?? [];
    const gatePassed = input.securityScan.gateResult?.passed;
    const included = !onlyEvaluated || (input.securityScan.gateResult !== undefined);

    sections.push({
      id: 'security-scan',
      title: 'Security Scanning',
      included,
      gateEvaluated: input.securityScan.gateResult !== undefined,
      passed: gatePassed,
      markdown: included
        ? renderSecurityScanSection(
            input.securityScan,
            scannerResults,
            input.securityScan.gateResult !== undefined,
            gatePassed,
          )
        : '',
    });
  }

  return sections;
}

function buildPrJsonSummary(input: SummaryInput, sections: SummarySection[]): unknown {
  return {
    generatedAt: new Date().toISOString(),
    type: 'pr-summary',
    projectName: input.projectName,
    branch: input.branch,
    commitSha: input.commitSha,
    buildId: input.buildId,
    overallPassed: input.qualityGate?.passed ?? true,
    coverage: input.results.map((r) => ({
      type: r.type,
      coveragePercent: r.coveragePercent,
      threshold: input.thresholds?.[r.type],
      passed: !input.qualityGate?.failures.some((f) => f.category === r.type),
    })),
    failedGates: input.qualityGate?.failures ?? [],
    sections: sections.map((s) => ({
      id: s.id,
      included: s.included,
      gateEvaluated: s.gateEvaluated,
      passed: s.passed,
    })),
  };
}

async function writePrOutputFiles(
  outDir: string,
  prMarkdown: string,
  aiMarkdown: string,
  json: unknown,
): Promise<void> {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'pr-summary.md'), prMarkdown, 'utf-8');
  // Also write ai-summary files if not already written by build summary
  if (!fs.existsSync(path.join(outDir, 'ai-summary.md'))) {
    fs.writeFileSync(path.join(outDir, 'ai-summary.md'), aiMarkdown, 'utf-8');
  }
  if (!fs.existsSync(path.join(outDir, 'summary.json'))) {
    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(json, null, 2), 'utf-8');
  }
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export type { SummaryInput, SummaryResult, SummarySection, SummaryConfig } from './markdownRenderer';
