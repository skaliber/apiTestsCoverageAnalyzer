import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  parseErrorScenarios,
  analyzeErrorCoverage,
  buildErrorCoverageReport,
  generateErrorReports,
  statusCodeToCategories,
  segmentMentionsEndpoint,
  matchesCategoryHeuristic,
  segmentCoversScenario,
  ErrorScenario,
  ErrorScenarioCoverage,
  ErrorCategory,
} from '../src/errorCoverage';

const SAMPLE_SPEC = path.resolve(__dirname, '../sample/openapi-errors.yaml');
const SAMPLE_TESTS_GLOB = path.resolve(__dirname, '../sample/tests/error.test.ts');

// ─── statusCodeToCategories ───────────────────────────────────────────────────

describe('statusCodeToCategories', () => {
  it('maps 400 with "missing" description to missing-parameter', () => {
    const cats = statusCodeToCategories(400, 'Missing required field');
    expect(cats).toContain('missing-parameter');
    expect(cats).not.toContain('invalid-value');
  });

  it('maps 400 with "invalid" description to invalid-value', () => {
    const cats = statusCodeToCategories(400, 'Invalid input value');
    expect(cats).toContain('invalid-value');
    expect(cats).not.toContain('missing-parameter');
  });

  it('maps generic 400 to both missing-parameter and invalid-value', () => {
    const cats = statusCodeToCategories(400, 'Bad request');
    expect(cats).toContain('missing-parameter');
    expect(cats).toContain('invalid-value');
  });

  it('maps 401 to unauthorized', () => {
    expect(statusCodeToCategories(401, 'Unauthorized')).toEqual(['unauthorized']);
  });

  it('maps 403 to forbidden', () => {
    expect(statusCodeToCategories(403, 'Forbidden')).toEqual(['forbidden']);
  });

  it('maps 404 to not-found', () => {
    expect(statusCodeToCategories(404, 'Not found')).toEqual(['not-found']);
  });

  it('maps 409 to conflict', () => {
    expect(statusCodeToCategories(409, 'Conflict')).toEqual(['conflict']);
  });

  it('maps 422 to invalid-value', () => {
    expect(statusCodeToCategories(422, 'Unprocessable entity')).toEqual(['invalid-value']);
  });

  it('maps 500 to server-error', () => {
    expect(statusCodeToCategories(500, 'Internal server error')).toEqual(['server-error']);
  });

  it('maps 503 to server-error', () => {
    expect(statusCodeToCategories(503, 'Service unavailable')).toEqual(['server-error']);
  });
});

// ─── parseErrorScenarios ─────────────────────────────────────────────────────

describe('parseErrorScenarios', () => {
  it('extracts all error scenarios from the sample spec', async () => {
    const scenarios = await parseErrorScenarios(SAMPLE_SPEC);
    // POST /users: 400, 401, 409                 = 3
    // GET  /users/{id}: 400, 401, 404            = 3
    // PUT  /users/{id}: 400, 401, 403, 404       = 4
    // DELETE /users/{id}: 401, 403, 404          = 3
    // GET  /items: 400, 401, 500                 = 3
    // Total = 16
    expect(scenarios.length).toBe(16);
  });

  it('does not include 2xx responses', async () => {
    const scenarios = await parseErrorScenarios(SAMPLE_SPEC);
    expect(scenarios.every((s) => s.statusCode >= 400)).toBe(true);
  });

  it('sets correct endpoint, method and path on each scenario', async () => {
    const scenarios = await parseErrorScenarios(SAMPLE_SPEC);

    const postUsers400 = scenarios.find((s) => s.id === 'POST /users:400');
    expect(postUsers400).toBeDefined();
    expect(postUsers400!.method).toBe('POST');
    expect(postUsers400!.path).toBe('/users');
    expect(postUsers400!.endpoint).toBe('POST /users');
  });

  it('assigns categories based on status code and description', async () => {
    const scenarios = await parseErrorScenarios(SAMPLE_SPEC);

    const s401 = scenarios.find((s) => s.id === 'POST /users:401');
    expect(s401!.categories).toContain('unauthorized');

    const s404 = scenarios.find((s) => s.id === 'GET /users/{id}:404');
    expect(s404!.categories).toContain('not-found');

    const s500 = scenarios.find((s) => s.id === 'GET /items:500');
    expect(s500!.categories).toContain('server-error');
  });

  it('throws when the spec file does not exist', async () => {
    await expect(parseErrorScenarios('/nonexistent/spec.yaml')).rejects.toThrow();
  });
});

// ─── segmentMentionsEndpoint ─────────────────────────────────────────────────

describe('segmentMentionsEndpoint', () => {
  const makeScenario = (method: string, path: string): ErrorScenario => ({
    id: `${method} ${path}:400`,
    endpoint: `${method} ${path}`,
    method,
    path,
    statusCode: 400,
    description: 'Bad request',
    categories: ['invalid-value'],
  });

  it('matches when description starts with "METHOD /path"', () => {
    const seg = { description: 'POST /users - missing field', content: '' };
    expect(segmentMentionsEndpoint(seg, makeScenario('POST', '/users'))).toBe(true);
  });

  it('matches when content has method string and path base', () => {
    const seg = {
      description: 'some test',
      content: "const method = 'POST';\nconst url = '/users';",
    };
    expect(segmentMentionsEndpoint(seg, makeScenario('POST', '/users'))).toBe(true);
  });

  it('matches parameterized path via pathBase prefix', () => {
    const seg = { description: 'GET /users/{id} - not found', content: '' };
    expect(segmentMentionsEndpoint(seg, makeScenario('GET', '/users/{id}'))).toBe(true);
  });

  it('does NOT match wrong method', () => {
    const seg = { description: 'GET /users - list users', content: '' };
    expect(segmentMentionsEndpoint(seg, makeScenario('POST', '/users'))).toBe(false);
  });

  it('does NOT match unrelated path', () => {
    const seg = { description: 'GET /orders - list orders', content: '' };
    expect(segmentMentionsEndpoint(seg, makeScenario('GET', '/users'))).toBe(false);
  });
});

// ─── matchesCategoryHeuristic ────────────────────────────────────────────────

describe('matchesCategoryHeuristic', () => {
  const seg = (desc: string, content = ''): { description: string; content: string } => ({
    description: desc,
    content,
  });

  it('detects missing-parameter via description keyword', () => {
    expect(matchesCategoryHeuristic(seg('missing name returns 400'), 'missing-parameter')).toBe(true);
    expect(matchesCategoryHeuristic(seg('without required field'), 'missing-parameter')).toBe(true);
    expect(matchesCategoryHeuristic(seg('omit the email field'), 'missing-parameter')).toBe(true);
  });

  it('detects missing-parameter via delete statement in code', () => {
    expect(
      matchesCategoryHeuristic(seg('some test', 'delete body.name;'), 'missing-parameter'),
    ).toBe(true);
  });

  it('detects invalid-value via description keyword', () => {
    expect(matchesCategoryHeuristic(seg('invalid email format'), 'invalid-value')).toBe(true);
    expect(matchesCategoryHeuristic(seg('wrong type for age'), 'invalid-value')).toBe(true);
    expect(matchesCategoryHeuristic(seg('out of range value'), 'invalid-value')).toBe(true);
  });

  it('detects invalid-value via null assignment in code', () => {
    expect(
      matchesCategoryHeuristic(seg('test', "const body = { name: null };"), 'invalid-value'),
    ).toBe(true);
  });

  it('detects unauthorized via description keyword', () => {
    expect(matchesCategoryHeuristic(seg('unauthorized request'), 'unauthorized')).toBe(true);
    expect(matchesCategoryHeuristic(seg('missing token'), 'unauthorized')).toBe(true);
    expect(matchesCategoryHeuristic(seg('no auth header'), 'unauthorized')).toBe(true);
    expect(matchesCategoryHeuristic(seg('missing api key'), 'unauthorized')).toBe(true);
  });

  it('detects unauthorized via empty Authorization header in code', () => {
    const content = "const headers = { authorization: '' };";
    expect(matchesCategoryHeuristic(seg('test', content), 'unauthorized')).toBe(true);
  });

  it('detects forbidden via description keyword', () => {
    expect(matchesCategoryHeuristic(seg('forbidden action'), 'forbidden')).toBe(true);
    expect(matchesCategoryHeuristic(seg('access denied'), 'forbidden')).toBe(true);
  });

  it('detects not-found via description keyword', () => {
    expect(matchesCategoryHeuristic(seg('user not found'), 'not-found')).toBe(true);
    expect(matchesCategoryHeuristic(seg('nonexistent resource'), 'not-found')).toBe(true);
  });

  it('detects not-found via large numeric ID in code', () => {
    expect(
      matchesCategoryHeuristic(seg('test', "const url = '/users/999999';"), 'not-found'),
    ).toBe(true);
  });

  it('detects conflict via description keyword', () => {
    expect(matchesCategoryHeuristic(seg('duplicate email'), 'conflict')).toBe(true);
    expect(matchesCategoryHeuristic(seg('already exists'), 'conflict')).toBe(true);
    expect(matchesCategoryHeuristic(seg('email already in use'), 'conflict')).toBe(true);
  });

  it('detects server-error via description keyword', () => {
    expect(matchesCategoryHeuristic(seg('internal server error'), 'server-error')).toBe(true);
    expect(matchesCategoryHeuristic(seg('unexpected error'), 'server-error')).toBe(true);
  });

  it('returns false when no heuristic matches', () => {
    expect(matchesCategoryHeuristic(seg('create user successfully'), 'missing-parameter')).toBe(
      false,
    );
  });
});

// ─── segmentCoversScenario ────────────────────────────────────────────────────

describe('segmentCoversScenario', () => {
  const makeScenario400 = (): ErrorScenario => ({
    id: 'POST /users:400',
    endpoint: 'POST /users',
    method: 'POST',
    path: '/users',
    statusCode: 400,
    description: 'Bad request',
    categories: ['missing-parameter', 'invalid-value'],
  });

  it('covers via direct status code assertion .toBe(400)', () => {
    const seg = {
      description: 'some test',
      content: 'expect(response.status).toBe(400);',
    };
    expect(segmentCoversScenario(seg, makeScenario400())).toBe(true);
  });

  it('covers via "status === 400" in code', () => {
    const seg = {
      description: 'some test',
      content: 'if (status === 400) { ... }',
    };
    expect(segmentCoversScenario(seg, makeScenario400())).toBe(true);
  });

  it('covers via description keyword (missing)', () => {
    const seg = { description: 'POST /users - missing name', content: '' };
    expect(segmentCoversScenario(seg, makeScenario400())).toBe(true);
  });

  it('covers via indirect error-body assertion', () => {
    const seg = {
      description: 'POST /users - error body check',
      content: "expect(response.body.message).toContain('required');",
    };
    expect(segmentCoversScenario(seg, makeScenario400())).toBe(true);
  });

  it('does NOT cover when neither assertion nor heuristic matches', () => {
    const seg = {
      description: 'POST /users - creates user successfully',
      content: 'expect(response.status).toBe(201);',
    };
    expect(segmentCoversScenario(seg, makeScenario400())).toBe(false);
  });

  it('covers 401 scenario via description keyword "unauthorized"', () => {
    const scenario: ErrorScenario = {
      id: 'POST /users:401',
      endpoint: 'POST /users',
      method: 'POST',
      path: '/users',
      statusCode: 401,
      description: 'Unauthorized',
      categories: ['unauthorized'],
    };
    const seg = { description: 'POST /users - unauthorized request', content: '' };
    expect(segmentCoversScenario(seg, scenario)).toBe(true);
  });
});

// ─── analyzeErrorCoverage ────────────────────────────────────────────────────

describe('analyzeErrorCoverage', () => {
  it('returns same number of entries as input scenarios', async () => {
    const scenarios = await parseErrorScenarios(SAMPLE_SPEC);
    const coverages = await analyzeErrorCoverage(scenarios, SAMPLE_TESTS_GLOB);
    expect(coverages.length).toBe(scenarios.length);
  });

  it('marks POST /users:400 as covered', async () => {
    const scenarios = await parseErrorScenarios(SAMPLE_SPEC);
    const coverages = await analyzeErrorCoverage(scenarios, SAMPLE_TESTS_GLOB);
    const c = coverages.find((x) => x.scenario.id === 'POST /users:400');
    expect(c).toBeDefined();
    expect(c!.covered).toBe(true);
    expect(c!.matchedTests.length).toBeGreaterThan(0);
  });

  it('marks POST /users:409 as covered (conflict)', async () => {
    const scenarios = await parseErrorScenarios(SAMPLE_SPEC);
    const coverages = await analyzeErrorCoverage(scenarios, SAMPLE_TESTS_GLOB);
    const c = coverages.find((x) => x.scenario.id === 'POST /users:409');
    expect(c).toBeDefined();
    expect(c!.covered).toBe(true);
  });

  it('marks GET /users/{id}:404 as covered (not-found)', async () => {
    const scenarios = await parseErrorScenarios(SAMPLE_SPEC);
    const coverages = await analyzeErrorCoverage(scenarios, SAMPLE_TESTS_GLOB);
    const c = coverages.find((x) => x.scenario.id === 'GET /users/{id}:404');
    expect(c).toBeDefined();
    expect(c!.covered).toBe(true);
  });

  it('marks PUT /users/{id}:403 as covered (forbidden)', async () => {
    const scenarios = await parseErrorScenarios(SAMPLE_SPEC);
    const coverages = await analyzeErrorCoverage(scenarios, SAMPLE_TESTS_GLOB);
    const c = coverages.find((x) => x.scenario.id === 'PUT /users/{id}:403');
    expect(c).toBeDefined();
    expect(c!.covered).toBe(true);
  });

  it('marks GET /items:500 as covered (server-error)', async () => {
    const scenarios = await parseErrorScenarios(SAMPLE_SPEC);
    const coverages = await analyzeErrorCoverage(scenarios, SAMPLE_TESTS_GLOB);
    const c = coverages.find((x) => x.scenario.id === 'GET /items:500');
    expect(c).toBeDefined();
    expect(c!.covered).toBe(true);
  });

  it('returns all uncovered when no test files match the glob', async () => {
    const scenarios = await parseErrorScenarios(SAMPLE_SPEC);
    const coverages = await analyzeErrorCoverage(scenarios, '/nonexistent/**/*.ts');
    expect(coverages.every((c) => !c.covered)).toBe(true);
  });
});

// ─── buildErrorCoverageReport ────────────────────────────────────────────────

describe('buildErrorCoverageReport', () => {
  const makeScenario = (id: string, cats: ErrorCategory[]): ErrorScenario => ({
    id,
    endpoint: 'POST /test',
    method: 'POST',
    path: '/test',
    statusCode: 400,
    description: 'test',
    categories: cats,
  });

  const makeCoverage = (id: string, cats: ErrorCategory[], covered: boolean): ErrorScenarioCoverage => ({
    scenario: makeScenario(id, cats),
    covered,
    matchedTests: covered ? ['some test'] : [],
  });

  it('computes total, covered and percentage correctly', () => {
    const coverages = [
      makeCoverage('a', ['missing-parameter'], true),
      makeCoverage('b', ['invalid-value'], true),
      makeCoverage('c', ['not-found'], false),
      makeCoverage('d', ['unauthorized'], false),
    ];
    const report = buildErrorCoverageReport(coverages);
    expect(report.total).toBe(4);
    expect(report.covered).toBe(2);
    expect(report.percentage).toBe(50);
  });

  it('handles 100% coverage', () => {
    const coverages = [
      makeCoverage('a', ['missing-parameter'], true),
      makeCoverage('b', ['invalid-value'], true),
    ];
    const report = buildErrorCoverageReport(coverages);
    expect(report.percentage).toBe(100);
  });

  it('handles 0% coverage (empty list)', () => {
    const report = buildErrorCoverageReport([]);
    expect(report.total).toBe(0);
    expect(report.covered).toBe(0);
    expect(report.percentage).toBe(0);
  });

  it('builds category summary totals correctly', () => {
    const coverages = [
      makeCoverage('a', ['missing-parameter'], true),
      makeCoverage('b', ['missing-parameter'], false),
      makeCoverage('c', ['unauthorized'], true),
    ];
    const report = buildErrorCoverageReport(coverages);
    expect(report.categorySummary['missing-parameter'].total).toBe(2);
    expect(report.categorySummary['missing-parameter'].covered).toBe(1);
    expect(report.categorySummary['unauthorized'].total).toBe(1);
    expect(report.categorySummary['unauthorized'].covered).toBe(1);
    expect(report.categorySummary['not-found'].total).toBe(0);
  });

  it('scenario with multiple categories increments each', () => {
    const coverages = [
      makeCoverage('a', ['missing-parameter', 'invalid-value'], true),
    ];
    const report = buildErrorCoverageReport(coverages);
    expect(report.categorySummary['missing-parameter'].total).toBe(1);
    expect(report.categorySummary['invalid-value'].total).toBe(1);
  });
});

// ─── generateErrorReports ────────────────────────────────────────────────────

describe('generateErrorReports', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'err-cov-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const sampleCoverage: ErrorScenarioCoverage[] = [
    {
      scenario: {
        id: 'POST /users:400',
        endpoint: 'POST /users',
        method: 'POST',
        path: '/users',
        statusCode: 400,
        description: 'Bad request',
        categories: ['missing-parameter', 'invalid-value'],
      },
      covered: true,
      matchedTests: ['POST /users - missing name returns 400'],
    },
    {
      scenario: {
        id: 'POST /users:404',
        endpoint: 'POST /users',
        method: 'POST',
        path: '/users',
        statusCode: 404,
        description: 'Not found',
        categories: ['not-found'],
      },
      covered: false,
      matchedTests: [],
    },
  ];

  it('creates the reports directory if it does not exist', () => {
    const newDir = path.join(tmpDir, 'new-reports');
    generateErrorReports(buildErrorCoverageReport(sampleCoverage), newDir);
    expect(fs.existsSync(newDir)).toBe(true);
  });

  it('writes error-coverage.json with correct structure', () => {
    const report = buildErrorCoverageReport(sampleCoverage);
    generateErrorReports(report, tmpDir);

    const jsonPath = path.join(tmpDir, 'error-coverage.json');
    expect(fs.existsSync(jsonPath)).toBe(true);

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    expect(data.total).toBe(2);
    expect(data.covered).toBe(1);
    expect(data.percentage).toBe(50);
    expect(data.scenarios).toHaveLength(2);
    expect(data.scenarios[0].id).toBe('POST /users:400');
    expect(data.scenarios[0].covered).toBe(true);
    expect(data.scenarios[1].covered).toBe(false);
  });

  it('writes error-coverage.html with a table and category summary', () => {
    const report = buildErrorCoverageReport(sampleCoverage);
    generateErrorReports(report, tmpDir);

    const htmlPath = path.join(tmpDir, 'error-coverage.html');
    expect(fs.existsSync(htmlPath)).toBe(true);

    const html = fs.readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('<table>');
    expect(html).toContain('POST /users');
    expect(html).toContain('400');
    expect(html).toContain('missing-parameter');
    expect(html).toContain('Category Summary');
    expect(html).toContain('Covered:');
  });
});

// ─── end-to-end: sample spec + sample tests ───────────────────────────────────

describe('end-to-end: sample spec + sample tests', () => {
  it('achieves > 0% coverage with the provided sample tests', async () => {
    const scenarios = await parseErrorScenarios(SAMPLE_SPEC);
    const coverages = await analyzeErrorCoverage(scenarios, SAMPLE_TESTS_GLOB);
    const report = buildErrorCoverageReport(coverages);

    expect(report.total).toBe(16);
    expect(report.covered).toBeGreaterThan(0);
    expect(report.percentage).toBeGreaterThan(0);
  });

  it('covers a majority of error scenarios with the sample tests', async () => {
    const scenarios = await parseErrorScenarios(SAMPLE_SPEC);
    const coverages = await analyzeErrorCoverage(scenarios, SAMPLE_TESTS_GLOB);
    const report = buildErrorCoverageReport(coverages);

    // The sample test file has tests for most of the 16 scenarios
    expect(report.percentage).toBeGreaterThan(50);
  });

  it('covers all expected error categories', async () => {
    const scenarios = await parseErrorScenarios(SAMPLE_SPEC);
    const coverages = await analyzeErrorCoverage(scenarios, SAMPLE_TESTS_GLOB);
    const report = buildErrorCoverageReport(coverages);

    // Every major category should have at least one covered scenario
    const coveredCats = Object.entries(report.categorySummary)
      .filter(([, s]) => s.covered > 0)
      .map(([cat]) => cat);

    expect(coveredCats).toContain('missing-parameter');
    expect(coveredCats).toContain('invalid-value');
    expect(coveredCats).toContain('unauthorized');
    expect(coveredCats).toContain('forbidden');
    expect(coveredCats).toContain('not-found');
    expect(coveredCats).toContain('conflict');
    expect(coveredCats).toContain('server-error');
  });

  it('does NOT mark unrelated endpoints as covered by a test', async () => {
    const scenarios = await parseErrorScenarios(SAMPLE_SPEC);
    const coverages = await analyzeErrorCoverage(scenarios, SAMPLE_TESTS_GLOB);

    // Tests for POST /users should not cover GET /items scenarios
    const itemsScenarios = coverages.filter((c) =>
      c.scenario.endpoint === 'GET /items' && c.covered,
    );
    const postUsersTests = itemsScenarios.flatMap((c) => c.matchedTests);
    // Covered GET /items tests must mention /items, not just /users
    postUsersTests.forEach((t) => {
      expect(t.toLowerCase()).toContain('/items');
    });
  });
});
