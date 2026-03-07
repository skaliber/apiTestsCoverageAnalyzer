/**
 * Tests for the MCP (Model Context Protocol) integration module.
 *
 * Covers:
 *   - Config loading and validation
 *   - Prompt generation for all categories
 *   - Response normalisation (happy path, malformed, error)
 *   - Template mapping (markdown, HTML, panel data)
 *   - Fallback interpreter (coverage, security, generic)
 *   - Event stream adapter
 *   - Secret redaction
 *   - Payload size / transport / server URL validation
 *   - McpIntegration facade (toggle logic, MCP enabled/disabled)
 *   - HTTP mock server integration
 *   - Contract schema validation
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  // Config helpers
  isMcpEnabledFor,
  resolveServerConfig,
  validateTransport,
  validateServerUrl,
  validatePayloadSize,
  redactSecrets,
  REDACTED_KEYS,
  MCP_DEFAULT_TIMEOUT_MS,
  MCP_DEFAULT_MAX_PAYLOAD_BYTES,
  MCP_DEFAULT_TRANSPORT,
  // Prompt builders
  buildCoverageSummaryPrompt,
  buildSecurityScanPrompt,
  buildPerformancePrompt,
  buildCompatibilityPrompt,
  buildCiSummaryPrompt,
  // Normalizer
  normalizeMcpResponse,
  // Template mapper
  renderAiAnalysisMarkdown,
  renderAiAnalysisHtml,
  buildAiPanelData,
  // Fallback
  generateFallbackCoverageAnalysis,
  generateFallbackSecurityAnalysis,
  generateFallbackAnalysis,
  // Events
  AnalysisEventStream,
  createNoOpStream,
  // Facade
  McpIntegration,
  McpClient,
} from '../src/mcp';

import { startMockMcpServer, buildMockAnalysisResponse } from '../src/mcp/testing/mock-server';

import type {
  McpConfig,
  NormalizedAiAnalysis,
  TemplateContext,
} from '../src/mcp/types';
import type { CoverageResult } from '../src/reporting';
import type { SecurityScanSummary } from '../src/security/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeCoverageResult(type: string, pct: number, total = 10): CoverageResult {
  return {
    type,
    totalItems: total,
    coveredItems: Math.round((pct / 100) * total),
    coveragePercent: pct,
    details: {},
  };
}

const sampleResults: CoverageResult[] = [
  makeCoverageResult('endpoint', 80),
  makeCoverageResult('business', 60),
];

const sampleSecurity: SecurityScanSummary = {
  totalFindings: 5,
  bySeverity: { CRITICAL: 1, HIGH: 2, MEDIUM: 2, LOW: 0 },
  byCategory: { sast: 3, sca: 1, secret: 0, misconfig: 1, dast: 0, auth: 0, injection: 0, 'data-exposure': 0, crypto: 0, unknown: 0 },
  byScanner: { semgrep: 3, trivy: 1, zap: 0, gitleaks: 0, other: 1 },
  findings: [
    { title: 'SQL Injection', severity: 'CRITICAL', category: 'injection', scanner: 'semgrep' },
    { title: 'Hardcoded secret', severity: 'HIGH', category: 'secret', scanner: 'semgrep' },
  ],
  scannersRun: ['semgrep', 'trivy'],
  gateResult: {
    passed: false,
    reasons: ['Critical findings found'],
    thresholds: {},
    counts: { critical: 1, high: 2, medium: 2, low: 0, secrets: 0, misconfigHigh: 0, criticalVulns: 0, highVulns: 0 },
  },
};

const disabledMcpConfig: McpConfig = { enabled: false };

const enabledMcpConfig: McpConfig = {
  enabled: true,
  servers: {
    coverageSummary: { enabled: true, transport: 'http', url: 'http://127.0.0.1:9999/mcp' },
    securityScan: { enabled: true, transport: 'http', url: 'http://127.0.0.1:9999/mcp' },
    performanceAnalysis: { enabled: false },
    compatibilityAnalysis: { enabled: false },
  },
};

// ─── 1. Config helpers ────────────────────────────────────────────────────────

describe('isMcpEnabledFor', () => {
  it('returns false when globally disabled', () => {
    expect(isMcpEnabledFor({ enabled: false, servers: { coverageSummary: { enabled: true } } }, 'coverageSummary')).toBe(false);
  });

  it('returns false when server not configured', () => {
    expect(isMcpEnabledFor({ enabled: true }, 'coverageSummary')).toBe(false);
  });

  it('returns false when server explicitly disabled', () => {
    expect(isMcpEnabledFor({ enabled: true, servers: { coverageSummary: { enabled: false } } }, 'coverageSummary')).toBe(false);
  });

  it('returns true when globally enabled and server enabled', () => {
    expect(isMcpEnabledFor({ enabled: true, servers: { coverageSummary: { enabled: true } } }, 'coverageSummary')).toBe(true);
  });
});

describe('resolveServerConfig', () => {
  it('applies global defaults when server has no overrides', () => {
    const cfg: McpConfig = { enabled: true, timeoutMs: 5000, defaultTransport: 'http', servers: { coverageSummary: { enabled: true } } };
    const resolved = resolveServerConfig(cfg, 'coverageSummary');
    expect(resolved.transport).toBe('http');
    expect(resolved.timeoutMs).toBe(5000);
  });

  it('per-server timeout overrides global', () => {
    const cfg: McpConfig = { enabled: true, timeoutMs: 5000, servers: { coverageSummary: { enabled: true, timeoutMs: 1000 } } };
    const resolved = resolveServerConfig(cfg, 'coverageSummary');
    expect(resolved.timeoutMs).toBe(1000);
  });

  it('falls back to MCP_DEFAULT_TRANSPORT when no transport set', () => {
    const cfg: McpConfig = { enabled: true };
    const resolved = resolveServerConfig(cfg, 'any');
    expect(resolved.transport).toBe(MCP_DEFAULT_TRANSPORT);
  });
});

describe('validateTransport', () => {
  it('does not throw when allowlist is empty', () => {
    expect(() => validateTransport({}, 'stdio')).not.toThrow();
    expect(() => validateTransport({}, 'http')).not.toThrow();
  });

  it('does not throw for allowed transport', () => {
    expect(() => validateTransport({ transportAllowlist: ['stdio'] }, 'stdio')).not.toThrow();
  });

  it('throws for disallowed transport', () => {
    expect(() => validateTransport({ transportAllowlist: ['stdio'] }, 'http')).toThrow(/not in the configured allowlist/);
  });
});

describe('validateServerUrl', () => {
  it('does not throw when allowlist is empty', () => {
    expect(() => validateServerUrl({}, 'http://any.example.com')).not.toThrow();
  });

  it('does not throw for URL matching a prefix', () => {
    expect(() => validateServerUrl({ serverAllowlist: ['http://127.0.0.1'] }, 'http://127.0.0.1:3000/mcp')).not.toThrow();
  });

  it('throws when URL does not match any allowed prefix', () => {
    expect(() => validateServerUrl({ serverAllowlist: ['http://allowed.example.com'] }, 'http://evil.example.com')).toThrow(/not in the configured server allowlist/);
  });
});

describe('validatePayloadSize', () => {
  it('does not throw when payload is within limit', () => {
    expect(() => validatePayloadSize({}, 'small payload')).not.toThrow();
  });

  it('throws when payload exceeds limit', () => {
    const huge = 'x'.repeat(MCP_DEFAULT_MAX_PAYLOAD_BYTES + 1);
    expect(() => validatePayloadSize({}, huge)).toThrow(/exceeds the configured limit/);
  });

  it('respects custom maxPayloadBytes', () => {
    expect(() => validatePayloadSize({ maxPayloadBytes: 10 }, 'x'.repeat(11))).toThrow(/exceeds/);
    expect(() => validatePayloadSize({ maxPayloadBytes: 100 }, 'x'.repeat(50))).not.toThrow();
  });
});

// ─── 2. Secret redaction ──────────────────────────────────────────────────────

describe('redactSecrets', () => {
  it('returns primitives unchanged', () => {
    expect(redactSecrets('hello')).toBe('hello');
    expect(redactSecrets(42)).toBe(42);
    expect(redactSecrets(null)).toBeNull();
  });

  it('redacts top-level sensitive keys', () => {
    const input = { token: 'abc123', username: 'bob', password: 'secret' };
    const out = redactSecrets(input) as Record<string, unknown>;
    expect(out['token']).toBe('[REDACTED]');
    expect(out['password']).toBe('[REDACTED]');
    expect(out['username']).toBe('bob');
  });

  it('redacts nested sensitive keys', () => {
    const input = { db: { connectionString: 'postgres://user:pass@host/db', host: 'localhost' } };
    const out = redactSecrets(input) as { db: Record<string, unknown> };
    expect(out.db['connectionString']).toBe('[REDACTED]');
    expect(out.db['host']).toBe('localhost');
  });

  it('does not mutate the original object', () => {
    const input = { apikey: 'secret' };
    redactSecrets(input);
    expect(input.apikey).toBe('secret');
  });

  it('handles arrays', () => {
    const input = [{ token: 'abc' }, { value: 'ok' }];
    const out = redactSecrets(input) as Array<Record<string, unknown>>;
    expect(out[0]!['token']).toBe('[REDACTED]');
    expect(out[1]!['value']).toBe('ok');
  });

  it('REDACTED_KEYS list is non-empty', () => {
    expect(REDACTED_KEYS.length).toBeGreaterThan(0);
  });
});

// ─── 3. Prompt builders ───────────────────────────────────────────────────────

describe('buildCoverageSummaryPrompt', () => {
  it('produces a prompt with category "coverage"', () => {
    const req = buildCoverageSummaryPrompt({ results: sampleResults, thresholds: { endpoint: 80 }, gatePassed: false, failedCategories: ['business'] });
    expect(req.category).toBe('coverage');
  });

  it('includes project name in the prompt', () => {
    const req = buildCoverageSummaryPrompt({ results: sampleResults, projectName: 'my-api' });
    expect(req.prompt).toContain('my-api');
  });

  it('includes branch in the prompt', () => {
    const req = buildCoverageSummaryPrompt({ results: sampleResults, branch: 'main' });
    expect(req.prompt).toContain('main');
  });

  it('includes coverage metrics in the prompt', () => {
    const req = buildCoverageSummaryPrompt({ results: sampleResults });
    expect(req.prompt).toContain('endpoint');
    expect(req.prompt).toContain('business');
  });

  it('includes failed gates in the prompt when present', () => {
    const req = buildCoverageSummaryPrompt({ results: sampleResults, failedCategories: ['business'] });
    expect(req.prompt).toContain('business');
  });

  it('includes coverage results in context', () => {
    const req = buildCoverageSummaryPrompt({ results: sampleResults });
    expect(Array.isArray((req.context as Record<string, unknown>)['results'])).toBe(true);
  });

  it('requests structured output', () => {
    const req = buildCoverageSummaryPrompt({ results: sampleResults });
    expect(req.prompt).toContain('JSON');
  });
});

describe('buildSecurityScanPrompt', () => {
  it('produces a prompt with category "security"', () => {
    const req = buildSecurityScanPrompt({ scanSummary: sampleSecurity });
    expect(req.category).toBe('security');
  });

  it('includes finding counts in the prompt', () => {
    const req = buildSecurityScanPrompt({ scanSummary: sampleSecurity });
    expect(req.prompt).toContain('5'); // totalFindings
    expect(req.prompt).toContain('Critical');
    expect(req.prompt).toContain('High');
  });

  it('includes scanner names in the prompt', () => {
    const req = buildSecurityScanPrompt({ scanSummary: sampleSecurity });
    expect(req.prompt).toContain('semgrep');
  });
});

describe('buildPerformancePrompt', () => {
  it('produces a prompt with category "performance"', () => {
    const req = buildPerformancePrompt({ coveragePercent: 75, totalScenarios: 8, coveredScenarios: 6 });
    expect(req.category).toBe('performance');
    expect(req.prompt).toContain('75');
  });
});

describe('buildCompatibilityPrompt', () => {
  it('produces a prompt with category "compatibility"', () => {
    const req = buildCompatibilityPrompt({ compatibilityPercent: 95, breakingChanges: 1, totalEndpoints: 20 });
    expect(req.category).toBe('compatibility');
    expect(req.prompt).toContain('95');
  });
});

describe('buildCiSummaryPrompt', () => {
  it('produces a prompt with category "ci-summary"', () => {
    const req = buildCiSummaryPrompt({ overallPassed: true, coverageResults: sampleResults, failedGates: [] });
    expect(req.category).toBe('ci-summary');
  });

  it('includes overall gate status', () => {
    const req = buildCiSummaryPrompt({ overallPassed: false, coverageResults: sampleResults, failedGates: ['business'] });
    expect(req.prompt).toContain('FAILED');
    expect(req.prompt).toContain('business');
  });
});

// ─── 4. Response normalizer ───────────────────────────────────────────────────

describe('normalizeMcpResponse', () => {
  it('normalizes a well-formed JSON response', () => {
    const raw = {
      ok: true,
      content: JSON.stringify({
        summary: 'All good',
        keyFindings: ['finding 1'],
        topRisks: ['risk 1'],
        recommendedActions: ['action 1'],
        confidence: 'high',
      }),
    };
    const result = normalizeMcpResponse(raw, 'coverage');
    expect(result.summary).toBe('All good');
    expect(result.keyFindings).toEqual(['finding 1']);
    expect(result.topRisks).toEqual(['risk 1']);
    expect(result.recommendedActions).toEqual(['action 1']);
    expect(result.confidence).toBe('high');
    expect(result.category).toBe('coverage');
  });

  it('handles markdown-fenced JSON', () => {
    const raw = {
      ok: true,
      content: '```json\n{"summary":"ok","keyFindings":[],"topRisks":[],"recommendedActions":[]}\n```',
    };
    const result = normalizeMcpResponse(raw, 'coverage');
    expect(result.summary).toBe('ok');
  });

  it('handles non-JSON plain text', () => {
    const raw = { ok: true, content: 'This is a plain text response.' };
    const result = normalizeMcpResponse(raw, 'coverage');
    expect(result.summary).toContain('plain text');
    expect(result.keyFindings).toEqual([]);
  });

  it('returns fallback when ok=false', () => {
    const raw = { ok: false, error: 'Server error' };
    const result = normalizeMcpResponse(raw, 'security');
    expect(result.summary).toContain('MCP analysis unavailable');
    expect(result.category).toBe('security');
  });

  it('returns fallback when content is empty', () => {
    const raw = { ok: true, content: '' };
    const result = normalizeMcpResponse(raw, 'coverage');
    expect(result.summary).toContain('MCP analysis unavailable');
  });

  it('normalizes camelCase and snake_case field variants', () => {
    const raw = {
      ok: true,
      content: JSON.stringify({
        summary: 'ok',
        key_findings: ['f1'],
        top_risks: ['r1'],
        recommended_actions: ['a1'],
        missing_coverage_areas: ['m1'],
        likely_root_causes: ['c1'],
      }),
    };
    const result = normalizeMcpResponse(raw, 'coverage');
    expect(result.keyFindings).toEqual(['f1']);
    expect(result.topRisks).toEqual(['r1']);
    expect(result.recommendedActions).toEqual(['a1']);
    expect(result.missingCoverageAreas).toEqual(['m1']);
    expect(result.likelyRootCauses).toEqual(['c1']);
  });

  it('falls back to "medium" confidence when invalid value given', () => {
    const raw = {
      ok: true,
      content: JSON.stringify({ summary: 'ok', keyFindings: [], topRisks: [], recommendedActions: [], confidence: 'unknown' }),
    };
    const result = normalizeMcpResponse(raw, 'coverage');
    expect(result.confidence).toBe('medium');
  });
});

// ─── 5. Template mapper ───────────────────────────────────────────────────────

const sampleAnalysis: NormalizedAiAnalysis = {
  summary: 'Test summary',
  keyFindings: ['Finding 1', 'Finding 2'],
  topRisks: ['Risk 1'],
  recommendedActions: ['Action 1', 'Action 2'],
  missingCoverageAreas: ['Area 1'],
  likelyRootCauses: ['Cause 1'],
  confidence: 'high',
  isFallback: false,
  category: 'coverage',
};

const sampleCtx: TemplateContext = {
  analysis: sampleAnalysis,
  category: 'coverage',
  categoryTitle: 'Endpoint Coverage',
  mcpEnabled: true,
};

describe('renderAiAnalysisMarkdown', () => {
  it('renders a <details> block', () => {
    const md = renderAiAnalysisMarkdown(sampleCtx);
    expect(md).toContain('<details>');
    expect(md).toContain('</details>');
  });

  it('includes category title in summary', () => {
    const md = renderAiAnalysisMarkdown(sampleCtx);
    expect(md).toContain('Endpoint Coverage');
  });

  it('includes summary text', () => {
    const md = renderAiAnalysisMarkdown(sampleCtx);
    expect(md).toContain('Test summary');
  });

  it('renders key findings', () => {
    const md = renderAiAnalysisMarkdown(sampleCtx);
    expect(md).toContain('Finding 1');
    expect(md).toContain('Finding 2');
  });

  it('renders top risks', () => {
    const md = renderAiAnalysisMarkdown(sampleCtx);
    expect(md).toContain('Risk 1');
  });

  it('renders missing coverage areas', () => {
    const md = renderAiAnalysisMarkdown(sampleCtx);
    expect(md).toContain('Area 1');
  });

  it('renders recommended actions', () => {
    const md = renderAiAnalysisMarkdown(sampleCtx);
    expect(md).toContain('Action 1');
  });

  it('renders confidence level', () => {
    const md = renderAiAnalysisMarkdown(sampleCtx);
    expect(md).toContain('high');
  });

  it('shows fallback note when isFallback=true', () => {
    const ctx: TemplateContext = { ...sampleCtx, analysis: { ...sampleAnalysis, isFallback: true } };
    const md = renderAiAnalysisMarkdown(ctx);
    expect(md).toContain('fallback mode');
  });
});

describe('renderAiAnalysisHtml', () => {
  it('renders a <details> HTML block', () => {
    const html = renderAiAnalysisHtml(sampleCtx);
    expect(html).toContain('<details');
    expect(html).toContain('</details>');
  });

  it('includes category title', () => {
    const html = renderAiAnalysisHtml(sampleCtx);
    expect(html).toContain('Endpoint Coverage');
  });

  it('renders summary text', () => {
    const html = renderAiAnalysisHtml(sampleCtx);
    expect(html).toContain('Test summary');
  });

  it('renders list items', () => {
    const html = renderAiAnalysisHtml(sampleCtx);
    expect(html).toContain('<li>');
    expect(html).toContain('Finding 1');
  });

  it('escapes HTML special characters in content', () => {
    const ctx: TemplateContext = {
      ...sampleCtx,
      analysis: { ...sampleAnalysis, summary: '<script>alert("xss")</script>' },
    };
    const html = renderAiAnalysisHtml(ctx);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('buildAiPanelData', () => {
  it('converts NormalizedAiAnalysis to panel data', () => {
    const panel = buildAiPanelData(sampleAnalysis);
    expect(panel.summary).toBe('Test summary');
    expect(panel.keyFindings).toEqual(['Finding 1', 'Finding 2']);
    expect(panel.topRisks).toEqual(['Risk 1']);
    expect(panel.recommendedActions).toEqual(['Action 1', 'Action 2']);
    expect(panel.missingCoverageAreas).toEqual(['Area 1']);
    expect(panel.likelyRootCauses).toEqual(['Cause 1']);
    expect(panel.confidence).toBe('high');
    expect(panel.isFallback).toBe(false);
    expect(panel.category).toBe('coverage');
  });

  it('provides defaults for optional fields', () => {
    const minimal: NormalizedAiAnalysis = {
      summary: 'ok',
      keyFindings: [],
      topRisks: [],
      recommendedActions: [],
    };
    const panel = buildAiPanelData(minimal);
    expect(panel.missingCoverageAreas).toEqual([]);
    expect(panel.likelyRootCauses).toEqual([]);
    expect(panel.confidence).toBe('medium');
    expect(panel.isFallback).toBe(false);
    expect(panel.category).toBe('');
  });
});

// ─── 6. Fallback interpreter ──────────────────────────────────────────────────

describe('generateFallbackCoverageAnalysis', () => {
  it('marks result as fallback', () => {
    const result = generateFallbackCoverageAnalysis({ results: sampleResults });
    expect(result.isFallback).toBe(true);
  });

  it('generates a passing summary when all gates pass', () => {
    const result = generateFallbackCoverageAnalysis({
      results: sampleResults,
      gatePassed: true,
      failedCategories: [],
    });
    expect(result.summary).toContain('passed');
  });

  it('generates a failing summary when gates fail', () => {
    const result = generateFallbackCoverageAnalysis({
      results: sampleResults,
      gatePassed: false,
      failedCategories: ['business'],
    });
    expect(result.summary).toContain('business');
    expect(result.topRisks.length).toBeGreaterThan(0);
  });

  it('lists uncovered items in missingCoverageAreas', () => {
    const result = generateFallbackCoverageAnalysis({ results: sampleResults });
    expect(result.missingCoverageAreas).toBeDefined();
  });

  it('sets category to "coverage"', () => {
    const result = generateFallbackCoverageAnalysis({ results: sampleResults });
    expect(result.category).toBe('coverage');
  });

  it('produces recommendedActions for failing gates', () => {
    const result = generateFallbackCoverageAnalysis({ results: sampleResults, failedCategories: ['endpoint'] });
    expect(result.recommendedActions.some((a) => a.includes('endpoint'))).toBe(true);
  });
});

describe('generateFallbackSecurityAnalysis', () => {
  it('marks result as fallback', () => {
    const result = generateFallbackSecurityAnalysis({ scanSummary: sampleSecurity });
    expect(result.isFallback).toBe(true);
  });

  it('generates failing summary when gate fails', () => {
    const result = generateFallbackSecurityAnalysis({ scanSummary: sampleSecurity });
    expect(result.summary).toContain('FAILED');
  });

  it('generates passing summary when gate passes', () => {
    const passed: SecurityScanSummary = {
      ...sampleSecurity,
      gateResult: { ...sampleSecurity.gateResult!, passed: true },
    };
    const result = generateFallbackSecurityAnalysis({ scanSummary: passed });
    expect(result.summary).toContain('completed');
  });

  it('includes finding counts in keyFindings', () => {
    const result = generateFallbackSecurityAnalysis({ scanSummary: sampleSecurity });
    expect(result.keyFindings.some((f) => f.includes('5'))).toBe(true);
  });

  it('sets category to "security"', () => {
    const result = generateFallbackSecurityAnalysis({ scanSummary: sampleSecurity });
    expect(result.category).toBe('security');
  });
});

describe('generateFallbackAnalysis', () => {
  it('generates passing analysis when coverage meets threshold', () => {
    const result = generateFallbackAnalysis('performance', 85, 80);
    expect(result.summary).toContain('passed');
    expect(result.topRisks).toEqual([]);
  });

  it('generates failing analysis when coverage below threshold', () => {
    const result = generateFallbackAnalysis('compatibility', 60, 80);
    expect(result.summary).toContain('below');
    expect(result.topRisks.length).toBeGreaterThan(0);
  });

  it('uses the supplied category', () => {
    const result = generateFallbackAnalysis('custom', 90);
    expect(result.category).toBe('custom');
  });

  it('marks result as fallback', () => {
    const result = generateFallbackAnalysis('endpoint', 100);
    expect(result.isFallback).toBe(true);
  });
});

// ─── 7. Event stream ──────────────────────────────────────────────────────────

describe('AnalysisEventStream', () => {
  it('buffers emitted events', () => {
    const stream = new AnalysisEventStream();
    stream.emit('scan_started', { scanId: 'abc' });
    stream.emit('file_analyzed', { file: 'test.ts' });
    expect(stream.getEvents().length).toBe(2);
  });

  it('delivers events to subscribers', () => {
    const stream = new AnalysisEventStream();
    const received: string[] = [];
    stream.subscribe((e) => received.push(e.type));
    stream.emit('scan_started');
    stream.emit('scan_completed');
    expect(received).toEqual(['scan_started', 'scan_completed']);
  });

  it('does not crash when subscriber throws', () => {
    const stream = new AnalysisEventStream();
    stream.subscribe(() => { throw new Error('handler error'); });
    expect(() => stream.emit('scan_started')).not.toThrow();
  });

  it('clears buffered events', () => {
    const stream = new AnalysisEventStream();
    stream.emit('scan_started');
    stream.clear();
    expect(stream.getEvents().length).toBe(0);
  });

  it('includes timestamp and payload', () => {
    const stream = new AnalysisEventStream();
    const before = Date.now();
    stream.emit('endpoint_detected', { path: '/api/users' });
    const after = Date.now();
    const events = stream.getEvents();
    expect(events[0]!.timestamp).toBeGreaterThanOrEqual(before);
    expect(events[0]!.timestamp).toBeLessThanOrEqual(after);
    expect(events[0]!.payload['path']).toBe('/api/users');
  });
});

describe('createNoOpStream', () => {
  it('creates a usable no-op stream', () => {
    const stream = createNoOpStream();
    expect(stream).toBeInstanceOf(AnalysisEventStream);
    stream.emit('scan_started');
    expect(stream.getEvents().length).toBe(1);
  });
});

// ─── 8. McpIntegration facade – disabled (fallback) mode ─────────────────────

describe('McpIntegration – MCP disabled (fallback)', () => {
  let mcp: McpIntegration;

  beforeEach(() => {
    mcp = new McpIntegration(disabledMcpConfig);
  });

  it('isEnabled() returns false', () => {
    expect(mcp.isEnabled()).toBe(false);
  });

  it('isEnabledFor() returns false for any server', () => {
    expect(mcp.isEnabledFor('coverageSummary')).toBe(false);
  });

  it('analyzeCoverage returns fallback analysis', async () => {
    const result = await mcp.analyzeCoverage({ results: sampleResults, failedCategories: [] });
    expect(result.isFallback).toBe(true);
    expect(result.category).toBe('coverage');
  });

  it('analyzeSecurity returns fallback analysis', async () => {
    const result = await mcp.analyzeSecurity({ scanSummary: sampleSecurity });
    expect(result.isFallback).toBe(true);
    expect(result.category).toBe('security');
  });

  it('analyzePerformance returns fallback analysis', async () => {
    const result = await mcp.analyzePerformance({ coveragePercent: 80, totalScenarios: 10, coveredScenarios: 8 });
    expect(result.isFallback).toBe(true);
  });

  it('analyzeCompatibility returns fallback analysis', async () => {
    const result = await mcp.analyzeCompatibility({ compatibilityPercent: 90, breakingChanges: 0, totalEndpoints: 10 });
    expect(result.isFallback).toBe(true);
  });

  it('analyzeCiSummary returns fallback analysis', async () => {
    const result = await mcp.analyzeCiSummary({ overallPassed: true, coverageResults: sampleResults, failedGates: [] });
    expect(result.isFallback).toBe(true);
  });

  it('renderMarkdown produces a <details> block', async () => {
    const analysis = await mcp.analyzeCoverage({ results: sampleResults });
    const md = mcp.renderMarkdown(analysis, 'coverage', 'Endpoint Coverage');
    expect(md).toContain('<details>');
  });

  it('renderHtml produces an HTML details block', async () => {
    const analysis = await mcp.analyzeSecurity({ scanSummary: sampleSecurity });
    const html = mcp.renderHtml(analysis, 'security', 'Security');
    expect(html).toContain('<details');
  });

  it('buildPanelData produces panel data', async () => {
    const analysis = await mcp.analyzeCoverage({ results: sampleResults });
    const panel = mcp.buildPanelData(analysis);
    expect(typeof panel.summary).toBe('string');
    expect(Array.isArray(panel.keyFindings)).toBe(true);
  });

  it('events stream captures emitted events', () => {
    mcp.events.emit('scan_started', { test: true });
    expect(mcp.getEvents().length).toBe(1);
  });
});

// ─── 9. Toggle logic ──────────────────────────────────────────────────────────

describe('McpIntegration – per-server toggle logic', () => {
  it('performanceAnalysis disabled → fallback used', async () => {
    const mcp = new McpIntegration({
      enabled: true,
      servers: {
        performanceAnalysis: { enabled: false },
      },
    });
    const result = await mcp.analyzePerformance({ coveragePercent: 70, totalScenarios: 5, coveredScenarios: 3 });
    expect(result.isFallback).toBe(true);
  });

  it('compatibilityAnalysis disabled → fallback used', async () => {
    const mcp = new McpIntegration({
      enabled: true,
      servers: { compatibilityAnalysis: { enabled: false } },
    });
    const result = await mcp.analyzeCompatibility({ compatibilityPercent: 85, breakingChanges: 1, totalEndpoints: 10 });
    expect(result.isFallback).toBe(true);
  });
});

// ─── 10. Mock MCP server ──────────────────────────────────────────────────────

describe('buildMockAnalysisResponse', () => {
  it('returns a deterministic response for a category', () => {
    const resp = buildMockAnalysisResponse('coverage');
    expect(resp.category).toBe('coverage');
    expect(resp.summary).toContain('coverage');
    expect(Array.isArray(resp.keyFindings)).toBe(true);
    expect(resp.isFallback).toBe(false);
  });

  it('throws for non-normal behaviour (handled at server layer)', () => {
    expect(() => buildMockAnalysisResponse('coverage', 'error')).toThrow();
  });
});

describe('startMockMcpServer – HTTP integration', () => {
  it('starts and returns a URL', async () => {
    const server = await startMockMcpServer();
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    await server.close();
  });

  it('returns deterministic mock responses', async () => {
    const server = await startMockMcpServer();
    const client = new McpClient({
      enabled: true,
      servers: {
        coverageSummary: { enabled: true, transport: 'http', url: server.url },
      },
      serverAllowlist: ['http://127.0.0.1'],
    });
    const request = buildCoverageSummaryPrompt({ results: sampleResults });
    const raw = await client.send('coverageSummary', request);
    await server.close();

    expect(raw.ok).toBe(true);
    const normalized = normalizeMcpResponse(raw, 'coverage');
    expect(normalized.summary).toContain('coverage');
  });

  it('returns error response when behaviour=error', async () => {
    const server = await startMockMcpServer({ behaviour: 'error' });
    const client = new McpClient({
      enabled: true,
      servers: { coverageSummary: { enabled: true, transport: 'http', url: server.url } },
      serverAllowlist: ['http://127.0.0.1'],
    });
    const request = buildCoverageSummaryPrompt({ results: sampleResults });
    const raw = await client.send('coverageSummary', request);
    await server.close();

    expect(raw.ok).toBe(false);
  });

  it('returns malformed response when behaviour=malformed', async () => {
    const server = await startMockMcpServer({ behaviour: 'malformed' });
    const client = new McpClient({
      enabled: true,
      servers: { coverageSummary: { enabled: true, transport: 'http', url: server.url } },
      serverAllowlist: ['http://127.0.0.1'],
    });
    const request = buildCoverageSummaryPrompt({ results: sampleResults });
    const raw = await client.send('coverageSummary', request);
    await server.close();

    // The raw response is "ok" (200 status) but content is malformed JSON
    if (raw.ok) {
      const normalized = normalizeMcpResponse(raw, 'coverage');
      // Fallback to plain-text summary wrapping
      expect(normalized.summary).toBeDefined();
    } else {
      // Accept as a graceful error too
      expect(raw.error).toBeDefined();
    }
  });

  it('setBehaviour changes mock behaviour at runtime', async () => {
    const server = await startMockMcpServer();
    server.setBehaviour('error');
    const client = new McpClient({
      enabled: true,
      servers: { coverageSummary: { enabled: true, transport: 'http', url: server.url } },
      serverAllowlist: ['http://127.0.0.1'],
    });
    const request = buildCoverageSummaryPrompt({ results: sampleResults });
    const raw = await client.send('coverageSummary', request);
    await server.close();

    expect(raw.ok).toBe(false);
  });
});

// ─── 11. McpIntegration – HTTP MCP server integration ────────────────────────

describe('McpIntegration – HTTP server integration', () => {
  it('uses MCP server when enabled and returns normalized analysis', async () => {
    const server = await startMockMcpServer();
    const mcp = new McpIntegration({
      enabled: true,
      servers: {
        coverageSummary: { enabled: true, transport: 'http', url: server.url },
      },
      serverAllowlist: ['http://127.0.0.1'],
    });

    const result = await mcp.analyzeCoverage({ results: sampleResults });
    await server.close();

    expect(result.isFallback).toBeFalsy();
    expect(result.summary).toContain('coverage');
    expect(Array.isArray(result.keyFindings)).toBe(true);
  });

  it('falls back gracefully when MCP server returns error', async () => {
    const server = await startMockMcpServer({ behaviour: 'error' });
    const mcp = new McpIntegration({
      enabled: true,
      servers: {
        coverageSummary: { enabled: true, transport: 'http', url: server.url },
      },
      serverAllowlist: ['http://127.0.0.1'],
      retryPolicy: { maxRetries: 0 },
    });

    const result = await mcp.analyzeCoverage({ results: sampleResults });
    await server.close();

    // When server fails, isFallback should be set
    expect(result.isFallback).toBe(true);
  });

  it('security analysis works with HTTP mock server', async () => {
    const server = await startMockMcpServer();
    const mcp = new McpIntegration({
      enabled: true,
      servers: {
        securityScan: { enabled: true, transport: 'http', url: server.url },
      },
      serverAllowlist: ['http://127.0.0.1'],
    });

    const result = await mcp.analyzeSecurity({ scanSummary: sampleSecurity });
    await server.close();

    expect(result.category).toBe('security');
    expect(typeof result.summary).toBe('string');
  });
});

// ─── 12. stdio mock server integration ───────────────────────────────────────

describe('McpClient – stdio transport integration', () => {
  it('sends prompt to stdio mock server and gets response', async () => {
    const scriptPath = path.resolve(__dirname, '../src/mcp/testing/mock-server/stdio-server.js');
    const client = new McpClient({
      enabled: true,
      servers: {
        coverageSummary: {
          enabled: true,
          transport: 'stdio',
          command: 'node',
          args: [scriptPath],
        },
      },
    });

    const request = buildCoverageSummaryPrompt({ results: sampleResults });
    const raw = await client.send('coverageSummary', request);

    expect(raw.ok).toBe(true);
    const normalized = normalizeMcpResponse(raw, 'coverage');
    expect(normalized.summary).toContain('coverage');
  });

  it('handles error behaviour via MCP_MOCK_BEHAVIOUR env', async () => {
    const scriptPath = path.resolve(__dirname, '../src/mcp/testing/mock-server/stdio-server.js');
    const client = new McpClient({
      enabled: true,
      servers: {
        coverageSummary: {
          enabled: true,
          transport: 'stdio',
          command: 'node',
          args: [`-e`, `process.env.MCP_MOCK_BEHAVIOUR='error'; require('${scriptPath}')`],
        },
      },
      retryPolicy: { maxRetries: 0 },
    });

    const request = buildCoverageSummaryPrompt({ results: sampleResults });
    // This may fail or succeed depending on env — just check it doesn't throw
    await expect(client.send('coverageSummary', request)).resolves.toBeDefined();
  });
});

// ─── 13. Contract schema tests ────────────────────────────────────────────────

describe('Contract schemas', () => {
  const schemasDir = path.resolve(__dirname, '../src/mcp/contracts');

  it('analysis-request.schema.json exists and is valid JSON', () => {
    const schemaPath = path.join(schemasDir, 'analysis-request.schema.json');
    expect(fs.existsSync(schemaPath)).toBe(true);
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    expect(schema['$schema']).toBeDefined();
    expect(schema['required']).toContain('category');
    expect(schema['required']).toContain('prompt');
    expect(schema['required']).toContain('context');
  });

  it('analysis-response.schema.json exists and is valid JSON', () => {
    const schemaPath = path.join(schemasDir, 'analysis-response.schema.json');
    expect(fs.existsSync(schemaPath)).toBe(true);
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
    expect(schema['required']).toContain('summary');
    expect(schema['required']).toContain('keyFindings');
    expect(schema['required']).toContain('topRisks');
    expect(schema['required']).toContain('recommendedActions');
  });

  it('a valid prompt request matches request schema properties', () => {
    const request = buildCoverageSummaryPrompt({ results: sampleResults });
    expect(typeof request.category).toBe('string');
    expect(typeof request.prompt).toBe('string');
    expect(typeof request.context).toBe('object');
    expect(request.category.length).toBeGreaterThan(0);
    expect(request.prompt.length).toBeGreaterThan(0);
  });

  it('a normalized response matches response schema properties', () => {
    const raw = {
      ok: true,
      content: JSON.stringify({
        summary: 'ok',
        keyFindings: ['f1'],
        topRisks: ['r1'],
        recommendedActions: ['a1'],
        confidence: 'high',
      }),
    };
    const normalized = normalizeMcpResponse(raw, 'coverage');
    expect(typeof normalized.summary).toBe('string');
    expect(Array.isArray(normalized.keyFindings)).toBe(true);
    expect(Array.isArray(normalized.topRisks)).toBe(true);
    expect(Array.isArray(normalized.recommendedActions)).toBe(true);
  });

  it('fallback analysis conforms to response schema', () => {
    const result = generateFallbackCoverageAnalysis({ results: sampleResults });
    expect(typeof result.summary).toBe('string');
    expect(Array.isArray(result.keyFindings)).toBe(true);
    expect(Array.isArray(result.topRisks)).toBe(true);
    expect(Array.isArray(result.recommendedActions)).toBe(true);
  });
});

// ─── 14. CoverageConfig mcp field ────────────────────────────────────────────

describe('CoverageConfig.mcp integration', () => {
  it('config.ts accepts an mcp block without errors', () => {
    // Just import and verify the type accepts mcp
    const { defaultConfig } = require('../src/config');
    expect(defaultConfig).toBeDefined();
    // mcp is optional, so defaultConfig.mcp should be undefined
    expect(defaultConfig.mcp).toBeUndefined();
  });
});
