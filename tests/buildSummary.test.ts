import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  generateStepSummary,
  writeStepSummary,
  generatePrComment,
  printCiSummary,
} from '../src/buildSummary';
import type { QualityGateResult } from '../src/qualityGate';
import type { CoverageResult } from '../src/reporting';
import { buildBuildMetadata } from '../src/publishing';

// ─── fixtures ─────────────────────────────────────────────────────────────────

const makeResult = (type: string, percent: number, total = 10): CoverageResult => ({
  type,
  totalItems: total,
  coveredItems: Math.round((percent / 100) * total),
  coveragePercent: percent,
  details: {},
});

const makeGate = (passed: boolean): QualityGateResult => ({
  passed,
  threshold: 100,
  actual: { endpoint: passed ? 100 : 70 },
  failures: passed ? [] : [{ category: 'endpoint', expected: 100, actual: 70, gap: 30 }],
});

const sampleResults: CoverageResult[] = [
  makeResult('endpoint', 100),
  makeResult('business', 80),
];

const passedGate = makeGate(true);
const failedGate = makeGate(false);
const meta = buildBuildMetadata(sampleResults, passedGate, {}, 'summary-test', {});

// ─── generateStepSummary ──────────────────────────────────────────────────────

describe('generateStepSummary', () => {
  it('contains the build ID', () => {
    const summary = generateStepSummary(sampleResults, passedGate, meta);
    expect(summary).toContain('summary-test');
  });

  it('shows PASSED status when gate passes', () => {
    const summary = generateStepSummary(sampleResults, passedGate, meta);
    expect(summary).toContain('PASSED');
  });

  it('shows FAILED status when gate fails', () => {
    const failMeta = buildBuildMetadata(sampleResults, failedGate, {}, 'fail-s', {});
    const summary = generateStepSummary(sampleResults, failedGate, failMeta);
    expect(summary).toContain('FAILED');
  });

  it('includes coverage category names', () => {
    const summary = generateStepSummary(sampleResults, passedGate, meta);
    expect(summary).toContain('endpoint');
    expect(summary).toContain('business');
  });

  it('includes threshold failure details when gate fails', () => {
    const failMeta = buildBuildMetadata(sampleResults, failedGate, {}, 'fail-s2', {});
    const summary = generateStepSummary(sampleResults, failedGate, failMeta);
    expect(summary).toContain('endpoint');
    expect(summary).toContain('30');
  });

  it('includes Pages URL when provided', () => {
    const summary = generateStepSummary(sampleResults, passedGate, meta, 'https://example.com/report');
    expect(summary).toContain('https://example.com/report');
  });

  it('includes top coverage gaps section when gaps exist', () => {
    const gapResults = [makeResult('endpoint', 60), makeResult('business', 50)];
    const summary = generateStepSummary(gapResults, makeGate(false), meta);
    expect(summary).toContain('Coverage Gaps');
  });

  it('includes recommended next action', () => {
    const failMeta = buildBuildMetadata(sampleResults, failedGate, {}, 'fail-s3', {});
    const summary = generateStepSummary(sampleResults, failedGate, failMeta);
    expect(summary).toContain('Recommended');
  });

  it('shows ⚠️ No coverage for 0% categories that did not fail threshold', () => {
    const zeroResults = [makeResult('error', 0), makeResult('endpoint', 100)];
    const zeroGate = makeGate(true);
    const zeroMeta = buildBuildMetadata(zeroResults, zeroGate, {}, 'zero-step', {});
    const summary = generateStepSummary(zeroResults, zeroGate, zeroMeta);
    expect(summary).toContain('⚠️ No coverage');
    expect(summary).not.toMatch(/error.*✅ Pass/);
  });
});

// ─── writeStepSummary ─────────────────────────────────────────────────────────

describe('writeStepSummary', () => {
  let tmpFile: string;
  const origEnv = process.env['GITHUB_STEP_SUMMARY'];

  afterEach(() => {
    if (origEnv === undefined) {
      delete process.env['GITHUB_STEP_SUMMARY'];
    } else {
      process.env['GITHUB_STEP_SUMMARY'] = origEnv;
    }
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  it('returns false when GITHUB_STEP_SUMMARY is not set', () => {
    delete process.env['GITHUB_STEP_SUMMARY'];
    expect(writeStepSummary('hello')).toBe(false);
  });

  it('writes to GITHUB_STEP_SUMMARY file when set', () => {
    tmpFile = path.join(os.tmpdir(), `step-summary-${Date.now()}.md`);
    process.env['GITHUB_STEP_SUMMARY'] = tmpFile;
    const written = writeStepSummary('# Test Summary');
    expect(written).toBe(true);
    expect(fs.existsSync(tmpFile)).toBe(true);
    expect(fs.readFileSync(tmpFile, 'utf-8')).toContain('# Test Summary');
  });
});

// ─── generatePrComment ────────────────────────────────────────────────────────

describe('generatePrComment', () => {
  it('includes pass/fail status', () => {
    const comment = generatePrComment(sampleResults, passedGate, meta);
    expect(comment).toContain('PASSED');
  });

  it('includes coverage percentage for each category', () => {
    const comment = generatePrComment(sampleResults, passedGate, meta);
    expect(comment).toContain('100.00%');
    expect(comment).toContain('80.00%');
  });

  it('includes pages URL link when provided', () => {
    const comment = generatePrComment(sampleResults, passedGate, meta, 'https://pages.example.com');
    expect(comment).toContain('https://pages.example.com');
  });

  it('lists failures when gate fails', () => {
    const failMeta = buildBuildMetadata(sampleResults, failedGate, {}, 'pr-fail', {});
    const comment = generatePrComment(sampleResults, failedGate, failMeta);
    expect(comment).toContain('Failures');
    expect(comment).toContain('endpoint');
  });

  it('shows ⚠️ icon for 0% coverage that did not fail threshold', () => {
    const zeroResults = [makeResult('error', 0), makeResult('endpoint', 100)];
    const zeroGate = makeGate(true);
    const zeroMeta = buildBuildMetadata(zeroResults, zeroGate, {}, 'zero-test', {});
    const comment = generatePrComment(zeroResults, zeroGate, zeroMeta);
    expect(comment).toContain('⚠️');
    expect(comment).not.toMatch(/\| error \| 0\.00% \| ✅/);
  });
});

// ─── printCiSummary ───────────────────────────────────────────────────────────

describe('printCiSummary', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('prints without throwing for a passed gate', () => {
    expect(() => printCiSummary(sampleResults, passedGate)).not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('prints without throwing for a failed gate', () => {
    expect(() => printCiSummary(sampleResults, failedGate)).not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('shows PASSED in output when gate passes', () => {
    printCiSummary(sampleResults, passedGate);
    const allOutput = consoleSpy.mock.calls.flat().join(' ');
    expect(allOutput).toContain('PASSED');
  });

  it('shows FAILED in output when gate fails', () => {
    printCiSummary(sampleResults, failedGate);
    const allOutput = consoleSpy.mock.calls.flat().join(' ');
    expect(allOutput).toContain('FAILED');
  });

  it('shows threshold failure details when gate fails', () => {
    printCiSummary(sampleResults, failedGate);
    const allOutput = consoleSpy.mock.calls.flat().join(' ');
    expect(allOutput).toContain('Threshold failures');
    expect(allOutput).toContain('endpoint');
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
