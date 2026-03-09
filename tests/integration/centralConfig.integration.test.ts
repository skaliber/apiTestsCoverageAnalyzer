/**
 * tests/integration/centralConfig.integration.test.ts
 *
 * Integration tests for the central config system (spec section 10.2).
 * Verifies end-to-end behavior: config loading, warning emission,
 * and the AnalyzerConfig structure delivered to scan callers.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig } from '../../src/config/loadConfig';
import { DEFAULT_CONFIG } from '../../src/config/defaultConfig';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aca-integ-'));
}

function writeConfig(dir: string, content: string): void {
  fs.writeFileSync(path.join(dir, 'config.yaml'), content, 'utf-8');
}

function withCwd<T>(dir: string, fn: () => T): T {
  const orig = process.cwd();
  process.chdir(dir);
  try { return fn(); }
  finally { process.chdir(orig); }
}

// ─── No config present ────────────────────────────────────────────────────────

describe('analyze with no config.yaml present', () => {
  let tmpDir: string;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('emits the required warning message', () => {
    withCwd(tmpDir, () => loadConfig());
    const written = (stderrSpy.mock.calls as string[][]).map((c) => c.join('')).join('');
    expect(written).toContain('[WARNING] No config.yaml found at project root.');
    expect(written).toContain('Running full default analysis profile.');
    expect(written).toContain('docs/guides/configuration.md');
  });

  it('returns config with all coverage types enabled', () => {
    const result = withCwd(tmpDir, () => loadConfig());
    expect(result.scans.coverage?.enabled).toBe(true);
    expect(result.scans.coverage?.types).toContain('endpoint');
    expect(result.scans.coverage?.types).toContain('parameter');
    expect(result.scans.coverage?.types).toContain('security');
  });

  it('returns config with MCP disabled (safe default)', () => {
    const result = withCwd(tmpDir, () => loadConfig());
    expect(result.mcp.enabled).toBe(false);
  });

  it('returns config with all intelligence types enabled', () => {
    const result = withCwd(tmpDir, () => loadConfig());
    expect(result.scans.intelligence?.enabled).toBe(true);
    expect(result.scans.intelligence?.types).toContain('ai-summary');
    expect(result.scans.intelligence?.types).toContain('recommendations');
  });
});

// ─── Config with root config.yaml ────────────────────────────────────────────

describe('analyze with root config.yaml', () => {
  let tmpDir: string;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads config without emitting missing-config warning', () => {
    writeConfig(tmpDir, 'version: 1\n');
    withCwd(tmpDir, () => loadConfig());
    const written = (stderrSpy.mock.calls as string[][]).map((c) => c.join('')).join('');
    expect(written).not.toContain('[WARNING] No config.yaml found');
  });

  it('loads thresholds from config instead of defaults', () => {
    writeConfig(tmpDir, 'version: 1\nthresholds:\n  global: 95\n  endpoint: 90\n');
    const result = withCwd(tmpDir, () => loadConfig());
    expect(result.thresholds.global).toBe(95);
    expect(result.thresholds.endpoint).toBe(90);
  });
});

// ─── Custom --config path ─────────────────────────────────────────────────────

describe('analyze --config ./custom.yaml', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads from specified file path', () => {
    const customPath = path.join(tmpDir, 'custom.yaml');
    fs.writeFileSync(customPath, 'version: 1\nproject:\n  name: custom\n', 'utf-8');
    const result = loadConfig(customPath);
    expect(result.project.name).toBe('custom');
  });

  it('fails clearly when specified path does not exist', () => {
    const badPath = path.join(tmpDir, 'nonexistent.yaml');
    expect(() => loadConfig(badPath)).toThrow(/not found/i);
  });
});

// ─── Scans disabled by config ─────────────────────────────────────────────────

describe('config with specific scan types disabled', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('config with scans.coverage.types: [endpoint] limits coverage types', () => {
    writeConfig(tmpDir, `version: 1\nscans:\n  coverage:\n    types:\n      - endpoint\n`);
    const result = withCwd(tmpDir, () => loadConfig());
    expect(result.scans.coverage?.types).toEqual(['endpoint']);
    expect(result.scans.coverage?.types).not.toContain('parameter');
  });

  it('config with scans.security.enabled: false disables security scans', () => {
    writeConfig(tmpDir, `version: 1\nscans:\n  security:\n    enabled: false\n`);
    const result = withCwd(tmpDir, () => loadConfig());
    expect(result.scans.security?.enabled).toBe(false);
  });

  it('config with scans.intelligence.enabled: false disables AI analysis', () => {
    writeConfig(tmpDir, `version: 1\nscans:\n  intelligence:\n    enabled: false\n`);
    const result = withCwd(tmpDir, () => loadConfig());
    expect(result.scans.intelligence?.enabled).toBe(false);
  });

  it('config with mcp.enabled: false keeps MCP disabled', () => {
    writeConfig(tmpDir, `version: 1\nmcp:\n  enabled: false\n`);
    const result = withCwd(tmpDir, () => loadConfig());
    expect(result.mcp.enabled).toBe(false);
  });
});

// ─── Threshold enforcement ────────────────────────────────────────────────────

describe('config thresholds vs actual coverage', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('config with threshold of 100 yields 100 in resolved config', () => {
    writeConfig(tmpDir, `version: 1\nthresholds:\n  endpoint: 100\n`);
    const result = withCwd(tmpDir, () => loadConfig());
    expect(result.thresholds.endpoint).toBe(100);
  });

  it('config with threshold of 0 yields 0 (boundary value)', () => {
    writeConfig(tmpDir, `version: 1\nthresholds:\n  endpoint: 0\n`);
    const result = withCwd(tmpDir, () => loadConfig());
    expect(result.thresholds.endpoint).toBe(0);
  });
});
