import * as fs from 'fs';
import * as path from 'path';
import type { ObservabilityInfo } from './observability';

// ─── Standardized result interface ───────────────────────────────────────────

/**
 * Standardized coverage result object produced by each coverage command.
 * All analysis commands return one of these so the reporting module can
 * handle them uniformly.
 */
export interface CoverageResult {
  /** Identifies which analysis produced this result (e.g. "endpoint", "parameter", "business", "integration") */
  type: string;
  /** Total number of items analysed (endpoints, parameters, rules, flows…) */
  totalItems: number;
  /** Number of items that are considered covered */
  coveredItems: number;
  /** Coverage percentage (0‑100, two decimal places) */
  coveragePercent: number;
  /** Arbitrary per-type detail data serialisable to JSON */
  details: unknown;
}

// ─── Supported output formats ─────────────────────────────────────────────────

export type ReportFormat = 'json' | 'html' | 'csv' | 'junit';

/**
 * Parse a comma-separated format string (e.g. "json,html") into an array of
 * validated `ReportFormat` values. Unknown tokens are silently ignored.
 */
export function parseFormats(raw: string): ReportFormat[] {
  const valid: ReportFormat[] = ['json', 'html', 'csv', 'junit'];
  return raw
    .split(',')
    .map((f) => f.trim().toLowerCase() as ReportFormat)
    .filter((f) => valid.includes(f));
}

// ─── Report writers ───────────────────────────────────────────────────────────

/** Write `reports/coverage-summary.json`, merging with any existing file so that
 *  successive per-type runs accumulate a complete summary across all 8 metrics. */
function writeJson(
  results: CoverageResult[],
  reportsDir: string,
  observability?: ObservabilityInfo,
): void {
  const outPath = path.join(reportsDir, 'coverage-summary.json');

  // Load existing summary/details so that successive single-type runs accumulate
  // all coverage types into one file rather than overwriting each other.
  let existingSummary: Array<Record<string, unknown>> = [];
  let existingDetails: Record<string, unknown> = {};
  try {
    if (fs.existsSync(outPath)) {
      const existing = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
      if (Array.isArray(existing.summary)) {
        existingSummary = existing.summary as Array<Record<string, unknown>>;
      }
      if (existing.details && typeof existing.details === 'object') {
        existingDetails = existing.details as Record<string, unknown>;
      }
    }
  } catch {
    // Corrupt file — start fresh
  }

  // New results replace any existing entry for the same type; others are kept.
  const newTypes = new Set(results.map((r) => r.type));
  const mergedSummary = [
    ...existingSummary.filter((s) => !newTypes.has(s.type as string)),
    ...results.map((r) => ({
      type: r.type,
      totalItems: r.totalItems,
      coveredItems: r.coveredItems,
      coveragePercent: r.coveragePercent,
    })),
  ];
  const mergedDetails: Record<string, unknown> = {
    ...existingDetails,
    ...results.reduce<Record<string, unknown>>((acc, r) => {
      acc[r.type] = r.details;
      return acc;
    }, {}),
  };

  const payload: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    summary: mergedSummary,
    details: mergedDetails,
  };

  if (observability) {
    payload.observability = {
      metricsUrl: observability.metricsUrl,
      note: observability.metricsUrl
        ? `Prometheus metrics available at ${observability.metricsUrl}`
        : 'Prometheus metrics export not enabled (use --metrics-port to enable)',
      metricNames: observability.metricNames,
      tracing: {
        enabled: observability.tracingEnabled,
        otlpEndpoint: observability.otlpEndpoint,
        note: observability.tracingEnabled
          ? `Traces are exported to ${observability.otlpEndpoint ?? 'in-memory (no OTLP endpoint configured)'}`
          : 'Tracing not enabled (use --trace to enable)',
      },
    };
  }

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf-8');
}

/** Write `reports/coverage-summary.html` */
function writeHtml(
  results: CoverageResult[],
  reportsDir: string,
  thresholds: Record<string, number> = {},
  observability?: ObservabilityInfo,
): void {
  const rows = results
    .map((r) => {
      const threshold = thresholds[r.type] ?? 0;
      const belowThreshold = r.coveragePercent < threshold;
      const rowClass = belowThreshold ? 'below' : r.coveragePercent >= 80 ? 'good' : 'warn';
      const thresholdCell = threshold > 0
        ? `<td class="${belowThreshold ? 'fail' : 'pass'}">${threshold}% ${belowThreshold ? '❌' : '✅'}</td>`
        : '<td>—</td>';
      return `    <tr class="${rowClass}">
      <td>${r.type}</td>
      <td>${r.coveredItems}/${r.totalItems}</td>
      <td>${r.coveragePercent}%</td>
      ${thresholdCell}
    </tr>`;
    })
    .join('\n');

  const observabilitySection = observability
    ? `
  <hr>
  <h2>Observability</h2>
  ${
    observability.metricsUrl
      ? `<p>📊 Prometheus metrics available at <a href="${observability.metricsUrl}">${observability.metricsUrl}</a></p>
  <p>Metric names (replace <code>&lt;type&gt;</code> with the coverage type, e.g. <code>endpoint</code>):</p>
  <ul>
    <li><code>api_coverage_total{coverage_type="&lt;type&gt;"}</code> — total items</li>
    <li><code>api_coverage_covered{coverage_type="&lt;type&gt;"}</code> — covered items</li>
    <li><code>api_coverage_ratio{coverage_type="&lt;type&gt;"}</code> — coverage ratio (0–1)</li>
    <li><code>api_coverage_threshold_failure{coverage_type="&lt;type&gt;"}</code> — 1 if below threshold</li>
  </ul>`
      : '<p>Prometheus metrics export not enabled. Use <code>--metrics-port &lt;port&gt;</code> to enable.</p>'
  }
  ${
    observability.tracingEnabled
      ? `<p>🔭 OpenTelemetry tracing enabled${observability.otlpEndpoint ? ` → <code>${observability.otlpEndpoint}</code>` : ' (in-memory only)'}. View traces in Jaeger or Grafana Tempo.</p>`
      : '<p>OpenTelemetry tracing not enabled. Use <code>--trace</code> to enable.</p>'
  }`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Coverage Summary Report</title>
  <style>
    body { font-family: sans-serif; padding: 2rem; background: #fafafa; }
    h1 { margin-bottom: 0.25rem; }
    .meta { color: #666; font-size: 0.9rem; margin-bottom: 1.5rem; }
    table { border-collapse: collapse; width: 100%; max-width: 800px; }
    th, td { border: 1px solid #ccc; padding: 0.5rem 1rem; text-align: left; }
    th { background: #f0f0f0; }
    tr.good { background: #e6ffe6; }
    tr.warn { background: #fff9e6; }
    tr.below { background: #ffe6e6; }
    td.pass { color: #2a7a2a; font-weight: bold; }
    td.fail { color: #aa2222; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Coverage Summary Report</h1>
  <p class="meta">Generated: ${new Date().toISOString()}</p>
  <table>
    <thead>
      <tr>
        <th>Coverage Type</th>
        <th>Covered / Total</th>
        <th>Coverage %</th>
        <th>Threshold</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>${observabilitySection}
</body>
</html>`;

  const outPath = path.join(reportsDir, 'coverage-summary.html');
  fs.writeFileSync(outPath, html, 'utf-8');
}

/** Write `reports/coverage-summary.csv` */
function writeCsv(results: CoverageResult[], reportsDir: string): void {
  const lines = ['type,total,covered,percent'];
  for (const r of results) {
    lines.push(`${r.type},${r.totalItems},${r.coveredItems},${r.coveragePercent}`);
  }

  const outPath = path.join(reportsDir, 'coverage-summary.csv');
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf-8');
}

/** Write `reports/coverage-summary-junit.xml` (JUnit-compatible XML) */
function writeJunit(
  results: CoverageResult[],
  reportsDir: string,
  thresholds: Record<string, number> = {},
): void {
  const testCases = results
    .map((r) => {
      const threshold = thresholds[r.type] ?? 0;
      const passed = r.coveragePercent >= threshold;
      const name = `${r.type} coverage`;
      if (passed) {
        return `    <testcase name="${name}" classname="CoverageThreshold" time="0"/>`;
      }
      const diff = (threshold - r.coveragePercent).toFixed(2);
      return `    <testcase name="${name}" classname="CoverageThreshold" time="0">
      <failure message="${r.type} coverage ${r.coveragePercent}% is below threshold ${threshold}% (gap: ${diff}%)">
        Coverage: ${r.coveragePercent}% / Threshold: ${threshold}% / Gap: ${diff}%
      </failure>
    </testcase>`;
    })
    .join('\n');

  const failures = results.filter(
    (r) => r.coveragePercent < (thresholds[r.type] ?? 0),
  ).length;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="API Coverage" tests="${results.length}" failures="${failures}" time="0">
  <testsuite name="Coverage Thresholds" tests="${results.length}" failures="${failures}" time="0">
${testCases}
  </testsuite>
</testsuites>`;

  const outPath = path.join(reportsDir, 'coverage-summary-junit.xml');
  fs.writeFileSync(outPath, xml, 'utf-8');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Write coverage reports in the requested formats to `reportsDir`.
 * The directory is created if it does not exist.
 *
 * @param results       Array of standardised coverage results
 * @param formats       Which output formats to generate
 * @param reportsDir    Absolute path to the output directory
 * @param thresholds    Optional per-type threshold percentages (used in HTML and JUnit outputs)
 * @param observability Optional observability metadata embedded in JSON and HTML outputs
 */
export function generateMultiFormatReports(
  results: CoverageResult[],
  formats: ReportFormat[],
  reportsDir: string,
  thresholds: Record<string, number> = {},
  observability?: ObservabilityInfo,
): void {
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  for (const fmt of formats) {
    switch (fmt) {
      case 'json':
        writeJson(results, reportsDir, observability);
        break;
      case 'html':
        writeHtml(results, reportsDir, thresholds, observability);
        break;
      case 'csv':
        writeCsv(results, reportsDir);
        break;
      case 'junit':
        writeJunit(results, reportsDir, thresholds);
        break;
    }
  }
}

/**
 * Check whether any coverage result falls below its threshold.
 * Returns an array of failure descriptions (empty means all pass).
 */
export function checkThresholds(
  results: CoverageResult[],
  thresholds: Record<string, number>,
): string[] {
  const failures: string[] = [];
  for (const result of results) {
    const threshold = thresholds[result.type];
    if (threshold !== undefined && result.coveragePercent < threshold) {
      const gap = (threshold - result.coveragePercent).toFixed(2);
      failures.push(
        `${result.type} coverage ${result.coveragePercent}% is below threshold ${threshold}% (gap: ${gap}%)`,
      );
    }
  }
  return failures;
}
