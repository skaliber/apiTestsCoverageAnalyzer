import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  parseBusinessRules,
  analyzeBusinessCoverage,
  buildBusinessCoverageReport,
  generateBusinessReports,
  BusinessRule,
  BusinessRuleCoverage,
} from '../src/businessCoverage';

const SAMPLE_RULES = path.resolve(__dirname, '../sample/business-rules.yaml');
const SAMPLE_TESTS_GLOB = path.resolve(__dirname, '../sample/tests/business.test.ts');

// ─── parseBusinessRules ───────────────────────────────────────────────────────

describe('parseBusinessRules', () => {
  it('parses the sample YAML rules file without error', () => {
    const rules = parseBusinessRules(SAMPLE_RULES);
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
  });

  it('returns rules with id, description and keywords', () => {
    const rules = parseBusinessRules(SAMPLE_RULES);
    for (const rule of rules) {
      expect(typeof rule.id).toBe('string');
      expect(rule.id.length).toBeGreaterThan(0);
      expect(typeof rule.description).toBe('string');
      expect(Array.isArray(rule.keywords)).toBe(true);
    }
  });

  it('parses scenarios for rules that define them', () => {
    const rules = parseBusinessRules(SAMPLE_RULES);
    const bl001 = rules.find((r) => r.id === 'BL001');
    expect(bl001).toBeDefined();
    expect(bl001!.scenarios).toBeDefined();
    expect(bl001!.scenarios!.length).toBeGreaterThan(0);
    expect(bl001!.scenarios![0]).toHaveProperty('id');
    expect(bl001!.scenarios![0]).toHaveProperty('description');
  });

  it('parses endpoints for rules that specify them', () => {
    const rules = parseBusinessRules(SAMPLE_RULES);
    const bl001 = rules.find((r) => r.id === 'BL001');
    expect(bl001!.endpoints).toContain('POST /users');
  });

  it('throws for a non-existent file', () => {
    expect(() => parseBusinessRules('/nonexistent/rules.yaml')).toThrow();
  });

  it('throws for a file with no top-level rules array', () => {
    const tmpFile = path.join(os.tmpdir(), 'bad-rules.yaml');
    fs.writeFileSync(tmpFile, 'notRules: true\n', 'utf-8');
    try {
      expect(() => parseBusinessRules(tmpFile)).toThrow(/top-level "rules" array/);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('parses a JSON rules file', () => {
    const tmpFile = path.join(os.tmpdir(), 'test-rules.json');
    const data = {
      rules: [
        {
          id: 'BL999',
          description: 'Test rule',
          keywords: ['test keyword'],
        },
      ],
    };
    fs.writeFileSync(tmpFile, JSON.stringify(data), 'utf-8');
    try {
      const rules = parseBusinessRules(tmpFile);
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('BL999');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

// ─── analyzeBusinessCoverage ─────────────────────────────────────────────────

describe('analyzeBusinessCoverage', () => {
  it('maps annotated tests to their rules via @rule annotation', async () => {
    const rules = parseBusinessRules(SAMPLE_RULES);
    const coverages = await analyzeBusinessCoverage(rules, SAMPLE_TESTS_GLOB);

    const bl001 = coverages.find((c) => c.rule.id === 'BL001');
    expect(bl001).toBeDefined();
    expect(bl001!.covered).toBe(true);
    expect(bl001!.matchedTests.length).toBeGreaterThan(0);
  });

  it('maps tests to rules using keyword matching', async () => {
    const rules = parseBusinessRules(SAMPLE_RULES);
    const coverages = await analyzeBusinessCoverage(rules, SAMPLE_TESTS_GLOB);

    // BL003 uses keyword "user not found" which appears in sample tests
    const bl003 = coverages.find((c) => c.rule.id === 'BL003');
    expect(bl003).toBeDefined();
    expect(bl003!.covered).toBe(true);
  });

  it('detects scenario-level coverage when a test matches both rule and scenario keywords', async () => {
    const rules = parseBusinessRules(SAMPLE_RULES);
    const coverages = await analyzeBusinessCoverage(rules, SAMPLE_TESTS_GLOB);

    const bl001 = coverages.find((c) => c.rule.id === 'BL001');
    const successScenario = bl001!.scenarios.find((s) => s.scenario.id === 'BL001-success');
    expect(successScenario).toBeDefined();
    expect(successScenario!.covered).toBe(true);
  });

  it('marks rules with no matching tests as uncovered', async () => {
    const rules = parseBusinessRules(SAMPLE_RULES);
    const coverages = await analyzeBusinessCoverage(rules, '/nonexistent/**/*.ts');
    expect(coverages.every((c) => !c.covered)).toBe(true);
  });

  it('returns the same number of entries as input rules', async () => {
    const rules = parseBusinessRules(SAMPLE_RULES);
    const coverages = await analyzeBusinessCoverage(rules, SAMPLE_TESTS_GLOB);
    expect(coverages.length).toBe(rules.length);
  });

  it('populates testFiles with paths of files that contain matching tests', async () => {
    const rules = parseBusinessRules(SAMPLE_RULES);
    const coverages = await analyzeBusinessCoverage(rules, SAMPLE_TESTS_GLOB);

    const covered = coverages.filter((c) => c.covered);
    for (const cov of covered) {
      expect(cov.testFiles.length).toBeGreaterThan(0);
      for (const f of cov.testFiles) {
        expect(typeof f).toBe('string');
        expect(f.length).toBeGreaterThan(0);
      }
    }
  });

  it('detects @rule annotation in test content (not just description)', async () => {
    const rule: BusinessRule = {
      id: 'BL-ANNOT',
      description: 'Annotation in content test',
      keywords: [],
    };
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biz-annot-'));
    const testFile = path.join(tmpDir, 'annot.test.ts');
    fs.writeFileSync(
      testFile,
      `test('some generic test description', () => {
  // @rule BL-ANNOT
  expect(true).toBe(true);
});`,
      'utf-8',
    );
    try {
      const coverages = await analyzeBusinessCoverage([rule], `${tmpDir}/**/*.ts`);
      expect(coverages[0].covered).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ─── buildBusinessCoverageReport ─────────────────────────────────────────────

describe('buildBusinessCoverageReport', () => {
  const makeRule = (id: string): BusinessRule => ({
    id,
    description: `Rule ${id}`,
    keywords: [id],
  });

  const makeCoverage = (id: string, covered: boolean): BusinessRuleCoverage => ({
    rule: makeRule(id),
    covered,
    testFiles: covered ? ['test.ts'] : [],
    matchedTests: covered ? ['some test'] : [],
    scenarios: [],
  });

  it('computes total, covered and percentage correctly', () => {
    const report = buildBusinessCoverageReport([
      makeCoverage('BL001', true),
      makeCoverage('BL002', true),
      makeCoverage('BL003', false),
      makeCoverage('BL004', false),
    ]);
    expect(report.total).toBe(4);
    expect(report.covered).toBe(2);
    expect(report.percentage).toBe(50);
  });

  it('handles 100% coverage', () => {
    const report = buildBusinessCoverageReport([
      makeCoverage('BL001', true),
      makeCoverage('BL002', true),
    ]);
    expect(report.percentage).toBe(100);
    expect(report.uncoveredRules).toHaveLength(0);
  });

  it('handles 0% coverage', () => {
    const report = buildBusinessCoverageReport([
      makeCoverage('BL001', false),
      makeCoverage('BL002', false),
    ]);
    expect(report.percentage).toBe(0);
    expect(report.uncoveredRules).toHaveLength(2);
  });

  it('handles empty rules list', () => {
    const report = buildBusinessCoverageReport([]);
    expect(report.total).toBe(0);
    expect(report.covered).toBe(0);
    expect(report.percentage).toBe(0);
    expect(report.uncoveredRules).toHaveLength(0);
  });

  it('lists uncoveredRules with the correct rule objects', () => {
    const report = buildBusinessCoverageReport([
      makeCoverage('BL001', true),
      makeCoverage('BL002', false),
      makeCoverage('BL003', false),
    ]);
    expect(report.uncoveredRules).toHaveLength(2);
    expect(report.uncoveredRules.map((r) => r.id)).toEqual(['BL002', 'BL003']);
  });
});

// ─── generateBusinessReports ─────────────────────────────────────────────────

describe('generateBusinessReports', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biz-cov-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const sampleReport = buildBusinessCoverageReport([
    {
      rule: {
        id: 'BL001',
        description: 'User created with unique email',
        endpoints: ['POST /users'],
        keywords: ['create user'],
        scenarios: [
          { id: 'BL001-success', description: 'Success path', keywords: ['success'] },
          { id: 'BL001-duplicate', description: 'Duplicate email', keywords: ['duplicate'] },
        ],
      },
      covered: true,
      testFiles: ['tests/business.test.ts'],
      matchedTests: ['create user with valid unique email returns 201'],
      scenarios: [
        {
          scenario: { id: 'BL001-success', description: 'Success path', keywords: ['success'] },
          covered: true,
          matchedTests: ['create user with valid unique email returns 201'],
        },
        {
          scenario: { id: 'BL001-duplicate', description: 'Duplicate email', keywords: ['duplicate'] },
          covered: false,
          matchedTests: [],
        },
      ],
    },
    {
      rule: {
        id: 'BL002',
        description: 'Order requires existing user',
        endpoints: ['POST /orders'],
        keywords: ['place order'],
      },
      covered: false,
      testFiles: [],
      matchedTests: [],
      scenarios: [],
    },
  ]);

  it('creates the reports directory if it does not exist', () => {
    const newDir = path.join(tmpDir, 'new-reports');
    generateBusinessReports(sampleReport, newDir);
    expect(fs.existsSync(newDir)).toBe(true);
  });

  it('writes business-coverage.json with correct structure', () => {
    generateBusinessReports(sampleReport, tmpDir);
    const jsonPath = path.join(tmpDir, 'business-coverage.json');
    expect(fs.existsSync(jsonPath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    expect(data.total).toBe(2);
    expect(data.covered).toBe(1);
    expect(data.percentage).toBe(50);
    expect(data.rules).toHaveLength(2);
    expect(data.rules[0].id).toBe('BL001');
    expect(data.rules[0].covered).toBe(true);
    expect(data.rules[1].covered).toBe(false);
  });

  it('includes scenarios in the JSON report', () => {
    generateBusinessReports(sampleReport, tmpDir);
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'business-coverage.json'), 'utf-8'));
    expect(data.rules[0].scenarios).toHaveLength(2);
    expect(data.rules[0].scenarios[0].id).toBe('BL001-success');
    expect(data.rules[0].scenarios[0].covered).toBe(true);
    expect(data.rules[0].scenarios[1].covered).toBe(false);
  });

  it('lists uncoveredRules in the JSON report', () => {
    generateBusinessReports(sampleReport, tmpDir);
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'business-coverage.json'), 'utf-8'));
    expect(data.uncoveredRules).toHaveLength(1);
    expect(data.uncoveredRules[0].id).toBe('BL002');
  });

  it('writes business-coverage.html with a table', () => {
    generateBusinessReports(sampleReport, tmpDir);
    const htmlPath = path.join(tmpDir, 'business-coverage.html');
    expect(fs.existsSync(htmlPath)).toBe(true);

    const html = fs.readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('<table>');
    expect(html).toContain('BL001');
    expect(html).toContain('BL002');
    expect(html).toContain('POST /users');
    expect(html).toContain('uncovered');
    expect(html).toContain('covered');
  });
});

// ─── end-to-end: sample rules + sample tests ─────────────────────────────────

describe('end-to-end: sample business rules + sample tests', () => {
  it('correctly identifies covered rules from the sample', async () => {
    const rules = parseBusinessRules(SAMPLE_RULES);
    const coverages = await analyzeBusinessCoverage(rules, SAMPLE_TESTS_GLOB);
    const report = buildBusinessCoverageReport(coverages);

    // BL001, BL002, BL003, BL004 are all in the sample rules
    expect(report.total).toBe(4);
    // At minimum BL001, BL002 and BL003 should be covered by sample tests
    expect(report.covered).toBeGreaterThanOrEqual(3);
    expect(report.percentage).toBeGreaterThan(50);
  });

  it('reports BL001 as covered with both annotation and keyword matching', async () => {
    const rules = parseBusinessRules(SAMPLE_RULES);
    const coverages = await analyzeBusinessCoverage(rules, SAMPLE_TESTS_GLOB);
    const bl001 = coverages.find((c) => c.rule.id === 'BL001');
    expect(bl001!.covered).toBe(true);
    expect(bl001!.matchedTests.length).toBeGreaterThanOrEqual(2);
  });

  it('reports BL004 as covered via annotation', async () => {
    const rules = parseBusinessRules(SAMPLE_RULES);
    const coverages = await analyzeBusinessCoverage(rules, SAMPLE_TESTS_GLOB);
    const bl004 = coverages.find((c) => c.rule.id === 'BL004');
    expect(bl004!.covered).toBe(true);
  });
});
