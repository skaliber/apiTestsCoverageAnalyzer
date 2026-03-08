/**
 * tests/config/validateConfig.test.ts
 *
 * Unit tests for the config schema validator (src/config/validateConfig.ts).
 */

import { validateConfig } from '../../src/config/validateConfig';

// ─── Valid inputs ─────────────────────────────────────────────────────────────

describe('validateConfig — valid inputs', () => {
  it('accepts a minimal config with only version: 1', () => {
    expect(() => validateConfig({ version: 1 })).not.toThrow();
  });

  it('accepts a complete valid config', () => {
    const cfg = {
      version: 1,
      project: { name: 'test' },
      analysis: { defaultMode: 'full', failOnConfigMissing: false },
      scans: {
        coverage: { enabled: true, types: ['endpoint', 'parameter'] },
        security: { enabled: true, scanners: ['semgrep', 'trivy'] },
        intelligence: { enabled: true, types: ['ai-summary', 'recommendations'] },
      },
      thresholds: { global: 80, endpoint: 90 },
      qualityGate: { enabled: true, mode: 'warn' },
      reports: { outputDir: 'reports', formats: ['json', 'html'] },
    };
    expect(() => validateConfig(cfg)).not.toThrow();
  });

  it('accepts all valid coverage types', () => {
    const types = ['endpoint', 'parameter', 'business', 'integration', 'error', 'security', 'performance', 'compatibility'];
    expect(() => validateConfig({ version: 1, scans: { coverage: { types } } })).not.toThrow();
  });

  it('accepts all valid security scanners', () => {
    expect(() =>
      validateConfig({ version: 1, scans: { security: { scanners: ['semgrep', 'trivy', 'zap'] } } }),
    ).not.toThrow();
  });

  it('accepts all valid intelligence types', () => {
    const types = ['ai-summary', 'risk-prioritization', 'recommendations', 'scanner-interpretation'];
    expect(() => validateConfig({ version: 1, scans: { intelligence: { types } } })).not.toThrow();
  });

  it('accepts all valid report formats', () => {
    expect(() =>
      validateConfig({ version: 1, reports: { formats: ['json', 'html', 'csv', 'junit', 'markdown'] } }),
    ).not.toThrow();
  });

  it('accepts valid MCP stdio server with command', () => {
    expect(() =>
      validateConfig({
        version: 1,
        mcp: {
          enabled: true,
          servers: {
            mySrv: { enabled: true, transport: 'stdio', command: 'node', args: ['./server.js'] },
          },
        },
      }),
    ).not.toThrow();
  });

  it('accepts valid MCP http server with url', () => {
    expect(() =>
      validateConfig({
        version: 1,
        mcp: {
          enabled: true,
          servers: {
            httpSrv: { enabled: true, transport: 'http', url: 'http://localhost:3100/mcp' },
          },
        },
      }),
    ).not.toThrow();
  });

  it('accepts thresholds at boundary values 0 and 100', () => {
    expect(() =>
      validateConfig({ version: 1, thresholds: { global: 0, endpoint: 100 } }),
    ).not.toThrow();
  });

  it('accepts qualityGate.mode: strict', () => {
    expect(() =>
      validateConfig({ version: 1, qualityGate: { mode: 'strict' } }),
    ).not.toThrow();
  });

  it('accepts qualityGate.mode: warn', () => {
    expect(() =>
      validateConfig({ version: 1, qualityGate: { mode: 'warn' } }),
    ).not.toThrow();
  });
});

// ─── Invalid inputs ───────────────────────────────────────────────────────────

describe('validateConfig — invalid inputs', () => {
  it('throws when version is unsupported (e.g. 99)', () => {
    expect(() => validateConfig({ version: 99 })).toThrow(/version/);
  });

  it('throws when version is a string', () => {
    expect(() => validateConfig({ version: 'one' })).toThrow(/version/);
  });

  it('throws when threshold value exceeds 100', () => {
    const err = expect(() => validateConfig({ version: 1, thresholds: { endpoint: 150 } }));
    err.toThrow(/thresholds\.endpoint/);
    err.toThrow(/150/);
  });

  it('throws when threshold value is negative', () => {
    expect(() => validateConfig({ version: 1, thresholds: { endpoint: -1 } })).toThrow(/thresholds\.endpoint/);
  });

  it('throws when threshold value is not a number', () => {
    expect(() => validateConfig({ version: 1, thresholds: { endpoint: 'high' } })).toThrow(/thresholds\.endpoint/);
  });

  it('throws for invalid coverage type', () => {
    expect(() =>
      validateConfig({ version: 1, scans: { coverage: { types: ['invalid-type'] } } }),
    ).toThrow(/scans\.coverage\.types/);
  });

  it('throws for invalid security scanner', () => {
    expect(() =>
      validateConfig({ version: 1, scans: { security: { scanners: ['burpsuite'] } } }),
    ).toThrow(/scans\.security\.scanners/);
  });

  it('throws for invalid intelligence type', () => {
    expect(() =>
      validateConfig({ version: 1, scans: { intelligence: { types: ['magic'] } } }),
    ).toThrow(/scans\.intelligence\.types/);
  });

  it('throws for invalid report format', () => {
    expect(() =>
      validateConfig({ version: 1, reports: { formats: ['xml'] } }),
    ).toThrow(/reports\.formats/);
  });

  it('throws for invalid qualityGate.mode', () => {
    expect(() =>
      validateConfig({ version: 1, qualityGate: { mode: 'hard' } }),
    ).toThrow(/qualityGate\.mode/);
  });

  it('throws for MCP stdio server missing command', () => {
    expect(() =>
      validateConfig({
        version: 1,
        mcp: {
          enabled: true,
          servers: { badServer: { enabled: true, transport: 'stdio' } },
        },
      }),
    ).toThrow(/mcp\.servers\.badServer\.command/);
  });

  it('throws for MCP http server missing url', () => {
    expect(() =>
      validateConfig({
        version: 1,
        mcp: {
          enabled: true,
          servers: { httpServer: { enabled: true, transport: 'http' } },
        },
      }),
    ).toThrow(/mcp\.servers\.httpServer\.url/);
  });

  it('throws for MCP sse server missing url', () => {
    expect(() =>
      validateConfig({
        version: 1,
        mcp: {
          enabled: true,
          servers: { sseServer: { enabled: true, transport: 'sse' } },
        },
      }),
    ).toThrow(/mcp\.servers\.sseServer\.url/);
  });

  it('throws when config root is not an object (scalar)', () => {
    expect(() => validateConfig('version: 1')).toThrow(/mapping/i);
  });

  it('throws when config root is a list', () => {
    expect(() => validateConfig([{ version: 1 }])).toThrow(/mapping/i);
  });

  it('throws when config root is null', () => {
    expect(() => validateConfig(null)).toThrow(/mapping/i);
  });

  it('throws for invalid analysis.defaultMode', () => {
    expect(() =>
      validateConfig({ version: 1, analysis: { defaultMode: 'partial' } }),
    ).toThrow(/analysis\.defaultMode/);
  });
});

// ─── Unknown top-level keys ────────────────────────────────────────────────────

describe('validateConfig — unknown top-level keys', () => {
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('emits warning (no throw) in default mode for unknown top-level keys', () => {
    expect(() => validateConfig({ version: 1, unknownKey: 'x' })).not.toThrow();
    const written = (stderrSpy.mock.calls as string[][]).map((c) => c.join('')).join('');
    expect(written).toContain('unknownKey');
  });

  it('throws in strict mode for unknown top-level keys', () => {
    expect(() => validateConfig({ version: 1, unknownKey: 'x' }, true)).toThrow(/unknownKey/);
  });
});
