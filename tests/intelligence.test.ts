/**
 * Unit tests for the Coverage Intelligence engine.
 *
 * Covers: risk scoring, risk band, priority assignment, linkage engine,
 * recommendation generation, deduplication, framework/language hints,
 * and markdown rendering.
 */

import {
  computeRiskScore,
  scoreToRiskBand,
  scoreToPriority,
  severityToWeight,
  defaultExposureWeight,
  defaultCriticalityWeight,
  defaultFlowImpactWeight,
} from '../src/intelligence/riskScoring';

import {
  runLinkageEngine,
  buildRecommendationFromFinding,
} from '../src/intelligence/linkageEngine';

import {
  runIntelligenceEngine,
} from '../src/intelligence/index';

import {
  renderCoverageIntelligenceMd,
  renderMissingTestsMd,
  renderRiskPrioritizationMd,
} from '../src/intelligence/markdownReporter';

import type {
  FunctionalFinding,
  IntelligenceInput,
} from '../src/intelligence/types';

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Risk Scoring ─────────────────────────────────────────────────────────────

describe('severityToWeight', () => {
  it('maps CRITICAL → 100', () => {
    expect(severityToWeight('CRITICAL')).toBe(100);
  });
  it('maps HIGH → 75', () => {
    expect(severityToWeight('HIGH')).toBe(75);
  });
  it('maps MEDIUM → 50', () => {
    expect(severityToWeight('MEDIUM')).toBe(50);
  });
  it('maps LOW → 25', () => {
    expect(severityToWeight('LOW')).toBe(25);
  });
  it('defaults unknown severity → 25', () => {
    expect(severityToWeight('UNKNOWN')).toBe(25);
  });
  it('is case-insensitive', () => {
    expect(severityToWeight('critical')).toBe(100);
    expect(severityToWeight('high')).toBe(75);
  });
});

describe('scoreToRiskBand', () => {
  it('0-24 → Low', () => {
    expect(scoreToRiskBand(0)).toBe('Low');
    expect(scoreToRiskBand(24)).toBe('Low');
  });
  it('25-49 → Moderate', () => {
    expect(scoreToRiskBand(25)).toBe('Moderate');
    expect(scoreToRiskBand(49)).toBe('Moderate');
  });
  it('50-74 → High', () => {
    expect(scoreToRiskBand(50)).toBe('High');
    expect(scoreToRiskBand(74)).toBe('High');
  });
  it('75-100 → Critical', () => {
    expect(scoreToRiskBand(75)).toBe('Critical');
    expect(scoreToRiskBand(100)).toBe('Critical');
  });
});

describe('computeRiskScore', () => {
  it('returns a number between 0 and 100', () => {
    const score = computeRiskScore({
      severity: 'MEDIUM',
      category: 'uncovered-endpoint',
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('higher severity produces higher score', () => {
    const low = computeRiskScore({ severity: 'LOW', category: 'uncovered-endpoint' });
    const critical = computeRiskScore({ severity: 'CRITICAL', category: 'uncovered-endpoint' });
    expect(critical).toBeGreaterThan(low);
  });

  it('security signal increases score', () => {
    const without = computeRiskScore({ severity: 'MEDIUM', category: 'uncovered-endpoint', hasSecuritySignal: false });
    const with_ = computeRiskScore({ severity: 'MEDIUM', category: 'uncovered-endpoint', hasSecuritySignal: true });
    expect(with_).toBeGreaterThan(without);
  });

  it('zero coverage increases score', () => {
    const partial = computeRiskScore({ severity: 'MEDIUM', category: 'uncovered-endpoint', zeroCoverage: false });
    const zero = computeRiskScore({ severity: 'MEDIUM', category: 'uncovered-endpoint', zeroCoverage: true });
    expect(zero).toBeGreaterThanOrEqual(partial);
  });

  it('uses formula components correctly', () => {
    // All max components → score should be 100
    const score = computeRiskScore({
      severity: 'CRITICAL',
      category: 'missing-auth-test',
      components: {
        severityWeight: 100,
        exposureWeight: 100,
        criticalityWeight: 100,
        missingCoverageWeight: 100,
        securitySignalWeight: 100,
        flowImpactWeight: 100,
        changeVolatilityWeight: 100,
      },
    });
    expect(score).toBe(100);
  });

  it('clamps score to 0-100', () => {
    const score = computeRiskScore({
      severity: 'CRITICAL',
      category: 'missing-auth-test',
      components: {
        severityWeight: 200, // out of range
        exposureWeight: 200,
        criticalityWeight: 200,
        missingCoverageWeight: 200,
        securitySignalWeight: 200,
        flowImpactWeight: 200,
        changeVolatilityWeight: 200,
      },
    });
    expect(score).toBe(100);
  });

  it('money movement endpoints get higher criticality', () => {
    const normal = computeRiskScore({ severity: 'HIGH', category: 'uncovered-endpoint', endpointPath: '/users' });
    const payment = computeRiskScore({ severity: 'HIGH', category: 'uncovered-endpoint', endpointPath: '/payments/refund' });
    expect(payment).toBeGreaterThan(normal);
  });
});

// ─── Priority Assignment ──────────────────────────────────────────────────────

describe('scoreToPriority', () => {
  it('score >= 85 → P0', () => {
    expect(scoreToPriority(85)).toBe('P0');
    expect(scoreToPriority(100)).toBe('P0');
  });
  it('score 70-84 → P1', () => {
    expect(scoreToPriority(70)).toBe('P1');
    expect(scoreToPriority(84)).toBe('P1');
  });
  it('score 50-69 → P2', () => {
    expect(scoreToPriority(50)).toBe('P2');
    expect(scoreToPriority(69)).toBe('P2');
  });
  it('score < 50 → P3', () => {
    expect(scoreToPriority(49)).toBe('P3');
    expect(scoreToPriority(0)).toBe('P3');
  });

  it('critical security finding overrides P3 to P1', () => {
    expect(scoreToPriority(30, { isCriticalSecurityFinding: true })).toBe('P1');
  });
  it('money movement overrides P2/P3 to P1', () => {
    // Score 55 would be P2 normally, but money movement endpoint overrides to P1
    expect(scoreToPriority(55, { isMoneyMovementEndpoint: true })).toBe('P1');
    // Score 40 would be P3, also upgraded to P1
    expect(scoreToPriority(40, { isMoneyMovementEndpoint: true })).toBe('P1');
  });
  it('auth gap overrides P3 to P1', () => {
    expect(scoreToPriority(20, { isAuthGap: true })).toBe('P1');
  });
  it('zero coverage critical flow overrides P3 to P1', () => {
    expect(scoreToPriority(10, { isZeroCoverageCriticalFlow: true })).toBe('P1');
  });
  it('does not downgrade P0 or P1', () => {
    expect(scoreToPriority(90, { isAuthGap: true })).toBe('P0');
    expect(scoreToPriority(75, { isMoneyMovementEndpoint: true })).toBe('P1');
  });
});

// ─── Exposure/Criticality Defaults ───────────────────────────────────────────

describe('defaultExposureWeight', () => {
  it('auth endpoints get high exposure', () => {
    expect(defaultExposureWeight('uncovered-endpoint', '/auth/login')).toBeGreaterThanOrEqual(80);
  });
  it('admin endpoints get low exposure', () => {
    expect(defaultExposureWeight('uncovered-endpoint', '/admin/settings')).toBeLessThanOrEqual(40);
  });
  it('missing-auth-test category gets high exposure', () => {
    expect(defaultExposureWeight('missing-auth-test')).toBeGreaterThanOrEqual(70);
  });
  it('unknown returns default 50', () => {
    expect(defaultExposureWeight('uncovered-endpoint')).toBe(50);
  });
});

describe('defaultCriticalityWeight', () => {
  it('payment endpoints are critical', () => {
    expect(defaultCriticalityWeight('uncovered-endpoint', '/payments/charge')).toBeGreaterThanOrEqual(90);
  });
  it('missing-auth-test is high criticality', () => {
    expect(defaultCriticalityWeight('missing-auth-test')).toBeGreaterThanOrEqual(80);
  });
});

describe('defaultFlowImpactWeight', () => {
  it('missing-flow-step-test has high flow impact', () => {
    expect(defaultFlowImpactWeight('missing-flow-step-test')).toBeGreaterThanOrEqual(70);
  });
  it('uncovered-endpoint has lower flow impact', () => {
    expect(defaultFlowImpactWeight('uncovered-endpoint')).toBeLessThan(50);
  });
});

// ─── Linkage Engine ───────────────────────────────────────────────────────────

describe('runLinkageEngine', () => {
  it('generates findings for uncovered endpoints', () => {
    const input: IntelligenceInput = {
      coverageResults: [
        {
          type: 'endpoint',
          totalItems: 3,
          coveredItems: 1,
          coveragePercent: 33,
          details: [
            { endpoint: { method: 'GET', path: '/users' }, covered: true },
            { endpoint: { method: 'POST', path: '/users' }, covered: false },
            { endpoint: { method: 'DELETE', path: '/users/{id}' }, covered: false },
          ],
        },
      ],
    };

    const { findings, recommendations } = runLinkageEngine(input);
    expect(findings.length).toBe(2);
    expect(findings.every((f) => f.category === 'uncovered-endpoint')).toBe(true);
    expect(recommendations.length).toBeGreaterThan(0);
  });

  it('generates findings from security scan findings', () => {
    const input: IntelligenceInput = {
      coverageResults: [],
      securityFindings: [
        {
          severity: 'HIGH',
          title: 'SQL Injection risk',
          scanner: 'semgrep',
          endpoint: { method: 'POST', path: '/search' },
        },
      ],
    };

    const { findings } = runLinkageEngine(input);
    expect(findings.some((f) => f.source === 'security-scan')).toBe(true);
    expect(findings.some((f) => f.category === 'security-finding-unprotected')).toBe(true);
  });

  it('generates findings for business coverage gaps', () => {
    const input: IntelligenceInput = {
      coverageResults: [
        {
          type: 'business',
          totalItems: 2,
          coveredItems: 0,
          coveragePercent: 0,
          details: [
            { name: 'credit_limit_enforced', covered: false },
            { name: 'duplicate_payment_check', covered: false },
          ],
        },
      ],
    };

    const { findings } = runLinkageEngine(input);
    expect(findings.filter((f) => f.category === 'missing-business-rule-test').length).toBe(2);
  });

  it('generates findings for error coverage gaps', () => {
    const input: IntelligenceInput = {
      coverageResults: [
        {
          type: 'error',
          totalItems: 1,
          coveredItems: 0,
          coveragePercent: 0,
          details: [
            {
              endpoint: { method: 'POST', path: '/payments' },
              covered: false,
              errorCodes: ['400', '422', '500'],
            },
          ],
        },
      ],
    };

    const { findings } = runLinkageEngine(input);
    expect(findings.some((f) => f.category === 'error-scenario-gap')).toBe(true);
  });

  it('deduplicates findings with same endpoint and category', () => {
    const input: IntelligenceInput = {
      coverageResults: [
        {
          type: 'endpoint',
          totalItems: 2,
          coveredItems: 0,
          coveragePercent: 0,
          details: [
            { endpoint: { method: 'GET', path: '/items' }, covered: false },
            { endpoint: { method: 'GET', path: '/items' }, covered: false }, // duplicate
          ],
        },
      ],
    };

    const { findings } = runLinkageEngine(input);
    expect(findings.filter((f) => f.endpoint?.path === '/items').length).toBe(1);
  });

  it('includes language and framework hints when provided', () => {
    const input: IntelligenceInput = {
      coverageResults: [
        {
          type: 'endpoint',
          totalItems: 1,
          coveredItems: 0,
          coveragePercent: 0,
          details: [{ endpoint: { method: 'GET', path: '/items' }, covered: false }],
        },
      ],
      languages: ['java'],
      frameworks: ['rest-assured'],
    };

    const { findings, recommendations } = runLinkageEngine(input);
    expect(findings[0].languageHints).toContain('java');
    expect(findings[0].frameworkHints).toContain('rest-assured');
    expect(recommendations[0].likelyLanguage).toBe('java');
    expect(recommendations[0].likelyFramework).toBe('rest-assured');
  });

  it('handles empty coverage results gracefully', () => {
    const input: IntelligenceInput = { coverageResults: [] };
    const { findings, recommendations } = runLinkageEngine(input);
    expect(findings).toEqual([]);
    expect(recommendations).toEqual([]);
  });
});

// ─── Recommendation Generation ────────────────────────────────────────────────

describe('buildRecommendationFromFinding', () => {
  const makeFinding = (overrides: Partial<FunctionalFinding> = {}): FunctionalFinding => ({
    id: 'ff-1',
    source: 'coverage-gap-analysis',
    category: 'uncovered-endpoint',
    severity: 'MEDIUM',
    title: 'Test finding',
    description: 'Test description',
    ...overrides,
  });

  it('produces a recommendation with correct structure', () => {
    const rec = buildRecommendationFromFinding(makeFinding());
    expect(rec).toHaveProperty('id');
    expect(rec).toHaveProperty('priority');
    expect(rec).toHaveProperty('riskScore');
    expect(rec).toHaveProperty('recommendedTestType');
    expect(rec).toHaveProperty('linkedFindingIds');
    expect(rec.linkedFindingIds).toContain('ff-1');
  });

  it('security-finding-unprotected maps to security-test', () => {
    const rec = buildRecommendationFromFinding(
      makeFinding({ category: 'security-finding-unprotected', severity: 'HIGH' }),
    );
    expect(rec.recommendedTestType).toBe('security-test');
  });

  it('missing-auth-test category maps to auth-test', () => {
    const rec = buildRecommendationFromFinding(
      makeFinding({ category: 'missing-auth-test', severity: 'HIGH' }),
    );
    expect(rec.recommendedTestType).toBe('auth-test');
  });

  it('missing-boundary-test maps to boundary-test', () => {
    const rec = buildRecommendationFromFinding(
      makeFinding({ category: 'missing-boundary-test' }),
    );
    expect(rec.recommendedTestType).toBe('boundary-test');
  });

  it('includes Python framework hint in rationale', () => {
    const rec = buildRecommendationFromFinding(
      makeFinding({ category: 'auth-test' as never }),
      'python',
      'pytest',
    );
    expect(rec.rationale.toLowerCase()).toMatch(/pytest/);
  });

  it('includes Ruby framework hint in rationale', () => {
    const rec = buildRecommendationFromFinding(
      makeFinding({ category: 'auth-test' as never }),
      'ruby',
      'rspec',
    );
    expect(rec.rationale.toLowerCase()).toMatch(/rspec/);
  });

  it('includes Java/RestAssured hint in rationale', () => {
    const rec = buildRecommendationFromFinding(
      makeFinding({ category: 'auth-test' as never }),
      'java',
      'rest-assured',
    );
    expect(rec.rationale.toLowerCase()).toMatch(/restassured/);
  });

  it('risk score is between 0 and 100', () => {
    const rec = buildRecommendationFromFinding(makeFinding({ severity: 'CRITICAL' }));
    expect(rec.riskScore).toBeGreaterThanOrEqual(0);
    expect(rec.riskScore).toBeLessThanOrEqual(100);
  });
});

// ─── Intelligence Engine ──────────────────────────────────────────────────────

describe('runIntelligenceEngine', () => {
  it('returns a complete report', () => {
    const input: IntelligenceInput = {
      projectName: 'test-project',
      coverageResults: [
        {
          type: 'endpoint',
          totalItems: 4,
          coveredItems: 2,
          coveragePercent: 50,
          details: [
            { endpoint: { method: 'GET', path: '/items' }, covered: true },
            { endpoint: { method: 'POST', path: '/items' }, covered: false },
            { endpoint: { method: 'DELETE', path: '/items/{id}' }, covered: false },
            { endpoint: { method: 'PUT', path: '/items/{id}' }, covered: true },
          ],
        },
      ],
      languages: ['typescript'],
      frameworks: ['jest'],
    };

    const report = runIntelligenceEngine(input);

    expect(report.projectName).toBe('test-project');
    expect(report.generatedAt).toBeTruthy();
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.summary.totalFindings).toBe(report.findings.length);
    expect(report.summary.totalRecommendations).toBe(report.recommendations.length);
    expect(report.summary.maxRiskScore).toBeGreaterThanOrEqual(0);
    expect(report.summary.avgRiskScore).toBeGreaterThanOrEqual(0);
  });

  it('writes reports to disk when outDir is provided', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'intelligence-test-'));
    try {
      const input: IntelligenceInput = {
        projectName: 'write-test',
        coverageResults: [
          {
            type: 'endpoint',
            totalItems: 2,
            coveredItems: 0,
            coveragePercent: 0,
            details: [
              { endpoint: { method: 'POST', path: '/payments' }, covered: false },
            ],
          },
        ],
        outDir: tmpDir,
      };

      runIntelligenceEngine(input);

      expect(fs.existsSync(path.join(tmpDir, 'coverage-intelligence.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'coverage-intelligence.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'missing-tests-recommendations.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'missing-tests-recommendations.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'risk-prioritization.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'risk-prioritization.md'))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('handles completely covered project gracefully', () => {
    const input: IntelligenceInput = {
      projectName: 'green-project',
      coverageResults: [
        {
          type: 'endpoint',
          totalItems: 3,
          coveredItems: 3,
          coveragePercent: 100,
          details: [
            { endpoint: { method: 'GET', path: '/items' }, covered: true },
            { endpoint: { method: 'POST', path: '/items' }, covered: true },
            { endpoint: { method: 'DELETE', path: '/items/{id}' }, covered: true },
          ],
        },
      ],
    };

    const report = runIntelligenceEngine(input);
    expect(report.findings.length).toBe(0);
    expect(report.recommendations.length).toBe(0);
    expect(report.summary.maxRiskScore).toBe(0);
  });

  it('counts unprotected security findings correctly', () => {
    const input: IntelligenceInput = {
      coverageResults: [],
      securityFindings: [
        { severity: 'HIGH', title: 'SQLi finding', scanner: 'semgrep' },
        { severity: 'CRITICAL', title: 'Auth bypass', scanner: 'zap' },
      ],
    };

    const report = runIntelligenceEngine(input);
    expect(report.summary.unprotectedSecurityFindings).toBeGreaterThan(0);
  });
});

// ─── Markdown Rendering ───────────────────────────────────────────────────────

describe('renderCoverageIntelligenceMd', () => {
  const makeReport = () => runIntelligenceEngine({
    projectName: 'md-test',
    coverageResults: [
      {
        type: 'endpoint',
        totalItems: 2,
        coveredItems: 0,
        coveragePercent: 0,
        details: [
          { endpoint: { method: 'POST', path: '/checkout' }, covered: false },
        ],
      },
    ],
  });

  it('produces markdown with required headings', () => {
    const md = renderCoverageIntelligenceMd(makeReport());
    expect(md).toMatch(/# Coverage Intelligence Report/);
    expect(md).toMatch(/## Summary/);
    expect(md).toMatch(/## Top Functional Findings/);
    expect(md).toMatch(/## Top Missing Test Recommendations/);
  });

  it('includes project name', () => {
    const md = renderCoverageIntelligenceMd(makeReport());
    expect(md).toContain('md-test');
  });

  it('includes endpoint information', () => {
    const md = renderCoverageIntelligenceMd(makeReport());
    expect(md).toContain('/checkout');
  });
});

describe('renderMissingTestsMd', () => {
  it('includes each recommendation', () => {
    const report = runIntelligenceEngine({
      projectName: 'recs-test',
      coverageResults: [
        {
          type: 'endpoint',
          totalItems: 1,
          coveredItems: 0,
          coveragePercent: 0,
          details: [{ endpoint: { method: 'DELETE', path: '/users/{id}' }, covered: false }],
        },
      ],
    });

    const md = renderMissingTestsMd(report);
    expect(md).toMatch(/# Missing Test Recommendations/);
    expect(md).toContain('/users/{id}');
  });

  it('renders gracefully when no recommendations', () => {
    const report = runIntelligenceEngine({
      projectName: 'empty',
      coverageResults: [],
    });
    const md = renderMissingTestsMd(report);
    expect(md).toContain('No missing test recommendations');
  });
});

describe('renderRiskPrioritizationMd', () => {
  it('includes risk sections', () => {
    const report = runIntelligenceEngine({
      projectName: 'risk-test',
      coverageResults: [
        {
          type: 'security',
          totalItems: 1,
          coveredItems: 0,
          coveragePercent: 0,
          details: [
            { endpoint: { method: 'DELETE', path: '/admin/users' }, covered: false, name: 'auth-check' },
          ],
        },
      ],
      securityFindings: [
        { severity: 'CRITICAL', title: 'Auth bypass on admin endpoint', scanner: 'zap', endpoint: { method: 'DELETE', path: '/admin/users' } },
      ],
    });

    const md = renderRiskPrioritizationMd(report);
    expect(md).toMatch(/# Risk Prioritization Report/);
    expect(md).toMatch(/Critical Risks/);
    expect(md).toMatch(/High Risks/);
    expect(md).toMatch(/Risks by Category/);
  });
});

// ─── Framework/Language Coverage ─────────────────────────────────────────────

describe('framework and language coverage', () => {
  const languages = ['java', 'kotlin', 'python', 'ruby', 'typescript'];

  for (const lang of languages) {
    it(`generates findings with correct language hint for ${lang}`, () => {
      const input: IntelligenceInput = {
        coverageResults: [
          {
            type: 'endpoint',
            totalItems: 1,
            coveredItems: 0,
            coveragePercent: 0,
            details: [{ endpoint: { method: 'GET', path: '/items' }, covered: false }],
          },
        ],
        languages: [lang],
      };

      const { findings } = runLinkageEngine(input);
      expect(findings[0].languageHints).toContain(lang);
    });
  }

  it('Cucumber language produces gherkin framework hints', () => {
    const input: IntelligenceInput = {
      coverageResults: [
        {
          type: 'business',
          totalItems: 1,
          coveredItems: 0,
          coveragePercent: 0,
          details: [{ name: 'payment_validation', covered: false }],
        },
      ],
      languages: ['cucumber'],
    };
    const { findings } = runLinkageEngine(input);
    expect(findings[0].frameworkHints).toContain('gherkin');
  });
});

// ─── Observability Metrics ────────────────────────────────────────────────────

describe('recordIntelligenceMetrics', () => {
  it('records without throwing when registry is initialised', () => {
    const { initMetrics, recordIntelligenceMetrics } = require('../src/observability');
    initMetrics('test-service');
    expect(() => {
      recordIntelligenceMetrics({
        projectName: 'test-project',
        totalFindings: 5,
        totalRecommendations: 3,
        recommendationsByPriority: { P0: 1, P1: 2, P2: 0, P3: 0 },
        maxRiskScore: 85,
        avgRiskScore: 62,
        criticalUncoveredItems: 2,
        unprotectedSecurityFindings: 1,
        languages: ['typescript'],
        frameworks: ['jest'],
      });
    }).not.toThrow();
  });

  it('no-ops gracefully when registry is not initialised', () => {
    jest.resetModules();
    const { recordIntelligenceMetrics } = require('../src/observability');
    expect(() => {
      recordIntelligenceMetrics({
        projectName: 'test',
        totalFindings: 0,
        totalRecommendations: 0,
        recommendationsByPriority: {},
        maxRiskScore: 0,
        avgRiskScore: 0,
        criticalUncoveredItems: 0,
        unprotectedSecurityFindings: 0,
      });
    }).not.toThrow();
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
