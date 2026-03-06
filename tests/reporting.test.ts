import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  parseFormats,
  generateMultiFormatReports,
  checkThresholds,
  CoverageResult,
  ReportFormat,
} from '../src/reporting';

// ─── parseFormats ─────────────────────────────────────────────────────────────

describe('parseFormats', () => {
  it('parses a single format', () => {
    expect(parseFormats('json')).toEqual(['json']);
  });

  it('parses multiple comma-separated formats', () => {
    expect(parseFormats('json,html,csv,junit')).toEqual(['json', 'html', 'csv', 'junit']);
  });

  it('trims whitespace around format names', () => {
    expect(parseFormats('json, html , csv')).toEqual(['json', 'html', 'csv']);
  });

  it('ignores unknown format tokens', () => {
    expect(parseFormats('json,pdf,xml')).toEqual(['json']);
  });

  it('is case-insensitive', () => {
    expect(parseFormats('JSON,HTML')).toEqual(['json', 'html']);
  });

  it('returns empty array for empty string', () => {
    expect(parseFormats('')).toEqual([]);
  });
});

// ─── checkThresholds ─────────────────────────────────────────────────────────

describe('checkThresholds', () => {
  const makeResult = (type: string, percent: number): CoverageResult => ({
    type,
    totalItems: 10,
    coveredItems: Math.round(percent / 10),
    coveragePercent: percent,
    details: {},
  });

  it('returns empty array when all results meet thresholds', () => {
    const results = [makeResult('endpoint', 80), makeResult('business', 70)];
    const thresholds = { endpoint: 80, business: 60 };
    expect(checkThresholds(results, thresholds)).toHaveLength(0);
  });

  it('returns failure message when a result is below its threshold', () => {
    const results = [makeResult('endpoint', 50)];
    const thresholds = { endpoint: 80 };
    const failures = checkThresholds(results, thresholds);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('endpoint');
    expect(failures[0]).toContain('50%');
    expect(failures[0]).toContain('80%');
  });

  it('returns multiple failure messages for multiple breaches', () => {
    const results = [makeResult('endpoint', 40), makeResult('business', 30)];
    const thresholds = { endpoint: 80, business: 60 };
    const failures = checkThresholds(results, thresholds);
    expect(failures).toHaveLength(2);
  });

  it('ignores results without a configured threshold', () => {
    const results = [makeResult('endpoint', 10)];
    const thresholds = { business: 80 }; // no threshold for 'endpoint'
    expect(checkThresholds(results, thresholds)).toHaveLength(0);
  });

  it('returns empty array when thresholds object is empty', () => {
    const results = [makeResult('endpoint', 10)];
    expect(checkThresholds(results, {})).toHaveLength(0);
  });

  it('passes when coverage exactly meets the threshold', () => {
    const results = [makeResult('endpoint', 75)];
    const thresholds = { endpoint: 75 };
    expect(checkThresholds(results, thresholds)).toHaveLength(0);
  });

  it('failure message includes gap value', () => {
    const results = [makeResult('endpoint', 60)];
    const thresholds = { endpoint: 80 };
    const failures = checkThresholds(results, thresholds);
    expect(failures[0]).toContain('gap');
    expect(failures[0]).toContain('20.00%');
  });
});

// ─── generateMultiFormatReports ───────────────────────────────────────────────

describe('generateMultiFormatReports', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reporting-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const sampleResults: CoverageResult[] = [
    {
      type: 'endpoint',
      totalItems: 10,
      coveredItems: 8,
      coveragePercent: 80,
      details: { endpoints: [] },
    },
    {
      type: 'business',
      totalItems: 5,
      coveredItems: 3,
      coveragePercent: 60,
      details: { rules: [] },
    },
  ];

  it('creates the reports directory if it does not exist', () => {
    const newDir = path.join(tmpDir, 'sub', 'reports');
    generateMultiFormatReports(sampleResults, ['json'], newDir);
    expect(fs.existsSync(newDir)).toBe(true);
  });

  // ── JSON ─────────────────────────────────────────────────────────────────

  describe('JSON format', () => {
    it('writes coverage-summary.json', () => {
      generateMultiFormatReports(sampleResults, ['json'], tmpDir);
      expect(fs.existsSync(path.join(tmpDir, 'coverage-summary.json'))).toBe(true);
    });

    it('JSON contains generatedAt, summary and details keys', () => {
      generateMultiFormatReports(sampleResults, ['json'], tmpDir);
      const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'coverage-summary.json'), 'utf-8'));
      expect(data).toHaveProperty('generatedAt');
      expect(data).toHaveProperty('summary');
      expect(data).toHaveProperty('details');
    });

    it('JSON summary includes all coverage types', () => {
      generateMultiFormatReports(sampleResults, ['json'], tmpDir);
      const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'coverage-summary.json'), 'utf-8'));
      expect(data.summary).toHaveLength(2);
      const types = data.summary.map((s: { type: string }) => s.type);
      expect(types).toContain('endpoint');
      expect(types).toContain('business');
    });

    it('JSON summary entries contain correct fields', () => {
      generateMultiFormatReports(sampleResults, ['json'], tmpDir);
      const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'coverage-summary.json'), 'utf-8'));
      const ep = data.summary.find((s: { type: string }) => s.type === 'endpoint');
      expect(ep.totalItems).toBe(10);
      expect(ep.coveredItems).toBe(8);
      expect(ep.coveragePercent).toBe(80);
    });
  });

  // ── HTML ─────────────────────────────────────────────────────────────────

  describe('HTML format', () => {
    it('writes coverage-summary.html', () => {
      generateMultiFormatReports(sampleResults, ['html'], tmpDir);
      expect(fs.existsSync(path.join(tmpDir, 'coverage-summary.html'))).toBe(true);
    });

    it('HTML contains a table', () => {
      generateMultiFormatReports(sampleResults, ['html'], tmpDir);
      const html = fs.readFileSync(path.join(tmpDir, 'coverage-summary.html'), 'utf-8');
      expect(html).toContain('<table>');
      expect(html).toContain('</table>');
    });

    it('HTML includes coverage type names', () => {
      generateMultiFormatReports(sampleResults, ['html'], tmpDir);
      const html = fs.readFileSync(path.join(tmpDir, 'coverage-summary.html'), 'utf-8');
      expect(html).toContain('endpoint');
      expect(html).toContain('business');
    });

    it('HTML highlights below-threshold rows', () => {
      const thresholds = { endpoint: 90 }; // endpoint at 80% < 90% → below
      generateMultiFormatReports(sampleResults, ['html'], tmpDir, thresholds);
      const html = fs.readFileSync(path.join(tmpDir, 'coverage-summary.html'), 'utf-8');
      expect(html).toContain('below');
    });
  });

  // ── CSV ──────────────────────────────────────────────────────────────────

  describe('CSV format', () => {
    it('writes coverage-summary.csv', () => {
      generateMultiFormatReports(sampleResults, ['csv'], tmpDir);
      expect(fs.existsSync(path.join(tmpDir, 'coverage-summary.csv'))).toBe(true);
    });

    it('CSV has header row', () => {
      generateMultiFormatReports(sampleResults, ['csv'], tmpDir);
      const csv = fs.readFileSync(path.join(tmpDir, 'coverage-summary.csv'), 'utf-8');
      expect(csv.split('\n')[0]).toBe('type,total,covered,percent');
    });

    it('CSV contains a data row for each result', () => {
      generateMultiFormatReports(sampleResults, ['csv'], tmpDir);
      const csv = fs.readFileSync(path.join(tmpDir, 'coverage-summary.csv'), 'utf-8');
      const lines = csv.split('\n').filter((l) => l.trim() !== '');
      expect(lines).toHaveLength(3); // 1 header + 2 data rows
    });

    it('CSV data rows contain correct values', () => {
      generateMultiFormatReports(sampleResults, ['csv'], tmpDir);
      const csv = fs.readFileSync(path.join(tmpDir, 'coverage-summary.csv'), 'utf-8');
      expect(csv).toContain('endpoint,10,8,80');
      expect(csv).toContain('business,5,3,60');
    });
  });

  // ── JUnit XML ─────────────────────────────────────────────────────────────

  describe('JUnit format', () => {
    it('writes coverage-summary-junit.xml', () => {
      generateMultiFormatReports(sampleResults, ['junit'], tmpDir);
      expect(fs.existsSync(path.join(tmpDir, 'coverage-summary-junit.xml'))).toBe(true);
    });

    it('XML contains <testsuites> root element', () => {
      generateMultiFormatReports(sampleResults, ['junit'], tmpDir);
      const xml = fs.readFileSync(path.join(tmpDir, 'coverage-summary-junit.xml'), 'utf-8');
      expect(xml).toContain('<testsuites');
      expect(xml).toContain('</testsuites>');
    });

    it('XML contains <testsuite> element', () => {
      generateMultiFormatReports(sampleResults, ['junit'], tmpDir);
      const xml = fs.readFileSync(path.join(tmpDir, 'coverage-summary-junit.xml'), 'utf-8');
      expect(xml).toContain('<testsuite');
      expect(xml).toContain('</testsuite>');
    });

    it('XML contains <testcase> elements for each result', () => {
      generateMultiFormatReports(sampleResults, ['junit'], tmpDir);
      const xml = fs.readFileSync(path.join(tmpDir, 'coverage-summary-junit.xml'), 'utf-8');
      const matches = xml.match(/<testcase/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(2);
    });

    it('XML contains <failure> element when threshold is not met', () => {
      const thresholds = { endpoint: 90 }; // 80% < 90% → failure
      generateMultiFormatReports(sampleResults, ['junit'], tmpDir, thresholds);
      const xml = fs.readFileSync(path.join(tmpDir, 'coverage-summary-junit.xml'), 'utf-8');
      expect(xml).toContain('<failure');
    });

    it('XML has no <failure> when all thresholds are met', () => {
      const thresholds = { endpoint: 80, business: 50 }; // both pass
      generateMultiFormatReports(sampleResults, ['junit'], tmpDir, thresholds);
      const xml = fs.readFileSync(path.join(tmpDir, 'coverage-summary-junit.xml'), 'utf-8');
      expect(xml).not.toContain('<failure');
    });

    it('XML failures attribute reflects number of threshold breaches', () => {
      const thresholds = { endpoint: 90, business: 90 }; // both fail
      generateMultiFormatReports(sampleResults, ['junit'], tmpDir, thresholds);
      const xml = fs.readFileSync(path.join(tmpDir, 'coverage-summary-junit.xml'), 'utf-8');
      expect(xml).toContain('failures="2"');
    });
  });

  // ── Multiple formats ──────────────────────────────────────────────────────

  it('writes all four formats when all are requested', () => {
    generateMultiFormatReports(sampleResults, ['json', 'html', 'csv', 'junit'], tmpDir);
    expect(fs.existsSync(path.join(tmpDir, 'coverage-summary.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'coverage-summary.html'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'coverage-summary.csv'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'coverage-summary-junit.xml'))).toBe(true);
  });

  it('writes nothing when formats array is empty', () => {
    generateMultiFormatReports(sampleResults, [], tmpDir);
    expect(fs.readdirSync(tmpDir)).toHaveLength(0);
  });
});

// ─── Threshold exit code behaviour (via process.exitCode) ─────────────────────

describe('threshold exit code integration', () => {
  const makeResult = (type: string, percent: number): CoverageResult => ({
    type,
    totalItems: 10,
    coveredItems: Math.round(percent / 10),
    coveragePercent: percent,
    details: {},
  });

  it('checkThresholds returns empty array (exit 0) when coverage meets threshold', () => {
    const failures = checkThresholds([makeResult('endpoint', 80)], { endpoint: 80 });
    expect(failures).toHaveLength(0);
    // simulating the caller: process.exitCode would not be set to 1
  });

  it('checkThresholds returns failures (exit 1 trigger) when coverage is below threshold', () => {
    const failures = checkThresholds([makeResult('endpoint', 50)], { endpoint: 80 });
    expect(failures.length).toBeGreaterThan(0);
  });

  it('handles mixed pass/fail thresholds correctly', () => {
    const results = [makeResult('endpoint', 80), makeResult('business', 40)];
    const failures = checkThresholds(results, { endpoint: 80, business: 60 });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('business');
  });
});
