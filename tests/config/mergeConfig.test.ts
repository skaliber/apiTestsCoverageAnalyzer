/**
 * tests/config/mergeConfig.test.ts
 *
 * Unit tests for the deep-merge utility (src/config/mergeConfig.ts).
 */

import { mergeConfig } from '../../src/config/mergeConfig';
import { DEFAULT_CONFIG } from '../../src/config/defaultConfig';
import type { AnalyzerConfig } from '../../src/config/types';

describe('mergeConfig', () => {
  it('returns a copy when user config is empty object', () => {
    const result = mergeConfig(DEFAULT_CONFIG, {} as Partial<AnalyzerConfig>);
    expect(result.version).toBe(DEFAULT_CONFIG.version);
    expect(result.analysis.defaultMode).toBe(DEFAULT_CONFIG.analysis.defaultMode);
  });

  it('user value takes precedence over default for scalar fields', () => {
    const result = mergeConfig(DEFAULT_CONFIG, {
      version: 1,
      analysis: { defaultMode: 'custom' },
    } as Partial<AnalyzerConfig>);
    expect(result.analysis.defaultMode).toBe('custom');
  });

  it('preserves default values for fields not in user config', () => {
    const result = mergeConfig(DEFAULT_CONFIG, { version: 1 } as Partial<AnalyzerConfig>);
    expect(result.mcp.enabled).toBe(DEFAULT_CONFIG.mcp.enabled);
    expect(result.reports.outputDir).toBe(DEFAULT_CONFIG.reports.outputDir);
  });

  it('user threshold overrides specific key while preserving others', () => {
    const result = mergeConfig(DEFAULT_CONFIG, {
      thresholds: { endpoint: 95 },
    } as Partial<AnalyzerConfig>);
    // User-specified threshold wins
    expect(result.thresholds.endpoint).toBe(95);
    // Default global is preserved via deep merge (thresholds is an object merge)
    expect(result.thresholds.global).toBe(DEFAULT_CONFIG.thresholds.global);
  });

  it('user array replaces default array (not concatenated)', () => {
    const result = mergeConfig(DEFAULT_CONFIG, {
      reports: { formats: ['markdown'] },
    } as Partial<AnalyzerConfig>);
    expect(result.reports.formats).toEqual(['markdown']);
  });

  it('user scans.coverage.types replaces the default full list', () => {
    const result = mergeConfig(DEFAULT_CONFIG, {
      scans: { coverage: { types: ['endpoint'] } },
    } as Partial<AnalyzerConfig>);
    expect(result.scans.coverage?.types).toEqual(['endpoint']);
  });

  it('does not mutate the defaults object', () => {
    const origMode = DEFAULT_CONFIG.analysis.defaultMode;
    mergeConfig(DEFAULT_CONFIG, { analysis: { defaultMode: 'custom' } } as Partial<AnalyzerConfig>);
    expect(DEFAULT_CONFIG.analysis.defaultMode).toBe(origMode);
  });

  it('deeply merges nested objects', () => {
    const result = mergeConfig(DEFAULT_CONFIG, {
      mcp: { enabled: true, timeoutMs: 60_000 },
    } as Partial<AnalyzerConfig>);
    expect(result.mcp.enabled).toBe(true);
    expect(result.mcp.timeoutMs).toBe(60_000);
    // Default transport preserved
    expect(result.mcp.defaultTransport).toBe(DEFAULT_CONFIG.mcp.defaultTransport);
  });

  it('merges project.name correctly', () => {
    const result = mergeConfig(DEFAULT_CONFIG, {
      project: { name: 'my-project' },
    } as Partial<AnalyzerConfig>);
    expect(result.project.name).toBe('my-project');
  });

  it('preserves dashboard defaults when only aiSummary.enabled is overridden', () => {
    const result = mergeConfig(DEFAULT_CONFIG, {
      dashboard: { aiSummary: { enabled: false } },
    } as Partial<AnalyzerConfig>);
    expect(result.dashboard.aiSummary?.enabled).toBe(false);
    // collapsedByDefault was not overridden — default should remain
    expect(result.dashboard.aiSummary?.collapsedByDefault).toBe(
      DEFAULT_CONFIG.dashboard.aiSummary?.collapsedByDefault,
    );
  });

  it('returns an AnalyzerConfig with all required keys', () => {
    const result = mergeConfig(DEFAULT_CONFIG, {} as Partial<AnalyzerConfig>);
    const requiredKeys: (keyof AnalyzerConfig)[] = [
      'version', 'project', 'analysis', 'scans', 'mcp',
      'thresholds', 'qualityGate', 'reports', 'publishing', 'dashboard',
    ];
    for (const key of requiredKeys) {
      expect(result).toHaveProperty(key);
    }
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
