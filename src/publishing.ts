import * as fs from 'fs';
import * as path from 'path';
import type { CoverageResult } from './reporting';
import type { QualityGateResult } from './qualityGate';
import type { PublishingConfig } from './config';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Metadata attached to each generated build bundle */
export interface BuildMetadata {
  buildId: string;
  projectName: string;
  repositoryName: string | null;
  branch: string | null;
  commitSha: string | null;
  runId: string | null;
  buildTimestamp: string;
  thresholds: Record<string, number | undefined>;
  actualCoverage: Record<string, number>;
  passed: boolean;
}

/** All generated files for a single build */
export interface GeneratedReports {
  buildId: string;
  bundleDir: string;
  siteDir: string;
  files: string[];
  metadata: BuildMetadata;
}

// ─── Build ID resolution ──────────────────────────────────────────────────────

/**
 * Resolve the build ID from the publishing configuration and environment.
 *
 * Supported patterns:
 *   - "timestamp"         → ISO timestamp (default)
 *   - "commit-sha"        → GITHUB_SHA env var
 *   - "run-number"        → GITHUB_RUN_NUMBER env var
 *   - "branch-timestamp"  → branch name + timestamp
 *   - any other string    → used as-is (custom naming)
 */
export function resolveBuildId(config: PublishingConfig): string {
  const pattern = config.buildId ?? 'timestamp';

  switch (pattern) {
    case 'timestamp':
      return new Date().toISOString().replace(/[:.]/g, '-');

    case 'commit-sha':
      return process.env['GITHUB_SHA'] ?? new Date().toISOString().replace(/[:.]/g, '-');

    case 'run-number':
      return process.env['GITHUB_RUN_NUMBER'] ?? new Date().toISOString().replace(/[:.]/g, '-');

    case 'branch-timestamp': {
      const branch = (process.env['GITHUB_REF_NAME'] ?? 'local').replace(/[^a-zA-Z0-9-_]/g, '-');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      return `${branch}-${ts}`;
    }

    default:
      // Custom or environment-variable pattern
      return pattern;
  }
}

// ─── Metadata builder ─────────────────────────────────────────────────────────

/** Build the metadata object for the current run */
export function buildBuildMetadata(
  results: CoverageResult[],
  qualityGate: QualityGateResult,
  config: PublishingConfig,
  buildId: string,
  thresholds: Record<string, number | undefined>,
): BuildMetadata {
  const actualCoverage: Record<string, number> = {};
  for (const r of results) {
    actualCoverage[r.type] = r.coveragePercent;
  }

  return {
    buildId,
    projectName: process.env['GITHUB_REPOSITORY']?.split('/')[1] ?? 'api-coverage',
    repositoryName: process.env['GITHUB_REPOSITORY'] ?? null,
    branch: process.env['GITHUB_REF_NAME'] ?? null,
    commitSha: process.env['GITHUB_SHA'] ?? null,
    runId: process.env['GITHUB_RUN_ID'] ?? null,
    buildTimestamp: new Date().toISOString(),
    thresholds,
    actualCoverage,
    passed: qualityGate.passed,
  };
}

// ─── Markdown report generator ────────────────────────────────────────────────

/** Generate an AI-friendly markdown summary */
export function generateMarkdownSummary(
  results: CoverageResult[],
  qualityGate: QualityGateResult,
  metadata: BuildMetadata,
): string {
  const statusEmoji = metadata.passed ? '✅' : '❌';
  const lines: string[] = [
    `# API Coverage Report — ${statusEmoji} ${metadata.passed ? 'PASSED' : 'FAILED'}`,
    '',
    `**Project:** ${metadata.projectName}`,
    `**Repository:** ${metadata.repositoryName ?? 'N/A'}`,
    `**Branch:** ${metadata.branch ?? 'N/A'}`,
    `**Commit:** ${metadata.commitSha ?? 'N/A'}`,
    `**Build ID:** ${metadata.buildId}`,
    `**Timestamp:** ${metadata.buildTimestamp}`,
    '',
    '## Coverage Summary',
    '',
    '| Category | Total | Covered | % |',
    '|---|---|---|---|',
  ];

  for (const r of results) {
    const pct = r.coveragePercent.toFixed(2);
    const status = qualityGate.failures.some((f) => f.category === r.type) ? '❌' : '✅';
    lines.push(`| ${r.type} ${status} | ${r.totalItems} | ${r.coveredItems} | ${pct}% |`);
  }

  lines.push('');
  lines.push('## Quality Gate');
  lines.push('');

  if (qualityGate.failures.length === 0) {
    lines.push('✅ All coverage thresholds met.');
  } else {
    lines.push('❌ The following categories did not meet their thresholds:');
    lines.push('');
    for (const f of qualityGate.failures) {
      lines.push(
        `- **${f.category}**: expected ≥ ${f.expected}%, actual ${f.actual}%, gap ${f.gap}%`,
      );
    }
  }

  lines.push('');
  lines.push('## AI-Friendly Analysis');
  lines.push('');
  lines.push('<details>');
  lines.push('<summary>Expand for AI-friendly analysis</summary>');
  lines.push('');
  lines.push('### Coverage Gaps');
  lines.push('');

  const gaps = results.filter((r) => r.coveragePercent < 100);
  if (gaps.length === 0) {
    lines.push('No coverage gaps found.');
  } else {
    for (const g of gaps) {
      lines.push(`- **${g.type}**: ${g.coveredItems}/${g.totalItems} covered (${g.coveragePercent.toFixed(2)}%)`);
    }
  }

  lines.push('');
  lines.push('### Recommended Next Steps');
  lines.push('');

  if (qualityGate.failures.length > 0) {
    for (const f of qualityGate.failures) {
      lines.push(`- Increase **${f.category}** coverage by at least ${f.gap}% to meet the configured threshold.`);
    }
  } else {
    lines.push('- Coverage meets all configured thresholds. Consider increasing thresholds to maintain quality.');
  }

  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}

// ─── Landing page generator ───────────────────────────────────────────────────

/** Generate the central index.html landing page */
export function generateLandingPage(
  results: CoverageResult[],
  qualityGate: QualityGateResult,
  metadata: BuildMetadata,
  config: PublishingConfig,
  screenshotPaths: string[],
): string {
  const basePath = config.githubPages?.basePath ?? '/';
  const statusClass = metadata.passed ? 'passed' : 'failed';
  const statusText = metadata.passed ? '✅ PASSED' : '❌ FAILED';

  const coverageRows = results.map((r) => {
    const pct = r.coveragePercent.toFixed(2);
    const rowStatus = qualityGate.failures.some((f) => f.category === r.type)
      ? 'below'
      : 'above';
    return `<tr class="${rowStatus}">
      <td>${r.type}</td>
      <td>${r.totalItems}</td>
      <td>${r.coveredItems}</td>
      <td>${pct}%</td>
    </tr>`;
  }).join('\n');

  const failureRows = qualityGate.failures.map((f) => `
    <li><strong>${f.category}</strong>: expected ≥ ${f.expected}%, actual ${f.actual}%, gap ${f.gap}%</li>
  `).join('');

  const screenshotSection = screenshotPaths.length > 0
    ? `<section class="screenshots">
        <h2>Dashboard Screenshots</h2>
        <div class="screenshot-grid">
          ${screenshotPaths.map((p) => `<figure>
            <img src="${p}" alt="Dashboard screenshot" loading="lazy">
          </figure>`).join('\n')}
        </div>
      </section>`
    : `<section class="screenshots">
        <p class="notice">No screenshots available. Run with screenshot capture enabled.</p>
      </section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API Coverage Report — ${metadata.projectName}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 1100px; margin: 0 auto; padding: 1rem; }
    h1 { border-bottom: 2px solid #333; padding-bottom: .5rem; }
    .status { display: inline-block; padding: .25rem .75rem; border-radius: 4px; font-weight: bold; }
    .passed { background: #d4edda; color: #155724; }
    .failed { background: #f8d7da; color: #721c24; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #dee2e6; padding: .5rem .75rem; text-align: left; }
    th { background: #f8f9fa; }
    tr.above td:last-child { color: #155724; }
    tr.below { background: #fff3cd; }
    tr.below td:last-child { color: #856404; font-weight: bold; }
    .meta { background: #f8f9fa; padding: 1rem; border-radius: 4px; margin: 1rem 0; }
    .meta p { margin: .25rem 0; }
    details summary { cursor: pointer; font-weight: bold; padding: .5rem 0; }
    .screenshot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
    .screenshot-grid img { width: 100%; border: 1px solid #dee2e6; border-radius: 4px; }
    .notice { color: #6c757d; font-style: italic; }
    ul { padding-left: 1.5rem; }
  </style>
</head>
<body>
  <h1>API Coverage Report <span class="status ${statusClass}">${statusText}</span></h1>

  <div class="meta">
    <p><strong>Project:</strong> ${metadata.projectName}</p>
    <p><strong>Repository:</strong> ${metadata.repositoryName ?? 'N/A'}</p>
    <p><strong>Branch:</strong> ${metadata.branch ?? 'N/A'}</p>
    <p><strong>Commit:</strong> ${metadata.commitSha ?? 'N/A'}</p>
    <p><strong>Build ID:</strong> ${metadata.buildId}</p>
    <p><strong>Timestamp:</strong> ${metadata.buildTimestamp}</p>
  </div>

  <h2>Coverage Summary</h2>
  <table>
    <thead><tr><th>Category</th><th>Total</th><th>Covered</th><th>%</th></tr></thead>
    <tbody>${coverageRows}</tbody>
  </table>

  <h2>Quality Gate</h2>
  ${qualityGate.failures.length === 0
    ? '<p class="status passed">✅ All coverage thresholds met.</p>'
    : `<p class="status failed">❌ ${qualityGate.failures.length} threshold(s) not met:</p>
       <ul>${failureRows}</ul>`
  }

  ${screenshotSection}

  <details>
    <summary>AI-Friendly Analysis</summary>
    <h3>Coverage Gaps</h3>
    <ul>
    ${results
      .filter((r) => r.coveragePercent < 100)
      .map((r) => `<li><strong>${r.type}</strong>: ${r.coveredItems}/${r.totalItems} covered (${r.coveragePercent.toFixed(2)}%)</li>`)
      .join('\n') || '<li>No coverage gaps found.</li>'}
    </ul>
    <h3>Recommended Next Steps</h3>
    <ul>
    ${qualityGate.failures.length > 0
      ? qualityGate.failures.map((f) => `<li>Increase <strong>${f.category}</strong> coverage by at least ${f.gap}% to meet the configured threshold.</li>`).join('\n')
      : '<li>Coverage meets all configured thresholds. Consider increasing thresholds to maintain quality.</li>'}
    </ul>
  </details>

  <h2>Report Links</h2>
  <ul>
    ${results.map((r) => `<li><a href="${basePath}${r.type}-coverage.html">${r.type} coverage report</a></li>`).join('\n')}
    <li><a href="${basePath}coverage-summary.json">coverage-summary.json</a></li>
    <li><a href="${basePath}coverage-summary.csv">coverage-summary.csv</a></li>
    <li><a href="${basePath}coverage-summary-junit.xml">coverage-summary-junit.xml</a></li>
    <li><a href="${basePath}ai-summary.md">AI-Friendly Markdown Summary</a></li>
  </ul>
</body>
</html>`;
}

// ─── Bundle generator ─────────────────────────────────────────────────────────

/** Write the build metadata JSON file */
function writeBuildMetadata(bundleDir: string, metadata: BuildMetadata): string {
  const metaPath = path.join(bundleDir, 'build-metadata.json');
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
  return metaPath;
}

/**
 * Generate a complete publishable build bundle.
 *
 * The bundle is written to:
 *   `<outputDir>/builds/<buildId>/`
 *
 * And the static site root is:
 *   `<outputDir>/`
 */
export function generateBuildBundle(
  results: CoverageResult[],
  qualityGate: QualityGateResult,
  config: PublishingConfig,
  thresholds: Record<string, number | undefined>,
  screenshotPaths?: string[],
): GeneratedReports {
  const outputDir = config.outputDir ?? 'site';
  const buildId = resolveBuildId(config);
  const bundleDir = path.join(outputDir, 'builds', buildId);
  const screenshots = screenshotPaths ?? [];

  fs.mkdirSync(bundleDir, { recursive: true });

  const metadata = buildBuildMetadata(results, qualityGate, config, buildId, thresholds);
  const files: string[] = [];

  // ── Build metadata ───────────────────────────────────────────────────────
  files.push(writeBuildMetadata(bundleDir, metadata));

  // ── Markdown summary (AI-friendly) ───────────────────────────────────────
  const mdSummary = generateMarkdownSummary(results, qualityGate, metadata);
  const mdPath = path.join(bundleDir, 'ai-summary.md');
  fs.writeFileSync(mdPath, mdSummary, 'utf-8');
  files.push(mdPath);

  // ── Landing page ─────────────────────────────────────────────────────────
  const landingHtml = generateLandingPage(results, qualityGate, metadata, config, screenshots);
  const indexPath = path.join(bundleDir, 'index.html');
  fs.writeFileSync(indexPath, landingHtml, 'utf-8');
  files.push(indexPath);

  // ── Site root index (always points to latest build) ──────────────────────
  fs.mkdirSync(outputDir, { recursive: true });
  const siteIndexPath = path.join(outputDir, 'index.html');
  fs.writeFileSync(siteIndexPath, landingHtml, 'utf-8');
  files.push(siteIndexPath);

  // ── AI-friendly markdown at site root ────────────────────────────────────
  const siteAiMdPath = path.join(outputDir, 'ai-summary.md');
  fs.writeFileSync(siteAiMdPath, mdSummary, 'utf-8');
  files.push(siteAiMdPath);

  return {
    buildId,
    bundleDir,
    siteDir: outputDir,
    files,
    metadata,
  };
}

// ─── Site copyover ────────────────────────────────────────────────────────────

/**
 * Copy existing report files from `reportsDir` into the bundle and site directories.
 * Useful to include the standard multi-format reports in the static site.
 */
export function copyReportFilesToBundle(
  reportsDir: string,
  bundleDir: string,
  siteDir: string,
  artifacts: {
    includeJson?: boolean;
    includeHtml?: boolean;
    includeCsv?: boolean;
    includeJunit?: boolean;
    includeMarkdown?: boolean;
  } = {},
): string[] {
  const copied: string[] = [];

  const defaults = {
    includeJson: true,
    includeHtml: true,
    includeCsv: true,
    includeJunit: true,
    includeMarkdown: true,
    ...artifacts,
  };

  const extensions: string[] = [];
  if (defaults.includeJson) extensions.push('.json');
  if (defaults.includeHtml) extensions.push('.html');
  if (defaults.includeCsv) extensions.push('.csv');
  if (defaults.includeJunit) extensions.push('.xml');
  if (defaults.includeMarkdown) extensions.push('.md');

  if (!fs.existsSync(reportsDir)) return copied;

  for (const file of fs.readdirSync(reportsDir)) {
    const ext = path.extname(file);
    if (!extensions.includes(ext)) continue;

    const src = path.join(reportsDir, file);
    if (!fs.statSync(src).isFile()) continue;

    const content = fs.readFileSync(src);

    const bundleDest = path.join(bundleDir, file);
    fs.writeFileSync(bundleDest, content);
    copied.push(bundleDest);

    const siteDest = path.join(siteDir, file);
    fs.writeFileSync(siteDest, content);
    copied.push(siteDest);
  }

  return copied;
}
