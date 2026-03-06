import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  pathToRegex,
  parseOpenApiSpec,
  analyzeTestCoverage,
  buildCoverageReport,
  generateReports,
  Endpoint,
  EndpointCoverage,
} from '../src/endpointCoverage';

const SAMPLE_SPEC = path.resolve(__dirname, '../sample/openapi.yaml');
const SAMPLE_TESTS_GLOB = path.resolve(__dirname, '../sample/tests/**/*.ts');

describe('pathToRegex', () => {
  it('matches exact paths without parameters', () => {
    const regex = pathToRegex('/users');
    expect(regex.test('/users')).toBe(true);
    expect(regex.test('/orders')).toBe(false);
    expect(regex.test('/users/123')).toBe(false);
  });

  it('matches paths with a single parameter', () => {
    const regex = pathToRegex('/users/{id}');
    expect(regex.test('/users/123')).toBe(true);
    expect(regex.test('/users/abc-def')).toBe(true);
    expect(regex.test('/users')).toBe(false);
    expect(regex.test('/users/123/orders')).toBe(false);
  });

  it('matches paths with multiple parameters', () => {
    const regex = pathToRegex('/users/{id}/orders');
    expect(regex.test('/users/123/orders')).toBe(true);
    expect(regex.test('/users/abc/orders')).toBe(true);
    expect(regex.test('/users/orders')).toBe(false);
  });
});

describe('parseOpenApiSpec', () => {
  it('extracts all endpoints from the sample spec', async () => {
    const endpoints = await parseOpenApiSpec(SAMPLE_SPEC);
    // Sample spec has 9 endpoints
    expect(endpoints.length).toBe(9);
  });

  it('returns endpoints with method and path', async () => {
    const endpoints = await parseOpenApiSpec(SAMPLE_SPEC);
    const methods = endpoints.map((e) => e.method);
    const paths = endpoints.map((e) => e.path);
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
    expect(paths).toContain('/users');
    expect(paths).toContain('/users/{id}');
    expect(paths).toContain('/orders');
    expect(paths).toContain('/users/{id}/orders');
  });

  it('includes pathRegex for each endpoint', async () => {
    const endpoints = await parseOpenApiSpec(SAMPLE_SPEC);
    for (const ep of endpoints) {
      expect(ep.pathRegex).toBeInstanceOf(RegExp);
    }
  });

  it('throws when the spec file does not exist', async () => {
    await expect(parseOpenApiSpec('/nonexistent/path.yaml')).rejects.toThrow();
  });
});

describe('analyzeTestCoverage', () => {
  it('marks covered endpoints correctly for sample tests', async () => {
    const endpoints = await parseOpenApiSpec(SAMPLE_SPEC);
    const coverageMap = await analyzeTestCoverage(endpoints, SAMPLE_TESTS_GLOB);

    const getUsers = coverageMap.find((e) => e.method === 'GET' && e.path === '/users');
    expect(getUsers).toBeDefined();
    expect(getUsers!.covered).toBe(true);

    const postUsers = coverageMap.find((e) => e.method === 'POST' && e.path === '/users');
    expect(postUsers).toBeDefined();
    expect(postUsers!.covered).toBe(true);

    const getUserById = coverageMap.find((e) => e.method === 'GET' && e.path === '/users/{id}');
    expect(getUserById).toBeDefined();
    expect(getUserById!.covered).toBe(true);
  });

  it('marks uncovered endpoints as not covered', async () => {
    const endpoints = await parseOpenApiSpec(SAMPLE_SPEC);
    const coverageMap = await analyzeTestCoverage(endpoints, SAMPLE_TESTS_GLOB);

    // DELETE /users/{id} and PUT /users/{id} are not in the sample tests
    const deleteUser = coverageMap.find((e) => e.method === 'DELETE' && e.path === '/users/{id}');
    expect(deleteUser).toBeDefined();
    expect(deleteUser!.covered).toBe(false);

    const putUser = coverageMap.find((e) => e.method === 'PUT' && e.path === '/users/{id}');
    expect(putUser).toBeDefined();
    expect(putUser!.covered).toBe(false);
  });

  it('returns empty coverage when no test files match the glob', async () => {
    const endpoints = await parseOpenApiSpec(SAMPLE_SPEC);
    const coverageMap = await analyzeTestCoverage(endpoints, '/nonexistent/**/*.ts');
    expect(coverageMap.every((e) => !e.covered)).toBe(true);
  });
});

describe('buildCoverageReport', () => {
  const makeEndpoints = (covered: boolean[]): EndpointCoverage[] =>
    covered.map((c, i) => ({
      method: 'GET',
      path: `/resource/${i}`,
      pathRegex: /x/,
      covered: c,
      testFiles: c ? ['test.ts'] : [],
    }));

  it('computes total, covered and percentage correctly', () => {
    const report = buildCoverageReport(makeEndpoints([true, true, false, false]));
    expect(report.total).toBe(4);
    expect(report.covered).toBe(2);
    expect(report.percentage).toBe(50);
  });

  it('handles 100% coverage', () => {
    const report = buildCoverageReport(makeEndpoints([true, true, true]));
    expect(report.percentage).toBe(100);
  });

  it('handles 0% coverage', () => {
    const report = buildCoverageReport(makeEndpoints([false, false]));
    expect(report.percentage).toBe(0);
  });

  it('handles empty endpoint list', () => {
    const report = buildCoverageReport([]);
    expect(report.total).toBe(0);
    expect(report.covered).toBe(0);
    expect(report.percentage).toBe(0);
  });
});

describe('generateReports', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-cov-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const sampleReport = {
    total: 2,
    covered: 1,
    percentage: 50,
    endpoints: [
      {
        method: 'GET',
        path: '/users',
        pathRegex: /x/,
        covered: true,
        testFiles: ['tests/users.test.ts'],
      },
      {
        method: 'POST',
        path: '/users',
        pathRegex: /x/,
        covered: false,
        testFiles: [],
      },
    ],
  };

  it('creates the reports directory if it does not exist', () => {
    const newDir = path.join(tmpDir, 'new-reports');
    generateReports(sampleReport, newDir);
    expect(fs.existsSync(newDir)).toBe(true);
  });

  it('writes endpoint-coverage.json', () => {
    generateReports(sampleReport, tmpDir);
    const jsonPath = path.join(tmpDir, 'endpoint-coverage.json');
    expect(fs.existsSync(jsonPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    expect(data.total).toBe(2);
    expect(data.covered).toBe(1);
    expect(data.percentage).toBe(50);
    expect(data.endpoints).toHaveLength(2);
    expect(data.endpoints[0].method).toBe('GET');
    expect(data.endpoints[0].covered).toBe(true);
  });

  it('writes endpoint-coverage.html with a table', () => {
    generateReports(sampleReport, tmpDir);
    const htmlPath = path.join(tmpDir, 'endpoint-coverage.html');
    expect(fs.existsSync(htmlPath)).toBe(true);
    const html = fs.readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('<table>');
    expect(html).toContain('/users');
    expect(html).toContain('GET');
    expect(html).toContain('POST');
    expect(html).toContain('uncovered');
  });
});

describe('end-to-end: sample spec + sample tests', () => {
  it('produces expected coverage ratio for the sample project', async () => {
    const endpoints = await parseOpenApiSpec(SAMPLE_SPEC);
    const coverageMap = await analyzeTestCoverage(endpoints, SAMPLE_TESTS_GLOB);
    const report = buildCoverageReport(coverageMap);

    // Sample tests cover: GET /users, POST /users, GET /users/{id}, GET /orders, POST /orders,
    // GET /users/{id}/orders (covered by business.test.ts)
    // Uncovered: PUT /users/{id}, DELETE /users/{id}, GET /orders/{id}
    expect(report.total).toBe(9);
    expect(report.covered).toBe(6);
    expect(report.percentage).toBeCloseTo(66.67, 1);
  });
});
