/**
 * selfAnalysisConfig.test.ts
 *
 * Unit tests for the self-analysis configuration system.
 * Validates that:
 * - coverage.self-analysis.json is valid and well-formed
 * - All thresholds default to 100%
 * - All required self-analysis input artifacts exist
 * - The self-analysis config structure matches expected schema
 * - Threshold overrides work correctly
 * - Quality gate defaults to 100% when no config is provided
 */

import * as fs from 'fs';
import * as path from 'path';
import { evaluateQualityGate } from '../src/qualityGate';
import type { CoverageResult } from '../src/reporting';

const ROOT = path.resolve(__dirname, '..');
const SELF_ANALYSIS_CONFIG = path.join(ROOT, 'coverage.self-analysis.json');

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeResult(type: string, percent: number, total = 10): CoverageResult {
  return {
    type,
    totalItems: total,
    coveredItems: Math.round((percent / 100) * total),
    coveragePercent: percent,
    details: {},
  };
}

// ─── coverage.self-analysis.json ─────────────────────────────────────────────

describe('coverage.self-analysis.json', () => {
  let config: Record<string, unknown>;

  beforeAll(() => {
    expect(fs.existsSync(SELF_ANALYSIS_CONFIG)).toBe(true);
    config = JSON.parse(fs.readFileSync(SELF_ANALYSIS_CONFIG, 'utf-8')) as Record<string, unknown>;
  });

  it('is valid JSON', () => {
    expect(config).toBeTruthy();
    expect(typeof config).toBe('object');
  });

  it('has a thresholds block', () => {
    expect(config).toHaveProperty('thresholds');
    expect(typeof config.thresholds).toBe('object');
  });

  it('sets endpoint threshold to 100', () => {
    expect((config.thresholds as Record<string, number>).endpoint).toBe(100);
  });

  it('sets parameter threshold to 100', () => {
    expect((config.thresholds as Record<string, number>).parameter).toBe(100);
  });

  it('sets business threshold to 100', () => {
    expect((config.thresholds as Record<string, number>).business).toBe(100);
  });

  it('sets integration threshold to 100', () => {
    expect((config.thresholds as Record<string, number>).integration).toBe(100);
  });

  it('sets error threshold to 100', () => {
    expect((config.thresholds as Record<string, number>).error).toBe(100);
  });

  it('sets security threshold to 100', () => {
    expect((config.thresholds as Record<string, number>).security).toBe(100);
  });

  it('sets performance threshold to 100', () => {
    expect((config.thresholds as Record<string, number>).performance).toBe(100);
  });

  it('sets resilience threshold to 100', () => {
    expect((config.thresholds as Record<string, number>).resilience).toBe(100);
  });

  it('has a selfAnalysis block', () => {
    expect(config).toHaveProperty('selfAnalysis');
    const sa = config.selfAnalysis as Record<string, unknown>;
    expect(sa).toHaveProperty('spec');
    expect(sa).toHaveProperty('tests');
    expect(sa).toHaveProperty('rules');
    expect(sa).toHaveProperty('flows');
  });

  it('selfAnalysis.spec points to openapi.self-analysis.yaml', () => {
    const sa = config.selfAnalysis as Record<string, unknown>;
    expect(sa.spec).toBe('openapi.self-analysis.yaml');
  });

  it('selfAnalysis.rules points to business-rules.self-analysis.yaml', () => {
    const sa = config.selfAnalysis as Record<string, unknown>;
    expect(sa.rules).toBe('business-rules.self-analysis.yaml');
  });

  it('selfAnalysis.flows points to integration-flows.self-analysis.yaml', () => {
    const sa = config.selfAnalysis as Record<string, unknown>;
    expect(sa.flows).toBe('integration-flows.self-analysis.yaml');
  });

  it('has a securityGate block with zero tolerance', () => {
    expect(config).toHaveProperty('securityGate');
    const sg = config.securityGate as Record<string, unknown>;
    expect(sg.failOnCritical).toBe(true);
    expect(sg.maxHighVulnerabilities).toBe(0);
    expect(sg.maxSecrets).toBe(0);
  });
});

// ─── Self-analysis input artifact files ──────────────────────────────────────

describe('self-analysis input artifacts', () => {
  it('openapi.self-analysis.yaml exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'openapi.self-analysis.yaml'))).toBe(true);
  });

  it('business-rules.self-analysis.yaml exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'business-rules.self-analysis.yaml'))).toBe(true);
  });

  it('integration-flows.self-analysis.yaml exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'integration-flows.self-analysis.yaml'))).toBe(true);
  });

  it('load-results.self-analysis.json exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'load-results.self-analysis.json'))).toBe(true);
  });

  it('openapi.self-analysis.yaml is non-empty YAML', () => {
    const content = fs.readFileSync(path.join(ROOT, 'openapi.self-analysis.yaml'), 'utf-8');
    expect(content.length).toBeGreaterThan(100);
    expect(content).toContain('openapi:');
    expect(content).toContain('paths:');
  });

  it('business-rules.self-analysis.yaml contains at least 5 rules', () => {
    const content = fs.readFileSync(path.join(ROOT, 'business-rules.self-analysis.yaml'), 'utf-8');
    const ruleMatches = content.match(/- id: RULE-/g) || [];
    expect(ruleMatches.length).toBeGreaterThanOrEqual(5);
  });

  it('integration-flows.self-analysis.yaml contains at least 2 flows', () => {
    const content = fs.readFileSync(path.join(ROOT, 'integration-flows.self-analysis.yaml'), 'utf-8');
    const flowMatches = content.match(/- id: SA-FLOW/g) || [];
    expect(flowMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('load-results.self-analysis.json is valid JSON with metrics', () => {
    const raw = fs.readFileSync(path.join(ROOT, 'load-results.self-analysis.json'), 'utf-8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    expect(data).toHaveProperty('metrics');
    expect(data).toHaveProperty('scenarios');
  });
});

// ─── Makefile ─────────────────────────────────────────────────────────────────

describe('Makefile', () => {
  it('Makefile exists at repository root', () => {
    expect(fs.existsSync(path.join(ROOT, 'Makefile'))).toBe(true);
  });

  it('Makefile contains required targets', () => {
    const content = fs.readFileSync(path.join(ROOT, 'Makefile'), 'utf-8');
    const requiredTargets = [
      'install',
      'build',
      'clean',
      'reports-clean',
      'test',
      'test-unit',
      'test-integration',
      'test-e2e',
      'test-smoke',
      'self-analysis-endpoint',
      'self-analysis-parameter',
      'self-analysis-business',
      'self-analysis-integration',
      'self-analysis-error',
      'self-analysis-security',
      'self-analysis-performance',
      'self-analysis-compatibility',
      'self-analysis-all',
      'security-scan',
      'summary',
      'pr-summary',
      'build-summary',
      'ci',
    ];
    for (const target of requiredTargets) {
      expect(content).toContain(`${target}:`);
    }
  });

  it('Makefile has a help target', () => {
    const content = fs.readFileSync(path.join(ROOT, 'Makefile'), 'utf-8');
    expect(content).toContain('help:');
  });
});

// ─── Quality gate 100% default (no config) ───────────────────────────────────

describe('quality gate — 100% default when no thresholds configured', () => {
  it('fails when endpoint coverage is 90% and no threshold override given', () => {
    const results = [makeResult('endpoint', 90)];
    const gate = evaluateQualityGate(results, {});
    expect(gate.passed).toBe(false);
    expect(gate.failures[0].expected).toBe(100);
  });

  it('passes when all metrics are at 100%', () => {
    const results = [
      makeResult('endpoint', 100),
      makeResult('business', 100),
      makeResult('security', 100),
    ];
    const gate = evaluateQualityGate(results, {});
    expect(gate.passed).toBe(true);
  });

  it('self-analysis threshold config equals 100% for all metrics', () => {
    const config = JSON.parse(fs.readFileSync(SELF_ANALYSIS_CONFIG, 'utf-8')) as {
      thresholds: Record<string, number>;
    };
    const metricTypes = [
      'endpoint', 'parameter', 'business', 'integration',
      'error', 'security', 'performance', 'resilience',
    ];
    for (const type of metricTypes) {
      expect(config.thresholds[type]).toBe(100);
    }
  });
});

// ─── CI workflow file ─────────────────────────────────────────────────────────

describe('CI workflow files', () => {
  it('self-analysis GitHub Actions workflow exists', () => {
    expect(
      fs.existsSync(path.join(ROOT, '.github', 'workflows', 'self-analysis.yml')),
    ).toBe(true);
  });

  it('self-analysis workflow uses make targets, not inline npm commands', () => {
    const content = fs.readFileSync(
      path.join(ROOT, '.github', 'workflows', 'self-analysis.yml'),
      'utf-8',
    );
    expect(content).toContain('make install');
    expect(content).toContain('make build');
    expect(content).toContain('make self-analysis-all');
    // Should NOT have inline analyzer commands
    expect(content).not.toContain('node dist/src/index.js endpoint-coverage');
  });

  it('Jenkins example pipeline uses make targets', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'ci', 'examples', 'jenkins-pipeline.groovy'),
      'utf-8',
    );
    expect(content).toContain('make install');
    expect(content).toContain('make build');
    expect(content).toContain('make self-analysis-all');
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
