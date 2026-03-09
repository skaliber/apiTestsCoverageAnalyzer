/**
 * tests/smoke/configSmoke.test.ts
 *
 * Smoke test for the central config system (spec section 10.4).
 *
 * 1. Runs loadConfig() without a config.yaml in a clean temp dir.
 * 2. Verifies the required warning message is emitted.
 * 3. Verifies the returned config has the full default profile.
 * 4. Writes a minimal valid config.yaml to the same temp dir.
 * 5. Runs loadConfig() again and verifies no warning + config matches.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig, MISSING_CONFIG_WARNING } from '../../src/config/loadConfig';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aca-smoke-'));
}

function withCwd<T>(dir: string, fn: () => T): T {
  const orig = process.cwd();
  process.chdir(dir);
  try { return fn(); }
  finally { process.chdir(orig); }
}

describe('config smoke test', () => {
  let tmpDir: string;
  let stderrOutput: string;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    stderrOutput = '';
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((msg) => {
      stderrOutput += String(msg);
      return true;
    });
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Phase 1 — no config.yaml present', () => {
    it('run with no config emits the required warning', () => {
      withCwd(tmpDir, () => loadConfig());
      expect(stderrOutput).toContain('[WARNING] No config.yaml found at project root.');
    });

    it('run with no config emits the full default profile notice', () => {
      withCwd(tmpDir, () => loadConfig());
      expect(stderrOutput).toContain('Running full default analysis profile.');
    });

    it('run with no config emits the config docs reference', () => {
      withCwd(tmpDir, () => loadConfig());
      expect(stderrOutput).toContain('docs/guides/configuration.md');
    });

    it('run with no config returns full default scan types', () => {
      const result = withCwd(tmpDir, () => loadConfig());
      expect(result.scans.coverage?.types).toContain('endpoint');
      expect(result.scans.coverage?.types).toContain('security');
      expect(result.scans.coverage?.types).toContain('performance');
    });

    it('run with no config returns full default intelligence types', () => {
      const result = withCwd(tmpDir, () => loadConfig());
      expect(result.scans.intelligence?.types).toContain('ai-summary');
      expect(result.scans.intelligence?.types).toContain('recommendations');
    });

    it('run with no config returns mcp.enabled = false', () => {
      const result = withCwd(tmpDir, () => loadConfig());
      expect(result.mcp.enabled).toBe(false);
    });
  });

  describe('Phase 2 — minimal valid config.yaml present', () => {
    beforeEach(() => {
      // Write a minimal config.yaml to the temp dir before each test
      fs.writeFileSync(
        path.join(tmpDir, 'config.yaml'),
        [
          'version: 1',
          'scans:',
          '  coverage:',
          '    types:',
          '      - endpoint',
          '',
        ].join('\n'),
        'utf-8',
      );
      stderrOutput = '';
    });

    it('run with config.yaml does not emit the missing-config warning', () => {
      withCwd(tmpDir, () => loadConfig());
      expect(stderrOutput).not.toContain('[WARNING] No config.yaml found');
    });

    it('run with config.yaml returns only configured scan types', () => {
      const result = withCwd(tmpDir, () => loadConfig());
      expect(result.scans.coverage?.types).toEqual(['endpoint']);
      expect(result.scans.coverage?.types).not.toContain('parameter');
    });

    it('run with config.yaml merges defaults for unspecified fields', () => {
      const result = withCwd(tmpDir, () => loadConfig());
      expect(result.analysis.defaultMode).toBe('full');
      expect(result.mcp.enabled).toBe(false);
    });
  });
});
