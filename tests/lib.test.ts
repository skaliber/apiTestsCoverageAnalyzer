import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  analyzeEndpoints,
  analyzeParameters,
  analyzeBusinessRules,
  analyzeIntegrationFlows,
  analyzeErrorHandling,
  analyzeSecurityControls,
  parseFormats,
  checkThresholds,
  CoverageResult,
} from '../src/lib/index';

const SAMPLE_SPEC = path.resolve(__dirname, '../sample/openapi.yaml');
const SAMPLE_PARAM_SPEC = path.resolve(__dirname, '../sample/openapi-parameters.yaml');
const SAMPLE_ERROR_SPEC = path.resolve(__dirname, '../sample/openapi-errors.yaml');
const SAMPLE_SECURITY_SPEC = path.resolve(__dirname, '../sample/openapi-security.yaml');
const SAMPLE_TESTS_GLOB = path.resolve(__dirname, '../sample/tests/**/*.ts');
const SAMPLE_RULES = path.resolve(__dirname, '../sample/business-rules.yaml');
const SAMPLE_FLOWS = path.resolve(__dirname, '../sample/integration-flows.yaml');

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lib-test-'));
}

describe('Library API – analyzeEndpoints', () => {
  it('returns a CoverageResult with correct type', async () => {
    const reportsDir = makeTempDir();
    const result = await analyzeEndpoints({
      spec: SAMPLE_SPEC,
      tests: SAMPLE_TESTS_GLOB,
      reportsDir,
    });

    expect(result.type).toBe('endpoint');
    expect(result.totalItems).toBeGreaterThan(0);
    expect(result.coveredItems).toBeGreaterThanOrEqual(0);
    expect(result.coveragePercent).toBeGreaterThanOrEqual(0);
    expect(result.coveragePercent).toBeLessThanOrEqual(100);
  });

  it('writes reports to the specified directory', async () => {
    const reportsDir = makeTempDir();
    await analyzeEndpoints({
      spec: SAMPLE_SPEC,
      tests: SAMPLE_TESTS_GLOB,
      format: 'json,html',
      reportsDir,
    });

    expect(fs.existsSync(path.join(reportsDir, 'coverage-summary.json'))).toBe(true);
    expect(fs.existsSync(path.join(reportsDir, 'coverage-summary.html'))).toBe(true);
  });

  it('accepts language option', async () => {
    const reportsDir = makeTempDir();
    const result = await analyzeEndpoints({
      spec: SAMPLE_SPEC,
      tests: SAMPLE_TESTS_GLOB,
      language: 'typescript',
      reportsDir,
    });

    expect(result.type).toBe('endpoint');
  });
});

describe('Library API – analyzeParameters', () => {
  it('returns a CoverageResult with type parameter', async () => {
    const reportsDir = makeTempDir();
    const result = await analyzeParameters({
      spec: SAMPLE_PARAM_SPEC,
      tests: SAMPLE_TESTS_GLOB,
      reportsDir,
    });

    expect(result.type).toBe('parameter');
    expect(result.totalItems).toBeGreaterThanOrEqual(0);
  });
});

describe('Library API – analyzeBusinessRules', () => {
  it('returns a CoverageResult with type business', async () => {
    const reportsDir = makeTempDir();
    const result = await analyzeBusinessRules({
      rules: SAMPLE_RULES,
      tests: SAMPLE_TESTS_GLOB,
      reportsDir,
    });

    expect(result.type).toBe('business');
    expect(result.totalItems).toBeGreaterThan(0);
  });
});

describe('Library API – analyzeIntegrationFlows', () => {
  it('returns a CoverageResult with type integration', async () => {
    const reportsDir = makeTempDir();
    const result = await analyzeIntegrationFlows({
      flows: SAMPLE_FLOWS,
      tests: SAMPLE_TESTS_GLOB,
      reportsDir,
    });

    expect(result.type).toBe('integration');
    expect(result.totalItems).toBeGreaterThan(0);
  });
});

describe('Library API – analyzeErrorHandling', () => {
  it('returns a CoverageResult with type error', async () => {
    const reportsDir = makeTempDir();
    const result = await analyzeErrorHandling({
      spec: SAMPLE_ERROR_SPEC,
      tests: SAMPLE_TESTS_GLOB,
      reportsDir,
    });

    expect(result.type).toBe('error');
    expect(result.totalItems).toBeGreaterThanOrEqual(0);
  });
});

describe('Library API – analyzeSecurityControls', () => {
  it('returns a CoverageResult with type security', async () => {
    const reportsDir = makeTempDir();
    const result = await analyzeSecurityControls({
      spec: SAMPLE_SECURITY_SPEC,
      tests: SAMPLE_TESTS_GLOB,
      reportsDir,
    });

    expect(result.type).toBe('security');
    expect(result.totalItems).toBeGreaterThanOrEqual(0);
  });
});

describe('Library API – parseFormats', () => {
  it('parses a comma-separated format string', () => {
    expect(parseFormats('json,html')).toEqual(['json', 'html']);
    expect(parseFormats('csv,junit')).toEqual(['csv', 'junit']);
    expect(parseFormats('json')).toEqual(['json']);
    expect(parseFormats('')).toEqual([]);
  });

  it('ignores unknown formats', () => {
    expect(parseFormats('json,xml,html')).toEqual(['json', 'html']);
  });
});

describe('Library API – checkThresholds', () => {
  const mockResult: CoverageResult = {
    type: 'endpoint',
    totalItems: 10,
    coveredItems: 8,
    coveragePercent: 80,
    details: {},
  };

  it('returns no failures when coverage meets threshold', () => {
    const failures = checkThresholds([mockResult], { endpoint: 80 });
    expect(failures).toHaveLength(0);
  });

  it('returns failures when coverage is below threshold', () => {
    const failures = checkThresholds([mockResult], { endpoint: 90 });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('endpoint');
  });

  it('returns empty array when no thresholds set', () => {
    const failures = checkThresholds([mockResult], {});
    expect(failures).toHaveLength(0);
  });
});

// ─── runAnalysisAndEnforceQualityGate ─────────────────────────────────────────

import { runAnalysisAndEnforceQualityGate } from '../src/lib/index';

describe('Library API – runAnalysisAndEnforceQualityGate', () => {
  const passing: CoverageResult = {
    type: 'endpoint',
    totalItems: 10,
    coveredItems: 10,
    coveragePercent: 100,
    details: {},
  };
  const failing: CoverageResult = {
    type: 'endpoint',
    totalItems: 10,
    coveredItems: 7,
    coveragePercent: 70,
    details: {},
  };

  it('returns exitCode 0 when all coverage meets threshold', async () => {
    const reportsDir = makeTempDir();
    const { exitCode, qualityGate } = await runAnalysisAndEnforceQualityGate({
      results: [passing],
      config: { thresholds: { global: 100 }, publishing: { enabled: false } },
      reportsDir,
    });
    expect(exitCode).toBe(0);
    expect(qualityGate.passed).toBe(true);
  });

  it('returns exitCode 1 when coverage is below threshold', async () => {
    const reportsDir = makeTempDir();
    const { exitCode, qualityGate } = await runAnalysisAndEnforceQualityGate({
      results: [failing],
      config: {
        thresholds: { global: 100 },
        qualityGate: { failBuildOnThresholdMiss: true },
        publishing: { enabled: false },
      },
      reportsDir,
    });
    expect(exitCode).toBe(1);
    expect(qualityGate.passed).toBe(false);
    expect(qualityGate.failures).toHaveLength(1);
  });

  it('returns exitCode 0 in warn mode even with failures', async () => {
    const reportsDir = makeTempDir();
    const { exitCode, qualityGate } = await runAnalysisAndEnforceQualityGate({
      results: [failing],
      config: {
        thresholds: { global: 100 },
        qualityGate: { mode: 'warn' },
        publishing: { enabled: false },
      },
      reportsDir,
    });
    expect(exitCode).toBe(0);
    expect(qualityGate.passed).toBe(true); // warn mode
    expect(qualityGate.failures.length).toBeGreaterThan(0); // but failures tracked
  });

  it('generates a build bundle when publishing is enabled', async () => {
    const reportsDir = makeTempDir();
    const siteDir = path.join(reportsDir, 'site');
    const { reports } = await runAnalysisAndEnforceQualityGate({
      results: [passing],
      config: {
        thresholds: { global: 100 },
        publishing: { enabled: true, outputDir: siteDir, buildId: 'test-123' },
      },
      reportsDir,
    });
    expect(reports).not.toBeNull();
    expect(fs.existsSync(path.join(siteDir, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(siteDir, 'ai-summary.md'))).toBe(true);
  });

  it('reports is null when publishing is disabled', async () => {
    const reportsDir = makeTempDir();
    const { reports } = await runAnalysisAndEnforceQualityGate({
      results: [passing],
      config: { publishing: { enabled: false } },
      reportsDir,
    });
    expect(reports).toBeNull();
  });
});
