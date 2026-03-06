/**
 * Observability module — structured logging, Prometheus metrics, and OpenTelemetry tracing.
 *
 * Usage:
 *   import { createLogger, initMetrics, startMetricsServer, recordCoverageMetrics,
 *            initTracing, startSpan, endSpan } from './observability';
 */

import * as http from 'http';
import pino from 'pino';
import {
  Registry,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';
import type { CoverageResult } from './reporting';

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

  // Store service name for use in recordCoverageMetrics
  (_registry as Registry & { _serviceName?: string })._serviceName = serviceName;

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
  };
}
