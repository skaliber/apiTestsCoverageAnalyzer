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
});
