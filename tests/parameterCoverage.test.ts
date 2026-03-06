import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  parseParameters,
  analyzeParameterCoverage,
  buildParameterCoverageReport,
  generateParameterReports,
  ParameterInfo,
  ParameterCoverage,
} from '../src/parameterCoverage';

const SAMPLE_SPEC = path.resolve(__dirname, '../sample/openapi-parameters.yaml');
const SAMPLE_TESTS_GLOB = path.resolve(__dirname, '../sample/tests/parameter.test.ts');

// ─── parseParameters ─────────────────────────────────────────────────────────

describe('parseParameters', () => {
  it('extracts all parameters from the sample spec', async () => {
    const params = await parseParameters(SAMPLE_SPEC);
    // POST /users: name (body), email (body), age (body) = 3
    // GET /users/{id}: id (path), fields (query)        = 2
    // GET /items: q (query), limit (query), X-Api-Key (header) = 3
    // Total = 8
    expect(params.length).toBe(8);
  });

  it('correctly identifies required and optional body parameters', async () => {
    const params = await parseParameters(SAMPLE_SPEC);
    const name = params.find((p) => p.name === 'name' && p.location === 'body');
    const age = params.find((p) => p.name === 'age' && p.location === 'body');

    expect(name).toBeDefined();
    expect(name!.required).toBe(true);
    expect(age).toBeDefined();
    expect(age!.required).toBe(false);
  });

  it('captures schema constraints for body parameters', async () => {
    const params = await parseParameters(SAMPLE_SPEC);
    const name = params.find((p) => p.name === 'name' && p.location === 'body');
    expect(name!.schema.type).toBe('string');
    expect(name!.schema.minLength).toBe(1);
    expect(name!.schema.maxLength).toBe(100);

    const age = params.find((p) => p.name === 'age' && p.location === 'body');
    expect(age!.schema.type).toBe('integer');
    expect(age!.schema.minimum).toBe(0);
    expect(age!.schema.maximum).toBe(150);
  });

  it('identifies path, query and header parameters', async () => {
    const params = await parseParameters(SAMPLE_SPEC);

    const id = params.find((p) => p.name === 'id');
    expect(id).toBeDefined();
    expect(id!.location).toBe('path');
    expect(id!.required).toBe(true);

    const fields = params.find((p) => p.name === 'fields');
    expect(fields).toBeDefined();
    expect(fields!.location).toBe('query');
    expect(fields!.required).toBe(false);

    const apiKey = params.find((p) => p.name === 'X-Api-Key');
    expect(apiKey).toBeDefined();
    expect(apiKey!.location).toBe('header');
    expect(apiKey!.required).toBe(true);
  });

  it('captures enum constraints on query parameters', async () => {
    const params = await parseParameters(SAMPLE_SPEC);
    const fields = params.find((p) => p.name === 'fields');
    expect(fields!.schema.enum).toEqual(['name', 'email', 'age']);
  });

  it('populates the endpoint string correctly', async () => {
    const params = await parseParameters(SAMPLE_SPEC);
    const postUsersParams = params.filter((p) => p.endpoint === 'POST /users');
    expect(postUsersParams.length).toBe(3); // name, email, age

    const getItemsParams = params.filter((p) => p.endpoint === 'GET /items');
    expect(getItemsParams.length).toBe(3); // q, limit, X-Api-Key
  });

  it('throws when the spec file does not exist', async () => {
    await expect(parseParameters('/nonexistent/spec.yaml')).rejects.toThrow();
  });
});

// ─── analyzeParameterCoverage ────────────────────────────────────────────────

describe('analyzeParameterCoverage', () => {
  it('detects valid-value coverage for required body param "name"', async () => {
    const params = await parseParameters(SAMPLE_SPEC);
    const coverages = await analyzeParameterCoverage(params, SAMPLE_TESTS_GLOB);
    const cov = coverages.find(
      (c) => c.parameter.name === 'name' && c.parameter.location === 'body',
    );
    expect(cov).toBeDefined();
    expect(cov!.validValue).toBe(true);
  });

  it('detects boundary-value coverage for "name" (min-length boundary)', async () => {
    const params = await parseParameters(SAMPLE_SPEC);
    const coverages = await analyzeParameterCoverage(params, SAMPLE_TESTS_GLOB);
    const cov = coverages.find(
      (c) => c.parameter.name === 'name' && c.parameter.location === 'body',
    );
    expect(cov!.boundaryValue).toBe(true);
  });

  it('detects missing-value coverage for required "name"', async () => {
    const params = await parseParameters(SAMPLE_SPEC);
    const coverages = await analyzeParameterCoverage(params, SAMPLE_TESTS_GLOB);
    const cov = coverages.find(
      (c) => c.parameter.name === 'name' && c.parameter.location === 'body',
    );
    expect(cov!.missing).toBe(true);
  });

  it('detects invalid-value coverage for "name" (null value)', async () => {
    const params = await parseParameters(SAMPLE_SPEC);
    const coverages = await analyzeParameterCoverage(params, SAMPLE_TESTS_GLOB);
    const cov = coverages.find(
      (c) => c.parameter.name === 'name' && c.parameter.location === 'body',
    );
    expect(cov!.invalidValue).toBe(true);
  });

  it('detects all four categories for "name" (ratio = 1)', async () => {
    const params = await parseParameters(SAMPLE_SPEC);
    const coverages = await analyzeParameterCoverage(params, SAMPLE_TESTS_GLOB);
    const cov = coverages.find(
      (c) => c.parameter.name === 'name' && c.parameter.location === 'body',
    );
    expect(cov!.ratio).toBe(1);
  });

  it('detects valid-value for path param "id"', async () => {
    const params = await parseParameters(SAMPLE_SPEC);
    const coverages = await analyzeParameterCoverage(params, SAMPLE_TESTS_GLOB);
    const cov = coverages.find((c) => c.parameter.name === 'id');
    expect(cov).toBeDefined();
    expect(cov!.validValue).toBe(true);
  });

  it('detects boundary value for path param "id" (minimum=1)', async () => {
    const params = await parseParameters(SAMPLE_SPEC);
    const coverages = await analyzeParameterCoverage(params, SAMPLE_TESTS_GLOB);
    const cov = coverages.find((c) => c.parameter.name === 'id');
    expect(cov!.boundaryValue).toBe(true);
  });

  it('detects invalid value for path param "id" (non-numeric)', async () => {
    const params = await parseParameters(SAMPLE_SPEC);
    const coverages = await analyzeParameterCoverage(params, SAMPLE_TESTS_GLOB);
    const cov = coverages.find((c) => c.parameter.name === 'id');
    expect(cov!.invalidValue).toBe(true);
  });

  it('returns zero coverage when no test files match the glob', async () => {
    const params = await parseParameters(SAMPLE_SPEC);
    const coverages = await analyzeParameterCoverage(params, '/nonexistent/**/*.ts');
    expect(coverages.every((c) => c.ratio === 0)).toBe(true);
  });

  it('returns the same number of entries as input parameters', async () => {
    const params = await parseParameters(SAMPLE_SPEC);
    const coverages = await analyzeParameterCoverage(params, SAMPLE_TESTS_GLOB);
    expect(coverages.length).toBe(params.length);
  });
});

// ─── buildParameterCoverageReport ────────────────────────────────────────────

describe('buildParameterCoverageReport', () => {
  const makeParam = (name: string): ParameterInfo => ({
    endpoint: 'POST /test',
    method: 'POST',
    path: '/test',
    name,
    location: 'body',
    required: true,
    schema: { type: 'string' },
  });

  const makeCoverage = (
    name: string,
    flags: { v: boolean; b: boolean; m: boolean; i: boolean },
  ): ParameterCoverage => {
    const count = [flags.v, flags.b, flags.m, flags.i].filter(Boolean).length;
    return {
      parameter: makeParam(name),
      validValue: flags.v,
      boundaryValue: flags.b,
      missing: flags.m,
      invalidValue: flags.i,
      ratio: count / 4,
    };
  };

  it('computes averageCoverage correctly', () => {
    const coverages = [
      makeCoverage('a', { v: true, b: true, m: true, i: true }),   // ratio 1.0
      makeCoverage('b', { v: true, b: false, m: false, i: false }), // ratio 0.25
    ];
    const report = buildParameterCoverageReport(coverages);
    expect(report.totalParameters).toBe(2);
    expect(report.averageCoverage).toBe(62.5);
  });

  it('computes fullyCoveredPercentage correctly', () => {
    const coverages = [
      makeCoverage('a', { v: true, b: true, m: true, i: true }),
      makeCoverage('b', { v: true, b: true, m: true, i: true }),
      makeCoverage('c', { v: true, b: false, m: false, i: false }),
    ];
    const report = buildParameterCoverageReport(coverages);
    expect(report.fullyCoveredPercentage).toBeCloseTo(66.67, 1);
  });

  it('lists parameters with zero coverage', () => {
    const coverages = [
      makeCoverage('uncovered', { v: false, b: false, m: false, i: false }),
      makeCoverage('covered', { v: true, b: true, m: true, i: true }),
    ];
    const report = buildParameterCoverageReport(coverages);
    expect(report.uncoveredParameters).toHaveLength(1);
    expect(report.uncoveredParameters[0].name).toBe('uncovered');
  });

  it('returns zeros for an empty parameter list', () => {
    const report = buildParameterCoverageReport([]);
    expect(report.totalParameters).toBe(0);
    expect(report.averageCoverage).toBe(0);
    expect(report.fullyCoveredPercentage).toBe(0);
    expect(report.uncoveredParameters).toHaveLength(0);
  });

  it('handles 100% average coverage', () => {
    const coverages = [
      makeCoverage('a', { v: true, b: true, m: true, i: true }),
    ];
    const report = buildParameterCoverageReport(coverages);
    expect(report.averageCoverage).toBe(100);
    expect(report.fullyCoveredPercentage).toBe(100);
  });
});

// ─── generateParameterReports ────────────────────────────────────────────────

describe('generateParameterReports', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'param-cov-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const sampleReport = buildParameterCoverageReport([
    {
      parameter: {
        endpoint: 'POST /users',
        method: 'POST',
        path: '/users',
        name: 'name',
        location: 'body',
        required: true,
        schema: { type: 'string', minLength: 1 },
      },
      validValue: true,
      boundaryValue: true,
      missing: true,
      invalidValue: true,
      ratio: 1,
    },
    {
      parameter: {
        endpoint: 'GET /users/{id}',
        method: 'GET',
        path: '/users/{id}',
        name: 'id',
        location: 'path',
        required: true,
        schema: { type: 'integer', minimum: 1 },
      },
      validValue: true,
      boundaryValue: false,
      missing: false,
      invalidValue: false,
      ratio: 0.25,
    },
  ]);

  it('creates the reports directory if it does not exist', () => {
    const newDir = path.join(tmpDir, 'new-reports');
    generateParameterReports(sampleReport, newDir);
    expect(fs.existsSync(newDir)).toBe(true);
  });

  it('writes parameter-coverage.json with correct structure', () => {
    generateParameterReports(sampleReport, tmpDir);
    const jsonPath = path.join(tmpDir, 'parameter-coverage.json');
    expect(fs.existsSync(jsonPath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    expect(data.totalParameters).toBe(2);
    expect(data.averageCoverage).toBe(62.5);
    expect(data.parameters).toHaveLength(2);
    expect(data.parameters[0].name).toBe('name');
    expect(data.parameters[0].validValue).toBe(true);
    expect(data.parameters[0].coveragePercent).toBe(100);
    expect(data.parameters[1].coveragePercent).toBe(25);
  });

  it('lists uncovered parameters in the JSON report', () => {
    const allUncoveredReport = buildParameterCoverageReport([
      {
        parameter: {
          endpoint: 'GET /test',
          method: 'GET',
          path: '/test',
          name: 'q',
          location: 'query',
          required: false,
          schema: { type: 'string' },
        },
        validValue: false,
        boundaryValue: false,
        missing: false,
        invalidValue: false,
        ratio: 0,
      },
    ]);
    generateParameterReports(allUncoveredReport, tmpDir);
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, 'parameter-coverage.json'), 'utf-8'));
    expect(data.uncoveredParameters).toHaveLength(1);
    expect(data.uncoveredParameters[0].name).toBe('q');
  });

  it('writes parameter-coverage.html with a table', () => {
    generateParameterReports(sampleReport, tmpDir);
    const htmlPath = path.join(tmpDir, 'parameter-coverage.html');
    expect(fs.existsSync(htmlPath)).toBe(true);

    const html = fs.readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('<table>');
    expect(html).toContain('name');
    expect(html).toContain('id');
    expect(html).toContain('POST /users');
    expect(html).toContain('GET /users/{id}');
  });
});

// ─── end-to-end: sample spec + sample tests ───────────────────────────────────

describe('end-to-end: sample spec + sample tests', () => {
  it('achieves high average coverage with the provided sample tests', async () => {
    const params = await parseParameters(SAMPLE_SPEC);
    const coverages = await analyzeParameterCoverage(params, SAMPLE_TESTS_GLOB);
    const report = buildParameterCoverageReport(coverages);

    // We have 8 parameters, all exercised with at least some categories
    expect(report.totalParameters).toBe(8);
    // Average coverage should be well above 50%
    expect(report.averageCoverage).toBeGreaterThan(50);
  });

  it('covers all four categories for the "name" body parameter', async () => {
    const params = await parseParameters(SAMPLE_SPEC);
    const coverages = await analyzeParameterCoverage(params, SAMPLE_TESTS_GLOB);
    const nameCov = coverages.find(
      (c) => c.parameter.name === 'name' && c.parameter.location === 'body',
    );
    expect(nameCov!.validValue).toBe(true);
    expect(nameCov!.boundaryValue).toBe(true);
    expect(nameCov!.missing).toBe(true);
    expect(nameCov!.invalidValue).toBe(true);
  });
});
