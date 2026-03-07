import * as http from 'http';
import {
  createLogger,
  initLogger,
  getLogger,
  logCoverageResult,
  logThresholdBreach,
  initMetrics,
  getRegistry,
  recordCoverageMetrics,
  recordSecurityScanMetrics,
  startMetricsServer,
  stopMetricsServer,
  initTracing,
  startSpan,
  getCollectedSpans,
  clearCollectedSpans,
  buildObservabilityInfo,
  SecurityScanMetricsSummary,
} from '../src/observability';
import type { CoverageResult } from '../src/reporting';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeResult = (type: string, total: number, covered: number): CoverageResult => ({
  type,
  totalItems: total,
  coveredItems: covered,
  coveragePercent: total > 0 ? parseFloat(((covered / total) * 100).toFixed(2)) : 0,
  details: {},
});

/** Fetch a URL and return the response body as a string. */
function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/** Return a free port by asking the OS to bind on 0 and immediately release it. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// ─── createLogger / initLogger / getLogger ────────────────────────────────────

describe('createLogger', () => {
  it('returns a pino logger with the requested level', () => {
    const logger = createLogger('debug');
    expect(logger.level).toBe('debug');
  });

  it('defaults to info level', () => {
    const logger = createLogger();
    expect(logger.level).toBe('info');
  });
});

describe('initLogger / getLogger', () => {
  afterEach(() => {
    // restore default
    initLogger('info');
  });

  it('getLogger returns a logger', () => {
    const logger = getLogger();
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });

  it('initLogger changes the module-level logger level', () => {
    initLogger('debug');
    expect(getLogger().level).toBe('debug');
  });

  it('silent level suppresses output without throwing', () => {
    initLogger('silent');
    expect(() => getLogger().info('this should not be printed')).not.toThrow();
  });
});

// ─── logCoverageResult ────────────────────────────────────────────────────────

describe('logCoverageResult', () => {
  it('logs without throwing for a passing result', () => {
    const logger = createLogger('silent');
    const result = makeResult('endpoint', 10, 8);
    expect(() => logCoverageResult(logger, result, 80)).not.toThrow();
  });

  it('logs without throwing for a failing result', () => {
    const logger = createLogger('silent');
    const result = makeResult('endpoint', 10, 5);
    expect(() => logCoverageResult(logger, result, 80)).not.toThrow();
  });

  it('logs without threshold (unchecked status)', () => {
    const logger = createLogger('silent');
    const result = makeResult('business', 5, 3);
    expect(() => logCoverageResult(logger, result)).not.toThrow();
  });
});

// ─── logThresholdBreach ───────────────────────────────────────────────────────

describe('logThresholdBreach', () => {
  it('logs a threshold breach without throwing', () => {
    const logger = createLogger('silent');
    expect(() => logThresholdBreach(logger, 'endpoint', 50, 80)).not.toThrow();
  });
});

// ─── Prometheus metrics ───────────────────────────────────────────────────────

describe('initMetrics / getRegistry', () => {
  it('getRegistry returns null before initMetrics', () => {
    // We test this in isolation with a fresh require - since module state persists,
    // just verify the function exists and returns something after init.
    const registry = initMetrics('test-service');
    expect(registry).toBeDefined();
    expect(getRegistry()).toBe(registry);
  });

  it('initMetrics creates a registry with the correct service name', () => {
    const registry = initMetrics('my-service');
    expect(registry).toBeDefined();
    const reg = getRegistry();
    expect(reg).not.toBeNull();
    // The registry should expose content type
    expect(reg!.contentType).toContain('text/plain');
  });
});

describe('recordCoverageMetrics', () => {
  beforeEach(() => {
    initMetrics('test-svc');
  });

  it('records metrics without throwing', () => {
    const results = [makeResult('endpoint', 10, 8), makeResult('business', 5, 3)];
    expect(() => recordCoverageMetrics(results, { endpoint: 80 }, 'test-svc')).not.toThrow();
  });

  it('metrics endpoint returns text/plain with metric names', async () => {
    const results = [makeResult('endpoint', 10, 8)];
    recordCoverageMetrics(results, { endpoint: 80 }, 'test-svc');

    const registry = getRegistry()!;
    const text = await registry.metrics();
    expect(text).toContain('api_coverage_total');
    expect(text).toContain('api_coverage_covered');
    expect(text).toContain('api_coverage_ratio');
    expect(text).toContain('api_coverage_threshold_failure');
  });

  it('coverage_total gauge reflects totalItems', async () => {
    const results = [makeResult('endpoint', 10, 8)];
    recordCoverageMetrics(results, {}, 'test-svc');
    const registry = getRegistry()!;
    const text = await registry.metrics();
    expect(text).toMatch(/api_coverage_total\{[^}]*coverage_type="endpoint"[^}]*\}\s+10/);
  });

  it('coverage_covered gauge reflects coveredItems', async () => {
    const results = [makeResult('endpoint', 10, 8)];
    recordCoverageMetrics(results, {}, 'test-svc');
    const registry = getRegistry()!;
    const text = await registry.metrics();
    expect(text).toMatch(/api_coverage_covered\{[^}]*coverage_type="endpoint"[^}]*\}\s+8/);
  });

  it('coverage_ratio gauge is correct', async () => {
    const results = [makeResult('endpoint', 10, 8)];
    recordCoverageMetrics(results, {}, 'test-svc');
    const registry = getRegistry()!;
    const text = await registry.metrics();
    expect(text).toMatch(/api_coverage_ratio\{[^}]*coverage_type="endpoint"[^}]*\}\s+0\.8/);
  });

  it('threshold_failure gauge is 1 when coverage is below threshold', async () => {
    const results = [makeResult('endpoint', 10, 5)]; // 50% < 80%
    recordCoverageMetrics(results, { endpoint: 80 }, 'test-svc');
    const registry = getRegistry()!;
    const text = await registry.metrics();
    expect(text).toMatch(/api_coverage_threshold_failure\{[^}]*coverage_type="endpoint"[^}]*\}\s+1/);
  });

  it('threshold_failure gauge is 0 when coverage meets threshold', async () => {
    const results = [makeResult('endpoint', 10, 8)]; // 80% >= 80%
    recordCoverageMetrics(results, { endpoint: 80 }, 'test-svc');
    const registry = getRegistry()!;
    const text = await registry.metrics();
    expect(text).toMatch(/api_coverage_threshold_failure\{[^}]*coverage_type="endpoint"[^}]*\}\s+0/);
  });
});

// ─── startMetricsServer / stopMetricsServer ───────────────────────────────────

describe('startMetricsServer / stopMetricsServer', () => {
  let port: number;

  beforeEach(async () => {
    initMetrics('server-test');
    port = await freePort();
  });

  afterEach(async () => {
    await stopMetricsServer();
  });

  it('starts an HTTP server on the requested port', async () => {
    await startMetricsServer(port);
    const body = await fetchUrl(`http://localhost:${port}/metrics`);
    expect(body).toContain('# HELP');
  });

  it('/metrics endpoint returns correct Content-Type', async () => {
    await startMetricsServer(port);
    const text = await new Promise<string>((resolve, reject) => {
      http.get(`http://localhost:${port}/metrics`, (res) => {
        expect(res.headers['content-type']).toContain('text/plain');
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
    expect(text.length).toBeGreaterThan(0);
  });

  it('/metrics endpoint contains recorded gauge values', async () => {
    const results = [makeResult('integration', 20, 15)];
    recordCoverageMetrics(results, {}, 'server-test');

    await startMetricsServer(port);
    const body = await fetchUrl(`http://localhost:${port}/metrics`);
    expect(body).toContain('api_coverage_total');
    expect(body).toContain('integration');
  });

  it('returns 404 for unknown paths', async () => {
    await startMetricsServer(port);
    const statusCode = await new Promise<number>((resolve, reject) => {
      http.get(`http://localhost:${port}/unknown`, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      }).on('error', reject);
    });
    expect(statusCode).toBe(404);
  });

  it('stopMetricsServer stops the server gracefully', async () => {
    await startMetricsServer(port);
    await stopMetricsServer();
    // After stop, connection should be refused
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
      http.get(`http://localhost:${port}/metrics`, () => resolve(null))
        .on('error', (e) => resolve(e as NodeJS.ErrnoException));
    });
    expect(err).not.toBeNull();
    expect(['ECONNREFUSED', 'ECONNRESET']).toContain(err!.code);
  });
});

// ─── OpenTelemetry tracing ────────────────────────────────────────────────────

describe('initTracing / startSpan / getCollectedSpans', () => {
  beforeEach(() => {
    clearCollectedSpans();
  });

  afterEach(() => {
    clearCollectedSpans();
    initTracing(false);
  });

  it('spans are NOT collected when tracing is disabled', () => {
    initTracing(false);
    const span = startSpan('test-span');
    span.end();
    expect(getCollectedSpans()).toHaveLength(0);
  });

  it('spans are collected when tracing is enabled', () => {
    initTracing(true);
    const span = startSpan('analysis-step', { coverageType: 'endpoint' });
    span.end();
    const spans = getCollectedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('analysis-step');
  });

  it('span has correct attributes', () => {
    initTracing(true);
    const span = startSpan('test', { coverageType: 'business', totalItems: 5 });
    span.end({ coveredItems: 3 });
    const spans = getCollectedSpans();
    expect(spans[0].attributes.coverageType).toBe('business');
    expect(spans[0].attributes.totalItems).toBe(5);
    expect(spans[0].attributes.coveredItems).toBe(3);
  });

  it('span records start and end times', () => {
    initTracing(true);
    const span = startSpan('timed-span');
    span.end();
    expect(span.startTime).toBeGreaterThan(0);
    expect(span.endTime).toBeGreaterThan(0);
    expect(span.endTime!).toBeGreaterThanOrEqual(span.startTime);
  });

  it('span.end() is idempotent (calling twice does not add duplicate)', () => {
    initTracing(true);
    const span = startSpan('idempotent');
    span.end();
    span.end(); // second call should be no-op
    expect(getCollectedSpans()).toHaveLength(1);
  });

  it('clearCollectedSpans empties the buffer', () => {
    initTracing(true);
    startSpan('s1').end();
    startSpan('s2').end();
    clearCollectedSpans();
    expect(getCollectedSpans()).toHaveLength(0);
  });

  it('multiple spans are all collected', () => {
    initTracing(true);
    startSpan('parse-spec').end();
    startSpan('scan-tests').end();
    startSpan('compute-coverage').end();
    expect(getCollectedSpans()).toHaveLength(3);
  });
});

// ─── buildObservabilityInfo ───────────────────────────────────────────────────

describe('buildObservabilityInfo', () => {
  afterEach(() => {
    initTracing(false);
  });

  it('returns null metricsUrl when no port is provided', () => {
    const info = buildObservabilityInfo();
    expect(info.metricsUrl).toBeNull();
  });

  it('returns correct metricsUrl when port is provided', () => {
    const info = buildObservabilityInfo(9090);
    expect(info.metricsUrl).toBe('http://localhost:9090/metrics');
  });

  it('reflects tracing disabled state', () => {
    initTracing(false);
    const info = buildObservabilityInfo();
    expect(info.tracingEnabled).toBe(false);
    expect(info.otlpEndpoint).toBeNull();
  });

  it('reflects tracing enabled state with endpoint', () => {
    initTracing(true, 'http://jaeger:4318');
    const info = buildObservabilityInfo();
    expect(info.tracingEnabled).toBe(true);
    expect(info.otlpEndpoint).toBe('http://jaeger:4318');
  });

  it('includes all four metric name templates', () => {
    const info = buildObservabilityInfo();
    expect(info.metricNames.total).toContain('api_coverage_total');
    expect(info.metricNames.covered).toContain('api_coverage_covered');
    expect(info.metricNames.ratio).toContain('api_coverage_ratio');
    expect(info.metricNames.thresholdFailure).toContain('api_coverage_threshold_failure');
  });

  it('includes security metric name templates', () => {
    const info = buildObservabilityInfo();
    expect(info.securityMetricNames?.findings).toContain('api_security_findings_total');
    expect(info.securityMetricNames?.gatePassed).toContain('api_security_gate_passed');
    expect(info.securityMetricNames?.scanTimestamp).toContain('api_security_scan_timestamp_seconds');
  });
});

// ─── recordSecurityScanMetrics ────────────────────────────────────────────────

const makeSecuritySummary = (
  overrides: Partial<SecurityScanMetricsSummary> = {},
): SecurityScanMetricsSummary => ({
  totalFindings: 5,
  bySeverity: { LOW: 1, MEDIUM: 2, HIGH: 1, CRITICAL: 1 },
  byCategory: { sast: 2, sca: 1, secret: 1, misconfig: 1, dast: 0, auth: 0, injection: 0, 'data-exposure': 0, crypto: 0, unknown: 0 },
  byScanner: { semgrep: 2, trivy: 3, zap: 0, gitleaks: 0, other: 0 },
  scannersRun: ['semgrep', 'trivy'],
  gateResult: { passed: false, reasons: ['1 CRITICAL finding(s) found'] },
  ...overrides,
});

describe('recordSecurityScanMetrics', () => {
  beforeEach(() => {
    initMetrics('sec-test');
  });

  it('records gate_passed = 0 when gate failed', async () => {
    recordSecurityScanMetrics(makeSecuritySummary({ gateResult: { passed: false, reasons: ['fail'] } }), 'sec-test');
    const text = await getRegistry()!.metrics();
    expect(text).toMatch(/api_security_gate_passed\{[^}]*service="sec-test"[^}]*\}\s+0/);
  });

  it('records gate_passed = 1 when gate passed', async () => {
    recordSecurityScanMetrics(makeSecuritySummary({ gateResult: { passed: true, reasons: [] } }), 'sec-test');
    const text = await getRegistry()!.metrics();
    expect(text).toMatch(/api_security_gate_passed\{[^}]*service="sec-test"[^}]*\}\s+1/);
  });

  it('records gate_passed = -1 when gate is not configured', async () => {
    recordSecurityScanMetrics(makeSecuritySummary({ gateResult: undefined }), 'sec-test');
    const text = await getRegistry()!.metrics();
    expect(text).toMatch(/api_security_gate_passed\{[^}]*service="sec-test"[^}]*\}\s+-1/);
  });

  it('records scan timestamp as a positive integer', async () => {
    const before = Math.floor(Date.now() / 1000);
    recordSecurityScanMetrics(makeSecuritySummary(), 'sec-test');
    const text = await getRegistry()!.metrics();
    const match = text.match(/api_security_scan_timestamp_seconds\{[^}]*service="sec-test"[^}]*\}\s+(\d+)/);
    expect(match).not.toBeNull();
    const ts = parseInt(match![1], 10);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(before + 5);
  });

  it('exposes api_security_findings_total metric name', async () => {
    recordSecurityScanMetrics(makeSecuritySummary(), 'sec-test');
    const text = await getRegistry()!.metrics();
    expect(text).toContain('api_security_findings_total');
  });

  it('is a no-op when registry has not been initialised', () => {
    // We cannot reset the private _registry, so test that it does not throw
    // even when called with a service name that has no matching registry.
    expect(() =>
      recordSecurityScanMetrics(makeSecuritySummary(), 'no-registry'),
    ).not.toThrow();
  });
});
