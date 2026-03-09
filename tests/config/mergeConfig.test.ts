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
});
