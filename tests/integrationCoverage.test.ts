import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  parseIntegrationFlows,
  analyzeIntegrationCoverage,
  buildIntegrationCoverageReport,
  generateIntegrationReports,
  IntegrationFlow,
  FlowCoverage,
} from '../src/integrationCoverage';

const SAMPLE_FLOWS = path.resolve(__dirname, '../sample/integration-flows.yaml');
const SAMPLE_TESTS_GLOB = path.resolve(__dirname, '../sample/tests/integration.test.ts');

// ─── parseIntegrationFlows ────────────────────────────────────────────────────

describe('parseIntegrationFlows', () => {
  it('parses the sample YAML flows file without error', () => {
    const flows = parseIntegrationFlows(SAMPLE_FLOWS);
    expect(Array.isArray(flows)).toBe(true);
    expect(flows.length).toBeGreaterThan(0);
  });

  it('returns flows with id, name, description and steps', () => {
    const flows = parseIntegrationFlows(SAMPLE_FLOWS);
    for (const flow of flows) {
      expect(typeof flow.id).toBe('string');
      expect(flow.id.length).toBeGreaterThan(0);
      expect(typeof flow.name).toBe('string');
      expect(typeof flow.description).toBe('string');
      expect(Array.isArray(flow.steps)).toBe(true);
    }
  });

  it('parses steps with id, description and keywords', () => {
    const flows = parseIntegrationFlows(SAMPLE_FLOWS);
    const flow001 = flows.find((f) => f.id === 'FLOW001');
    expect(flow001).toBeDefined();
    expect(flow001!.steps.length).toBeGreaterThan(0);
    for (const step of flow001!.steps) {
      expect(typeof step.id).toBe('string');
      expect(typeof step.description).toBe('string');
      expect(Array.isArray(step.keywords)).toBe(true);
    }
  });

  it('parses method and path for api-type steps', () => {
    const flows = parseIntegrationFlows(SAMPLE_FLOWS);
    const flow001 = flows.find((f) => f.id === 'FLOW001');
    const step1 = flow001!.steps[0];
    expect(step1.method).toBe('POST');
    expect(step1.path).toBe('/users');
  });

  it('throws for a non-existent file', () => {
    expect(() => parseIntegrationFlows('/nonexistent/flows.yaml')).toThrow();
  });

  it('throws for a file with no top-level flows array', () => {
    const tmpFile = path.join(os.tmpdir(), 'bad-flows.yaml');
    fs.writeFileSync(tmpFile, 'notFlows: true\n', 'utf-8');
    try {
      expect(() => parseIntegrationFlows(tmpFile)).toThrow(/top-level "flows" array/);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('parses a JSON flows file', () => {
    const tmpFile = path.join(os.tmpdir(), 'test-flows.json');
    const data = {
      flows: [
        {
          id: 'FLOW999',
          name: 'Test flow',
          description: 'A test flow',
          steps: [
            {
              id: 'FLOW999-step1',
              description: 'First step',
              keywords: ['test keyword'],
            },
          ],
        },
      ],
    };
    fs.writeFileSync(tmpFile, JSON.stringify(data), 'utf-8');
    try {
      const flows = parseIntegrationFlows(tmpFile);
      expect(flows).toHaveLength(1);
      expect(flows[0].id).toBe('FLOW999');
      expect(flows[0].steps).toHaveLength(1);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

// ─── analyzeIntegrationCoverage ───────────────────────────────────────────────

describe('analyzeIntegrationCoverage', () => {
  it('returns the same number of entries as input flows', async () => {
    const flows = parseIntegrationFlows(SAMPLE_FLOWS);
    const coverages = await analyzeIntegrationCoverage(flows, SAMPLE_TESTS_GLOB);
    expect(coverages.length).toBe(flows.length);
  });

  it('marks all flows as missing when no test files match the glob', async () => {
    const flows = parseIntegrationFlows(SAMPLE_FLOWS);
    const coverages = await analyzeIntegrationCoverage(flows, '/nonexistent/**/*.ts');
    expect(coverages.every((c) => c.status === 'missing')).toBe(true);
  });

  it('marks FLOW001 as complete when all steps are covered', async () => {
    const flows = parseIntegrationFlows(SAMPLE_FLOWS);
    const coverages = await analyzeIntegrationCoverage(flows, SAMPLE_TESTS_GLOB);
    const flow001 = coverages.find((c) => c.flow.id === 'FLOW001');
    expect(flow001).toBeDefined();
    expect(flow001!.status).toBe('complete');
  });

  it('detects @flow annotation matching', async () => {
    const flow: IntegrationFlow = {
      id: 'FLOW-ANNOT',
      name: 'Annotation test flow',
      description: 'Tests @flow annotation detection',
      steps: [
        {
          id: 'FLOW-ANNOT-step1',
          description: 'Some step',
          keywords: ['unique keyword xyz'],
        },
      ],
    };
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'int-cov-flow-annot-'));
    const testFile = path.join(tmpDir, 'annot.test.ts');
    fs.writeFileSync(
      testFile,
      `test('some test - @flow FLOW-ANNOT', () => {
  // does unique keyword xyz
  expect(true).toBe(true);
});`,
      'utf-8',
    );
    try {
      const coverages = await analyzeIntegrationCoverage([flow], `${tmpDir}/**/*.ts`);
      expect(coverages[0].steps[0].covered).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('populates testFiles for covered flows', async () => {
    const flows = parseIntegrationFlows(SAMPLE_FLOWS);
    const coverages = await analyzeIntegrationCoverage(flows, SAMPLE_TESTS_GLOB);
    const covered = coverages.filter((c) => c.status !== 'missing');
    for (const cov of covered) {
      expect(cov.testFiles.length).toBeGreaterThan(0);
    }
  });

  it('marks FLOW004 as complete when all steps are covered', async () => {
    const flows = parseIntegrationFlows(SAMPLE_FLOWS);
    const coverages = await analyzeIntegrationCoverage(flows, SAMPLE_TESTS_GLOB);
    const flow004 = coverages.find((c) => c.flow.id === 'FLOW004');
    expect(flow004).toBeDefined();
    // FLOW004 step2 has the keyword "orders per user" which now matches
    // the integration test annotated with "@flow FLOW004":
    //   "Step 2: GET /users/{id}/orders – orders per user"
    expect(flow004!.status).toBe('complete');
  });

  it('returns per-step coverage details', async () => {
    const flows = parseIntegrationFlows(SAMPLE_FLOWS);
    const coverages = await analyzeIntegrationCoverage(flows, SAMPLE_TESTS_GLOB);
    for (const cov of coverages) {
      expect(cov.steps.length).toBe(cov.flow.steps.length);
      for (const stepCov of cov.steps) {
        expect(typeof stepCov.covered).toBe('boolean');
        expect(Array.isArray(stepCov.matchedTests)).toBe(true);
      }
    }
  });
});

// ─── buildIntegrationCoverageReport ──────────────────────────────────────────

describe('buildIntegrationCoverageReport', () => {
  const makeFlow = (id: string): IntegrationFlow => ({
    id,
    name: `Flow ${id}`,
    description: `Description for ${id}`,
    steps: [],
  });

  const makeCoverage = (id: string, status: FlowCoverage['status']): FlowCoverage => ({
    flow: makeFlow(id),
    status,
    testFiles: status !== 'missing' ? ['test.ts'] : [],
    steps: [],
  });

  it('computes total, complete, partial, missing correctly', () => {
    const report = buildIntegrationCoverageReport([
      makeCoverage('FLOW001', 'complete'),
      makeCoverage('FLOW002', 'complete'),
      makeCoverage('FLOW003', 'partial'),
      makeCoverage('FLOW004', 'missing'),
    ]);
    expect(report.total).toBe(4);
    expect(report.complete).toBe(2);
    expect(report.partial).toBe(1);
    expect(report.missing).toBe(1);
  });

  it('computes percentage as complete/total', () => {
    const report = buildIntegrationCoverageReport([
      makeCoverage('FLOW001', 'complete'),
      makeCoverage('FLOW002', 'partial'),
      makeCoverage('FLOW003', 'missing'),
      makeCoverage('FLOW004', 'missing'),
    ]);
    expect(report.percentage).toBe(25);
  });

  it('handles 100% coverage', () => {
    const report = buildIntegrationCoverageReport([
      makeCoverage('FLOW001', 'complete'),
      makeCoverage('FLOW002', 'complete'),
    ]);
    expect(report.percentage).toBe(100);
    expect(report.missing).toBe(0);
    expect(report.partial).toBe(0);
  });

  it('handles 0% coverage', () => {
    const report = buildIntegrationCoverageReport([
      makeCoverage('FLOW001', 'missing'),
      makeCoverage('FLOW002', 'missing'),
    ]);
    expect(report.percentage).toBe(0);
    expect(report.complete).toBe(0);
  });

  it('handles empty flows list', () => {
    const report = buildIntegrationCoverageReport([]);
    expect(report.total).toBe(0);
    expect(report.complete).toBe(0);
    expect(report.partial).toBe(0);
    expect(report.missing).toBe(0);
    expect(report.percentage).toBe(0);
  });
});

// ─── generateIntegrationReports ──────────────────────────────────────────────

describe('generateIntegrationReports', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'int-cov-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const sampleReport = buildIntegrationCoverageReport([
    {
      flow: {
        id: 'FLOW001',
        name: 'User Registration and First Order',
        description: 'User registers and places first order',
        steps: [
          {
            id: 'FLOW001-step1',
            description: 'Create user',
            type: 'api',
            method: 'POST',
            path: '/users',
            keywords: ['POST /users'],
          },
          {
            id: 'FLOW001-step2',
            description: 'Get user',
            type: 'api',
            method: 'GET',
            path: '/users/{id}',
            keywords: ['GET /users'],
          },
        ],
      },
      status: 'complete',
      testFiles: ['tests/integration.test.ts'],
      steps: [
        {
          step: {
            id: 'FLOW001-step1',
            description: 'Create user',
            type: 'api',
            method: 'POST',
            path: '/users',
            keywords: ['POST /users'],
          },
          covered: true,
          matchedTests: ['create user, get user, then place order - @flow FLOW001'],
        },
        {
          step: {
            id: 'FLOW001-step2',
            description: 'Get user',
            type: 'api',
            method: 'GET',
            path: '/users/{id}',
            keywords: ['GET /users'],
          },
          covered: true,
          matchedTests: ['create user, get user, then place order - @flow FLOW001'],
        },
      ],
    },
    {
      flow: {
        id: 'FLOW002',
        name: 'Missing Flow',
        description: 'A flow with no test coverage',
        steps: [
          {
            id: 'FLOW002-step1',
            description: 'Some step',
            keywords: ['something obscure'],
          },
        ],
      },
      status: 'missing',
      testFiles: [],
      steps: [
        {
          step: {
            id: 'FLOW002-step1',
            description: 'Some step',
            keywords: ['something obscure'],
          },
          covered: false,
          matchedTests: [],
        },
      ],
    },
  ]);

  it('creates the reports directory if it does not exist', () => {
    const newDir = path.join(tmpDir, 'new-reports');
    generateIntegrationReports(sampleReport, newDir);
    expect(fs.existsSync(newDir)).toBe(true);
  });

  it('writes integration-coverage.json with correct structure', () => {
    generateIntegrationReports(sampleReport, tmpDir);
    const jsonPath = path.join(tmpDir, 'integration-coverage.json');
    expect(fs.existsSync(jsonPath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    expect(data.total).toBe(2);
    expect(data.complete).toBe(1);
    expect(data.missing).toBe(1);
    expect(data.partial).toBe(0);
    expect(data.percentage).toBe(50);
    expect(data.flows).toHaveLength(2);
    expect(data.flows[0].id).toBe('FLOW001');
    expect(data.flows[0].status).toBe('complete');
    expect(data.flows[1].status).toBe('missing');
  });

  it('includes step details in the JSON report', () => {
    generateIntegrationReports(sampleReport, tmpDir);
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'integration-coverage.json'), 'utf-8'));
    expect(data.flows[0].steps).toHaveLength(2);
    expect(data.flows[0].steps[0].id).toBe('FLOW001-step1');
    expect(data.flows[0].steps[0].covered).toBe(true);
    expect(data.flows[1].steps[0].covered).toBe(false);
  });

  it('writes integration-coverage.html with a table', () => {
    generateIntegrationReports(sampleReport, tmpDir);
    const htmlPath = path.join(tmpDir, 'integration-coverage.html');
    expect(fs.existsSync(htmlPath)).toBe(true);

    const html = fs.readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('<table>');
    expect(html).toContain('FLOW001');
    expect(html).toContain('FLOW002');
    expect(html).toContain('complete');
    expect(html).toContain('missing');
  });

  it('HTML includes step rows', () => {
    generateIntegrationReports(sampleReport, tmpDir);
    const html = fs.readFileSync(path.join(tmpDir, 'integration-coverage.html'), 'utf-8');
    expect(html).toContain('FLOW001-step1');
    expect(html).toContain('FLOW001-step2');
  });
});

// ─── end-to-end: sample flows + sample tests ──────────────────────────────────

describe('end-to-end: sample integration flows + sample tests', () => {
  it('correctly identifies flow coverage from the sample', async () => {
    const flows = parseIntegrationFlows(SAMPLE_FLOWS);
    const coverages = await analyzeIntegrationCoverage(flows, SAMPLE_TESTS_GLOB);
    const report = buildIntegrationCoverageReport(coverages);

    expect(report.total).toBe(4);
    // FLOW001, FLOW002, FLOW003 should be complete; FLOW004 partial
    expect(report.complete).toBeGreaterThanOrEqual(3);
    expect(report.percentage).toBeGreaterThan(50);
  });

  it('reports FLOW001 as complete', async () => {
    const flows = parseIntegrationFlows(SAMPLE_FLOWS);
    const coverages = await analyzeIntegrationCoverage(flows, SAMPLE_TESTS_GLOB);
    const flow001 = coverages.find((c) => c.flow.id === 'FLOW001');
    expect(flow001!.status).toBe('complete');
    expect(flow001!.steps.every((s) => s.covered)).toBe(true);
  });

  it('reports FLOW004 as complete (both steps now covered by sample tests)', async () => {
    const flows = parseIntegrationFlows(SAMPLE_FLOWS);
    const coverages = await analyzeIntegrationCoverage(flows, SAMPLE_TESTS_GLOB);
    const flow004 = coverages.find((c) => c.flow.id === 'FLOW004');
    expect(flow004!.status).toBe('complete');
    expect(flow004!.steps[0].covered).toBe(true);
  });

  it('generates valid JSON and HTML reports', async () => {
    const flows = parseIntegrationFlows(SAMPLE_FLOWS);
    const coverages = await analyzeIntegrationCoverage(flows, SAMPLE_TESTS_GLOB);
    const report = buildIntegrationCoverageReport(coverages);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'int-e2e-'));
    try {
      generateIntegrationReports(report, tmpDir);
      expect(fs.existsSync(path.join(tmpDir, 'integration-coverage.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'integration-coverage.html'))).toBe(true);

      const data = JSON.parse(
        fs.readFileSync(path.join(tmpDir, 'integration-coverage.json'), 'utf-8'),
      );
      expect(data.flows).toHaveLength(4);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
