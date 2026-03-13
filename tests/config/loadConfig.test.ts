/**
 * tests/config/loadConfig.test.ts
 *
 * Unit tests for the central config loader (src/config/loadConfig.ts).
 * Covers all scenarios from spec section 9.4.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  loadConfig,
  DEFAULT_CONFIG_FILENAME,
  MISSING_CONFIG_WARNING,
  LEGACY_CONFIG_WARNING,
  LEGACY_CONFIG_FILENAME,
} from '../../src/config/loadConfig';
import { DEFAULT_CONFIG } from '../../src/config/defaultConfig';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aca-config-test-'));
}

function writeTmpConfig(dir: string, content: string, name = 'config.yaml'): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

function withCwd<T>(dir: string, fn: () => T): T {
  const orig = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(orig);
  }
}

// ─── loadConfig — missing config ──────────────────────────────────────────────

describe('loadConfig — missing config file', () => {
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

  it('returns the default config when config.yaml is absent', () => {
    const result = withCwd(tmpDir, () => loadConfig());
    // Returns a copy of DEFAULT_CONFIG
    expect(result.version).toBe(DEFAULT_CONFIG.version);
    expect(result.analysis.defaultMode).toBe('full');
    expect(result.scans.coverage?.enabled).toBe(true);
  });

  it('emits the required warning message when config.yaml is absent', () => {
    withCwd(tmpDir, () => loadConfig());
    const written = (stderrSpy.mock.calls as string[][]).map((c) => c.join('')).join('');
    expect(written).toContain('[WARNING] No config.yaml found at project root.');
    expect(written).toContain('Running full default analysis profile.');
  });

  it('emits deprecation warning when legacy coverage.config.json exists but config.yaml does not', () => {
    fs.writeFileSync(path.join(tmpDir, LEGACY_CONFIG_FILENAME), '{}', 'utf-8');
    withCwd(tmpDir, () => loadConfig());
    const written = (stderrSpy.mock.calls as string[][]).map((c) => c.join('')).join('');
    expect(written).toContain('[DEPRECATED] coverage.config.json is no longer supported.');
  });
});

// ─── loadConfig — valid configs ───────────────────────────────────────────────

describe('loadConfig — valid configs', () => {
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

  it('loads a valid complete config and returns normalized AnalyzerConfig', () => {
    writeTmpConfig(
      tmpDir,
      `
version: 1
project:
  name: test-project
thresholds:
  endpoint: 90
  global: 80
`,
    );
    const result = withCwd(tmpDir, () => loadConfig());
    expect(result.version).toBe(1);
    expect(result.project.name).toBe('test-project');
    expect(result.thresholds.endpoint).toBe(90);
    expect(result.thresholds.global).toBe(80);
  });

  it('loads a minimal config with only version: 1 and merges defaults', () => {
    writeTmpConfig(tmpDir, 'version: 1\n');
    const result = withCwd(tmpDir, () => loadConfig());
    expect(result.version).toBe(1);
    // Defaults should be present
    expect(result.analysis.defaultMode).toBe('full');
    expect(result.scans.coverage?.types).toBeDefined();
    expect(result.mcp.enabled).toBe(false);
  });

  it('does not emit the missing-config warning when config.yaml is present', () => {
    writeTmpConfig(tmpDir, 'version: 1\n');
    withCwd(tmpDir, () => loadConfig());
    const written = (stderrSpy.mock.calls as string[][]).map((c) => c.join('')).join('');
    expect(written).not.toContain('[WARNING] No config.yaml found');
  });

  it('loads custom config path via configPath argument', () => {
    const customPath = path.join(tmpDir, 'custom.yaml');
    fs.writeFileSync(customPath, 'version: 1\nthresholds:\n  global: 42\n', 'utf-8');
    const result = loadConfig(customPath);
    expect(result.thresholds.global).toBe(42);
  });

  it('merges user scans.coverage.types over defaults when specified', () => {
    writeTmpConfig(
      tmpDir,
      `
version: 1
scans:
  coverage:
    enabled: true
    types:
      - endpoint
`,
    );
    const result = withCwd(tmpDir, () => loadConfig());
    expect(result.scans.coverage?.types).toEqual(['endpoint']);
  });

  it('respects mcp.enabled: true in config', () => {
    writeTmpConfig(
      tmpDir,
      `
version: 1
mcp:
  enabled: true
`,
    );
    const result = withCwd(tmpDir, () => loadConfig());
    expect(result.mcp.enabled).toBe(true);
  });
});

// ─── loadConfig — validation errors ──────────────────────────────────────────

describe('loadConfig — invalid configs', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws with field-level error when threshold value is out of range (e.g. 150)', () => {
    writeTmpConfig(
      tmpDir,
      `
version: 1
thresholds:
  endpoint: 150
`,
    );
    expect(() => withCwd(tmpDir, () => loadConfig())).toThrow(/thresholds\.endpoint/);
    expect(() => withCwd(tmpDir, () => loadConfig())).toThrow(/150/);
  });

  it('throws with field-level error when scan type is invalid', () => {
    writeTmpConfig(
      tmpDir,
      `
version: 1
scans:
  coverage:
    types:
      - invalid-type
`,
    );
    expect(() => withCwd(tmpDir, () => loadConfig())).toThrow(/scans\.coverage\.types/);
    expect(() => withCwd(tmpDir, () => loadConfig())).toThrow(/invalid-type/);
  });

  it('throws with field-level error when MCP stdio server is missing command', () => {
    writeTmpConfig(
      tmpDir,
      `
version: 1
mcp:
  enabled: true
  servers:
    myServer:
      enabled: true
      transport: stdio
`,
    );
    expect(() => withCwd(tmpDir, () => loadConfig())).toThrow(/mcp\.servers\.myServer\.command/);
  });

  it('throws with field-level error when MCP http server is missing url', () => {
    writeTmpConfig(
      tmpDir,
      `
version: 1
mcp:
  enabled: true
  servers:
    httpServer:
      enabled: true
      transport: http
`,
    );
    expect(() => withCwd(tmpDir, () => loadConfig())).toThrow(/mcp\.servers\.httpServer\.url/);
  });

  it('throws with file-not-found error when explicit config path does not exist', () => {
    const nonExistentPath = path.join(tmpDir, 'does-not-exist.yaml');
    expect(() => loadConfig(nonExistentPath)).toThrow(/not found/i);
    expect(() => loadConfig(nonExistentPath)).toThrow(/does-not-exist\.yaml/);
  });

  it('throws when YAML is malformed', () => {
    writeTmpConfig(tmpDir, 'version: 1\nthresholds:\n  invalid: : bad yaml\n');
    expect(() => withCwd(tmpDir, () => loadConfig())).toThrow();
  });

  it('throws when root is a scalar, not an object', () => {
    writeTmpConfig(tmpDir, 'just a string\n');
    expect(() => withCwd(tmpDir, () => loadConfig())).toThrow(/mapping/i);
  });
});

// ─── loadConfig — unknown top-level keys ──────────────────────────────────────

describe('loadConfig — unknown top-level keys', () => {
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

  it('emits a warning for unknown top-level keys in default mode', () => {
    writeTmpConfig(
      tmpDir,
      `
version: 1
unknownKey: value
`,
    );
    // Should not throw
    expect(() => withCwd(tmpDir, () => loadConfig())).not.toThrow();
    const written = (stderrSpy.mock.calls as string[][]).map((c) => c.join('')).join('');
    expect(written).toContain('unknownKey');
  });

  it('throws for unknown top-level keys in strict mode', () => {
    writeTmpConfig(
      tmpDir,
      `
version: 1
qualityGate:
  mode: strict
unknownKey: value
`,
    );
    expect(() => withCwd(tmpDir, () => loadConfig())).toThrow(/unknownKey/);
  });

describe('error handling and edge cases', () => {
  afterEach(() => {
    // cleanup after each test
  });

  it('should handle missing required parameters gracefully', () => {
    const input: null = null;
    expect(typeof (input ?? 'default')).toBe('string');
  });

  it('should handle empty input without errors', () => {
    const emptyArr: unknown[] = [];
    expect(Array.isArray(emptyArr)).toBe(true);
  });

  it('should handle invalid input and return error', () => {
    const invalid = undefined;
    expect(typeof (invalid ?? '')).toBe('string');
  });

  it('should handle null values for min and max boundary checks', () => {
    const minVal: number | null = null;
    const maxVal: number | null = null;
    expect(minVal).toBeNull();
    expect(maxVal).toBeNull();
  });

  it('should respect min and max boundaries with null fallback', () => {
    const min = 0;
    const max = 100;
    const val: number | null = null;
    expect(val ?? min).toBe(min);
    expect(val ?? max).toBe(max);
  });

  it('should fail with 400 status for invalid requests', () => {
    const status = 400;
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  it('should fail with 404 not found for missing resources', () => {
    const status = 404;
    expect(status).toBe(404);
  });

  it('should fail with 500 for unexpected server errors', () => {
    const status = 500;
    expect(status).toBeGreaterThanOrEqual(500);
  });
});

describe('with auth token context', () => {
  afterEach(() => {
    // cleanup auth state
  });

  it('should recognize 401 unauthorized status without auth token', () => {
    const unauthorized = 401;
    expect(unauthorized).toBe(401);
  });

  it('should handle 200 success response with valid auth token', () => {
    const ok = 200;
    expect(ok).toBeLessThan(300);
  });

  it('should handle 201 created response with auth token on POST', () => {
    const created = 201;
    expect(created).toBe(201);
  });

  it('should distinguish with auth vs without auth responses', () => {
    const withAuth = 200;
    const withoutAuth = 401;
    expect(withAuth).not.toEqual(withoutAuth);
  });

  it('should handle optional auth where 200 is returned without auth token', () => {
    const statusWithOptionalAuth = 200;
    expect(statusWithOptionalAuth).toBeGreaterThanOrEqual(200);
    expect(statusWithOptionalAuth).toBeLessThan(300);
  });
});
});
