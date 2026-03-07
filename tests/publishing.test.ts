import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  resolveBuildId,
  buildBuildMetadata,
  generateMarkdownSummary,
  generateLandingPage,
  generateBuildBundle,
  copyReportFilesToBundle,
} from '../src/publishing';
import type { QualityGateResult } from '../src/qualityGate';
import type { CoverageResult } from '../src/reporting';
import type { PublishingConfig } from '../src/config';

// ─── fixtures ─────────────────────────────────────────────────────────────────

const makeResult = (type: string, percent: number, total = 10): CoverageResult => ({
  type,
  totalItems: total,
  coveredItems: Math.round((percent / 100) * total),
  coveragePercent: percent,
  details: {},
});

const makeQualityGate = (passed: boolean): QualityGateResult => ({
  passed,
  threshold: 100,
  actual: { endpoint: passed ? 100 : 80 },
  failures: passed
    ? []
    : [{ category: 'endpoint', expected: 100, actual: 80, gap: 20 }],
});

const sampleResults: CoverageResult[] = [
  makeResult('endpoint', 100),
  makeResult('business', 80),
];

const passedGate = makeQualityGate(true);
const failedGate = makeQualityGate(false);

// ─── resolveBuildId ────────────────────────────────────────────────────────────

describe('resolveBuildId', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env['GITHUB_SHA'] = origEnv['GITHUB_SHA'];
    process.env['GITHUB_RUN_NUMBER'] = origEnv['GITHUB_RUN_NUMBER'];
    process.env['GITHUB_REF_NAME'] = origEnv['GITHUB_REF_NAME'];
  });

  it('returns a timestamp string for "timestamp" pattern', () => {
    const id = resolveBuildId({ buildId: 'timestamp' });
    expect(id).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns GITHUB_SHA for "commit-sha" pattern', () => {
    process.env['GITHUB_SHA'] = 'abc123';
    expect(resolveBuildId({ buildId: 'commit-sha' })).toBe('abc123');
  });

  it('returns GITHUB_RUN_NUMBER for "run-number" pattern', () => {
    process.env['GITHUB_RUN_NUMBER'] = '42';
    expect(resolveBuildId({ buildId: 'run-number' })).toBe('42');
  });

  it('returns branch+timestamp for "branch-timestamp" pattern', () => {
    process.env['GITHUB_REF_NAME'] = 'feature/my-branch';
    const id = resolveBuildId({ buildId: 'branch-timestamp' });
    expect(id).toContain('feature-my-branch');
  });

  it('returns the pattern as-is for custom strings', () => {
    expect(resolveBuildId({ buildId: 'my-custom-build' })).toBe('my-custom-build');
  });

  it('defaults to timestamp when no buildId is set', () => {
    const id = resolveBuildId({});
    expect(id).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── buildBuildMetadata ────────────────────────────────────────────────────────

describe('buildBuildMetadata', () => {
  it('includes all required fields', () => {
    const meta = buildBuildMetadata(sampleResults, passedGate, {}, 'build-001', {});
    expect(meta.buildId).toBe('build-001');
    expect(meta.passed).toBe(true);
    expect(meta.buildTimestamp).toBeTruthy();
    expect(meta.actualCoverage).toHaveProperty('endpoint');
    expect(meta.actualCoverage).toHaveProperty('business');
  });

  it('reflects failed quality gate', () => {
    const meta = buildBuildMetadata(sampleResults, failedGate, {}, 'build-002', {});
    expect(meta.passed).toBe(false);
  });

  it('includes coverage values in actualCoverage', () => {
    const meta = buildBuildMetadata(sampleResults, passedGate, {}, 'build-003', {});
    expect(meta.actualCoverage['endpoint']).toBe(100);
    expect(meta.actualCoverage['business']).toBe(80);
  });
});

// ─── generateMarkdownSummary ──────────────────────────────────────────────────

describe('generateMarkdownSummary', () => {
  const meta = buildBuildMetadata(sampleResults, passedGate, {}, 'test-build', {});

  it('contains the project name', () => {
    const md = generateMarkdownSummary(sampleResults, passedGate, meta);
    expect(md).toContain(meta.projectName);
  });

  it('contains PASSED when gate passes', () => {
    const md = generateMarkdownSummary(sampleResults, passedGate, meta);
    expect(md).toContain('PASSED');
  });

  it('contains FAILED when gate fails', () => {
    const failMeta = buildBuildMetadata(sampleResults, failedGate, {}, 'fail-build', {});
    const md = generateMarkdownSummary(sampleResults, failedGate, failMeta);
    expect(md).toContain('FAILED');
  });

  it('contains coverage type names', () => {
    const md = generateMarkdownSummary(sampleResults, passedGate, meta);
    expect(md).toContain('endpoint');
    expect(md).toContain('business');
  });

  it('contains AI-friendly analysis section', () => {
    const md = generateMarkdownSummary(sampleResults, passedGate, meta);
    expect(md).toContain('AI-Friendly Analysis');
  });

  it('contains recommended next steps', () => {
    const failMeta = buildBuildMetadata(sampleResults, failedGate, {}, 'fail-build-2', {});
    const md = generateMarkdownSummary(sampleResults, failedGate, failMeta);
    expect(md).toContain('Recommended');
    expect(md).toContain('endpoint');
  });

  it('lists failure details when gate fails', () => {
    const failMeta = buildBuildMetadata([makeResult('endpoint', 80)], failedGate, {}, 'fb', {});
    const md = generateMarkdownSummary([makeResult('endpoint', 80)], failedGate, failMeta);
    expect(md).toContain('endpoint');
    expect(md).toContain('20');
  });
});

// ─── generateLandingPage ──────────────────────────────────────────────────────

describe('generateLandingPage', () => {
  const config: PublishingConfig = { outputDir: 'site' };
  const meta = buildBuildMetadata(sampleResults, passedGate, config, 'lp-test', {});

  it('returns valid HTML', () => {
    const html = generateLandingPage(sampleResults, passedGate, meta, config, []);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('includes pass/fail status', () => {
    const passHtml = generateLandingPage(sampleResults, passedGate, meta, config, []);
    expect(passHtml).toContain('PASSED');

    const failMeta = buildBuildMetadata(sampleResults, failedGate, config, 'fail-lp', {});
    const failHtml = generateLandingPage(sampleResults, failedGate, failMeta, config, []);
    expect(failHtml).toContain('FAILED');
  });

  it('includes coverage categories in table', () => {
    const html = generateLandingPage(sampleResults, passedGate, meta, config, []);
    expect(html).toContain('endpoint');
    expect(html).toContain('business');
  });

  it('includes report links', () => {
    const html = generateLandingPage(sampleResults, passedGate, meta, config, []);
    expect(html).toContain('coverage-summary.json');
    expect(html).toContain('ai-summary.md');
  });

  it('includes screenshot thumbnails when provided', () => {
    const html = generateLandingPage(sampleResults, passedGate, meta, config, ['/site/assets/screenshots/latest/overview.png']);
    expect(html).toContain('overview.png');
    expect(html).toContain('<img');
  });

  it('includes no-screenshots notice when empty', () => {
    const html = generateLandingPage(sampleResults, passedGate, meta, config, []);
    expect(html).toContain('screenshots');
  });

  it('includes AI-friendly section', () => {
    const html = generateLandingPage(sampleResults, passedGate, meta, config, []);
    expect(html).toContain('AI-Friendly');
  });
});

// ─── generateBuildBundle ──────────────────────────────────────────────────────

describe('generateBuildBundle', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the bundle directory', () => {
    const config: PublishingConfig = { outputDir: path.join(tmpDir, 'site'), buildId: 'test-001' };
    const reports = generateBuildBundle(sampleResults, passedGate, config, {});
    expect(fs.existsSync(reports.bundleDir)).toBe(true);
  });

  it('writes build-metadata.json', () => {
    const config: PublishingConfig = { outputDir: path.join(tmpDir, 'site'), buildId: 'test-002' };
    const reports = generateBuildBundle(sampleResults, passedGate, config, {});
    const metaPath = path.join(reports.bundleDir, 'build-metadata.json');
    expect(fs.existsSync(metaPath)).toBe(true);
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    expect(meta.buildId).toBe('test-002');
    expect(meta.passed).toBe(true);
  });

  it('writes index.html landing page', () => {
    const config: PublishingConfig = { outputDir: path.join(tmpDir, 'site'), buildId: 'test-003' };
    const reports = generateBuildBundle(sampleResults, passedGate, config, {});
    expect(fs.existsSync(path.join(reports.bundleDir, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(reports.siteDir, 'index.html'))).toBe(true);
  });

  it('writes ai-summary.md markdown', () => {
    const config: PublishingConfig = { outputDir: path.join(tmpDir, 'site'), buildId: 'test-004' };
    const reports = generateBuildBundle(sampleResults, passedGate, config, {});
    expect(fs.existsSync(path.join(reports.bundleDir, 'ai-summary.md'))).toBe(true);
    const md = fs.readFileSync(path.join(reports.bundleDir, 'ai-summary.md'), 'utf-8');
    expect(md).toContain('PASSED');
  });

  it('sets buildId in returned reports', () => {
    const config: PublishingConfig = { outputDir: path.join(tmpDir, 'site'), buildId: 'custom-id' };
    const reports = generateBuildBundle(sampleResults, passedGate, config, {});
    expect(reports.buildId).toBe('custom-id');
  });

  it('generates failed build metadata when gate failed', () => {
    const config: PublishingConfig = { outputDir: path.join(tmpDir, 'site'), buildId: 'fail-test' };
    const reports = generateBuildBundle(sampleResults, failedGate, config, {});
    const meta = JSON.parse(fs.readFileSync(path.join(reports.bundleDir, 'build-metadata.json'), 'utf-8'));
    expect(meta.passed).toBe(false);
  });

  it('landing page shows FAILED on failed gate', () => {
    const config: PublishingConfig = { outputDir: path.join(tmpDir, 'site'), buildId: 'fail-lp' };
    generateBuildBundle(sampleResults, failedGate, config, {});
    const html = fs.readFileSync(path.join(tmpDir, 'site', 'index.html'), 'utf-8');
    expect(html).toContain('FAILED');
  });

  it('lists generated files', () => {
    const config: PublishingConfig = { outputDir: path.join(tmpDir, 'site'), buildId: 'files-test' };
    const reports = generateBuildBundle(sampleResults, passedGate, config, {});
    expect(reports.files.length).toBeGreaterThan(0);
  });
});

// ─── copyReportFilesToBundle ──────────────────────────────────────────────────

describe('copyReportFilesToBundle', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('copies JSON and HTML files into bundle and site dirs', () => {
    const reportsDir = path.join(tmpDir, 'reports');
    const bundleDir = path.join(tmpDir, 'site', 'builds', 'b1');
    const siteDir = path.join(tmpDir, 'site');
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.mkdirSync(bundleDir, { recursive: true });
    fs.mkdirSync(siteDir, { recursive: true });

    fs.writeFileSync(path.join(reportsDir, 'coverage-summary.json'), '{}');
    fs.writeFileSync(path.join(reportsDir, 'coverage-summary.html'), '<html></html>');

    const copied = copyReportFilesToBundle(reportsDir, bundleDir, siteDir, {
      includeJson: true,
      includeHtml: true,
    });

    expect(fs.existsSync(path.join(bundleDir, 'coverage-summary.json'))).toBe(true);
    expect(fs.existsSync(path.join(siteDir, 'coverage-summary.json'))).toBe(true);
    expect(copied.length).toBeGreaterThan(0);
  });

  it('handles missing reportsDir gracefully', () => {
    const copied = copyReportFilesToBundle(
      '/nonexistent/dir',
      path.join(tmpDir, 'bundle'),
      path.join(tmpDir, 'site'),
    );
    expect(copied).toHaveLength(0);
  });
});
