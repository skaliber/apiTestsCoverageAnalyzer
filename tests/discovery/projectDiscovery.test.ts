import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { discoverProject } from '../../src/discovery/projectDiscovery';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeTempProject(structure: Record<string, string>): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qintel-discovery-'));
  for (const [relPath, content] of Object.entries(structure)) {
    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }
  return tmpDir;
}

function cleanTempProject(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ─── discoverProject ─────────────────────────────────────────────────────────

describe('discoverProject — spec discovery', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempProject({
      'openapi.yaml': 'openapi: 3.0.0',
      'src/userService.ts': 'export function getUser() {}',
      'src/users.test.ts': 'test("it works", () => {})',
    });
  });

  afterEach(() => cleanTempProject(tmpDir));

  it('finds openapi.yaml', () => {
    const result = discoverProject({ rootDir: tmpDir });
    expect(result.specs.length).toBeGreaterThanOrEqual(1);
    expect(result.specs.some((s) => s.endsWith('openapi.yaml'))).toBe(true);
  });

  it('puts openapi.yaml in discoverySource as discovered', () => {
    const result = discoverProject({ rootDir: tmpDir });
    expect(result.discoverySource.specs).toBe('discovered');
  });

  it('respects explicitSpecs override', () => {
    const explicit = ['/explicit/openapi.yaml'];
    const result = discoverProject({ rootDir: tmpDir, explicitSpecs: explicit });
    expect(result.specs).toEqual(explicit);
    expect(result.discoverySource.specs).toBe('explicit');
  });
});

describe('discoverProject — test file discovery', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempProject({
      'src/users.test.ts': 'test("gets user", () => {})',
      'src/payments.spec.ts': 'describe("payments", () => {})',
      'features/login.feature': 'Feature: Login',
      'src/userService.ts': 'export function createUser() {}',
      'openapi.yaml': 'openapi: 3.0.0',
    });
  });

  afterEach(() => cleanTempProject(tmpDir));

  it('discovers test files', () => {
    const result = discoverProject({ rootDir: tmpDir });
    expect(result.testFiles.length).toBeGreaterThanOrEqual(2);
  });

  it('discovers feature files', () => {
    const result = discoverProject({ rootDir: tmpDir });
    expect(result.featureFiles.some((f) => f.endsWith('login.feature'))).toBe(true);
  });

  it('includes feature files in testFiles', () => {
    const result = discoverProject({ rootDir: tmpDir });
    expect(result.testFiles.some((f) => f.endsWith('login.feature'))).toBe(true);
  });

  it('respects explicitTests override', () => {
    const explicit = ['/explicit/api.test.ts'];
    const result = discoverProject({ rootDir: tmpDir, explicitTests: explicit });
    expect(result.testFiles).toEqual(explicit);
    expect(result.discoverySource.testFiles).toBe('explicit');
  });
});

describe('discoverProject — service code discovery', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempProject({
      'src/userService.ts': 'export function createUser() {}',
      'src/paymentService.ts': 'export function processPayment() {}',
      'src/users.test.ts': 'test("works", () => {})',
    });
  });

  afterEach(() => cleanTempProject(tmpDir));

  it('discovers service code files', () => {
    const result = discoverProject({ rootDir: tmpDir });
    expect(result.serviceFiles.length).toBeGreaterThanOrEqual(1);
    expect(result.serviceFiles.some((f) => f.endsWith('userService.ts'))).toBe(true);
  });

  it('does not include test files in serviceFiles', () => {
    const result = discoverProject({ rootDir: tmpDir });
    expect(result.serviceFiles.every((f) => !f.endsWith('.test.ts'))).toBe(true);
  });
});

describe('discoverProject — language detection', () => {
  let tmpDir: string;

  afterEach(() => cleanTempProject(tmpDir));

  it('detects TypeScript project via package.json', () => {
    tmpDir = makeTempProject({
      'package.json': '{"name": "test"}',
      'src/app.ts': 'export const x = 1;',
    });
    const result = discoverProject({ rootDir: tmpDir });
    expect(result.languages).toContain('typescript');
  });

  it('detects Java project via pom.xml', () => {
    tmpDir = makeTempProject({
      'pom.xml': '<project></project>',
      'src/main/UserService.java': 'public class UserService {}',
    });
    const result = discoverProject({ rootDir: tmpDir });
    expect(result.languages).toContain('java');
  });

  it('detects Python project via requirements.txt', () => {
    tmpDir = makeTempProject({
      'requirements.txt': 'fastapi==0.100.0',
      'app/main.py': 'from fastapi import FastAPI',
    });
    const result = discoverProject({ rootDir: tmpDir });
    expect(result.languages).toContain('python');
  });
});

describe('discoverProject — security and performance artifact discovery', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempProject({
      'zap/zap-report.json': '{"site": []}',
      'jmeter/results.jtl': 'timestamp,elapsed',
      'k6/summary.json': '{"metrics": {}}',
      'contracts/api-consumer.pact.json': '{}',
      'src/app.ts': 'export const app = 1;',
    });
  });

  afterEach(() => cleanTempProject(tmpDir));

  it('discovers security report files', () => {
    const result = discoverProject({ rootDir: tmpDir });
    expect(result.securityReportFiles.some((f) => f.includes('zap'))).toBe(true);
  });

  it('discovers performance artifact files', () => {
    const result = discoverProject({ rootDir: tmpDir });
    const perf = result.performanceFiles;
    expect(perf.some((f) => f.includes('jmeter') || f.includes('k6'))).toBe(true);
  });

  it('discovers contract files', () => {
    const result = discoverProject({ rootDir: tmpDir });
    expect(result.contractFiles.some((f) => f.endsWith('.pact.json'))).toBe(true);
  });
});

describe('discoverProject — excludeDirs', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempProject({
      'node_modules/lodash/index.js': 'module.exports = {}',
      'src/app.ts': 'export const x = 1;',
    });
  });

  afterEach(() => cleanTempProject(tmpDir));

  it('excludes node_modules by default', () => {
    const result = discoverProject({ rootDir: tmpDir });
    expect(result.allFiles.every((f) => !f.filePath.includes('node_modules'))).toBe(true);
  });
});
