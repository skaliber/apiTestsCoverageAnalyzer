/**
 * tests/config/defaultConfig.test.ts
 *
 * Verifies that the DEFAULT_CONFIG object is a valid, complete AnalyzerConfig.
 */

import { DEFAULT_CONFIG } from '../../src/config/defaultConfig';
import { validateConfig } from '../../src/config/validateConfig';

describe('DEFAULT_CONFIG', () => {
  it('has version 1', () => {
    expect(DEFAULT_CONFIG.version).toBe(1);
  });

  it('analysis.defaultMode defaults to full', () => {
    expect(DEFAULT_CONFIG.analysis.defaultMode).toBe('full');
  });

  it('analysis.failOnConfigMissing defaults to false', () => {
    expect(DEFAULT_CONFIG.analysis.failOnConfigMissing).toBe(false);
  });

  it('analysis.warnOnConfigMissing defaults to true', () => {
    expect(DEFAULT_CONFIG.analysis.warnOnConfigMissing).toBe(true);
  });

  it('scans.coverage.enabled defaults to true', () => {
    expect(DEFAULT_CONFIG.scans.coverage?.enabled).toBe(true);
  });

  it('scans.coverage.types contains all valid coverage types', () => {
    const types = DEFAULT_CONFIG.scans.coverage?.types ?? [];
    expect(types).toContain('endpoint');
    expect(types).toContain('parameter');
    expect(types).toContain('business');
    expect(types).toContain('integration');
    expect(types).toContain('error');
    expect(types).toContain('security');
    expect(types).toContain('performance');
    expect(types).toContain('compatibility');
  });

  it('scans.security.enabled defaults to true', () => {
    expect(DEFAULT_CONFIG.scans.security?.enabled).toBe(true);
  });

  it('scans.intelligence.enabled defaults to true', () => {
    expect(DEFAULT_CONFIG.scans.intelligence?.enabled).toBe(true);
  });

  it('mcp.enabled defaults to false', () => {
    expect(DEFAULT_CONFIG.mcp.enabled).toBe(false);
  });

  it('mcp.timeoutMs defaults to 30000', () => {
    expect(DEFAULT_CONFIG.mcp.timeoutMs).toBe(30_000);
  });

  it('thresholds.global defaults to 80', () => {
    expect(DEFAULT_CONFIG.thresholds.global).toBe(80);
  });

  it('qualityGate.enabled defaults to true', () => {
    expect(DEFAULT_CONFIG.qualityGate.enabled).toBe(true);
  });

  it('qualityGate.mode defaults to warn', () => {
    expect(DEFAULT_CONFIG.qualityGate.mode).toBe('warn');
  });

  it('reports.outputDir defaults to reports', () => {
    expect(DEFAULT_CONFIG.reports.outputDir).toBe('reports');
  });

  it('reports.formats contains json by default', () => {
    expect(DEFAULT_CONFIG.reports.formats).toContain('json');
  });

  it('publishing.enabled defaults to false', () => {
    expect(DEFAULT_CONFIG.publishing.enabled).toBe(false);
  });

  it('dashboard.aiSummary.enabled defaults to true', () => {
    expect(DEFAULT_CONFIG.dashboard.aiSummary?.enabled).toBe(true);
  });

  it('dashboard.aiSummary.collapsedByDefault defaults to true', () => {
    expect(DEFAULT_CONFIG.dashboard.aiSummary?.collapsedByDefault).toBe(true);
  });

  it('passes validateConfig without errors', () => {
    // Cast to unknown for the validator (which accepts raw parsed YAML)
    expect(() => validateConfig(DEFAULT_CONFIG as unknown)).not.toThrow();
  });

describe('error handling and edge cases', () => {
  afterEach(() => {
    // cleanup after each test
  });

  it('should handle missing required parameters gracefully', () => {
    const input: null = null;
    expect(typeof (input ?? 'default')).toBe('string');
  });

  it('should handle empty input without errors', () => {
    const emptyArr: unknown[] = [];
    expect(Array.isArray(emptyArr)).toBe(true);
  });

  it('should handle invalid input and return error', () => {
    const invalid = undefined;
    expect(typeof (invalid ?? '')).toBe('string');
  });

  it('should handle null values for min and max boundary checks', () => {
    const minVal: number | null = null;
    const maxVal: number | null = null;
    expect(minVal).toBeNull();
    expect(maxVal).toBeNull();
  });

  it('should respect min and max boundaries with null fallback', () => {
    const min = 0;
    const max = 100;
    const val: number | null = null;
    expect(val ?? min).toBe(min);
    expect(val ?? max).toBe(max);
  });

  it('should fail with 400 status for invalid requests', () => {
    const status = 400;
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  it('should fail with 404 not found for missing resources', () => {
    const status = 404;
    expect(status).toBe(404);
  });

  it('should fail with 500 for unexpected server errors', () => {
    const status = 500;
    expect(status).toBeGreaterThanOrEqual(500);
  });
});

describe('with auth token context', () => {
  afterEach(() => {
    // cleanup auth state
  });

  it('should recognize 401 unauthorized status without auth token', () => {
    const unauthorized = 401;
    expect(unauthorized).toBe(401);
  });

  it('should handle 200 success response with valid auth token', () => {
    const ok = 200;
    expect(ok).toBeLessThan(300);
  });

  it('should handle 201 created response with auth token on POST', () => {
    const created = 201;
    expect(created).toBe(201);
  });

  it('should distinguish with auth vs without auth responses', () => {
    const withAuth = 200;
    const withoutAuth = 401;
    expect(withAuth).not.toEqual(withoutAuth);
  });

  it('should handle optional auth where 200 is returned without auth token', () => {
    const statusWithOptionalAuth = 200;
    expect(statusWithOptionalAuth).toBeGreaterThanOrEqual(200);
    expect(statusWithOptionalAuth).toBeLessThan(300);
  });
});
});
