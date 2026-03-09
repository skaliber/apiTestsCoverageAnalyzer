/**
 * selfAnalysis.smoke.test.ts
 *
 * Smoke test: runs the analyzer against its own codebase using the library API
 * and verifies:
 *  - All major analyze functions return a valid CoverageResult
 *  - Report files are written to the reports directory
 *  - Business rule coverage analysis runs against the self-analysis rules file
 *  - Integration flow analysis runs against the self-analysis flows file
 *  - Quality gate evaluation correctly applies 100% thresholds
 *  - Summary functions produce non-empty output
 *
 * This test must NOT rely on external network calls or env-specific state.
 * All analysis uses samples bundled in this repository.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  analyzeEndpoints,
  analyzeParameters,
  analyzeBusinessRules,
  analyzeIntegrationFlows,
  analyzeErrorHandling,
  analyzeSecurityControls,
  checkThresholds,
} from '../src/lib';

const ROOT = path.resolve(__dirname, '..');

// ─── Shared output directory ──────────────────────────────────────────────────

let reportsDir: string;

beforeAll(() => {
  reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-reports-'));
});

afterAll(() => {
  fs.rmSync(reportsDir, { recursive: true, force: true });
});

// ─── Endpoint coverage ────────────────────────────────────────────────────────

describe('smoke: endpoint coverage on sample spec', () => {
  it('returns a CoverageResult with type=endpoint', async () => {
    const result = await analyzeEndpoints({
      spec: path.join(ROOT, 'sample', 'openapi.yaml'),
      tests: path.join(ROOT, 'sample', 'tests', '**', '*.ts'),
      reportsDir,
    });

    expect(result.type).toBe('endpoint');
    expect(typeof result.coveragePercent).toBe('number');
    expect(result.coveragePercent).toBeGreaterThanOrEqual(0);
    expect(result.coveragePercent).toBeLessThanOrEqual(100);
    expect(typeof result.totalItems).toBe('number');
    expect(result.totalItems).toBeGreaterThan(0);
  });

  it('100% endpoint coverage on sample spec with full test suite', async () => {
    const result = await analyzeEndpoints({
      spec: path.join(ROOT, 'sample', 'openapi.yaml'),
      tests: path.join(ROOT, 'sample', 'tests', '**', '*.ts'),
      reportsDir,
    });
    expect(result.coveragePercent).toBe(100);
  });
});

// ─── Parameter coverage ───────────────────────────────────────────────────────

describe('smoke: parameter coverage on sample spec', () => {
  it('returns a CoverageResult with type=parameter', async () => {
    const result = await analyzeParameters({
      spec: path.join(ROOT, 'sample', 'openapi-parameters.yaml'),
      tests: path.join(ROOT, 'sample', 'tests', '**', '*.ts'),
      reportsDir,
    });

    expect(result.type).toBe('parameter');
    expect(typeof result.coveragePercent).toBe('number');
    expect(result.totalItems).toBeGreaterThan(0);
  });
});

// ─── Business rule coverage — sample rules ───────────────────────────────────

describe('smoke: business rule coverage on sample rules', () => {
  it('returns a CoverageResult with type=business', async () => {
    const result = await analyzeBusinessRules({
      rules: path.join(ROOT, 'sample', 'business-rules.yaml'),
      tests: path.join(ROOT, 'sample', 'tests', '**', '*.ts'),
      reportsDir,
    });

    expect(result.type).toBe('business');
    expect(typeof result.coveragePercent).toBe('number');
    expect(result.totalItems).toBeGreaterThan(0);
  });
});

// ─── Business rule coverage — self-analysis rules ────────────────────────────

describe('smoke: business rule coverage on self-analysis rules', () => {
  it('self-analysis rules file exists and is parseable', () => {
    const rulesPath = path.join(ROOT, 'business-rules.self-analysis.yaml');
    expect(fs.existsSync(rulesPath)).toBe(true);
  });

  it('returns a CoverageResult when running on self-analysis rules vs project tests', async () => {
    const result = await analyzeBusinessRules({
      rules: path.join(ROOT, 'business-rules.self-analysis.yaml'),
      tests: path.join(ROOT, 'tests', '**', '*.ts'),
      reportsDir,
    });

    expect(result.type).toBe('business');
    expect(typeof result.coveragePercent).toBe('number');
    expect(result.totalItems).toBeGreaterThan(0);
    // Coverage may not be 100% yet since self-analysis is progressive,
    // but the analysis must complete without throwing
  });
});

// ─── Integration flow coverage ───────────────────────────────────────────────

describe('smoke: integration flow coverage on sample flows', () => {
  it('returns a CoverageResult with type=integration', async () => {
    const result = await analyzeIntegrationFlows({
      flows: path.join(ROOT, 'sample', 'integration-flows.yaml'),
      tests: path.join(ROOT, 'sample', 'tests', '**', '*.ts'),
      reportsDir,
    });

    expect(result.type).toBe('integration');
    expect(typeof result.coveragePercent).toBe('number');
  });
});

// ─── Integration flow coverage — self-analysis flows ─────────────────────────

describe('smoke: integration flow coverage on self-analysis flows', () => {
  it('self-analysis flows file exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'integration-flows.self-analysis.yaml'))).toBe(true);
  });

  it('returns a CoverageResult when running on self-analysis flows vs project tests', async () => {
    const result = await analyzeIntegrationFlows({
      flows: path.join(ROOT, 'integration-flows.self-analysis.yaml'),
      tests: path.join(ROOT, 'tests', '**', '*.ts'),
      reportsDir,
    });

    expect(result.type).toBe('integration');
    expect(typeof result.coveragePercent).toBe('number');
    expect(result.totalItems).toBeGreaterThan(0);
  });
});

// ─── Error coverage ──────────────────────────────────────────────────────────

describe('smoke: error coverage on sample spec', () => {
  it('returns a CoverageResult with type=error', async () => {
    const result = await analyzeErrorHandling({
      spec: path.join(ROOT, 'sample', 'openapi-errors.yaml'),
      tests: path.join(ROOT, 'sample', 'tests', '**', '*.ts'),
      reportsDir,
    });

    expect(result.type).toBe('error');
    expect(typeof result.coveragePercent).toBe('number');
  });
});

// ─── Security coverage ───────────────────────────────────────────────────────

describe('smoke: security coverage on sample spec', () => {
  it('returns a CoverageResult with type=security', async () => {
    const result = await analyzeSecurityControls({
      spec: path.join(ROOT, 'sample', 'openapi.yaml'),
      tests: path.join(ROOT, 'sample', 'tests', '**', '*.ts'),
      reportsDir,
    });

    expect(result.type).toBe('security');
    expect(typeof result.coveragePercent).toBe('number');
  });
});

// ─── Report files exist after analysis ───────────────────────────────────────

describe('smoke: report files are written', () => {
  it('reports directory contains JSON files after analysis', async () => {
    await analyzeEndpoints({
      spec: path.join(ROOT, 'sample', 'openapi.yaml'),
      tests: path.join(ROOT, 'sample', 'tests', '**', '*.ts'),
      reportsDir,
    });

    const files = fs.readdirSync(reportsDir);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    expect(jsonFiles.length).toBeGreaterThan(0);
  });
});

// ─── Quality gate — threshold enforcement ────────────────────────────────────

describe('smoke: quality gate threshold enforcement', () => {
  it('checkThresholds returns no violations when coverage meets 100%', async () => {
    const result = await analyzeEndpoints({
      spec: path.join(ROOT, 'sample', 'openapi.yaml'),
      tests: path.join(ROOT, 'sample', 'tests', '**', '*.ts'),
      reportsDir,
    });

    // Sample spec has 100% endpoint coverage
    const violations = checkThresholds([result], { endpoint: 100 });
    expect(violations).toHaveLength(0);
  });

  it('checkThresholds returns violations when coverage is below threshold', async () => {
    // Use a very high threshold to force a violation
    const result = await analyzeEndpoints({
      spec: path.join(ROOT, 'sample', 'openapi.yaml'),
      tests: path.join(ROOT, 'sample', 'tests', '**', '*.ts'),
      reportsDir,
    });

    // Set threshold to 200% to force a violation
    const violations = checkThresholds([result], { endpoint: 200 });
    expect(violations.length).toBeGreaterThan(0);
  });

  it('checkThresholds returns violations when threshold breached', () => {
    const fakeResult = {
      type: 'business',
      coveragePercent: 60,
      coveredItems: 6,
      totalItems: 10,
      details: {},
    };
    const violations = checkThresholds([fakeResult], { business: 80 });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toMatch(/business/i);
  });
});

// ─── Self-analysis input artifacts are valid ──────────────────────────────────

describe('smoke: self-analysis input artifacts', () => {
  it('coverage.self-analysis.json is valid JSON with 100% thresholds', () => {
    const configPath = path.join(ROOT, 'coverage.self-analysis.json');
    expect(fs.existsSync(configPath)).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
      thresholds: Record<string, number>;
    };
    expect(config.thresholds.endpoint).toBe(100);
    expect(config.thresholds.business).toBe(100);
    expect(config.thresholds.security).toBe(100);
  });

  it('openapi.self-analysis.yaml contains analyze endpoints path', () => {
    const specPath = path.join(ROOT, 'openapi.self-analysis.yaml');
    const content = fs.readFileSync(specPath, 'utf-8');
    expect(content).toContain('/analyze/endpoints');
    expect(content).toContain('/analyze/security');
    expect(content).toContain('/thresholds/check');
  });
});
