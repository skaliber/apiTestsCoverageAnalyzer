import SwaggerParser from '@apidevtools/swagger-parser';
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import { OpenAPIV3 } from 'openapi-types';

// ─── Data structures ──────────────────────────────────────────────────────────

export type ResilienceCategory =
  | 'timeout'
  | 'retry'
  | 'circuit-breaker'
  | 'fallback'
  | 'rate-limiting'
  | 'bulkhead';

export const RESILIENCE_CATEGORIES: ResilienceCategory[] = [
  'timeout',
  'retry',
  'circuit-breaker',
  'fallback',
  'rate-limiting',
  'bulkhead',
];

/** An API endpoint derived from the OpenAPI spec */
export interface PerformanceEndpoint {
  /** Unique identifier, e.g. "GET /users" */
  id: string;
  method: string;
  path: string;
}

/** Thresholds used to evaluate load-test metrics */
export interface PerformanceThresholds {
  /** Maximum acceptable median response time in ms (default: 500) */
  responseMs: number;
  /** Maximum acceptable error rate as a fraction 0–1 (default: 0.05) */
  errorRate: number;
}

/** Parsed metrics for a single endpoint from a load-test result file */
export interface LoadTestMetrics {
  /** Endpoint identifier (matches PerformanceEndpoint.id or a label) */
  endpoint: string;
  /** Number of requests sampled */
  sampleCount: number;
  /** Average response time in ms */
  avg: number;
  /** Median (P50) response time in ms */
  median: number;
  /** 95th-percentile response time in ms */
  p95: number;
  /** 99th-percentile response time in ms */
  p99: number;
  /** Error rate (0–1) */
  errorRate: number;
  /** Requests per second */
  throughput: number;
}

/** Performance coverage result for one endpoint */
export interface PerformanceCoverage {
  endpoint: PerformanceEndpoint;
  /** True when at least one load-test result was found for this endpoint */
  hasLoadTestData: boolean;
  metrics?: LoadTestMetrics;
  /** Whether the median response time is within the threshold */
  meetsResponseTime: boolean;
  /** Whether the error rate is within the threshold */
  meetsErrorRate: boolean;
  /** Overall status */
  status: 'good' | 'needs-improvement' | 'missing-data';
}

/** A single resilience scenario (e.g. timeout handling for GET /users) */
export interface ResilienceScenario {
  /** Unique identifier, e.g. "timeout:GET /users" */
  id: string;
  category: ResilienceCategory;
  description: string;
  /** Associated endpoint, if scenario is endpoint-specific */
  endpoint?: PerformanceEndpoint;
}

/** Coverage result for one resilience scenario */
export interface ResilienceScenarioCoverage {
  scenario: ResilienceScenario;
  covered: boolean;
  /** Test description strings that matched this scenario */
  matchedTests: string[];
}

export interface ResilienceCategorySummary {
  total: number;
  covered: number;
}

/** Full performance and resilience coverage report */
export interface PerfResilienceReport {
  totalEndpoints: number;
  endpointsWithLoadData: number;
  performanceCoveragePercent: number;
  performanceCoverages: PerformanceCoverage[];
  totalResilienceScenarios: number;
  coveredResilienceScenarios: number;
  resilienceCoveragePercent: number;
  resilienceCoverages: ResilienceScenarioCoverage[];
  resilienceCategorySummary: Record<ResilienceCategory, ResilienceCategorySummary>;
}

// ─── Keyword maps ─────────────────────────────────────────────────────────────

/** Keywords used to detect resilience tests in test descriptions */
export const RESILIENCE_KEYWORDS: Record<ResilienceCategory, string[]> = {
  timeout: [
    'timeout', 'timed out', 'time out', 'deadline exceeded', 'request timeout',
    'connection timeout', 'slow response', 'latency', 'response time',
  ],
  retry: [
    'retry', 'retries', 'retrying', 'back-off', 'backoff', 'exponential backoff',
    'retry logic', 'retry attempt', 'max retries',
  ],
  'circuit-breaker': [
    'circuit breaker', 'circuit-breaker', 'circuit open', 'circuit closed',
    'circuit half-open', 'short circuit', 'tripped', 'open state',
  ],
  fallback: [
    'fallback', 'fall back', 'graceful degradation', 'degraded', 'default value',
    'cached response', 'fail gracefully', 'partial failure', 'unavailable',
    'service unavailable', '503', '5xx',
  ],
  'rate-limiting': [
    'rate limit', 'rate-limit', 'rate limiting', '429', 'too many requests',
    'throttle', 'throttling', 'quota', 'request quota', 'slow down',
  ],
  bulkhead: [
    'bulkhead', 'isolation', 'resource isolation', 'thread pool', 'semaphore',
    'concurrency limit', 'max concurrent', 'overload',
  ],
};

// ─── OpenAPI spec parsing ─────────────────────────────────────────────────────

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const;

/**
 * Parse an OpenAPI/Swagger spec and return a flat list of endpoints.
 */
export async function parseEndpointsFromSpec(specPath: string): Promise<PerformanceEndpoint[]> {
  const api = (await SwaggerParser.validate(specPath)) as OpenAPIV3.Document;
  const endpoints: PerformanceEndpoint[] = [];

  for (const [apiPath, pathItem] of Object.entries(api.paths ?? {})) {
    if (!pathItem) continue;
    for (const method of HTTP_METHODS) {
      if (pathItem[method]) {
        const id = `${method.toUpperCase()} ${apiPath}`;
        endpoints.push({ id, method: method.toUpperCase(), path: apiPath });
      }
    }
  }

  return endpoints;
}

// ─── Load-test result parsing ─────────────────────────────────────────────────

/**
 * Parse one or more load-test result files.
 * Supported formats:
 *  - JMeter .jtl / .csv  (comma-separated with standard JMeter headers)
 *  - k6 JSON summary     (`{ "metrics": { "http_req_duration": { "values": { ... } } } }`)
 *
 * Returns a map from endpoint label → LoadTestMetrics.
 */
export function parseLoadTestResults(filePaths: string[]): Map<string, LoadTestMetrics> {
  const results = new Map<string, LoadTestMetrics>();

  for (const filePath of filePaths) {
    const ext = path.extname(filePath).toLowerCase();
    const raw = fs.readFileSync(filePath, 'utf-8');

    if (ext === '.json') {
      const parsed = parseK6Json(raw);
      for (const [label, metrics] of parsed) {
        results.set(label, metrics);
      }
    } else {
      // .jtl, .csv, or any other extension → try JMeter CSV
      const parsed = parseJMeterCsv(raw);
      for (const [label, metrics] of parsed) {
        results.set(label, metrics);
      }
    }
  }

  return results;
}

// ── JMeter CSV ────────────────────────────────────────────────────────────────

/**
 * Parse a JMeter .jtl / .csv file.
 *
 * Expected header (standard JMeter format):
 *   timeStamp,elapsed,label,responseCode,success,bytes,sentBytes,grpThreads,allThreads,Latency,Connect
 *
 * Returns a map of label → aggregated LoadTestMetrics.
 */
export function parseJMeterCsv(csvContent: string): Map<string, LoadTestMetrics> {
  const lines = csvContent.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return new Map();

  const headerLine = lines[0].toLowerCase();
  const headers = headerLine.split(',').map((h) => h.trim());

  const elapsedIdx = headers.indexOf('elapsed');
  const labelIdx = headers.indexOf('label');
  const successIdx = headers.indexOf('success');

  if (elapsedIdx === -1 || labelIdx === -1) return new Map();

  // Accumulate raw samples per label
  const raw = new Map<string, { elapsed: number[]; errors: number }>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const label = (cols[labelIdx] ?? '').trim();
    const elapsed = parseFloat(cols[elapsedIdx] ?? '0');
    const success = successIdx === -1 ? true : (cols[successIdx] ?? 'true').trim().toLowerCase() === 'true';

    if (!label || isNaN(elapsed)) continue;

    if (!raw.has(label)) raw.set(label, { elapsed: [], errors: 0 });
    const entry = raw.get(label)!;
    entry.elapsed.push(elapsed);
    if (!success) entry.errors++;
  }

  const result = new Map<string, LoadTestMetrics>();
  for (const [label, data] of raw) {
    if (data.elapsed.length === 0) continue;
    const metrics = computeMetrics(label, data.elapsed, data.errors);
    result.set(label, metrics);
  }
  return result;
}

// ── k6 JSON ───────────────────────────────────────────────────────────────────

/**
 * Parse a k6 JSON summary file.
 *
 * Supports both the top-level summary format:
 *   `{ "metrics": { "http_req_duration": { "values": { "avg", "med", "p(95)", "p(99)" } } } }`
 * and a per-URL breakdown when present in `scenarios` or `groups` keys.
 */
export function parseK6Json(jsonContent: string): Map<string, LoadTestMetrics> {
  const result = new Map<string, LoadTestMetrics>();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonContent);
  } catch {
    return result;
  }

  if (!parsed || typeof parsed !== 'object') return result;
  const doc = parsed as Record<string, unknown>;

  // Top-level metrics (entire run summary)
  const metrics = doc.metrics as Record<string, unknown> | undefined;
  if (!metrics) return result;

  const durationMetric = metrics['http_req_duration'] as Record<string, unknown> | undefined;
  const failedMetric = metrics['http_req_failed'] as Record<string, unknown> | undefined;
  const reqs = metrics['http_reqs'] as Record<string, unknown> | undefined;

  if (!durationMetric) return result;

  const dVals = (durationMetric['values'] ?? durationMetric) as Record<string, unknown>;
  const fVals = failedMetric
    ? ((failedMetric['values'] ?? failedMetric) as Record<string, unknown>)
    : {};
  const rVals = reqs ? ((reqs['values'] ?? reqs) as Record<string, unknown>) : {};

  const avg = toNum(dVals['avg']) ?? 0;
  const med = toNum(dVals['med']) ?? toNum(dVals['median']) ?? avg;
  const p95 = toNum(dVals['p(95)']) ?? toNum(dVals['p95']) ?? avg;
  const p99 = toNum(dVals['p(99)']) ?? toNum(dVals['p99']) ?? avg;
  const errorRate = toNum(fVals['rate']) ?? 0;
  const count = toNum(rVals['count']) ?? 0;
  const throughput = toNum(rVals['rate']) ?? 0;

  result.set('overall', {
    endpoint: 'overall',
    sampleCount: count,
    avg,
    median: med,
    p95,
    p99,
    errorRate,
    throughput,
  });

  // Per-URL metrics: check for a "scenarios" or "url" breakdown
  const scenarios = doc.scenarios as Record<string, unknown> | undefined;
  if (scenarios) {
    for (const [scenarioName, scenarioData] of Object.entries(scenarios)) {
      if (!scenarioData || typeof scenarioData !== 'object') continue;
      const sd = scenarioData as Record<string, unknown>;
      const sdMetrics = sd['metrics'] as Record<string, unknown> | undefined;
      if (!sdMetrics) continue;
      const sdDur = sdMetrics['http_req_duration'] as Record<string, unknown> | undefined;
      if (!sdDur) continue;
      const sdVals = (sdDur['values'] ?? sdDur) as Record<string, unknown>;
      const sdFailed = sdMetrics['http_req_failed'] as Record<string, unknown> | undefined;
      const sdFVals = sdFailed
        ? ((sdFailed['values'] ?? sdFailed) as Record<string, unknown>)
        : {};
      result.set(scenarioName, {
        endpoint: scenarioName,
        sampleCount: toNum((sdMetrics['http_reqs'] as Record<string, unknown>)?.['count']) ?? 0,
        avg: toNum(sdVals['avg']) ?? 0,
        median: toNum(sdVals['med']) ?? toNum(sdVals['median']) ?? 0,
        p95: toNum(sdVals['p(95)']) ?? toNum(sdVals['p95']) ?? 0,
        p99: toNum(sdVals['p(99)']) ?? toNum(sdVals['p99']) ?? 0,
        errorRate: toNum(sdFVals['rate']) ?? 0,
        throughput: 0,
      });
    }
  }

  return result;
}

function toNum(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return isNaN(n) ? undefined : n;
  }
  return undefined;
}

/** Compute aggregated metrics from raw elapsed time samples */
function computeMetrics(label: string, elapsed: number[], errors: number): LoadTestMetrics {
  const sorted = [...elapsed].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / n;
  const median = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);
  const errorRate = errors / n;
  // Throughput is approximate (samples per "second" is not derivable from elapsed alone;
  // we return samples/total-elapsed-seconds as an approximation when total > 0)
  const totalElapsed = sum / 1000; // convert ms to s
  const throughput = totalElapsed > 0 ? n / totalElapsed : 0;

  return {
    endpoint: label,
    sampleCount: n,
    avg: round2(avg),
    median: round2(median),
    p95: round2(p95),
    p99: round2(p99),
    errorRate: round4(errorRate),
    throughput: round2(throughput),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// ─── Resilience scenario generation ──────────────────────────────────────────

/**
 * Build the list of resilience scenarios to check.
 *
 * For each endpoint we create one scenario per resilience category.
 * This gives a measurable and exhaustive checklist.
 */
export function buildResilienceScenarios(endpoints: PerformanceEndpoint[]): ResilienceScenario[] {
  const scenarios: ResilienceScenario[] = [];

  for (const endpoint of endpoints) {
    for (const cat of RESILIENCE_CATEGORIES) {
      scenarios.push({
        id: `${cat}:${endpoint.id}`,
        category: cat,
        description: resilienceDescription(cat, endpoint.id),
        endpoint,
      });
    }
  }

  return scenarios;
}

function resilienceDescription(cat: ResilienceCategory, endpointId: string): string {
  switch (cat) {
    case 'timeout':
      return `Timeout handling for ${endpointId}: verify that slow/unresponsive upstream causes proper timeout error`;
    case 'retry':
      return `Retry logic for ${endpointId}: verify that transient failures trigger retries with back-off`;
    case 'circuit-breaker':
      return `Circuit-breaker for ${endpointId}: verify that repeated failures open the circuit and stop cascading`;
    case 'fallback':
      return `Fallback/degradation for ${endpointId}: verify that unavailable dependency returns a graceful response`;
    case 'rate-limiting':
      return `Rate-limiting for ${endpointId}: verify that excessive requests return HTTP 429 with Retry-After`;
    case 'bulkhead':
      return `Bulkhead for ${endpointId}: verify that resource isolation prevents one endpoint from starving others`;
  }
}

// ─── Test-file analysis ───────────────────────────────────────────────────────

export interface TestEntry {
  description: string;
  filePath: string;
}

/**
 * Read test files matching a glob and extract test descriptions.
 * Recognises Jest/Mocha-style `test(`, `it(`, and `describe(` calls.
 */
export async function collectTestEntries(testsGlob: string): Promise<TestEntry[]> {
  const files = await fg(testsGlob, { absolute: true });
  const entries: TestEntry[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const pattern = /(?:test|it|describe)\s*\(\s*(['"`])([\s\S]*?)\1/g;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(content)) !== null) {
      entries.push({ description: m[2], filePath: file });
    }
  }

  return entries;
}

/**
 * Determine whether a test entry covers a given resilience scenario.
 *
 * Matching rules (applied to test description only):
 *  1. Explicit `@resilience <scenarioId>` annotation
 *  2. Category keywords AND (endpoint path or method in description)
 *  3. Category keywords alone (for global/category-level coverage)
 */
export function testCoversScenario(entry: TestEntry, scenario: ResilienceScenario): boolean {
  const desc = entry.description.toLowerCase();

  // Rule 1: explicit annotation
  if (desc.includes(`@resilience ${scenario.id.toLowerCase()}`)) return true;

  const keywords = RESILIENCE_KEYWORDS[scenario.category];
  const hasKeyword = keywords.some((kw) => desc.includes(kw.toLowerCase()));
  if (!hasKeyword) return false;

  // Rule 2: keyword + endpoint reference
  if (scenario.endpoint) {
    const pathLower = scenario.endpoint.path.toLowerCase();
    const methodLower = scenario.endpoint.method.toLowerCase();
    if (desc.includes(pathLower) || desc.includes(methodLower)) return true;
  }

  // Rule 3: keyword match alone (category-wide coverage)
  return true;
}

/**
 * Analyse test files and return coverage for each resilience scenario.
 */
export async function analyzeResilienceCoverage(
  scenarios: ResilienceScenario[],
  testsGlob: string,
): Promise<ResilienceScenarioCoverage[]> {
  const entries = await collectTestEntries(testsGlob);

  return scenarios.map((scenario) => {
    const matched: string[] = [];
    for (const entry of entries) {
      if (testCoversScenario(entry, scenario)) {
        matched.push(entry.description);
      }
    }
    return {
      scenario,
      covered: matched.length > 0,
      matchedTests: matched,
    };
  });
}

// ─── Performance coverage analysis ───────────────────────────────────────────

/**
 * Match load-test metrics to spec endpoints.
 *
 * A metrics label is matched to an endpoint when:
 *  - exact string match (e.g. "GET /users")
 *  - case-insensitive substring match of the endpoint path within the label
 *  - the label contains both the HTTP method and path fragments
 */
function matchMetricsToEndpoint(
  endpoint: PerformanceEndpoint,
  metricsMap: Map<string, LoadTestMetrics>,
): LoadTestMetrics | undefined {
  const endpointLower = endpoint.id.toLowerCase();
  const pathLower = endpoint.path.toLowerCase();
  const methodLower = endpoint.method.toLowerCase();

  // Try exact match first
  for (const [label, metrics] of metricsMap) {
    if (label.toLowerCase() === endpointLower) return metrics;
  }

  // Try path substring match
  for (const [label, metrics] of metricsMap) {
    const lbl = label.toLowerCase();
    if (lbl.includes(pathLower) && lbl.includes(methodLower)) return metrics;
  }

  // Try path only (covers cases where label is just the path)
  for (const [label, metrics] of metricsMap) {
    if (label.toLowerCase().includes(pathLower)) return metrics;
  }

  return undefined;
}

/**
 * Compute performance coverage for each endpoint.
 */
export function analyzePerformanceCoverage(
  endpoints: PerformanceEndpoint[],
  metricsMap: Map<string, LoadTestMetrics>,
  thresholds: PerformanceThresholds,
): PerformanceCoverage[] {
  return endpoints.map((endpoint) => {
    const metrics = matchMetricsToEndpoint(endpoint, metricsMap);

    if (!metrics) {
      return {
        endpoint,
        hasLoadTestData: false,
        meetsResponseTime: false,
        meetsErrorRate: false,
        status: 'missing-data',
      };
    }

    const meetsResponseTime = metrics.median <= thresholds.responseMs;
    const meetsErrorRate = metrics.errorRate <= thresholds.errorRate;
    const status: PerformanceCoverage['status'] =
      meetsResponseTime && meetsErrorRate ? 'good' : 'needs-improvement';

    return {
      endpoint,
      hasLoadTestData: true,
      metrics,
      meetsResponseTime,
      meetsErrorRate,
      status,
    };
  });
}

// ─── Report building ──────────────────────────────────────────────────────────

/**
 * Assemble the full PerfResilienceReport from individual coverage lists.
 */
export function buildPerfResilienceReport(
  performanceCoverages: PerformanceCoverage[],
  resilienceCoverages: ResilienceScenarioCoverage[],
): PerfResilienceReport {
  const totalEndpoints = performanceCoverages.length;
  const endpointsWithLoadData = performanceCoverages.filter((c) => c.hasLoadTestData).length;
  const performanceCoveragePercent =
    totalEndpoints > 0 ? round2((endpointsWithLoadData / totalEndpoints) * 100) : 0;

  const totalResilienceScenarios = resilienceCoverages.length;
  const coveredResilienceScenarios = resilienceCoverages.filter((c) => c.covered).length;
  const resilienceCoveragePercent =
    totalResilienceScenarios > 0
      ? round2((coveredResilienceScenarios / totalResilienceScenarios) * 100)
      : 0;

  const resilienceCategorySummary = {} as Record<ResilienceCategory, ResilienceCategorySummary>;
  for (const cat of RESILIENCE_CATEGORIES) {
    const catCoverages = resilienceCoverages.filter((c) => c.scenario.category === cat);
    resilienceCategorySummary[cat] = {
      total: catCoverages.length,
      covered: catCoverages.filter((c) => c.covered).length,
    };
  }

  return {
    totalEndpoints,
    endpointsWithLoadData,
    performanceCoveragePercent,
    performanceCoverages,
    totalResilienceScenarios,
    coveredResilienceScenarios,
    resilienceCoveragePercent,
    resilienceCoverages,
    resilienceCategorySummary,
  };
}

// ─── Report generation ────────────────────────────────────────────────────────

/**
 * Write `reports/perf-resilience-coverage.json` and
 * `reports/perf-resilience-coverage.html` to `reportsDir`.
 */
export function generatePerfResilienceReports(
  report: PerfResilienceReport,
  reportsDir: string,
): void {
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  writePerfJson(report, reportsDir);
  writePerfHtml(report, reportsDir);
}

function writePerfJson(report: PerfResilienceReport, reportsDir: string): void {
  const payload = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalEndpoints: report.totalEndpoints,
      endpointsWithLoadData: report.endpointsWithLoadData,
      performanceCoveragePercent: report.performanceCoveragePercent,
      totalResilienceScenarios: report.totalResilienceScenarios,
      coveredResilienceScenarios: report.coveredResilienceScenarios,
      resilienceCoveragePercent: report.resilienceCoveragePercent,
    },
    resilienceCategorySummary: report.resilienceCategorySummary,
    performanceDetails: report.performanceCoverages.map((c) => ({
      endpoint: c.endpoint.id,
      hasLoadTestData: c.hasLoadTestData,
      status: c.status,
      meetsResponseTime: c.meetsResponseTime,
      meetsErrorRate: c.meetsErrorRate,
      ...(c.metrics ? { metrics: c.metrics } : {}),
    })),
    resilienceDetails: report.resilienceCoverages.map((c) => ({
      scenario: c.scenario.id,
      category: c.scenario.category,
      description: c.scenario.description,
      covered: c.covered,
      matchedTests: c.matchedTests,
    })),
  };

  const outPath = path.join(reportsDir, 'perf-resilience-coverage.json');
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf-8');
}

function writePerfHtml(report: PerfResilienceReport, reportsDir: string): void {
  const perfRows = report.performanceCoverages
    .map((c) => {
      const rowClass = c.status === 'good' ? 'good' : c.status === 'needs-improvement' ? 'warn' : 'below';
      const metricsCell = c.metrics
        ? `<td>${c.metrics.median} ms</td><td>${c.metrics.p95} ms</td><td>${(c.metrics.errorRate * 100).toFixed(2)}%</td><td>${c.metrics.throughput} req/s</td>`
        : '<td colspan="4">—</td>';
      const statusCell = c.status === 'good' ? '✅ Good' : c.status === 'needs-improvement' ? '⚠️ Needs Improvement' : '❌ Missing Data';
      return `    <tr class="${rowClass}">
      <td>${c.endpoint.id}</td>
      ${metricsCell}
      <td>${statusCell}</td>
    </tr>`;
    })
    .join('\n');

  const resilienceRows = report.resilienceCoverages
    .map((c) => {
      const rowClass = c.covered ? 'good' : 'below';
      const coveredCell = c.covered ? '✅ Covered' : '❌ Not covered';
      return `    <tr class="${rowClass}">
      <td>${c.scenario.category}</td>
      <td>${c.scenario.endpoint?.id ?? '—'}</td>
      <td>${c.scenario.description}</td>
      <td>${coveredCell}</td>
    </tr>`;
    })
    .join('\n');

  const catRows = RESILIENCE_CATEGORIES.map((cat) => {
    const s = report.resilienceCategorySummary[cat];
    const pct = s.total > 0 ? Math.round((s.covered / s.total) * 100) : 0;
    const cls = pct >= 80 ? 'good' : pct > 0 ? 'warn' : 'below';
    return `    <tr class="${cls}"><td>${cat}</td><td>${s.covered}/${s.total}</td><td>${pct}%</td></tr>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Performance &amp; Resilience Coverage Report</title>
  <style>
    body { font-family: sans-serif; padding: 2rem; background: #fafafa; }
    h1, h2 { margin-bottom: 0.25rem; }
    .meta { color: #666; font-size: 0.9rem; margin-bottom: 1.5rem; }
    .summary { display: flex; gap: 2rem; margin-bottom: 2rem; flex-wrap: wrap; }
    .card { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 1rem 1.5rem; min-width: 180px; }
    .card .value { font-size: 2rem; font-weight: bold; }
    table { border-collapse: collapse; width: 100%; max-width: 1000px; margin-bottom: 2rem; }
    th, td { border: 1px solid #ccc; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #f0f0f0; }
    tr.good { background: #e6ffe6; }
    tr.warn { background: #fff9e6; }
    tr.below { background: #ffe6e6; }
  </style>
</head>
<body>
  <h1>Performance &amp; Resilience Coverage Report</h1>
  <p class="meta">Generated: ${new Date().toISOString()}</p>

  <div class="summary">
    <div class="card">
      <div class="label">Performance Coverage</div>
      <div class="value">${report.performanceCoveragePercent}%</div>
      <div class="sub">${report.endpointsWithLoadData}/${report.totalEndpoints} endpoints with load data</div>
    </div>
    <div class="card">
      <div class="label">Resilience Coverage</div>
      <div class="value">${report.resilienceCoveragePercent}%</div>
      <div class="sub">${report.coveredResilienceScenarios}/${report.totalResilienceScenarios} scenarios covered</div>
    </div>
  </div>

  <h2>Performance Coverage by Endpoint</h2>
  <table>
    <thead>
      <tr>
        <th>Endpoint</th>
        <th>Median</th>
        <th>P95</th>
        <th>Error Rate</th>
        <th>Throughput</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
${perfRows}
    </tbody>
  </table>

  <h2>Resilience Coverage by Category</h2>
  <table>
    <thead>
      <tr><th>Category</th><th>Covered / Total</th><th>%</th></tr>
    </thead>
    <tbody>
${catRows}
    </tbody>
  </table>

  <h2>Resilience Coverage by Scenario</h2>
  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Endpoint</th>
        <th>Description</th>
        <th>Covered</th>
      </tr>
    </thead>
    <tbody>
${resilienceRows}
    </tbody>
  </table>
</body>
</html>`;

  const outPath = path.join(reportsDir, 'perf-resilience-coverage.html');
  fs.writeFileSync(outPath, html, 'utf-8');
}
