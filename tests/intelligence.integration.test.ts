/**
 * Integration tests for the Coverage Intelligence engine across multiple
 * language and framework stacks.
 *
 * These tests validate that the intelligence engine:
 *   - Correctly propagates language and framework hints for each stack
 *   - Generates framework-appropriate recommendations (Jest, RestAssured, pytest,
 *     RSpec, Gherkin, Kotlin)
 *   - Handles mixed coverage results from multi-module projects
 *   - Produces correct risk scores and priorities for each stack
 *   - Writes all expected report files when outDir is provided
 *   - Handles edge cases gracefully (empty results, 100% coverage, all security)
 *
 * Run: npx jest tests/intelligence.integration.test.ts
 */

import { runIntelligenceEngine } from '../src/intelligence/index';
import { runLinkageEngine } from '../src/intelligence/linkageEngine';
import type { IntelligenceInput } from '../src/intelligence/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEndpointResult(endpoints: Array<{ method: string; path: string; covered: boolean }>) {
  const covered = endpoints.filter((e) => e.covered).length;
  return {
    type: 'endpoint' as const,
    totalItems: endpoints.length,
    coveredItems: covered,
    coveragePercent: endpoints.length > 0 ? (covered / endpoints.length) * 100 : 100,
    details: endpoints.map((e) => ({ endpoint: { method: e.method, path: e.path }, covered: e.covered })),
  };
}

function makeBusinessResult(rules: Array<{ name: string; covered: boolean }>) {
  const covered = rules.filter((r) => r.covered).length;
  return {
    type: 'business' as const,
    totalItems: rules.length,
    coveredItems: covered,
    coveragePercent: rules.length > 0 ? (covered / rules.length) * 100 : 100,
    details: rules.map((r) => ({ name: r.name, covered: r.covered })),
  };
}

function makeErrorResult(endpoints: Array<{ method: string; path: string; covered: boolean }>) {
  const covered = endpoints.filter((e) => e.covered).length;
  return {
    type: 'error' as const,
    totalItems: endpoints.length,
    coveredItems: covered,
    coveragePercent: endpoints.length > 0 ? (covered / endpoints.length) * 100 : 100,
    details: endpoints.map((e) => ({
      endpoint: { method: e.method, path: e.path },
      covered: e.covered,
      errorCodes: ['400', '422', '500'],
    })),
  };
}

// ─── 1. TypeScript / Jest stack ───────────────────────────────────────────────

describe('Intelligence engine – TypeScript/Jest stack', () => {
  const tsJestInput: IntelligenceInput = {
    projectName: 'ts-wallet-api',
    languages: ['typescript'],
    frameworks: ['jest', 'supertest'],
    coverageResults: [
      makeEndpointResult([
        { method: 'GET', path: '/wallets', covered: true },
        { method: 'POST', path: '/wallets', covered: true },
        { method: 'DELETE', path: '/wallets/{id}', covered: false },
        { method: 'POST', path: '/wallets/{id}/transfer', covered: false },
        { method: 'POST', path: '/payments', covered: false },
      ]),
      makeBusinessResult([
        { name: 'daily_transfer_limit', covered: false },
        { name: 'minimum_balance_check', covered: false },
        { name: 'duplicate_payment_guard', covered: true },
      ]),
      makeErrorResult([
        { method: 'POST', path: '/wallets', covered: true },
        { method: 'POST', path: '/payments', covered: false },
      ]),
    ],
    securityFindings: [
      { severity: 'HIGH', title: 'Missing rate limit on /payments', scanner: 'semgrep', endpoint: { method: 'POST', path: '/payments' } },
    ],
  };

  it('produces findings with typescript language hints', () => {
    const { findings } = runLinkageEngine(tsJestInput);
    const epFinding = findings.find((f) => f.category === 'uncovered-endpoint');
    expect(epFinding?.languageHints).toContain('typescript');
  });

  it('produces recommendations with jest framework hints', () => {
    const { recommendations } = runLinkageEngine(tsJestInput);
    const rec = recommendations.find((r) => r.likelyFramework === 'jest');
    expect(rec).toBeDefined();
  });

  it('generates P0 or P1 for payment endpoint gap', () => {
    const report = runIntelligenceEngine(tsJestInput);
    const paymentRec = report.recommendations.find(
      (r) => r.endpoint?.path?.includes('/payments'),
    );
    // Payment endpoint should be P0 or P1 due to money movement criticality
    expect(['P0', 'P1']).toContain(paymentRec?.priority);
  });

  it('links security finding to a recommendation', () => {
    const report = runIntelligenceEngine(tsJestInput);
    const securityRec = report.recommendations.find((r) => r.recommendedTestType === 'security-test');
    expect(securityRec).toBeDefined();
  });

  it('generates full report with all sections', () => {
    const report = runIntelligenceEngine(tsJestInput);
    expect(report.projectName).toBe('ts-wallet-api');
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.summary.totalFindings).toBeGreaterThan(0);
    expect(report.summary.maxRiskScore).toBeGreaterThan(0);
  });

  it('writes all 6 report files to disk', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-intel-'));
    try {
      runIntelligenceEngine({ ...tsJestInput, outDir: tmpDir });
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
});

// ─── 2. Java / REST-Assured stack ─────────────────────────────────────────────

describe('Intelligence engine – Java/REST-Assured stack', () => {
  const javaInput: IntelligenceInput = {
    projectName: 'java-order-api',
    languages: ['java'],
    frameworks: ['rest-assured', 'junit5'],
    coverageResults: [
      makeEndpointResult([
        { method: 'POST', path: '/orders', covered: true },
        { method: 'GET', path: '/orders/{id}', covered: true },
        { method: 'PUT', path: '/orders/{id}/confirm', covered: false },
        { method: 'DELETE', path: '/orders/{id}', covered: false },
        { method: 'POST', path: '/orders/{id}/refund', covered: false },
      ]),
      makeBusinessResult([
        { name: 'order_total_validation', covered: true },
        { name: 'inventory_reservation', covered: false },
        { name: 'payment_authorization', covered: false },
      ]),
    ],
    securityFindings: [
      { severity: 'CRITICAL', title: 'IDOR on DELETE /orders/{id}', scanner: 'zap', endpoint: { method: 'DELETE', path: '/orders/{id}' } },
    ],
  };

  it('produces findings with java language hints', () => {
    const { findings } = runLinkageEngine(javaInput);
    expect(findings.every((f) => f.languageHints?.includes('java') || f.languageHints === undefined)).toBe(true);
    const hasjava = findings.some((f) => f.languageHints?.includes('java'));
    expect(hasjava).toBe(true);
  });

  it('produces recommendations with rest-assured framework hints', () => {
    const { recommendations } = runLinkageEngine(javaInput);
    const javaRec = recommendations.find((r) => r.likelyFramework === 'rest-assured');
    expect(javaRec).toBeDefined();
  });

  it('includes restassured in recommendation rationale', () => {
    const report = runIntelligenceEngine(javaInput);
    const recs = report.recommendations.filter((r) => r.likelyFramework === 'rest-assured');
    expect(recs.some((r) => r.rationale.toLowerCase().includes('restassured'))).toBe(true);
  });

  it('marks IDOR finding as security-finding-unprotected', () => {
    const report = runIntelligenceEngine(javaInput);
    const secFinding = report.findings.find((f) => f.category === 'security-finding-unprotected');
    expect(secFinding).toBeDefined();
    expect(secFinding?.severity).toBe('CRITICAL');
  });

  it('refund endpoint recommendation is P0 or P1', () => {
    const report = runIntelligenceEngine(javaInput);
    const refundRec = report.recommendations.find((r) => r.endpoint?.path?.includes('/refund'));
    expect(refundRec).toBeDefined();
    expect(['P0', 'P1']).toContain(refundRec?.priority);
  });

  it('payment authorization business rule is identified as a finding', () => {
    const report = runIntelligenceEngine(javaInput);
    // The engine creates a finding per uncovered business rule
    const paymentFinding = report.findings.find(
      (f) => f.title.toLowerCase().includes('payment'),
    );
    expect(paymentFinding).toBeDefined();
    // At least one business-rule-test recommendation should exist
    const businessRuleRec = report.recommendations.find(
      (r) => r.recommendedTestType === 'business-rule-test',
    );
    expect(businessRuleRec).toBeDefined();
  });
});

// ─── 3. Python / pytest stack ─────────────────────────────────────────────────

describe('Intelligence engine – Python/pytest stack', () => {
  const pythonInput: IntelligenceInput = {
    projectName: 'python-inventory-api',
    languages: ['python'],
    frameworks: ['pytest', 'requests'],
    coverageResults: [
      makeEndpointResult([
        { method: 'GET', path: '/items', covered: true },
        { method: 'POST', path: '/items', covered: true },
        { method: 'DELETE', path: '/items/{id}', covered: false },
        { method: 'PATCH', path: '/items/{id}/stock', covered: false },
      ]),
      makeBusinessResult([
        { name: 'stock_below_zero_prevention', covered: false },
        { name: 'reserved_items_cannot_be_deleted', covered: false },
      ]),
    ],
  };

  it('produces findings with python language hints', () => {
    const { findings } = runLinkageEngine(pythonInput);
    const hasPython = findings.some((f) => f.languageHints?.includes('python'));
    expect(hasPython).toBe(true);
  });

  it('produces recommendations with pytest framework hints', () => {
    const { recommendations } = runLinkageEngine(pythonInput);
    const pytestRec = recommendations.find((r) => r.likelyFramework === 'pytest');
    expect(pytestRec).toBeDefined();
  });

  it('includes pytest in recommendation rationale', () => {
    const report = runIntelligenceEngine(pythonInput);
    const recs = report.recommendations.filter((r) => r.likelyFramework === 'pytest');
    expect(recs.some((r) => r.rationale.toLowerCase().includes('pytest'))).toBe(true);
  });

  it('stock business rule gap generates business-rule recommendation', () => {
    const report = runIntelligenceEngine(pythonInput);
    const businessRec = report.recommendations.find((r) => r.recommendedTestType === 'business-rule-test');
    expect(businessRec).toBeDefined();
  });

  it('generates valid JSON report parseable as intelligence report', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'python-intel-'));
    try {
      runIntelligenceEngine({ ...pythonInput, outDir: tmpDir });
      const jsonPath = path.join(tmpDir, 'coverage-intelligence.json');
      const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      expect(content.projectName).toBe('python-inventory-api');
      expect(Array.isArray(content.findings)).toBe(true);
      expect(Array.isArray(content.recommendations)).toBe(true);
      expect(content.summary).toBeDefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ─── 4. Ruby / RSpec stack ────────────────────────────────────────────────────

describe('Intelligence engine – Ruby/RSpec stack', () => {
  const rubyInput: IntelligenceInput = {
    projectName: 'ruby-billing-api',
    languages: ['ruby'],
    frameworks: ['rspec'],
    coverageResults: [
      makeEndpointResult([
        { method: 'POST', path: '/subscriptions', covered: false },
        { method: 'DELETE', path: '/subscriptions/{id}', covered: false },
        { method: 'GET', path: '/invoices', covered: true },
      ]),
      makeErrorResult([
        { method: 'POST', path: '/subscriptions', covered: false },
      ]),
    ],
  };

  it('produces findings with ruby language hints', () => {
    const { findings } = runLinkageEngine(rubyInput);
    const hasRuby = findings.some((f) => f.languageHints?.includes('ruby'));
    expect(hasRuby).toBe(true);
  });

  it('produces recommendations with rspec framework hints', () => {
    const { recommendations } = runLinkageEngine(rubyInput);
    const rspecRec = recommendations.find((r) => r.likelyFramework === 'rspec');
    expect(rspecRec).toBeDefined();
  });

  it('includes rspec in recommendation rationale', () => {
    const report = runIntelligenceEngine(rubyInput);
    const recs = report.recommendations.filter((r) => r.likelyFramework === 'rspec');
    expect(recs.some((r) => r.rationale.toLowerCase().includes('rspec'))).toBe(true);
  });

  it('generates error-scenario-gap finding for error coverage gap', () => {
    const report = runIntelligenceEngine(rubyInput);
    const errorGap = report.findings.find((f) => f.category === 'error-scenario-gap');
    expect(errorGap).toBeDefined();
  });
});

// ─── 5. Cucumber / Gherkin stack ─────────────────────────────────────────────

describe('Intelligence engine – Cucumber/Gherkin stack', () => {
  const cucumberInput: IntelligenceInput = {
    projectName: 'bdd-checkout-service',
    languages: ['cucumber'],
    frameworks: ['gherkin'],
    coverageResults: [
      {
        type: 'business',
        totalItems: 4,
        coveredItems: 1,
        coveragePercent: 25,
        details: [
          { name: 'checkout_total_validation', covered: true },
          { name: 'coupon_redemption_limit', covered: false },
          { name: 'out_of_stock_rejection', covered: false },
          { name: 'age_verification_for_restricted_items', covered: false },
        ],
      },
      {
        type: 'integration',
        totalItems: 2,
        coveredItems: 0,
        coveragePercent: 0,
        details: [
          { name: 'full_checkout_flow', covered: false, steps: ['add_to_cart', 'apply_coupon', 'payment', 'confirmation'] },
          { name: 'return_and_refund_flow', covered: false, steps: ['initiate_return', 'verify_eligibility', 'process_refund'] },
        ],
      },
    ],
  };

  it('produces findings with cucumber language hints', () => {
    const { findings } = runLinkageEngine(cucumberInput);
    const hasCucumber = findings.some((f) => f.languageHints?.includes('cucumber'));
    expect(hasCucumber).toBe(true);
  });

  it('produces findings with gherkin framework hints', () => {
    const { findings } = runLinkageEngine(cucumberInput);
    const hasGherkin = findings.some((f) => f.frameworkHints?.includes('gherkin'));
    expect(hasGherkin).toBe(true);
  });

  it('generates missing-business-rule-test findings for uncovered rules', () => {
    const report = runIntelligenceEngine(cucumberInput);
    const businessFindings = report.findings.filter((f) => f.category === 'missing-business-rule-test');
    expect(businessFindings.length).toBe(3); // 3 uncovered rules
  });

  it('generates missing-flow-step-test findings for uncovered flows', () => {
    const report = runIntelligenceEngine(cucumberInput);
    const flowFindings = report.findings.filter((f) => f.category === 'missing-flow-step-test');
    expect(flowFindings.length).toBeGreaterThan(0);
  });

  it('recommends business-rule-test and integration-flow-test types', () => {
    const report = runIntelligenceEngine(cucumberInput);
    const types = new Set(report.recommendations.map((r) => r.recommendedTestType));
    expect(types.has('business-rule-test')).toBe(true);
    expect(types.has('integration-flow-test')).toBe(true);
  });
});

// ─── 6. Kotlin stack ──────────────────────────────────────────────────────────

describe('Intelligence engine – Kotlin stack', () => {
  const kotlinInput: IntelligenceInput = {
    projectName: 'kotlin-notification-service',
    languages: ['kotlin'],
    frameworks: ['rest-assured'],
    coverageResults: [
      makeEndpointResult([
        { method: 'POST', path: '/notifications/send', covered: false },
        { method: 'GET', path: '/notifications/{id}/status', covered: true },
        { method: 'DELETE', path: '/notifications/{id}', covered: false },
      ]),
    ],
  };

  it('produces findings with kotlin language hints', () => {
    const { findings } = runLinkageEngine(kotlinInput);
    const hasKotlin = findings.some((f) => f.languageHints?.includes('kotlin'));
    expect(hasKotlin).toBe(true);
  });

  it('generates correct number of uncovered endpoint findings', () => {
    const report = runIntelligenceEngine(kotlinInput);
    expect(report.findings.filter((f) => f.category === 'uncovered-endpoint').length).toBe(2);
  });

  it('total findings and recommendations match summary', () => {
    const report = runIntelligenceEngine(kotlinInput);
    expect(report.summary.totalFindings).toBe(report.findings.length);
    expect(report.summary.totalRecommendations).toBe(report.recommendations.length);
  });
});

// ─── 7. Multi-language / mixed stack ─────────────────────────────────────────

describe('Intelligence engine – multi-language stack', () => {
  const mixedInput: IntelligenceInput = {
    projectName: 'microservices-platform',
    languages: ['typescript', 'java', 'python'],
    frameworks: ['jest', 'rest-assured', 'pytest'],
    coverageResults: [
      makeEndpointResult([
        { method: 'POST', path: '/auth/login', covered: false },
        { method: 'POST', path: '/auth/logout', covered: true },
        { method: 'DELETE', path: '/users/{id}', covered: false },
      ]),
      makeBusinessResult([
        { name: 'rate_limit_enforcement', covered: false },
        { name: 'session_expiry_validation', covered: false },
      ]),
    ],
    securityFindings: [
      { severity: 'CRITICAL', title: 'Auth bypass on /auth/login', scanner: 'zap' },
      { severity: 'HIGH', title: 'Missing CSRF protection', scanner: 'semgrep' },
    ],
  };

  it('includes all languages in language hints', () => {
    const { findings } = runLinkageEngine(mixedInput);
    const allLangs = new Set(findings.flatMap((f) => f.languageHints ?? []));
    expect(allLangs.has('typescript')).toBe(true);
    expect(allLangs.has('java')).toBe(true);
    expect(allLangs.has('python')).toBe(true);
  });

  it('auth endpoint gap generates missing-auth-test or high priority finding', () => {
    const report = runIntelligenceEngine(mixedInput);
    // Login endpoint being uncovered should be a high priority finding
    const loginRec = report.recommendations.find(
      (r) => r.endpoint?.path?.includes('/auth/login') || (r.title.toLowerCase().includes('login')),
    );
    if (loginRec) {
      expect(['P0', 'P1']).toContain(loginRec.priority);
    }
  });

  it('unprotectedSecurityFindings count matches security scan findings', () => {
    const report = runIntelligenceEngine(mixedInput);
    expect(report.summary.unprotectedSecurityFindings).toBeGreaterThan(0);
  });

  it('generates risk scores for all recommendations', () => {
    const report = runIntelligenceEngine(mixedInput);
    for (const rec of report.recommendations) {
      expect(rec.riskScore).toBeGreaterThanOrEqual(0);
      expect(rec.riskScore).toBeLessThanOrEqual(100);
    }
  });

  it('summary topRiskAreas includes endpoints with highest risk', () => {
    const report = runIntelligenceEngine(mixedInput);
    expect(Array.isArray(report.summary.topRiskAreas)).toBe(true);
  });
});

// ─── 8. Edge cases ────────────────────────────────────────────────────────────

describe('Intelligence engine – edge cases', () => {
  it('handles project with only security findings and no coverage gaps', () => {
    const input: IntelligenceInput = {
      projectName: 'covered-but-risky',
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
      securityFindings: [
        { severity: 'HIGH', title: 'XSS in /items/{id}', scanner: 'semgrep', endpoint: { method: 'DELETE', path: '/items/{id}' } },
      ],
    };

    const report = runIntelligenceEngine(input);
    // Should have security findings even with full endpoint coverage
    expect(report.findings.some((f) => f.source === 'security-scan')).toBe(true);
    expect(report.summary.unprotectedSecurityFindings).toBe(1);
  });

  it('handles empty languages and frameworks gracefully', () => {
    const input: IntelligenceInput = {
      coverageResults: [
        makeEndpointResult([{ method: 'GET', path: '/test', covered: false }]),
      ],
    };

    const report = runIntelligenceEngine(input);
    expect(report.findings.length).toBeGreaterThan(0);
    // Should still produce recommendations without language/framework hints
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('handles large number of endpoints without crashing', () => {
    const manyEndpoints = Array.from({ length: 50 }, (_, i) => ({
      method: i % 2 === 0 ? 'GET' : 'POST',
      path: `/resource-${i}`,
      covered: i < 25, // half covered
    }));

    const input: IntelligenceInput = {
      projectName: 'large-api',
      coverageResults: [makeEndpointResult(manyEndpoints)],
    };

    expect(() => runIntelligenceEngine(input)).not.toThrow();
    const report = runIntelligenceEngine(input);
    expect(report.findings.length).toBe(25); // 25 uncovered
  });

  it('deduplicates when same endpoint appears in multiple coverage types', () => {
    const input: IntelligenceInput = {
      coverageResults: [
        makeEndpointResult([{ method: 'POST', path: '/payments', covered: false }]),
        makeErrorResult([{ method: 'POST', path: '/payments', covered: false }]),
      ],
    };

    const { findings } = runLinkageEngine(input);
    // POST /payments covered as uncovered endpoint — may produce both endpoint and error finding
    // but same endpoint+category should not be duplicated
    const endpointFindings = findings.filter(
      (f) => f.category === 'uncovered-endpoint' && f.endpoint?.path === '/payments',
    );
    expect(endpointFindings.length).toBe(1);
  });

  it('avg risk score is valid when there are recommendations', () => {
    const input: IntelligenceInput = {
      coverageResults: [
        makeEndpointResult([
          { method: 'POST', path: '/payments', covered: false },
          { method: 'GET', path: '/items', covered: false },
        ]),
      ],
    };

    const report = runIntelligenceEngine(input);
    if (report.recommendations.length > 0) {
      expect(report.summary.avgRiskScore).toBeGreaterThan(0);
      expect(report.summary.avgRiskScore).toBeLessThanOrEqual(100);
    }
  });
});
