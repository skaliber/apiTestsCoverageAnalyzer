/**
 * Observability module — structured logging, Prometheus metrics, and OpenTelemetry tracing.
 *
 * Usage:
 *   import { createLogger, initMetrics, startMetricsServer, recordCoverageMetrics,
 *            recordSecurityScanMetrics, initTracing, startSpan, endSpan } from './observability';
 */

import * as http from 'http';
import pino from 'pino';
import {
  Registry,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';
import type { CoverageResult } from './reporting';

// ─── Security scanning types (kept minimal to avoid a circular import) ────────

/** Shape of SecurityScanSummary used for metrics — mirrors src/security/types.ts. */
export interface SecurityScanMetricsSummary {
  totalFindings: number;
  bySeverity: { LOW: number; MEDIUM: number; HIGH: number; CRITICAL: number };
  byCategory: Record<string, number>;
  byScanner: Record<string, number>;
  scannersRun: string[];
  gateResult?: { passed: boolean; reasons: string[] };
  /** Individual findings list — present when the full SecurityScanSummary is passed. */
  findings?: Array<{ severity: string; category: string; scanner: string }>;
}

// ─── Logging ─────────────────────────────────────────────────────────────────

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

/** Create a pino logger at the specified level (defaults to 'info'). */
export function createLogger(level: LogLevel = 'info'): pino.Logger {
  return pino({
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  });
}

/** Shared module-level logger instance — replaced by initLogger(). */
let _logger: pino.Logger = createLogger('info');

/** Initialise (or replace) the module-level logger. */
export function initLogger(level: LogLevel): void {
  _logger = createLogger(level);
}

/** Return the current module-level logger. */
export function getLogger(): pino.Logger {
  return _logger;
}

/** Log a coverage result at INFO level with structured fields. */
export function logCoverageResult(
  logger: pino.Logger,
  result: CoverageResult,
  threshold?: number,
): void {
  const status =
    threshold !== undefined
      ? result.coveragePercent >= threshold
        ? 'pass'
        : 'fail'
      : 'unchecked';

  logger.info({
    coverageType: result.type,
    totalItems: result.totalItems,
    coveredItems: result.coveredItems,
    coveragePercent: result.coveragePercent,
    threshold,
    status,
    message: `Coverage result for ${result.type}: ${result.coveragePercent}% (${result.coveredItems}/${result.totalItems})`,
  });
}

/** Log a threshold breach at WARN level. */
export function logThresholdBreach(
  logger: pino.Logger,
  coverageType: string,
  coveragePercent: number,
  threshold: number,
): void {
  const gap = (threshold - coveragePercent).toFixed(2);
  logger.warn({
    event: 'threshold_breach',
    coverageType,
    coveragePercent,
    threshold,
    gap: parseFloat(gap),
    message: `Threshold breach: ${coverageType} coverage ${coveragePercent}% is below threshold ${threshold}% (gap: ${gap}%)`,
  });
}

// ─── Prometheus metrics ───────────────────────────────────────────────────────

/** Per-run Prometheus registry — recreated each run to avoid stale data. */
let _registry: Registry | null = null;

/** Gauges populated after each analysis run. */
let _gauges: {
  total: Gauge;
  covered: Gauge;
  ratio: Gauge;
  thresholdFailure: Gauge;
} | null = null;

/** Gauges for the security scanning layer. */
let _securityGauges: {
  findings: Gauge;        // api_security_findings_total{service, severity, category, scanner}
  gatePassed: Gauge;      // api_security_gate_passed{service}
  scanTimestamp: Gauge;   // api_security_scan_timestamp_seconds{service}
} | null = null;

/** Gauges for the coverage intelligence layer. */
let _intelligenceGauges: {
  functionalFindingsTotal: Gauge;         // api_coverage_functional_findings_total
  missingTestRecommendationsTotal: Gauge; // api_coverage_missing_test_recommendations_total
  missingTestByPriority: Gauge;           // api_coverage_missing_test_recommendations_by_priority
  riskScoreMax: Gauge;                    // api_coverage_risk_score_max
  riskScoreAvg: Gauge;                    // api_coverage_risk_score_avg
  criticalUncoveredItems: Gauge;          // api_coverage_critical_uncovered_items_total
  unprotectedSecurityFindings: Gauge;     // api_coverage_unprotected_security_findings_total
} | null = null;

/** Metrics HTTP server (set when --metrics-port is active). */
let _metricsServer: http.Server | null = null;

/**
 * Initialise a fresh Prometheus registry and register the coverage gauges.
 * Call once before recording metrics.
 */
export function initMetrics(serviceName = 'api-coverage-analyzer'): Registry {
  _registry = new Registry();

  // Optional: collect default Node.js process metrics
  collectDefaultMetrics({ register: _registry, prefix: 'nodejs_' });

  _gauges = {
    total: new Gauge({
      name: 'api_coverage_total',
      help: 'Total number of items analysed for this coverage type',
      labelNames: ['service', 'coverage_type'],
      registers: [_registry],
    }),
    covered: new Gauge({
      name: 'api_coverage_covered',
      help: 'Number of covered items for this coverage type',
      labelNames: ['service', 'coverage_type'],
      registers: [_registry],
    }),
    ratio: new Gauge({
      name: 'api_coverage_ratio',
      help: 'Coverage ratio (0–1) for this coverage type',
      labelNames: ['service', 'coverage_type'],
      registers: [_registry],
    }),
    thresholdFailure: new Gauge({
      name: 'api_coverage_threshold_failure',
      help: '1 if coverage is below the configured threshold, 0 otherwise',
      labelNames: ['service', 'coverage_type'],
      registers: [_registry],
    }),
  };

  _securityGauges = {
    findings: new Gauge({
      name: 'api_security_findings_total',
      help: 'Number of security scan findings labeled by severity, category and scanner',
      labelNames: ['service', 'severity', 'category', 'scanner'],
      registers: [_registry],
    }),
    gatePassed: new Gauge({
      name: 'api_security_gate_passed',
      help: '1 if the security gate passed on the last scan, 0 if it failed, -1 if not configured',
      labelNames: ['service'],
      registers: [_registry],
    }),
    scanTimestamp: new Gauge({
      name: 'api_security_scan_timestamp_seconds',
      help: 'Unix timestamp (seconds) of the last security scan run',
      labelNames: ['service'],
      registers: [_registry],
    }),
  };

  // Store service name for use in recordCoverageMetrics
  (_registry as Registry & { _serviceName?: string })._serviceName = serviceName;

  _intelligenceGauges = {
    functionalFindingsTotal: new Gauge({
      name: 'api_coverage_functional_findings_total',
      help: 'Total number of functional findings detected by the intelligence engine',
      labelNames: ['project', 'coverage_type', 'language', 'framework'],
      registers: [_registry],
    }),
    missingTestRecommendationsTotal: new Gauge({
      name: 'api_coverage_missing_test_recommendations_total',
      help: 'Total number of missing test recommendations',
      labelNames: ['project', 'coverage_type', 'language', 'framework'],
      registers: [_registry],
    }),
    missingTestByPriority: new Gauge({
      name: 'api_coverage_missing_test_recommendations_by_priority',
      help: 'Missing test recommendations grouped by priority',
      labelNames: ['project', 'priority', 'risk_band'],
      registers: [_registry],
    }),
    riskScoreMax: new Gauge({
      name: 'api_coverage_risk_score_max',
      help: 'Maximum risk score across all recommendations',
      labelNames: ['project'],
      registers: [_registry],
    }),
    riskScoreAvg: new Gauge({
      name: 'api_coverage_risk_score_avg',
      help: 'Average risk score across all recommendations',
      labelNames: ['project'],
      registers: [_registry],
    }),
    criticalUncoveredItems: new Gauge({
      name: 'api_coverage_critical_uncovered_items_total',
      help: 'Total number of critical/high severity uncovered items',
      labelNames: ['project'],
      registers: [_registry],
    }),
    unprotectedSecurityFindings: new Gauge({
      name: 'api_coverage_unprotected_security_findings_total',
      help: 'Number of security findings with no associated test protection',
      labelNames: ['project'],
      registers: [_registry],
    }),
  };

  return _registry;
}

/** Return the current registry (null if not yet initialised). */
export function getRegistry(): Registry | null {
  return _registry;
}

/**
 * Record coverage results into the Prometheus gauges.
 * Must be called after initMetrics().
 */
export function recordCoverageMetrics(
  results: CoverageResult[],
  thresholds: Record<string, number> = {},
  serviceName = 'api-coverage-analyzer',
): void {
  if (!_gauges || !_registry) return;

  for (const r of results) {
    const labels = { service: serviceName, coverage_type: r.type };
    const ratio = r.totalItems > 0 ? r.coveredItems / r.totalItems : 0;
    const threshold = thresholds[r.type];
    const failing = threshold !== undefined && r.coveragePercent < threshold ? 1 : 0;

    _gauges.total.set(labels, r.totalItems);
    _gauges.covered.set(labels, r.coveredItems);
    _gauges.ratio.set(labels, ratio);
    _gauges.thresholdFailure.set(labels, failing);
  }
}

/**
 * Record security scanning results into dedicated Prometheus gauges.
 *
 * Exposes:
 *  - `api_security_findings_total{service, severity, category, scanner}` — count per label combination
 *  - `api_security_gate_passed{service}` — 1 = passed, 0 = failed, -1 = not configured
 *  - `api_security_scan_timestamp_seconds{service}` — Unix timestamp of this scan
 *
 * Must be called after initMetrics().
 */
export function recordSecurityScanMetrics(
  summary: SecurityScanMetricsSummary,
  serviceName = 'api-coverage-analyzer',
): void {
  if (!_securityGauges || !_registry) return;

  const now = Math.floor(Date.now() / 1000);
  _securityGauges.scanTimestamp.set({ service: serviceName }, now);

  // Gate status: 1 passed, 0 failed, -1 not configured
  const gateValue =
    summary.gateResult === undefined ? -1 : summary.gateResult.passed ? 1 : 0;
  _securityGauges.gatePassed.set({ service: serviceName }, gateValue);

  const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const categories = Object.keys(summary.byCategory);
  const scanners = summary.scannersRun.length > 0 ? summary.scannersRun : ['none'];

  // Zero-out all combinations first so Grafana sees 0 instead of stale values
  for (const sev of severities) {
    for (const cat of categories) {
      for (const scanner of scanners) {
        _securityGauges.findings.set(
          { service: serviceName, severity: sev, category: cat, scanner },
          0,
        );
      }
    }
  }

  if (summary.findings && summary.findings.length > 0) {
    // Use the per-finding detail list when available (highest granularity)
    for (const finding of summary.findings) {
      _securityGauges.findings.inc(
        { service: serviceName, severity: finding.severity, category: finding.category, scanner: finding.scanner },
        1,
      );
    }
  } else {
    // Fallback: use pre-aggregated severity counts when no per-finding list is provided
    for (const [sev, count] of Object.entries(summary.bySeverity)) {
      for (const scanner of scanners) {
        _securityGauges.findings.set(
          { service: serviceName, severity: sev, category: 'unknown', scanner },
          count,
        );
      }
    }
  }
}

/** Shape of IntelligenceSummary used for metrics recording. */
export interface IntelligenceMetricsSummary {
  projectName: string;
  totalFindings: number;
  totalRecommendations: number;
  recommendationsByPriority: Record<string, number>;
  maxRiskScore: number;
  avgRiskScore: number;
  criticalUncoveredItems: number;
  unprotectedSecurityFindings: number;
  languages?: string[];
  frameworks?: string[];
}

/**
 * Record coverage intelligence results into dedicated Prometheus gauges.
 *
 * Must be called after initMetrics().
 */
export function recordIntelligenceMetrics(
  summary: IntelligenceMetricsSummary,
  projectName?: string,
): void {
  if (!_intelligenceGauges || !_registry) return;

  const project = projectName ?? summary.projectName ?? 'unknown';
  const language = summary.languages?.[0] ?? 'unknown';
  const framework = summary.frameworks?.[0] ?? 'unknown';

  _intelligenceGauges.functionalFindingsTotal.set(
    { project, coverage_type: 'all', language, framework },
    summary.totalFindings,
  );
  _intelligenceGauges.missingTestRecommendationsTotal.set(
    { project, coverage_type: 'all', language, framework },
    summary.totalRecommendations,
  );
  _intelligenceGauges.riskScoreMax.set({ project }, summary.maxRiskScore);
  _intelligenceGauges.riskScoreAvg.set({ project }, summary.avgRiskScore);
  _intelligenceGauges.criticalUncoveredItems.set({ project }, summary.criticalUncoveredItems);
  _intelligenceGauges.unprotectedSecurityFindings.set(
    { project },
    summary.unprotectedSecurityFindings,
  );

  for (const [priority, count] of Object.entries(summary.recommendationsByPriority)) {
    // Derive a risk band label from priority
    const riskBand =
      priority === 'P0' ? 'Critical' :
      priority === 'P1' ? 'High' :
      priority === 'P2' ? 'Moderate' : 'Low';
    _intelligenceGauges.missingTestByPriority.set(
      { project, priority, risk_band: riskBand },
      count,
    );
  }
}

/**
 * Start an HTTP server that exposes /metrics in Prometheus text format.
 * Resolves with the bound server instance once the port is open.
 */
export function startMetricsServer(port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    if (!_registry) {
      reject(new Error('Metrics registry not initialised — call initMetrics() first'));
      return;
    }

    const registry = _registry;
    const server = http.createServer(async (req, res) => {
      if (req.url === '/metrics') {
        try {
          const text = await registry.metrics();
          res.writeHead(200, { 'Content-Type': registry.contentType });
          res.end(text);
        } catch (err) {
          res.writeHead(500);
          res.end(String(err));
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.once('error', reject);
    server.listen(port, () => {
      _metricsServer = server;
      resolve(server);
    });
  });
}

/** Stop the metrics server if it is running. */
export function stopMetricsServer(): Promise<void> {
  return new Promise((resolve) => {
    if (_metricsServer) {
      _metricsServer.close(() => {
        _metricsServer = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

// ─── OpenTelemetry tracing ────────────────────────────────────────────────────

export interface TraceSpan {
  name: string;
  startTime: number;
  attributes: Record<string, string | number | boolean>;
  end(attributes?: Record<string, string | number | boolean>): void;
  ended: boolean;
  endTime?: number;
}

/** In-memory span collector (used when no OTLP endpoint is configured). */
const _spans: TraceSpan[] = [];
let _tracingEnabled = false;
let _otlpEndpoint: string | null = null;

/** Enable or disable tracing. If endpoint is provided, spans are POSTed via OTLP HTTP. */
export function initTracing(enabled: boolean, otlpEndpoint?: string): void {
  _tracingEnabled = enabled;
  _otlpEndpoint = otlpEndpoint ?? null;
  if (enabled) {
    _logger.debug({ event: 'tracing_init', otlpEndpoint: _otlpEndpoint ?? 'in-memory' }, 'OpenTelemetry tracing enabled');
  }
}

/** Start a new span. No-op if tracing is disabled. */
export function startSpan(
  name: string,
  attributes: Record<string, string | number | boolean> = {},
): TraceSpan {
  const span: TraceSpan = {
    name,
    startTime: Date.now(),
    attributes: { ...attributes },
    ended: false,
    end(extraAttributes?: Record<string, string | number | boolean>) {
      if (this.ended) return;
      this.ended = true;
      this.endTime = Date.now();
      if (extraAttributes) {
        Object.assign(this.attributes, extraAttributes);
      }
      if (_tracingEnabled) {
        const durationMs = this.endTime - this.startTime;
        _logger.debug({
          event: 'span_end',
          spanName: this.name,
          durationMs,
          attributes: this.attributes,
        });
        _spans.push(this);
        if (_otlpEndpoint) {
          void exportSpanOtlp(this, _otlpEndpoint);
        }
      }
    },
  };

  if (_tracingEnabled) {
    _logger.debug({ event: 'span_start', spanName: name, attributes });
  }

  return span;
}

/** Return all completed spans collected in memory. */
export function getCollectedSpans(): TraceSpan[] {
  return [..._spans];
}

/** Clear the in-memory span buffer (useful in tests). */
export function clearCollectedSpans(): void {
  _spans.length = 0;
}

/**
 * Export a single span to an OTLP HTTP endpoint.
 * This is a minimal implementation that sends a simplified JSON payload.
 * For production use, the full @opentelemetry/exporter-trace-otlp-http package
 * can be substituted.
 */
async function exportSpanOtlp(span: TraceSpan, endpoint: string): Promise<void> {
  const url = new URL('/v1/traces', endpoint);
  const body = JSON.stringify({
    resourceSpans: [
      {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: 'api-coverage-analyzer' } }],
        },
        scopeSpans: [
          {
            spans: [
              {
                name: span.name,
                startTimeUnixNano: String(span.startTime * 1_000_000),
                endTimeUnixNano: String((span.endTime ?? span.startTime) * 1_000_000),
                attributes: Object.entries(span.attributes).map(([k, v]) => ({
                  key: k,
                  value:
                    typeof v === 'string'
                      ? { stringValue: v }
                      : typeof v === 'boolean'
                      ? { boolValue: v }
                      : { intValue: v },
                })),
                status: {},
              },
            ],
          },
        ],
      },
    ],
  });

  try {
    const { default: https } = await import('https');
    const { default: httpModule } = await import('http');
    const mod = url.protocol === 'https:' ? https : httpModule;

    await new Promise<void>((resolve, reject) => {
      const reqOptions = {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || undefined,
        path: url.pathname,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };
      const req = mod.request(
        reqOptions,
        (res) => {
          res.resume();
          res.on('end', resolve);
        },
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  } catch (err) {
    _logger.warn({ event: 'otlp_export_error', error: String(err) }, 'Failed to export span to OTLP endpoint');
  }
}

// ─── Observability summary for reports ───────────────────────────────────────

export interface ObservabilityInfo {
  metricsUrl: string | null;
  tracingEnabled: boolean;
  otlpEndpoint: string | null;
  metricNames: {
    total: string;
    covered: string;
    ratio: string;
    thresholdFailure: string;
  };
  securityMetricNames?: {
    findings: string;
    gatePassed: string;
    scanTimestamp: string;
  };
  intelligenceMetricNames?: {
    functionalFindingsTotal: string;
    missingTestRecommendationsTotal: string;
    missingTestByPriority: string;
    riskScoreMax: string;
    riskScoreAvg: string;
    criticalUncoveredItems: string;
    unprotectedSecurityFindings: string;
  };
}

/** Build an observability info object for embedding in reports. */
export function buildObservabilityInfo(metricsPort?: number): ObservabilityInfo {
  return {
    metricsUrl: metricsPort ? `http://localhost:${metricsPort}/metrics` : null,
    tracingEnabled: _tracingEnabled,
    otlpEndpoint: _otlpEndpoint,
    metricNames: {
      total: 'api_coverage_total{service="<name>",coverage_type="<type>"}',
      covered: 'api_coverage_covered{service="<name>",coverage_type="<type>"}',
      ratio: 'api_coverage_ratio{service="<name>",coverage_type="<type>"}',
      thresholdFailure: 'api_coverage_threshold_failure{service="<name>",coverage_type="<type>"}',
    },
    securityMetricNames: {
      findings: 'api_security_findings_total{service="<name>",severity="<sev>",category="<cat>",scanner="<scanner>"}',
      gatePassed: 'api_security_gate_passed{service="<name>"}',
      scanTimestamp: 'api_security_scan_timestamp_seconds{service="<name>"}',
    },
    intelligenceMetricNames: {
      functionalFindingsTotal: 'api_coverage_functional_findings_total{project="<name>",coverage_type="<type>",language="<lang>",framework="<fw>"}',
      missingTestRecommendationsTotal: 'api_coverage_missing_test_recommendations_total{project="<name>",coverage_type="<type>",language="<lang>",framework="<fw>"}',
      missingTestByPriority: 'api_coverage_missing_test_recommendations_by_priority{project="<name>",priority="<P0-P3>",risk_band="<band>"}',
      riskScoreMax: 'api_coverage_risk_score_max{project="<name>"}',
      riskScoreAvg: 'api_coverage_risk_score_avg{project="<name>"}',
      criticalUncoveredItems: 'api_coverage_critical_uncovered_items_total{project="<name>"}',
      unprotectedSecurityFindings: 'api_coverage_unprotected_security_findings_total{project="<name>"}',
    },
  };
}
