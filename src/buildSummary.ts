import * as fs from 'fs';
import type { CoverageResult } from './reporting';
import type { QualityGateResult } from './qualityGate';
import type { BuildMetadata } from './publishing';

// ─── GitHub Actions Step Summary ─────────────────────────────────────────────

/**
 * Generate a Markdown string suitable for the GitHub Actions step summary
 * ($GITHUB_STEP_SUMMARY).
 */
export function generateStepSummary(
  results: CoverageResult[],
  qualityGate: QualityGateResult,
  metadata: BuildMetadata,
  pagesUrl?: string,
  artifactsUrl?: string,
): string {
  const statusEmoji = metadata.passed ? '✅' : '❌';
  const lines: string[] = [
    `## ${statusEmoji} API Coverage Report — ${metadata.passed ? 'PASSED' : 'FAILED'}`,
    '',
    `| | |`,
    `|---|---|`,
    `| **Project** | ${metadata.projectName} |`,
    `| **Branch** | ${metadata.branch ?? 'N/A'} |`,
    `| **Commit** | \`${metadata.commitSha ?? 'N/A'}\` |`,
    `| **Build ID** | \`${metadata.buildId}\` |`,
    `| **Timestamp** | ${metadata.buildTimestamp} |`,
    '',
    '### Coverage Summary',
    '',
    '| Category | Total | Covered | Coverage | Status |',
    '|---|---|---|---|---|',
  ];

  for (const r of results) {
    const pct = r.coveragePercent.toFixed(2);
    const failed = qualityGate.failures.some((f) => f.category === r.type);
    const status = failed ? '❌ Below threshold' : r.coveragePercent === 0 ? '⚠️ No coverage' : '✅ Pass';
    lines.push(`| ${r.type} | ${r.totalItems} | ${r.coveredItems} | ${pct}% | ${status} |`);
  }

  lines.push('');
  lines.push('### Quality Gate');
  lines.push('');

  if (qualityGate.failures.length === 0) {
    lines.push('✅ All coverage thresholds met.');
  } else {
    lines.push(`❌ **${qualityGate.failures.length} threshold(s) not met:**`);
    lines.push('');
    for (const f of qualityGate.failures) {
      lines.push(`- **${f.category}**: expected ≥ ${f.expected}%, actual ${f.actual}%, gap **${f.gap}%**`);
    }
  }

  // Top 5 coverage gaps
  const top5Gaps = results
    .filter((r) => r.coveragePercent < 100)
    .sort((a, b) => a.coveragePercent - b.coveragePercent)
    .slice(0, 5);

  if (top5Gaps.length > 0) {
    lines.push('');
    lines.push('### Top Coverage Gaps');
    lines.push('');
    for (const g of top5Gaps) {
      const missing = g.totalItems - g.coveredItems;
      lines.push(`- **${g.type}**: ${missing} item(s) not covered (${g.coveragePercent.toFixed(2)}%)`);
    }
  }

  if (pagesUrl) {
    lines.push('');
    lines.push(`📊 **[View Full Report on GitHub Pages](${pagesUrl})**`);
  }

  if (artifactsUrl) {
    lines.push('');
    lines.push(`📦 **[Download Artifacts](${artifactsUrl})**`);
  }

  lines.push('');
  lines.push('### Recommended Next Action');
  lines.push('');
  if (qualityGate.failures.length > 0) {
    const worstFailure = [...qualityGate.failures].sort((a, b) => b.gap - a.gap)[0];
    if (worstFailure) {
      lines.push(
        `Increase **${worstFailure.category}** coverage by at least ${worstFailure.gap}% ` +
          `(currently ${worstFailure.actual}%, required ${worstFailure.expected}%).`,
      );
    }
  } else {
    lines.push('All thresholds met. Consider raising thresholds to enforce higher coverage standards.');
  }

  return lines.join('\n');
}

/**
 * Write the step summary to `$GITHUB_STEP_SUMMARY` if that environment
 * variable is set (i.e. we are running inside GitHub Actions).
 *
 * @returns `true` if the summary was written, `false` otherwise.
 */
export function writeStepSummary(summary: string): boolean {
  const summaryFile = process.env['GITHUB_STEP_SUMMARY'];
  if (!summaryFile) return false;

  try {
    fs.appendFileSync(summaryFile, summary + '\n');
    return true;
  } catch {
    return false;
  }
}

// ─── PR Annotation / Comment ──────────────────────────────────────────────────

/**
 * Generate a concise markdown string suitable for a PR comment.
 * This is a shorter version of the step summary.
 */
export function generatePrComment(
  results: CoverageResult[],
  qualityGate: QualityGateResult,
  metadata: BuildMetadata,
  pagesUrl?: string,
): string {
  const statusEmoji = metadata.passed ? '✅' : '❌';
  const header = `${statusEmoji} **API Coverage: ${metadata.passed ? 'PASSED' : 'FAILED'}** — Build \`${metadata.buildId}\``;

  const tableRows = results.map((r) => {
    const pct = r.coveragePercent.toFixed(2);
    const failed = qualityGate.failures.some((f) => f.category === r.type);
    const icon = failed ? '❌' : r.coveragePercent === 0 ? '⚠️' : '✅';
    return `| ${r.type} | ${pct}% | ${icon} |`;
  });

  const lines = [
    header,
    '',
    '| Category | Coverage | Status |',
    '|---|---|---|',
    ...tableRows,
    '',
  ];

  if (qualityGate.failures.length > 0) {
    lines.push('**Failures:**');
    for (const f of qualityGate.failures) {
      lines.push(`- ${f.category}: ${f.actual}% < ${f.expected}% (gap: ${f.gap}%)`);
    }
    lines.push('');
  }

  if (pagesUrl) {
    lines.push(`[View full report](${pagesUrl})`);
  }

  return lines.join('\n');
}

// ─── CI output summary ────────────────────────────────────────────────────────

/**
 * Print a concise, human-readable summary to stdout.
 * This is always called regardless of pass/fail.
 */
export function printCiSummary(
  results: CoverageResult[],
  qualityGate: QualityGateResult,
): void {
  const status = qualityGate.passed ? '✅ PASSED' : '❌ FAILED';
  console.log(`\n=== API Coverage Quality Gate: ${status} ===\n`);

  for (const r of results) {
    const failed = qualityGate.failures.some((f) => f.category === r.type);
    const indicator = failed ? '❌' : '✅';
    console.log(
      `  ${indicator} ${r.type.padEnd(20)} ${String(r.coveredItems).padStart(4)}/${String(r.totalItems).padEnd(4)} (${r.coveragePercent.toFixed(2)}%)`,
    );
  }

  if (qualityGate.failures.length > 0) {
    console.log('\nThreshold failures:');
    for (const f of qualityGate.failures) {
      console.log(`  ❌ ${f.category}: expected ≥ ${f.expected}%, actual ${f.actual}%, gap ${f.gap}%`);
    }
  }

  console.log('');
}
