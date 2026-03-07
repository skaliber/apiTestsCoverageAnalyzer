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
});

// ─── printCiSummary ───────────────────────────────────────────────────────────

describe('printCiSummary', () => {
  it('prints without throwing', () => {
    expect(() => printCiSummary(sampleResults, passedGate)).not.toThrow();
    expect(() => printCiSummary(sampleResults, failedGate)).not.toThrow();
  });
});
