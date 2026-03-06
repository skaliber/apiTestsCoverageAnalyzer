import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { OpenAPIV3 } from 'openapi-types';
import {
  loadSpec,
  compareSpecs,
  parseContractFiles,
  verifyContracts,
  buildCompatibilityReport,
  generateCompatibilityReports,
  computeCompatibilityPercent,
  computeContractCoveragePercent,
  EndpointChange,
  ConsumerContract,
} from '../src/compatibilityCoverage';

const SAMPLE_V1 = path.resolve(__dirname, '../sample/v1.yaml');
const SAMPLE_V2 = path.resolve(__dirname, '../sample/v2.yaml');
const SAMPLE_CONTRACTS_DIR = path.resolve(__dirname, '../sample/contracts');

/** Build a minimal valid OpenAPIV3.Document for use in tests. */
function makeEmptySpec(version = '0.0.1'): OpenAPIV3.Document {
  return {
    openapi: '3.0.0',
    info: { title: 'Empty', version },
    paths: {},
  };
}

// ─── loadSpec ─────────────────────────────────────────────────────────────────

describe('loadSpec', () => {
  it('loads and parses v1.yaml', async () => {
    const api = await loadSpec(SAMPLE_V1);
    expect(api).toBeDefined();
    expect(api.info.version).toBe('1.0.0');
    expect(api.paths).toBeDefined();
  });

  it('loads and parses v2.yaml', async () => {
    const api = await loadSpec(SAMPLE_V2);
    expect(api).toBeDefined();
    expect(api.info.version).toBe('2.0.0');
    expect(api.paths).toBeDefined();
  });

  it('throws for a non-existent spec file', async () => {
    await expect(loadSpec('/nonexistent/spec.yaml')).rejects.toThrow();
  });
});

// ─── compareSpecs ─────────────────────────────────────────────────────────────

describe('compareSpecs', () => {
  it('detects removed endpoints as breaking changes', async () => {
    const oldApi = await loadSpec(SAMPLE_V1);
    const newApi = await loadSpec(SAMPLE_V2);
    const changes = compareSpecs(oldApi, newApi);

    const removed = changes.filter((c) => c.changeType === 'removed');
    // /products was in v1 but not in v2 as a standalone endpoint... wait let me check
    // v2 has /products added in v2.yaml actually - v1 has it too
    // Let me check: v1 has GET /products, v2 also has GET /products (added in v2)
    // v1 has GET /users, POST /users, GET /users/{id}, PUT /users/{id}, DELETE /users/{id}, GET /products
    // v2 has GET /users, POST /users, GET /users/{id}, PUT /users/{id}, DELETE /users/{id}, GET /users/{id}/profile, GET /orders
    // so DELETE /users/{id} is in v1 and v2, GET /products is removed in v2 - wait no
    // Actually v2.yaml has GET /orders and GET /users/{id}/profile added, GET /products REMOVED
    const removedEndpoints = removed.map((c) => `${c.method}:${c.path}`);
    expect(removedEndpoints).toContain('get:/products');
  });

  it('detects added endpoints as non-breaking', async () => {
    const oldApi = await loadSpec(SAMPLE_V1);
    const newApi = await loadSpec(SAMPLE_V2);
    const changes = compareSpecs(oldApi, newApi);

    const added = changes.filter((c) => c.changeType === 'added');
    expect(added.every((c) => !c.breaking)).toBe(true);
    const addedPaths = added.map((c) => c.path);
    expect(addedPaths).toContain('/users/{id}/profile');
    expect(addedPaths).toContain('/orders');
  });

  it('detects parameter type changes as breaking', async () => {
    const oldApi = await loadSpec(SAMPLE_V1);
    const newApi = await loadSpec(SAMPLE_V2);
    const changes = compareSpecs(oldApi, newApi);

    // GET /users/{id}: id changed from integer to string in v2
    const paramChanges = changes.filter(
      (c) => c.changeType === 'changed-parameter' && c.path === '/users/{id}' && c.breaking,
    );
    expect(paramChanges.length).toBeGreaterThan(0);
  });

  it('classifies breaking changes correctly', async () => {
    const oldApi = await loadSpec(SAMPLE_V1);
    const newApi = await loadSpec(SAMPLE_V2);
    const changes = compareSpecs(oldApi, newApi);

    const breaking = changes.filter((c) => c.breaking);
    expect(breaking.length).toBeGreaterThan(0);
    for (const c of breaking) {
      expect(['removed', 'changed-parameter', 'changed-response-codes', 'changed-schema']).toContain(
        c.changeType,
      );
    }
  });

  it('returns no changes for identical specs', async () => {
    const api = await loadSpec(SAMPLE_V1);
    const changes = compareSpecs(api, api);
    expect(changes).toHaveLength(0);
  });

  it('handles an empty new spec (all endpoints removed)', async () => {
    const oldApi = await loadSpec(SAMPLE_V1);
    const emptyApi = makeEmptySpec();
    const changes = compareSpecs(oldApi, emptyApi);
    const removed = changes.filter((c) => c.changeType === 'removed');
    expect(removed.length).toBeGreaterThan(0);
    expect(removed.every((c) => c.breaking)).toBe(true);
  });
});

// ─── parseContractFiles ───────────────────────────────────────────────────────

describe('parseContractFiles', () => {
  it('loads contracts from a directory', async () => {
    const contracts = await parseContractFiles(SAMPLE_CONTRACTS_DIR);
    expect(contracts.length).toBeGreaterThanOrEqual(2);
  });

  it('each contract has consumer, provider, and interactions', async () => {
    const contracts = await parseContractFiles(SAMPLE_CONTRACTS_DIR);
    for (const c of contracts) {
      expect(c.consumer).toBeTruthy();
      expect(c.provider).toBeTruthy();
      expect(Array.isArray(c.interactions)).toBe(true);
    }
  });

  it('parses interaction fields correctly', async () => {
    const contracts = await parseContractFiles(SAMPLE_CONTRACTS_DIR);
    const userContract = contracts.find((c) => c.consumer === 'UserServiceClient');
    expect(userContract).toBeDefined();
    expect(userContract!.interactions.length).toBe(3);
    const listUsers = userContract!.interactions.find((i) => i.description === 'a request to list users');
    expect(listUsers).toBeDefined();
    expect(listUsers!.method).toBe('get');
    expect(listUsers!.path).toBe('/users');
    expect(listUsers!.expectedStatus).toBe(200);
  });

  it('returns empty array for a directory with no JSON files', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contracts-empty-'));
    const contracts = await parseContractFiles(tmpDir);
    expect(contracts).toHaveLength(0);
    fs.rmdirSync(tmpDir);
  });

  it('parses contracts from a glob pattern', async () => {
    const pattern = path.join(SAMPLE_CONTRACTS_DIR, '*.json').replace(/\\/g, '/');
    const contracts = await parseContractFiles(pattern);
    expect(contracts.length).toBeGreaterThanOrEqual(2);
  });

  it('ignores invalid JSON files', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contracts-bad-'));
    fs.writeFileSync(path.join(tmpDir, 'bad.json'), 'not valid json', 'utf-8');
    const contracts = await parseContractFiles(tmpDir);
    expect(contracts).toHaveLength(0);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ─── verifyContracts ──────────────────────────────────────────────────────────

describe('verifyContracts', () => {
  it('passes contracts whose interactions match the new spec', async () => {
    const newApi = await loadSpec(SAMPLE_V2);
    const contracts = await parseContractFiles(SAMPLE_CONTRACTS_DIR);
    const userContract = contracts.filter((c) => c.consumer === 'UserServiceClient');
    const results = verifyContracts(userContract, newApi);
    expect(results.length).toBe(1);
    // All user endpoints (GET /users, POST /users, GET /users/{id}) exist in v2
    expect(results[0].passed).toBe(true);
  });

  it('fails contracts for endpoints not present in the new spec', async () => {
    const newApi = await loadSpec(SAMPLE_V2);
    const missingContract: ConsumerContract = {
      consumer: 'TestConsumer',
      provider: 'TestProvider',
      filePath: '/tmp/test.json',
      interactions: [
        {
          description: 'a request to a deleted endpoint',
          method: 'get',
          path: '/products',
          expectedStatus: 200,
        },
      ],
    };
    const results = verifyContracts([missingContract], newApi);
    expect(results[0].passed).toBe(false);
    expect(results[0].interactionResults[0].reason).toContain('/products');
  });

  it('fails contracts when expected response code is absent from spec', async () => {
    const newApi = await loadSpec(SAMPLE_V2);
    const badStatusContract: ConsumerContract = {
      consumer: 'TestConsumer',
      provider: 'TestProvider',
      filePath: '/tmp/test2.json',
      interactions: [
        {
          description: 'unexpected status code interaction',
          method: 'get',
          path: '/users',
          expectedStatus: 418,
        },
      ],
    };
    const results = verifyContracts([badStatusContract], newApi);
    expect(results[0].passed).toBe(false);
    expect(results[0].interactionResults[0].reason).toContain('418');
  });

  it('returns empty array for no contracts', async () => {
    const newApi = await loadSpec(SAMPLE_V2);
    const results = verifyContracts([], newApi);
    expect(results).toHaveLength(0);
  });

  it('matches path parameters in contracts using real path values', async () => {
    const newApi = await loadSpec(SAMPLE_V2);
    const contract: ConsumerContract = {
      consumer: 'TestConsumer',
      provider: 'TestProvider',
      filePath: '/tmp/test3.json',
      interactions: [
        {
          description: 'get user by id with actual id value',
          method: 'get',
          path: '/users/42',
          expectedStatus: 200,
        },
      ],
    };
    const results = verifyContracts([contract], newApi);
    // /users/42 should match /users/{id}
    expect(results[0].passed).toBe(true);
  });
});

// ─── computeCompatibilityPercent ─────────────────────────────────────────────

describe('computeCompatibilityPercent', () => {
  it('returns 100 when there are no breaking changes', () => {
    expect(computeCompatibilityPercent(5, [])).toBe(100);
  });

  it('returns 100 when there are no old endpoints', () => {
    expect(computeCompatibilityPercent(0, [])).toBe(100);
  });

  it('returns correct percentage with some breaking changes', () => {
    const breaking: EndpointChange[] = [
      { method: 'get', path: '/a', changeType: 'removed', breaking: true, description: '' },
      { method: 'post', path: '/b', changeType: 'removed', breaking: true, description: '' },
    ];
    expect(computeCompatibilityPercent(4, breaking)).toBe(50);
  });

  it('returns 0 when all old endpoints have breaking changes', () => {
    const breaking: EndpointChange[] = [
      { method: 'get', path: '/a', changeType: 'removed', breaking: true, description: '' },
      { method: 'get', path: '/b', changeType: 'removed', breaking: true, description: '' },
    ];
    expect(computeCompatibilityPercent(2, breaking)).toBe(0);
  });

  it('ignores added endpoints (non-breaking) in breaking change list', () => {
    const changes: EndpointChange[] = [
      { method: 'get', path: '/new', changeType: 'added', breaking: false, description: '' },
    ];
    // added is non-breaking, should not count against compatibility
    expect(computeCompatibilityPercent(5, changes.filter((c) => c.breaking))).toBe(100);
  });
});

// ─── computeContractCoveragePercent ──────────────────────────────────────────

describe('computeContractCoveragePercent', () => {
  it('returns 100 when spec has no endpoints', async () => {
    const emptyApi = makeEmptySpec();
    const result = computeContractCoveragePercent([], emptyApi);
    expect(result.coveragePercent).toBe(100);
    expect(result.totalEndpoints).toBe(0);
    expect(result.coveredEndpoints).toBe(0);
  });

  it('returns 0 when no contracts provided', async () => {
    const newApi = await loadSpec(SAMPLE_V2);
    const result = computeContractCoveragePercent([], newApi);
    expect(result.coveragePercent).toBe(0);
    expect(result.coveredEndpoints).toBe(0);
    expect(result.totalEndpoints).toBeGreaterThan(0);
  });

  it('counts endpoints covered by at least one interaction', async () => {
    const newApi = await loadSpec(SAMPLE_V2);
    const contracts = await parseContractFiles(SAMPLE_CONTRACTS_DIR);
    const result = computeContractCoveragePercent(contracts, newApi);
    expect(result.coveredEndpoints).toBeGreaterThan(0);
    expect(result.totalEndpoints).toBeGreaterThan(0);
    expect(result.coveragePercent).toBeGreaterThanOrEqual(0);
    expect(result.coveragePercent).toBeLessThanOrEqual(100);
  });
});

// ─── buildCompatibilityReport ─────────────────────────────────────────────────

describe('buildCompatibilityReport', () => {
  it('builds a report with correct structure', async () => {
    const oldApi = await loadSpec(SAMPLE_V1);
    const newApi = await loadSpec(SAMPLE_V2);
    const changes = compareSpecs(oldApi, newApi);
    const contracts = await parseContractFiles(SAMPLE_CONTRACTS_DIR);
    const verificationResults = verifyContracts(contracts, newApi);
    const report = buildCompatibilityReport(oldApi, newApi, changes, verificationResults, SAMPLE_V1, SAMPLE_V2);

    expect(report.generatedAt).toBeTruthy();
    expect(report.oldSpecPath).toBe(SAMPLE_V1);
    expect(report.newSpecPath).toBe(SAMPLE_V2);
    expect(typeof report.compatibilityPercent).toBe('number');
    expect(typeof report.contractCoveragePercent).toBe('number');
    expect(Array.isArray(report.breakingChanges)).toBe(true);
    expect(Array.isArray(report.nonBreakingChanges)).toBe(true);
    expect(Array.isArray(report.contractVerificationResults)).toBe(true);
  });

  it('correctly separates breaking and non-breaking changes', async () => {
    const oldApi = await loadSpec(SAMPLE_V1);
    const newApi = await loadSpec(SAMPLE_V2);
    const changes = compareSpecs(oldApi, newApi);
    const report = buildCompatibilityReport(oldApi, newApi, changes, [], SAMPLE_V1, SAMPLE_V2);

    for (const c of report.breakingChanges) {
      expect(c.breaking).toBe(true);
    }
    for (const c of report.nonBreakingChanges) {
      expect(c.breaking).toBe(false);
    }
  });
});

// ─── generateCompatibilityReports ────────────────────────────────────────────

describe('generateCompatibilityReports', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compat-reports-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('writes JSON and HTML report files', async () => {
    const oldApi = await loadSpec(SAMPLE_V1);
    const newApi = await loadSpec(SAMPLE_V2);
    const changes = compareSpecs(oldApi, newApi);
    const contracts = await parseContractFiles(SAMPLE_CONTRACTS_DIR);
    const verificationResults = verifyContracts(contracts, newApi);
    const report = buildCompatibilityReport(oldApi, newApi, changes, verificationResults, SAMPLE_V1, SAMPLE_V2);

    generateCompatibilityReports(report, tmpDir);

    expect(fs.existsSync(path.join(tmpDir, 'compatibility-contracts.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'compatibility-contracts.html'))).toBe(true);
  });

  it('JSON report contains expected keys', async () => {
    const oldApi = await loadSpec(SAMPLE_V1);
    const newApi = await loadSpec(SAMPLE_V2);
    const changes = compareSpecs(oldApi, newApi);
    const report = buildCompatibilityReport(oldApi, newApi, changes, [], SAMPLE_V1, SAMPLE_V2);

    generateCompatibilityReports(report, tmpDir);

    const json = JSON.parse(fs.readFileSync(path.join(tmpDir, 'compatibility-contracts.json'), 'utf-8'));
    expect(json).toHaveProperty('breakingChanges');
    expect(json).toHaveProperty('nonBreakingChanges');
    expect(json).toHaveProperty('contractVerificationResults');
    expect(json).toHaveProperty('compatibilityPercent');
    expect(json).toHaveProperty('contractCoveragePercent');
  });

  it('creates the reports directory if it does not exist', async () => {
    const newDir = path.join(tmpDir, 'new-subdir');
    const oldApi = await loadSpec(SAMPLE_V1);
    const newApi = await loadSpec(SAMPLE_V2);
    const changes = compareSpecs(oldApi, newApi);
    const report = buildCompatibilityReport(oldApi, newApi, changes, [], SAMPLE_V1, SAMPLE_V2);

    generateCompatibilityReports(report, newDir);

    expect(fs.existsSync(path.join(newDir, 'compatibility-contracts.json'))).toBe(true);
  });
});

// ─── threshold / exit code logic ──────────────────────────────────────────────

describe('threshold enforcement', () => {
  it('checkThresholds from reporting module works with compatibility results', () => {
    const { checkThresholds } = require('../src/reporting');
    const results = [
      { type: 'compatibility', totalItems: 10, coveredItems: 8, coveragePercent: 80, details: {} },
    ];
    // 80% meets 80% threshold
    expect(checkThresholds(results, { compatibility: 80 })).toHaveLength(0);
    // 80% does not meet 90% threshold
    const failures = checkThresholds(results, { compatibility: 90 });
    expect(failures.length).toBe(1);
    expect(failures[0]).toContain('compatibility');
  });
});
