import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  loadConfigFile,
  resolveConfig,
  mergeConfig,
  isExcluded,
  defaultConfig,
  DEFAULT_CONFIG_FILENAME,
  CoverageConfig,
} from '../src/config';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
}

function writeConfig(dir: string, obj: unknown, filename = DEFAULT_CONFIG_FILENAME): string {
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(obj), 'utf-8');
  return filePath;
}

// ─── loadConfigFile ───────────────────────────────────────────────────────────

describe('loadConfigFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads a valid JSON config file', () => {
    const cfg: CoverageConfig = { thresholds: { endpoint: 85 } };
    const filePath = writeConfig(tmpDir, cfg);
    const loaded = loadConfigFile(filePath);
    expect(loaded.thresholds?.endpoint).toBe(85);
  });

  it('throws when the file does not exist', () => {
    expect(() => loadConfigFile(path.join(tmpDir, 'nonexistent.json'))).toThrow();
  });

  it('throws when the JSON is invalid', () => {
    const filePath = path.join(tmpDir, DEFAULT_CONFIG_FILENAME);
    fs.writeFileSync(filePath, '{ bad json }', 'utf-8');
    expect(() => loadConfigFile(filePath)).toThrow();
  });

  it('throws when the JSON root is not an object', () => {
    const filePath = path.join(tmpDir, DEFAULT_CONFIG_FILENAME);
    fs.writeFileSync(filePath, '[1, 2, 3]', 'utf-8');
    expect(() => loadConfigFile(filePath)).toThrow(/JSON object/);
  });

  it('loads all supported fields', () => {
    const cfg: CoverageConfig = {
      thresholds: { endpoint: 80, parameter: 70 },
      exclude: { paths: ['/internal/*'], methods: ['OPTIONS'] },
      testPatterns: ['tests/**/*.ts'],
      plugins: ['./plugins/my-plugin.js'],
    };
    const filePath = writeConfig(tmpDir, cfg);
    const loaded = loadConfigFile(filePath);
    expect(loaded.thresholds?.parameter).toBe(70);
    expect(loaded.exclude?.paths).toContain('/internal/*');
    expect(loaded.exclude?.methods).toContain('OPTIONS');
    expect(loaded.testPatterns).toEqual(['tests/**/*.ts']);
    expect(loaded.plugins).toEqual(['./plugins/my-plugin.js']);
  });
});

// ─── resolveConfig ────────────────────────────────────────────────────────────

describe('resolveConfig', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads the specified config file when path is given', () => {
    const cfg: CoverageConfig = { thresholds: { endpoint: 99 } };
    const filePath = writeConfig(tmpDir, cfg);
    const result = resolveConfig(filePath);
    expect(result.thresholds?.endpoint).toBe(99);
  });

  it('throws when specified config file does not exist', () => {
    expect(() => resolveConfig('/nonexistent/path/config.json')).toThrow(/not found/);
  });

  it('loads coverage.config.json from cwd when no path given and file exists', () => {
    process.chdir(tmpDir);
    const cfg: CoverageConfig = { thresholds: { business: 55 } };
    writeConfig(tmpDir, cfg);
    const result = resolveConfig();
    expect(result.thresholds?.business).toBe(55);
  });

  it('returns default config when no path given and no coverage.config.json in cwd', () => {
    process.chdir(tmpDir); // no coverage.config.json here
    const result = resolveConfig();
    expect(result).toMatchObject(defaultConfig);
  });
});

// ─── mergeConfig ─────────────────────────────────────────────────────────────

describe('mergeConfig', () => {
  it('uses file config values when no CLI overrides given', () => {
    const file: CoverageConfig = { thresholds: { endpoint: 80 } };
    const result = mergeConfig(file, {});
    expect(result.thresholds?.endpoint).toBe(80);
  });

  it('CLI threshold overrides file threshold', () => {
    const file: CoverageConfig = { thresholds: { endpoint: 80 } };
    const cli: Partial<CoverageConfig> = { thresholds: { endpoint: 95 } };
    const result = mergeConfig(file, cli);
    expect(result.thresholds?.endpoint).toBe(95);
  });

  it('merges thresholds from both sources', () => {
    const file: CoverageConfig = { thresholds: { endpoint: 80, parameter: 70 } };
    const cli: Partial<CoverageConfig> = { thresholds: { parameter: 90 } };
    const result = mergeConfig(file, cli);
    expect(result.thresholds?.endpoint).toBe(80);
    expect(result.thresholds?.parameter).toBe(90);
  });

  it('CLI testPatterns override file testPatterns', () => {
    const file: CoverageConfig = { testPatterns: ['src/tests/**/*.ts'] };
    const cli: Partial<CoverageConfig> = { testPatterns: ['custom/**/*.ts'] };
    const result = mergeConfig(file, cli);
    expect(result.testPatterns).toEqual(['custom/**/*.ts']);
  });

  it('uses file testPatterns when CLI does not provide any', () => {
    const file: CoverageConfig = { testPatterns: ['src/tests/**/*.ts'] };
    const result = mergeConfig(file, {});
    expect(result.testPatterns).toEqual(['src/tests/**/*.ts']);
  });

  it('concatenates plugins from file and CLI', () => {
    const file: CoverageConfig = { plugins: ['./plugins/a.js'] };
    const cli: Partial<CoverageConfig> = { plugins: ['./plugins/b.js'] };
    const result = mergeConfig(file, cli);
    expect(result.plugins).toContain('./plugins/a.js');
    expect(result.plugins).toContain('./plugins/b.js');
  });

  it('CLI exclude settings override file exclude settings', () => {
    const file: CoverageConfig = { exclude: { paths: ['/internal/*'], methods: ['OPTIONS'] } };
    const cli: Partial<CoverageConfig> = { exclude: { methods: ['HEAD'] } };
    const result = mergeConfig(file, cli);
    // CLI exclude.methods overrides file
    expect(result.exclude?.methods).toEqual(['HEAD']);
    // file exclude.paths remain (CLI did not provide paths)
    expect(result.exclude?.paths).toContain('/internal/*');
  });
});

// ─── isExcluded ───────────────────────────────────────────────────────────────

describe('isExcluded', () => {
  it('returns false when exclude config is empty', () => {
    expect(isExcluded('GET', '/users', {})).toBe(false);
  });

  it('excludes a method listed in exclude.methods', () => {
    expect(isExcluded('OPTIONS', '/anything', { methods: ['OPTIONS'] })).toBe(true);
  });

  it('is case-insensitive for methods', () => {
    expect(isExcluded('options', '/anything', { methods: ['OPTIONS'] })).toBe(true);
    expect(isExcluded('OPTIONS', '/anything', { methods: ['options'] })).toBe(true);
  });

  it('does not exclude a method not in the list', () => {
    expect(isExcluded('GET', '/users', { methods: ['OPTIONS', 'HEAD'] })).toBe(false);
  });

  it('excludes a path matching a wildcard pattern', () => {
    expect(isExcluded('GET', '/internal/users', { paths: ['/internal/*'] })).toBe(true);
  });

  it('does not exclude a path that does not match any pattern', () => {
    expect(isExcluded('GET', '/users', { paths: ['/internal/*'] })).toBe(false);
  });

  it('excludes a path matching a double-wildcard pattern', () => {
    expect(isExcluded('GET', '/admin/settings/advanced', { paths: ['/admin/**'] })).toBe(true);
  });

  it('excludes a path matching an exact pattern', () => {
    expect(isExcluded('DELETE', '/deprecated/endpoint', { paths: ['/deprecated/endpoint'] })).toBe(true);
  });

  it('returns true when method matches even if path does not', () => {
    expect(isExcluded('OPTIONS', '/users', { paths: ['/internal/*'], methods: ['OPTIONS'] })).toBe(true);
  });
});

// ─── CoverageConfig – new fields (Spec 15) ────────────────────────────────────

describe('CoverageConfig – publishing and qualityGate fields', () => {
  it('accepts a publishing config block', () => {
    const config: import('../src/config').CoverageConfig = {
      publishing: {
        enabled: true,
        outputDir: 'site',
        buildId: 'timestamp',
        githubPages: { enabled: true, basePath: '/myrepo/' },
        artifacts: { includeJson: true, includeCsv: false },
        screenshots: { enabled: false, strict: false },
      },
    };
    expect(config.publishing?.outputDir).toBe('site');
    expect(config.publishing?.githubPages?.basePath).toBe('/myrepo/');
  });

  it('accepts a qualityGate config block', () => {
    const config: import('../src/config').CoverageConfig = {
      qualityGate: {
        enabled: true,
        failBuildOnThresholdMiss: true,
        mode: 'strict',
      },
    };
    expect(config.qualityGate?.mode).toBe('strict');
  });

  it('accepts thresholdsByBranch config', () => {
    const config: import('../src/config').CoverageConfig = {
      thresholds: { global: 100 },
      thresholdsByBranch: {
        'main': { global: 100 },
        'feature/*': { global: 80 },
      },
    };
    expect(config.thresholdsByBranch?.['main']?.global).toBe(100);
    expect(config.thresholdsByBranch?.['feature/*']?.global).toBe(80);
  });

  it('accepts a global threshold key', () => {
    const config: import('../src/config').CoverageConfig = {
      thresholds: { global: 100, performance: 90 },
    };
    expect(config.thresholds?.global).toBe(100);
    expect(config.thresholds?.performance).toBe(90);
  });
});
