/**
 * Tests for the built-in summary engine (src/summary/).
 *
 * Covers:
 *  - Section inclusion logic (gate-aware)
 *  - Gate-aware rendering
 *  - Scanner-aware rendering
 *  - Markdown generation
 *  - Pass/fail status logic
 *  - Omission of non-run analyzers
 *  - AI summary structure
 *  - generateBuildSummary output
 *  - generatePrSummary output
 *  - File output
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateBuildSummary } from '../src/summary/buildSummary';
import { generatePrSummary } from '../src/summary/prSummary';
import {
  coverageTypeTitle,
  renderCoverageSection,
  renderSecurityScanSection,
  renderAiSummary,
  statusBadge,
  pct,
  extractGaps,
} from '../src/summary/markdownRenderer';
import type { SummaryInput } from '../src/summary/markdownRenderer';
import type { CoverageResult } from '../src/reporting';
import type { QualityGateResult } from '../src/qualityGate';
import type { SecurityScanSummary, ScannerResult } from '../src/security/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeResult(
  type: string,
  percent: number,
  total = 10,
  details: Record<string, unknown> = {},
): CoverageResult {
  return {
    type,
    totalItems: total,
    coveredItems: Math.round((percent / 100) * total),
    coveragePercent: percent,
    details,
  };
}

function makeGate(passed: boolean, failures: Array<{ category: string; expected: number; actual: number; gap: number }> = []): QualityGateResult {
  return {
    passed,
    threshold: 80,
    actual: Object.fromEntries(failures.map((f) => [f.category, f.actual])),
    failures,
  };
}

const sampleResults: CoverageResult[] = [
  makeResult('endpoint', 100),
  makeResult('business', 80),
];

const passedGate = makeGate(true);
const failedGate = makeGate(false, [{ category: 'business', expected: 90, actual: 80, gap: 10 }]);

const sampleInput: SummaryInput = {
  results: sampleResults,
  qualityGate: passedGate,
  thresholds: { endpoint: 80, business: 90 },
  projectName: 'my-api',
  branch: 'main',
  commitSha: 'abc123',
  buildId: 'build-001',
};

// ─── markdownRenderer helpers ─────────────────────────────────────────────────

describe('coverageTypeTitle', () => {
  it('returns human-readable title for known types', () => {
    expect(coverageTypeTitle('endpoint')).toBe('Endpoint Coverage');
    expect(coverageTypeTitle('business')).toBe('Business Rule Coverage');
    expect(coverageTypeTitle('integration')).toBe('Integration Flow Coverage');
    expect(coverageTypeTitle('error')).toBe('Error Handling Coverage');
    expect(coverageTypeTitle('parameter')).toBe('Parameter Coverage');
    expect(coverageTypeTitle('security')).toBe('Security Control Coverage');
    expect(coverageTypeTitle('performance')).toBe('Performance Coverage');
    expect(coverageTypeTitle('resilience')).toBe('Resilience Coverage');
    expect(coverageTypeTitle('compatibility')).toBe('Compatibility & Contract Coverage');
  });

  it('capitalises unknown type names', () => {
    expect(coverageTypeTitle('custom')).toBe('Custom Coverage');
  });
});

describe('statusBadge', () => {
  it('returns pass badge for true', () => {
    expect(statusBadge(true)).toContain('PASS');
  });

  it('returns fail badge for false', () => {
    expect(statusBadge(false)).toContain('FAIL');
  });
});

describe('pct', () => {
  it('formats percentage with two decimal places', () => {
    expect(pct(92.4)).toBe('92.40%');
    expect(pct(100)).toBe('100.00%');
    expect(pct(0)).toBe('0.00%');
  });
});

describe('extractGaps', () => {
  it('returns empty array when fully covered', () => {
    const result = makeResult('endpoint', 100);
    expect(extractGaps(result)).toEqual([]);
  });

  it('returns fallback message when no detail available', () => {
    const result = makeResult('endpoint', 50, 10);
    const gaps = extractGaps(result);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps[0]).toContain('not covered');
  });

  it('extracts uncoveredEndpoints from details', () => {
    const result = makeResult('endpoint', 50, 10, {
      uncoveredEndpoints: [
        { method: 'POST', path: '/payments/refund' },
        { method: 'DELETE', path: '/users/{id}' },
      ],
    });
    const gaps = extractGaps(result);
    expect(gaps).toContain('`POST /payments/refund`');
    expect(gaps).toContain('`DELETE /users/{id}`');
  });

  it('extracts uncovered list from details', () => {
    const result = makeResult('business', 60, 10, {
      uncovered: ['rule-auth-check', 'rule-rate-limit'],
    });
    const gaps = extractGaps(result);
    expect(gaps).toContain('`rule-auth-check`');
  });

  it('extracts uncoveredFlows from details', () => {
    const result = makeResult('integration', 70, 10, {
      uncoveredFlows: ['checkout-flow', 'refund-flow'],
    });
    const gaps = extractGaps(result);
    expect(gaps).toContain('`checkout-flow`');
  });

  it('respects the limit parameter', () => {
    const result = makeResult('endpoint', 10, 20, {
      uncoveredEndpoints: Array.from({ length: 15 }, (_, i) => ({
        method: 'GET',
        path: `/endpoint/${i}`,
      })),
    });
    expect(extractGaps(result, 5)).toHaveLength(5);
  });
});

// ─── renderCoverageSection ────────────────────────────────────────────────────

describe('renderCoverageSection', () => {
  it('includes the coverage type title', () => {
    const md = renderCoverageSection(makeResult('endpoint', 92), 100, true);
    expect(md).toContain('## Endpoint Coverage');
  });

  it('shows PASS status when gate passes', () => {
    const md = renderCoverageSection(makeResult('endpoint', 100), 80, false);
    expect(md).toContain('PASS');
  });

  it('shows FAIL status when gate fails', () => {
    const md = renderCoverageSection(makeResult('endpoint', 70), 80, true);
    expect(md).toContain('FAIL');
  });

  it('shows "Gate: not configured" when no threshold', () => {
    const md = renderCoverageSection(makeResult('endpoint', 70), undefined, false);
    expect(md).toContain('not configured');
    expect(md).not.toContain('PASS');
    expect(md).not.toContain('FAIL');
  });

  it('shows threshold when configured', () => {
    const md = renderCoverageSection(makeResult('endpoint', 80), 85, false);
    expect(md).toContain('85.00%');
  });

  it('shows actual coverage', () => {
    const md = renderCoverageSection(makeResult('endpoint', 92.5), 100, true);
    expect(md).toContain('92.50%');
  });

  it('includes recommended next work section', () => {
    const md = renderCoverageSection(makeResult('endpoint', 80), 100, true);
    expect(md).toContain('Recommended Next Work');
  });

  it('shows gap amount in recommendation when gate fails', () => {
    const md = renderCoverageSection(makeResult('endpoint', 70), 100, true);
    expect(md).toContain('30.00%');
  });

  it('shows main gaps section when there are uncovered items', () => {
    const result = makeResult('endpoint', 60, 10, {
      uncoveredEndpoints: [{ method: 'POST', path: '/pay' }],
    });
    const md = renderCoverageSection(result, 80, true);
    expect(md).toContain('Main Gaps');
    expect(md).toContain('POST /pay');
  });
});

// ─── renderSecurityScanSection ────────────────────────────────────────────────

describe('renderSecurityScanSection', () => {
  const mockScan: SecurityScanSummary = {
    totalFindings: 5,
    bySeverity: { LOW: 1, MEDIUM: 2, HIGH: 2, CRITICAL: 0 },
    byCategory: { sast: 3, sca: 1, secret: 1, misconfig: 0, dast: 0, auth: 0, injection: 0, 'data-exposure': 0, crypto: 0, unknown: 0 },
    byScanner: { semgrep: 5, trivy: 0, zap: 0, gitleaks: 0, other: 0 },
    findings: [
      {
        scanner: 'semgrep',
        category: 'sast',
        severity: 'HIGH',
        title: 'SQL injection risk',
        filePath: 'src/payments/refund.ts',
      },
    ],
    scannersRun: ['semgrep'],
    gateResult: {
      passed: false,
      reasons: ['High findings exceed limit'],
      thresholds: {},
      counts: { critical: 0, high: 2, medium: 2, low: 1, secrets: 0, misconfigHigh: 0, criticalVulns: 0, highVulns: 0 },
    },
  };

  const mockScannerResults: ScannerResult[] = [
    {
      scanner: 'semgrep',
      success: true,
      findings: [
        {
          scanner: 'semgrep',
          category: 'sast',
          severity: 'HIGH',
          title: 'SQL injection risk',
          filePath: 'src/payments/refund.ts',
        },
      ],
    },
  ];

  it('includes security scanning heading', () => {
    const md = renderSecurityScanSection(mockScan, mockScannerResults, true, false);
    expect(md).toContain('## Security Scanning');
  });

  it('shows FAIL status when gate failed', () => {
    const md = renderSecurityScanSection(mockScan, mockScannerResults, true, false);
    expect(md).toContain('FAIL');
  });

  it('shows total findings count', () => {
    const md = renderSecurityScanSection(mockScan, mockScannerResults, true, false);
    expect(md).toContain('5');
  });

  it('shows main blocking findings', () => {
    const md = renderSecurityScanSection(mockScan, mockScannerResults, true, false);
    expect(md).toContain('SQL injection risk');
  });

  it('shows "Gate: not configured" when gate not evaluated', () => {
    const scanNonGate: SecurityScanSummary = { ...mockScan, gateResult: undefined };
    const md = renderSecurityScanSection(scanNonGate, mockScannerResults, false, undefined);
    expect(md).toContain('not configured');
  });

  it('shows scanner name', () => {
    const md = renderSecurityScanSection(mockScan, mockScannerResults, true, false);
    expect(md).toContain('Semgrep');
  });
});

// ─── Gate-aware inclusion logic ───────────────────────────────────────────────

describe('generateBuildSummary – gate-aware inclusion', () => {
  it('includes sections for all results by default', async () => {
    const input: SummaryInput = {
      results: [makeResult('endpoint', 100), makeResult('business', 80)],
      qualityGate: passedGate,
    };
    const result = await generateBuildSummary(input);
    const endpointSection = result.sections.find((s) => s.id === 'endpoint');
    const businessSection = result.sections.find((s) => s.id === 'business');
    expect(endpointSection?.included).toBe(true);
    expect(businessSection?.included).toBe(true);
  });

  it('omits sections when includeOnlyEvaluatedSections=true and no threshold', async () => {
    const input: SummaryInput = {
      results: [makeResult('endpoint', 100), makeResult('business', 80)],
      qualityGate: passedGate,
      thresholds: { endpoint: 80 }, // business has no threshold
      summaryConfig: { includeOnlyEvaluatedSections: true },
    };
    const result = await generateBuildSummary(input);
    const endpointSection = result.sections.find((s) => s.id === 'endpoint');
    const businessSection = result.sections.find((s) => s.id === 'business');
    expect(endpointSection?.included).toBe(true);
    expect(businessSection?.included).toBe(false);
  });

  it('marks gate as evaluated only when threshold is configured', async () => {
    const input: SummaryInput = {
      results: [makeResult('endpoint', 100)],
      qualityGate: passedGate,
      thresholds: { endpoint: 80 },
    };
    const result = await generateBuildSummary(input);
    const section = result.sections.find((s) => s.id === 'endpoint');
    expect(section?.gateEvaluated).toBe(true);
  });

  it('marks gate as not evaluated when no threshold', async () => {
    const input: SummaryInput = {
      results: [makeResult('endpoint', 100)],
      qualityGate: passedGate,
      thresholds: {},
    };
    const result = await generateBuildSummary(input);
    const section = result.sections.find((s) => s.id === 'endpoint');
    expect(section?.gateEvaluated).toBe(false);
  });

  it('omits security-scan section when no securityScan provided', async () => {
    const input: SummaryInput = {
      results: [makeResult('endpoint', 100)],
    };
    const result = await generateBuildSummary(input);
    const secSection = result.sections.find((s) => s.id === 'security-scan');
    expect(secSection).toBeUndefined();
  });

  it('includes security-scan section when securityScan is provided', async () => {
    const scan: SecurityScanSummary = {
      totalFindings: 0,
      bySeverity: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
      byCategory: { sast: 0, sca: 0, secret: 0, misconfig: 0, dast: 0, auth: 0, injection: 0, 'data-exposure': 0, crypto: 0, unknown: 0 },
      byScanner: { semgrep: 0, trivy: 0, zap: 0, gitleaks: 0, other: 0 },
      findings: [],
      scannersRun: ['semgrep'],
      gateResult: undefined,
    };
    const input: SummaryInput = {
      results: [makeResult('endpoint', 100)],
      securityScan: scan,
      scannerResults: [],
    };
    const result = await generateBuildSummary(input);
    const secSection = result.sections.find((s) => s.id === 'security-scan');
    expect(secSection?.included).toBe(true);
  });
});

// ─── generateBuildSummary content ────────────────────────────────────────────

describe('generateBuildSummary – content', () => {
  it('contains PASSED in markdown when gate passes', async () => {
    const result = await generateBuildSummary(sampleInput);
    expect(result.markdown).toContain('PASSED');
  });

  it('contains FAILED in markdown when gate fails', async () => {
    const input: SummaryInput = { ...sampleInput, qualityGate: failedGate };
    const result = await generateBuildSummary(input);
    expect(result.markdown).toContain('FAILED');
  });

  it('contains project name in markdown', async () => {
    const result = await generateBuildSummary(sampleInput);
    expect(result.markdown).toContain('my-api');
  });

  it('contains branch name in markdown', async () => {
    const result = await generateBuildSummary(sampleInput);
    expect(result.markdown).toContain('main');
  });

  it('contains coverage category names', async () => {
    const result = await generateBuildSummary(sampleInput);
    expect(result.markdown).toContain('endpoint');
    expect(result.markdown).toContain('business');
  });

  it('shows failed gate details', async () => {
    const input: SummaryInput = { ...sampleInput, qualityGate: failedGate };
    const result = await generateBuildSummary(input);
    expect(result.markdown).toContain('business');
    expect(result.markdown).toContain('90');
  });

  it('includes pagesUrl link when provided', async () => {
    const input: SummaryInput = { ...sampleInput, pagesUrl: 'https://example.com/report' };
    const result = await generateBuildSummary(input);
    expect(result.markdown).toContain('https://example.com/report');
  });

  it('returns machine-readable JSON', async () => {
    const result = await generateBuildSummary(sampleInput);
    expect(result.json).toBeTruthy();
    const json = result.json as Record<string, unknown>;
    expect(json['coverage']).toBeDefined();
    expect(Array.isArray(json['coverage'])).toBe(true);
  });

  it('returns sections array', async () => {
    const result = await generateBuildSummary(sampleInput);
    expect(Array.isArray(result.sections)).toBe(true);
    expect(result.sections.length).toBe(2); // endpoint + business
  });

  it('marks passed section as passed=true', async () => {
    const input: SummaryInput = { ...sampleInput, thresholds: { endpoint: 80, business: 70 } };
    const result = await generateBuildSummary(input);
    const endpointSection = result.sections.find((s) => s.id === 'endpoint');
    expect(endpointSection?.passed).toBe(true);
  });

  it('marks failed section as passed=false', async () => {
    const input: SummaryInput = { ...sampleInput, qualityGate: failedGate, thresholds: { endpoint: 80, business: 90 } };
    const result = await generateBuildSummary(input);
    const businessSection = result.sections.find((s) => s.id === 'business');
    expect(businessSection?.passed).toBe(false);
  });
});

// ─── generateBuildSummary – file output ──────────────────────────────────────

describe('generateBuildSummary – file output', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'summary-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes build-summary.md', async () => {
    await generateBuildSummary(sampleInput, tmpDir);
    expect(fs.existsSync(path.join(tmpDir, 'build-summary.md'))).toBe(true);
  });

  it('writes ai-summary.md', async () => {
    await generateBuildSummary(sampleInput, tmpDir);
    expect(fs.existsSync(path.join(tmpDir, 'ai-summary.md'))).toBe(true);
  });

  it('writes summary.json', async () => {
    await generateBuildSummary(sampleInput, tmpDir);
    expect(fs.existsSync(path.join(tmpDir, 'summary.json'))).toBe(true);
  });

  it('writes ai-summary.json', async () => {
    await generateBuildSummary(sampleInput, tmpDir);
    expect(fs.existsSync(path.join(tmpDir, 'ai-summary.json'))).toBe(true);
  });

  it('build-summary.md contains PASSED', async () => {
    await generateBuildSummary(sampleInput, tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, 'build-summary.md'), 'utf-8');
    expect(content).toContain('PASSED');
  });

  it('summary.json is valid JSON with expected fields', async () => {
    await generateBuildSummary(sampleInput, tmpDir);
    const json = JSON.parse(fs.readFileSync(path.join(tmpDir, 'summary.json'), 'utf-8'));
    expect(json.coverage).toBeDefined();
    expect(json.sections).toBeDefined();
    expect(json.generatedAt).toBeDefined();
  });
});

// ─── generatePrSummary – content ─────────────────────────────────────────────

describe('generatePrSummary – content', () => {
  it('contains PASSED when gate passes', async () => {
    const result = await generatePrSummary(sampleInput);
    expect(result.markdown).toContain('PASSED');
  });

  it('contains FAILED when gate fails', async () => {
    const input: SummaryInput = { ...sampleInput, qualityGate: failedGate };
    const result = await generatePrSummary(input);
    expect(result.markdown).toContain('FAILED');
  });

  it('contains build ID', async () => {
    const result = await generatePrSummary(sampleInput);
    expect(result.markdown).toContain('build-001');
  });

  it('contains category names in table', async () => {
    const result = await generatePrSummary(sampleInput);
    expect(result.markdown).toContain('endpoint');
    expect(result.markdown).toContain('business');
  });

  it('includes pagesUrl link when provided', async () => {
    const input: SummaryInput = { ...sampleInput, pagesUrl: 'https://pages.example.com' };
    const result = await generatePrSummary(input);
    expect(result.markdown).toContain('https://pages.example.com');
  });

  it('includes failed gate details when gate fails', async () => {
    const input: SummaryInput = { ...sampleInput, qualityGate: failedGate };
    const result = await generatePrSummary(input);
    expect(result.markdown).toContain('Failed gates');
    expect(result.markdown).toContain('business');
  });

  it('shows ✅ PASS for 0% coverage when threshold is 0 and items exist', async () => {
    const zeroResult = makeResult('error', 0);   // totalItems=10, coveragePercent=0
    const input: SummaryInput = {
      ...sampleInput,
      results: [zeroResult],
      thresholds: { error: 0 },
      qualityGate: makeGate(true),
    };
    const result = await generatePrSummary(input);
    expect(result.markdown).toContain('✅ PASS');
    expect(result.markdown).not.toContain('⚠️ PASS');
  });

  it('shows — N/A for 0% coverage when totalItems is 0', async () => {
    const zeroItemsResult = makeResult('error', 0, 0);  // totalItems=0
    const input: SummaryInput = {
      ...sampleInput,
      results: [zeroItemsResult],
      thresholds: { error: 0 },
      qualityGate: makeGate(true),
    };
    const result = await generatePrSummary(input);
    expect(result.markdown).toContain('— N/A');
    expect(result.markdown).not.toContain('✅ PASS');
    expect(result.markdown).not.toContain('⚠️ PASS');
  });

  it('shows ⏭ SKIPPED for known metric types absent from results', async () => {
    const input: SummaryInput = {
      ...sampleInput,
      results: [makeResult('endpoint', 100)],
      thresholds: { endpoint: 80 },
    };
    const result = await generatePrSummary(input);
    expect(result.markdown).toContain('⏭ SKIPPED');
  });

  it('shows — for categories with no threshold configured', async () => {
    const input: SummaryInput = {
      ...sampleInput,
      thresholds: {},
    };
    const result = await generatePrSummary(input);
    expect(result.markdown).toContain('—');
  });

  it('returns sections array', async () => {
    const result = await generatePrSummary(sampleInput);
    expect(Array.isArray(result.sections)).toBe(true);
    expect(result.sections.length).toBe(2);
  });
});

// ─── generatePrSummary – file output ─────────────────────────────────────────

describe('generatePrSummary – file output', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-summary-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes pr-summary.md', async () => {
    await generatePrSummary(sampleInput, tmpDir);
    expect(fs.existsSync(path.join(tmpDir, 'pr-summary.md'))).toBe(true);
  });

  it('pr-summary.md contains expected content', async () => {
    await generatePrSummary(sampleInput, tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, 'pr-summary.md'), 'utf-8');
    expect(content).toContain('PASSED');
    expect(content).toContain('endpoint');
  });
});

// ─── AI summary structure ─────────────────────────────────────────────────────

describe('renderAiSummary', () => {
  it('includes AI-Friendly Coverage Summary heading', async () => {
    const result = await generateBuildSummary(sampleInput);
    const aiMd = renderAiSummary(sampleInput, result.sections);
    expect(aiMd).toContain('AI-Friendly Coverage Summary');
  });

  it('includes Analyzed Inputs section', async () => {
    const result = await generateBuildSummary(sampleInput);
    const aiMd = renderAiSummary(sampleInput, result.sections);
    expect(aiMd).toContain('Analyzed Inputs');
  });

  it('includes Coverage Details section', async () => {
    const result = await generateBuildSummary(sampleInput);
    const aiMd = renderAiSummary(sampleInput, result.sections);
    expect(aiMd).toContain('Coverage Details');
  });

  it('includes Failed Gates section when gate fails', async () => {
    const input: SummaryInput = { ...sampleInput, qualityGate: failedGate, thresholds: { endpoint: 80, business: 90 } };
    const result = await generateBuildSummary(input);
    const aiMd = renderAiSummary(input, result.sections);
    expect(aiMd).toContain('Failed Gates');
  });

  it('includes Recommended Next Steps', async () => {
    const result = await generateBuildSummary(sampleInput);
    const aiMd = renderAiSummary(sampleInput, result.sections);
    expect(aiMd).toContain('Recommended Next Steps');
  });

  it('shows project name when provided', async () => {
    const result = await generateBuildSummary(sampleInput);
    const aiMd = renderAiSummary(sampleInput, result.sections);
    expect(aiMd).toContain('my-api');
  });

  it('shows branch when provided', async () => {
    const result = await generateBuildSummary(sampleInput);
    const aiMd = renderAiSummary(sampleInput, result.sections);
    expect(aiMd).toContain('main');
  });

  it('includes remediation items when gate fails', async () => {
    const input: SummaryInput = {
      ...sampleInput,
      qualityGate: failedGate,
      thresholds: { endpoint: 80, business: 90 },
    };
    const result = await generateBuildSummary(input);
    const aiMd = renderAiSummary(input, result.sections);
    expect(aiMd).toContain('Highest Priority Remediation Items');
  });

  it('does not include failed gates section when all pass', async () => {
    const input: SummaryInput = {
      results: [makeResult('endpoint', 100)],
      qualityGate: passedGate,
      thresholds: { endpoint: 80 },
    };
    const result = await generateBuildSummary(input);
    const aiMd = renderAiSummary(input, result.sections);
    // Failed Gates heading should NOT appear (all passed)
    expect(aiMd).not.toContain('## Failed Gates');
  });
});

// ─── generateBuildSummary – still generates on gate failure ──────────────────

describe('generateBuildSummary – generates on gate failure', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-fail-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('still writes output files when the gate fails', async () => {
    const input: SummaryInput = {
      results: [makeResult('endpoint', 50)],
      qualityGate: makeGate(false, [{ category: 'endpoint', expected: 80, actual: 50, gap: 30 }]),
      thresholds: { endpoint: 80 },
    };
    await generateBuildSummary(input, tmpDir);
    expect(fs.existsSync(path.join(tmpDir, 'build-summary.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'summary.json'))).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, 'build-summary.md'), 'utf-8');
    expect(content).toContain('FAILED');
  });

  it('summary.json has overallPassed=false when gate fails', async () => {
    const input: SummaryInput = {
      results: [makeResult('endpoint', 50)],
      qualityGate: makeGate(false, [{ category: 'endpoint', expected: 80, actual: 50, gap: 30 }]),
      thresholds: { endpoint: 80 },
    };
    await generateBuildSummary(input, tmpDir);
    const json = JSON.parse(fs.readFileSync(path.join(tmpDir, 'summary.json'), 'utf-8'));
    expect(json.overallPassed).toBe(false);
  });
});

// ─── generatePrSummary – security scan section ───────────────────────────────

describe('generatePrSummary – security scan', () => {
  const mockScan: SecurityScanSummary = {
    totalFindings: 3,
    bySeverity: { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 0 },
    byCategory: { sast: 2, sca: 0, secret: 1, misconfig: 0, dast: 0, auth: 0, injection: 0, 'data-exposure': 0, crypto: 0, unknown: 0 },
    byScanner: { semgrep: 3, trivy: 0, zap: 0, gitleaks: 0, other: 0 },
    findings: [],
    scannersRun: ['semgrep'],
    gateResult: {
      passed: false,
      reasons: ['High findings exceed limit'],
      thresholds: {},
      counts: { critical: 0, high: 2, medium: 1, low: 0, secrets: 0, misconfigHigh: 0, criticalVulns: 0, highVulns: 0 },
    },
  };

  it('shows security scan findings count', async () => {
    const input: SummaryInput = {
      results: [makeResult('endpoint', 100)],
      securityScan: mockScan,
      scannerResults: [],
    };
    const result = await generatePrSummary(input);
    expect(result.markdown).toContain('3');
  });

  it('shows security gate fail', async () => {
    const input: SummaryInput = {
      results: [makeResult('endpoint', 100)],
      securityScan: mockScan,
      scannerResults: [],
    };
    const result = await generatePrSummary(input);
    expect(result.markdown).toContain('FAIL');
  });
});
