/**
 * Integration tests for the AST analysis pipeline.
 *
 * These tests exercise the full stack:
 *   parseOpenApiSpec → analyzeTestCoverage (with AST enabled) → buildCoverageReport
 *
 * Fixtures are small inline definitions — no files on disk required.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  analyzeTestCoverage,
  buildCoverageReport,
  type Endpoint,
  type EndpointCoverage,
} from '../../../src/endpointCoverage';
import { buildAnalysisContext } from '../../../src/ast/astAnalysisOrchestrator';
import { DEFAULT_DEEP_ANALYSIS_CONFIG } from '../../../src/coverage/deep-analysis/types';

// Make sure all language analyzers are loaded
import '../../../src/languages/javascript/index';
import '../../../src/languages/typescript/index';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ast-integration-'));
}

function writeFile(dir: string, name: string, content: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

const ctx = buildAnalysisContext({ enabled: true });

const sampleEndpoints: Endpoint[] = [
  { method: 'GET', path: '/users', pathRegex: /^\/users$/ },
  { method: 'POST', path: '/users', pathRegex: /^\/users$/ },
  { method: 'GET', path: '/orders', pathRegex: /^\/orders$/ },
  { method: 'DELETE', path: '/users/{id}', pathRegex: /^\/users\/[^\\/]+$/ },
];

// ─── JavaScript test file coverage ───────────────────────────────────────────

describe('AST integration: JavaScript test files', () => {
  let dir: string;

  beforeAll(() => {
    dir = tmpDir();
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('detects coverage from direct axios.get calls', async () => {
    writeFile(
      dir,
      'users.test.js',
      `
        axios.get('/users');
        axios.post('/users');
      `,
    );

    const coverage = await analyzeTestCoverage(
      sampleEndpoints,
      path.join(dir, '*.test.js'),
      ['javascript'],
      { ...DEFAULT_DEEP_ANALYSIS_CONFIG, enabled: true },
      ctx.astConfig,
    );

    const report = buildCoverageReport(coverage);
    expect(report.covered).toBeGreaterThanOrEqual(2);
  });

  it('detects coverage from constant-resolved URLs', async () => {
    const constDir = tmpDir();

    writeFile(
      constDir,
      'api.test.js',
      `
        const ORDERS_PATH = '/orders';
        axios.get(ORDERS_PATH);
      `,
    );

    const coverage = await analyzeTestCoverage(
      sampleEndpoints,
      path.join(constDir, '*.test.js'),
      ['javascript'],
      { ...DEFAULT_DEEP_ANALYSIS_CONFIG, enabled: true },
      ctx.astConfig,
    );

    const ordersEp = coverage.find((ep: EndpointCoverage) => ep.path === '/orders' && ep.method === 'GET');
    expect(ordersEp?.covered).toBe(true);

    fs.rmSync(constDir, { recursive: true, force: true });
  });

  it('correctly marks uncovered endpoints as not covered', async () => {
    const onlyGetDir = tmpDir();

    writeFile(
      onlyGetDir,
      'partial.test.js',
      `axios.get('/users');`, // Only GET /users — DELETE not covered
    );

    const coverage = await analyzeTestCoverage(
      sampleEndpoints,
      path.join(onlyGetDir, '*.test.js'),
      ['javascript'],
      { ...DEFAULT_DEEP_ANALYSIS_CONFIG, enabled: true },
      ctx.astConfig,
    );

    const deleteEp = coverage.find((ep: EndpointCoverage) => ep.path === '/users/{id}' && ep.method === 'DELETE');
    expect(deleteEp?.covered).toBe(false);

    fs.rmSync(onlyGetDir, { recursive: true, force: true });
  });

  it('builds a valid coverage report with percentage between 0 and 100', async () => {
    writeFile(
      dir,
      'full.test.js',
      `
        axios.get('/users');
        axios.post('/users');
        axios.get('/orders');
        axios.delete('/users/123');
      `,
    );

    const coverage = await analyzeTestCoverage(
      sampleEndpoints,
      path.join(dir, 'full.test.js'),
      ['javascript'],
      { ...DEFAULT_DEEP_ANALYSIS_CONFIG, enabled: true },
      ctx.astConfig,
    );

    const report = buildCoverageReport(coverage);
    expect(report.percentage).toBeGreaterThanOrEqual(0);
    expect(report.percentage).toBeLessThanOrEqual(100);
    expect(report.total).toBe(sampleEndpoints.length);
  });
});

// ─── TypeScript test file coverage ───────────────────────────────────────────

describe('AST integration: TypeScript test files', () => {
  it('detects coverage from TypeScript test files with type annotations', async () => {
    const dir = tmpDir();

    writeFile(
      dir,
      'users.test.ts',
      `
        import axios from 'axios';
        const path: string = '/users';
        it('gets users', async () => {
          const res = await axios.get(path);
          expect(res.status).toBe(200);
        });
      `,
    );

    const coverage = await analyzeTestCoverage(
      sampleEndpoints,
      path.join(dir, '*.test.ts'),
      ['typescript'],
      { ...DEFAULT_DEEP_ANALYSIS_CONFIG, enabled: true },
      ctx.astConfig,
    );

    const usersGet = coverage.find((ep: EndpointCoverage) => ep.path === '/users' && ep.method === 'GET');
    expect(usersGet?.covered).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
