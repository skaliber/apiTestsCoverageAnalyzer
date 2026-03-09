/**
 * Coverage Intelligence – Linkage Engine.
 *
 * Inspects coverage results and security findings to produce FunctionalFinding
 * objects and link them to MissingTestRecommendation records.
 *
 * The engine is deterministic and does not require MCP to run.
 */

import type {
  FunctionalFinding,
  MissingTestRecommendation,
  IntelligenceInput,
  Severity,
  FindingCategory,
  RecommendedTestType,
} from './types';
import {
  computeRiskScore,
  scoreToPriority,
  defaultCriticalityWeight,
} from './riskScoring';

// ─── Simple UUID stub (avoid external dependency) ─────────────────────────────

let _counter = 0;
function makeId(prefix: string): string {
  _counter++;
  return `${prefix}-${Date.now()}-${_counter}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeSeverity(raw: string): Severity {
  switch (raw.toUpperCase()) {
    case 'CRITICAL': return 'CRITICAL';
    case 'HIGH':     return 'HIGH';
    case 'MEDIUM':   return 'MEDIUM';
    default:         return 'LOW';
  }
}

function isMoneyPath(path?: string): boolean {
  if (!path) return false;
  const lower = path.toLowerCase();
  return (
    lower.includes('payment') ||
    lower.includes('wallet') ||
    lower.includes('transfer') ||
    lower.includes('refund') ||
    lower.includes('debit') ||
    lower.includes('charge') ||
    lower.includes('fund') ||
    lower.includes('payout')
  );
}

function isAuthPath(path?: string): boolean {
  if (!path) return false;
  const lower = path.toLowerCase();
  return (
    lower.includes('auth') ||
    lower.includes('login') ||
    lower.includes('token') ||
    lower.includes('oauth') ||
    lower.includes('session') ||
    lower.includes('password')
  );
}

function frameworkHintsForLanguages(languages?: string[]): string[] {
  const hints: string[] = [];
  if (!languages?.length) return hints;
  for (const lang of languages) {
    switch (lang.toLowerCase()) {
      case 'typescript':
      case 'javascript':
        hints.push('jest', 'supertest');
        break;
      case 'java':
        hints.push('junit', 'testng', 'rest-assured', 'spring-mockmvc');
        break;
      case 'kotlin':
        hints.push('kotest', 'junit', 'ktor-test');
        break;
      case 'python':
        hints.push('pytest', 'httpx', 'requests');
        break;
      case 'ruby':
        hints.push('rspec', 'minitest', 'rails-request-specs');
        break;
      case 'cucumber':
        hints.push('cucumber', 'gherkin');
        break;
    }
  }
  return [...new Set(hints)];
}

function recommendationHint(
  testType: RecommendedTestType,
  language?: string,
  framework?: string,
): string {
  const lang = (language || '').toLowerCase();
  const fw   = (framework  || '').toLowerCase();

  if (lang === 'java' || fw.includes('rest-assured')) {
    switch (testType) {
      case 'auth-test':    return 'RestAssured authz scenario: .auth().oauth2(token) chain';
      case 'negative-api-test': return 'RestAssured negative test: expect 4xx status with .statusCode(403)';
      case 'boundary-test': return 'RestAssured boundary: parameterize with @ParameterizedTest';
      default: return 'RestAssured test case';
    }
  }
  if (lang === 'python' || fw.includes('pytest')) {
    switch (testType) {
      case 'auth-test':    return 'pytest fixture: add missing auth header, assert 401/403';
      case 'negative-api-test': return 'pytest parametrize with invalid inputs, assert HTTP 4xx';
      case 'boundary-test': return 'pytest @pytest.mark.parametrize with boundary values';
      default: return 'pytest test function';
    }
  }
  if (lang === 'ruby' || fw.includes('rspec')) {
    switch (testType) {
      case 'auth-test':    return 'RSpec request spec: without_auth context block';
      case 'negative-api-test': return 'RSpec: context "with invalid input" do ... expect(response).to have_http_status(422)';
      case 'boundary-test': return 'RSpec shared_examples with boundary parameter values';
      default: return 'RSpec request spec';
    }
  }
  if (fw.includes('cucumber') || fw.includes('gherkin')) {
    return `Scenario: missing coverage – add Gherkin scenario for ${testType}`;
  }
  // default JS/TS
  switch (testType) {
    case 'auth-test':    return 'Jest + supertest: describe("unauthorized") { it("returns 401") }';
    case 'negative-api-test': return 'Jest + supertest: test invalid inputs → 4xx responses';
    case 'boundary-test': return 'Jest test.each with boundary value arrays';
    default: return 'Jest test case';
  }
}

// ─── Coverage-gap linkage rules ───────────────────────────────────────────────

interface CoverageDetail {
  endpoint?: { method?: string; path?: string };
  covered?: boolean;
  errorCodes?: string[];
  tests?: string[];
  name?: string;
  status?: string;
  steps?: Array<{ name?: string; covered?: boolean }>;
}

function buildEndpointFindings(
  details: unknown,
  languages?: string[],
  frameworks?: string[],
): FunctionalFinding[] {
  const findings: FunctionalFinding[] = [];
  if (!Array.isArray(details)) return findings;

  const fwHints = frameworkHintsForLanguages(languages);

  for (const item of details as CoverageDetail[]) {
    const ep = item.endpoint;
    const covered = item.covered ?? false;

    if (!covered) {
      findings.push({
        id: makeId('ff-ep'),
        source: 'coverage-gap-analysis',
        category: 'uncovered-endpoint',
        severity: isMoneyPath(ep?.path) ? 'HIGH' : 'MEDIUM',
        title: `Uncovered endpoint: ${ep?.method ?? 'UNKNOWN'} ${ep?.path ?? '/'}`,
        description: `Endpoint ${ep?.method} ${ep?.path} has no test coverage.`,
        endpoint: ep,
        missingTestTypes: ['positive-api-test', 'negative-api-test'],
        frameworkHints: fwHints,
        languageHints: languages,
        tags: ['endpoint-coverage', 'zero-coverage'],
      });
    }
  }
  return findings;
}

function buildErrorCoverageFindings(
  details: unknown,
  languages?: string[],
): FunctionalFinding[] {
  const findings: FunctionalFinding[] = [];
  if (!Array.isArray(details)) return findings;

  const fwHints = frameworkHintsForLanguages(languages);

  for (const item of details as CoverageDetail[]) {
    if (!item.covered && item.errorCodes?.length) {
      findings.push({
        id: makeId('ff-err'),
        source: 'error-coverage',
        category: 'error-scenario-gap',
        severity: 'MEDIUM',
        title: `Missing error scenario tests for ${item.endpoint?.path ?? 'endpoint'}`,
        description: `Error codes ${item.errorCodes.join(', ')} are documented but have no matching test.`,
        endpoint: item.endpoint,
        missingTestTypes: ['negative-api-test'],
        frameworkHints: fwHints,
        languageHints: languages,
        tags: ['error-coverage', 'negative-test'],
      });
    }
  }
  return findings;
}

function buildBusinessCoverageFindings(
  details: unknown,
  languages?: string[],
): FunctionalFinding[] {
  const findings: FunctionalFinding[] = [];
  if (!Array.isArray(details)) return findings;

  const fwHints = frameworkHintsForLanguages(languages);

  for (const item of details as CoverageDetail[]) {
    if (!item.covered) {
      findings.push({
        id: makeId('ff-biz'),
        source: 'business-coverage',
        category: 'missing-business-rule-test',
        severity: 'MEDIUM',
        title: `Uncovered business rule: ${item.name ?? 'unknown'}`,
        description: `Business rule "${item.name}" has no test coverage.`,
        relatedRules: item.name ? [item.name] : [],
        missingTestTypes: ['business-rule-test'],
        frameworkHints: fwHints,
        languageHints: languages,
        tags: ['business-coverage'],
      });
    }
  }
  return findings;
}

function buildIntegrationFlowFindings(
  details: unknown,
  languages?: string[],
): FunctionalFinding[] {
  const findings: FunctionalFinding[] = [];
  if (!Array.isArray(details)) return findings;

  const fwHints = frameworkHintsForLanguages(languages);

  for (const flow of details as CoverageDetail[]) {
    if (!flow.steps) continue;
    for (const step of flow.steps) {
      if (!step.covered) {
        findings.push({
          id: makeId('ff-flow'),
          source: 'integration-flow',
          category: 'missing-flow-step-test',
          severity: 'MEDIUM',
          title: `Uncovered flow step: ${step.name ?? 'unknown'} in ${(flow as { name?: string }).name ?? 'flow'}`,
          description: `Integration flow step "${step.name}" has no test coverage.`,
          missingTestTypes: ['integration-flow-test'],
          frameworkHints: fwHints,
          languageHints: languages,
          tags: ['integration-flow'],
        });
      }
    }
  }
  return findings;
}

function buildSecurityCoverageFindings(
  details: unknown,
  languages?: string[],
): FunctionalFinding[] {
  const findings: FunctionalFinding[] = [];
  if (!Array.isArray(details)) return findings;

  const fwHints = frameworkHintsForLanguages(languages);

  for (const item of details as CoverageDetail[]) {
    if (!item.covered) {
      findings.push({
        id: makeId('ff-sec-cov'),
        source: 'security-coverage',
        category: 'missing-auth-test',
        severity: 'HIGH',
        title: `Missing auth/security test: ${item.endpoint?.path ?? item.name ?? 'unknown'}`,
        description: `Security scenario for ${item.endpoint?.path ?? item.name} has no test coverage.`,
        endpoint: item.endpoint,
        missingTestTypes: ['auth-test', 'authz-test', 'security-test'],
        frameworkHints: fwHints,
        languageHints: languages,
        tags: ['security-coverage', 'auth-test'],
      });
    }
  }
  return findings;
}

function buildSecurityScanFindings(
  securityFindings: IntelligenceInput['securityFindings'],
  languages?: string[],
): FunctionalFinding[] {
  const findings: FunctionalFinding[] = [];
  if (!securityFindings?.length) return findings;

  const fwHints = frameworkHintsForLanguages(languages);

  for (const sf of securityFindings) {
    const severity = normalizeSeverity(sf.severity);
    findings.push({
      id: makeId('ff-scan'),
      source: 'security-scan',
      category: 'security-finding-unprotected',
      severity,
      title: `Scanner finding: ${sf.title}`,
      description: sf.description ?? sf.title,
      endpoint: sf.endpoint,
      filePaths: sf.filePath ? [sf.filePath] : [],
      relatedScanners: sf.scanner ? [sf.scanner] : [],
      missingTestTypes: ['security-test', 'negative-api-test'],
      frameworkHints: fwHints,
      languageHints: languages,
      tags: ['security-scan', sf.scanner ?? 'scanner', severity.toLowerCase()],
    });
  }
  return findings;
}

function buildParameterCoverageFindings(
  details: unknown,
  languages?: string[],
): FunctionalFinding[] {
  const findings: FunctionalFinding[] = [];
  if (!Array.isArray(details)) return findings;

  const fwHints = frameworkHintsForLanguages(languages);

  for (const item of details as Array<{
    name?: string;
    covered?: boolean;
    missingCategories?: string[];
    endpoint?: { method?: string; path?: string };
  }>) {
    if (!item.covered && item.missingCategories?.length) {
      const hasBoundary = item.missingCategories.includes('boundary');
      const hasInvalid  = item.missingCategories.includes('invalid');

      if (hasBoundary) {
        findings.push({
          id: makeId('ff-param-boundary'),
          source: 'parameter-coverage',
          category: 'missing-boundary-test',
          severity: 'MEDIUM',
          title: `Missing boundary tests for parameter: ${item.name ?? 'unknown'}`,
          description: `Parameter "${item.name}" is missing boundary value test coverage.`,
          endpoint: item.endpoint,
          missingTestTypes: ['boundary-test'],
          frameworkHints: fwHints,
          languageHints: languages,
          tags: ['parameter-coverage', 'boundary-test'],
        });
      }
      if (hasInvalid) {
        findings.push({
          id: makeId('ff-param-invalid'),
          source: 'parameter-coverage',
          category: 'high-risk-parameter-gap',
          severity: 'MEDIUM',
          title: `Missing invalid-input tests for parameter: ${item.name ?? 'unknown'}`,
          description: `Parameter "${item.name}" is missing invalid input test coverage.`,
          endpoint: item.endpoint,
          missingTestTypes: ['negative-api-test'],
          frameworkHints: fwHints,
          languageHints: languages,
          tags: ['parameter-coverage', 'negative-test'],
        });
      }
    }
  }
  return findings;
}

function buildCompatibilityFindings(
  details: unknown,
  languages?: string[],
): FunctionalFinding[] {
  const findings: FunctionalFinding[] = [];
  if (!Array.isArray(details)) return findings;

  const fwHints = frameworkHintsForLanguages(languages);

  for (const item of details as Array<{
    breakingChange?: boolean;
    description?: string;
    endpoint?: { method?: string; path?: string };
  }>) {
    if (item.breakingChange) {
      findings.push({
        id: makeId('ff-compat'),
        source: 'compatibility',
        category: 'compatibility-risk',
        severity: 'HIGH',
        title: `Breaking change risk: ${item.description ?? 'API contract change'}`,
        description: item.description ?? 'A breaking API change was detected with no contract test.',
        endpoint: item.endpoint,
        missingTestTypes: ['compatibility-test'],
        frameworkHints: fwHints,
        languageHints: languages,
        tags: ['compatibility', 'breaking-change'],
      });
    }
  }
  return findings;
}

function buildPerfResilienceFindings(
  details: unknown,
  languages?: string[],
): FunctionalFinding[] {
  const findings: FunctionalFinding[] = [];
  if (!Array.isArray(details)) return findings;

  const fwHints = frameworkHintsForLanguages(languages);

  for (const item of details as Array<{
    covered?: boolean;
    endpoint?: { method?: string; path?: string };
    name?: string;
    hasThreshold?: boolean;
    resilience?: boolean;
  }>) {
    if (!item.covered) {
      if (item.hasThreshold) {
        findings.push({
          id: makeId('ff-perf'),
          source: 'performance-resilience',
          category: 'performance-risk',
          severity: 'MEDIUM',
          title: `Missing performance test: ${item.endpoint?.path ?? item.name ?? 'unknown'}`,
          description: `Endpoint has performance thresholds defined but no performance test exists.`,
          endpoint: item.endpoint,
          missingTestTypes: ['performance-test'],
          frameworkHints: fwHints,
          languageHints: languages,
          tags: ['performance', 'perf-test'],
        });
      }
      if (item.resilience) {
        findings.push({
          id: makeId('ff-resilience'),
          source: 'performance-resilience',
          category: 'performance-risk',
          severity: 'MEDIUM',
          title: `Missing resilience test: ${item.endpoint?.path ?? item.name ?? 'unknown'}`,
          description: `Resilience scenario has no test coverage.`,
          endpoint: item.endpoint,
          missingTestTypes: ['resilience-test'],
          frameworkHints: fwHints,
          languageHints: languages,
          tags: ['resilience', 'resilience-test'],
        });
      }
    }
  }
  return findings;
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function deduplicateFindings(findings: FunctionalFinding[]): FunctionalFinding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.category}|${f.endpoint?.method ?? ''}|${f.endpoint?.path ?? ''}|${f.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Recommendation generation ────────────────────────────────────────────────

function categoryToTestType(category: FindingCategory | string): RecommendedTestType {
  switch (category) {
    case 'uncovered-endpoint':           return 'positive-api-test';
    case 'missing-negative-test':        return 'negative-api-test';
    case 'missing-auth-test':            return 'auth-test';
    case 'missing-boundary-test':        return 'boundary-test';
    case 'missing-business-rule-test':   return 'business-rule-test';
    case 'missing-flow-step-test':       return 'integration-flow-test';
    case 'security-finding-unprotected': return 'security-test';
    case 'high-risk-parameter-gap':      return 'negative-api-test';
    case 'compatibility-risk':           return 'compatibility-test';
    case 'performance-risk':             return 'performance-test';
    case 'error-scenario-gap':           return 'negative-api-test';
    default:                             return 'positive-api-test';
  }
}

export function buildRecommendationFromFinding(
  finding: FunctionalFinding,
  primaryLanguage?: string,
  primaryFramework?: string,
): MissingTestRecommendation {
  const testType = categoryToTestType(finding.category);
  const language = primaryLanguage ?? finding.languageHints?.[0];
  const framework = primaryFramework ?? finding.frameworkHints?.[0];

  const hasSecuritySignal =
    finding.source === 'security-scan' ||
    finding.category === 'security-finding-unprotected' ||
    finding.category === 'missing-auth-test';

  const isMoneyEp = isMoneyPath(finding.endpoint?.path);
  const isAuthGap =
    finding.category === 'missing-auth-test' ||
    finding.category === 'security-finding-unprotected';
  const isZeroCoverage = finding.tags?.includes('zero-coverage') ?? false;

  const score = computeRiskScore({
    severity: finding.severity,
    category: finding.category,
    endpointPath: finding.endpoint?.path,
    hasSecuritySignal,
    zeroCoverage: isZeroCoverage,
  });

  const priority = scoreToPriority(score, {
    isCriticalSecurityFinding: finding.severity === 'CRITICAL' && hasSecuritySignal,
    isMoneyMovementEndpoint: isMoneyEp,
    isAuthGap,
    isZeroCoverageCriticalFlow:
      isZeroCoverage &&
      defaultCriticalityWeight(finding.category, finding.endpoint?.path) >= 75,
  });

  const hint = recommendationHint(testType, language, framework);

  return {
    id: makeId('rec'),
    priority,
    title: `Add ${testType.replace(/-/g, ' ')} for: ${finding.title}`,
    rationale: `${finding.description} ${hint}`,
    recommendedTestType: testType,
    endpoint: finding.endpoint,
    likelyFramework: framework,
    likelyLanguage: language,
    linkedFindingIds: [finding.id],
    riskScore: score,
    confidence: hasSecuritySignal ? 'high' : isZeroCoverage ? 'high' : 'medium',
  };
}

function deduplicateRecommendations(
  recs: MissingTestRecommendation[],
): MissingTestRecommendation[] {
  const byKey = new Map<string, MissingTestRecommendation>();
  for (const r of recs) {
    const key = `${r.recommendedTestType}|${r.endpoint?.method ?? ''}|${r.endpoint?.path ?? ''}`;
    const existing = byKey.get(key);
    if (!existing || r.riskScore > existing.riskScore) {
      byKey.set(key, {
        ...r,
        linkedFindingIds: [
          ...(existing?.linkedFindingIds ?? []),
          ...r.linkedFindingIds,
        ].filter((v, i, a) => a.indexOf(v) === i),
      });
    }
  }
  return Array.from(byKey.values()).sort((a, b) => b.riskScore - a.riskScore);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface LinkageResult {
  findings: FunctionalFinding[];
  recommendations: MissingTestRecommendation[];
}

/**
 * Run the full linkage engine over coverage + security results.
 * Returns all functional findings and deduplicated recommendations.
 */
export function runLinkageEngine(input: IntelligenceInput): LinkageResult {
  const languages = input.languages ?? [];
  const frameworks = input.frameworks ?? [];
  const primaryLanguage = languages[0];
  const primaryFramework = frameworks[0];

  let allFindings: FunctionalFinding[] = [];

  for (const result of input.coverageResults) {
    switch (result.type) {
      case 'endpoint':
        allFindings.push(...buildEndpointFindings(result.details, languages, frameworks));
        break;
      case 'error':
        allFindings.push(...buildErrorCoverageFindings(result.details, languages));
        break;
      case 'business':
        allFindings.push(...buildBusinessCoverageFindings(result.details, languages));
        break;
      case 'integration':
        allFindings.push(...buildIntegrationFlowFindings(result.details, languages));
        break;
      case 'security':
        allFindings.push(...buildSecurityCoverageFindings(result.details, languages));
        break;
      case 'parameter':
        allFindings.push(...buildParameterCoverageFindings(result.details, languages));
        break;
      case 'compatibility':
        allFindings.push(...buildCompatibilityFindings(result.details, languages));
        break;
      case 'performance':
        allFindings.push(...buildPerfResilienceFindings(result.details, languages));
        break;
    }
  }

  // Add security scanner findings
  allFindings.push(...buildSecurityScanFindings(input.securityFindings, languages));

  // Deduplicate
  const findings = deduplicateFindings(allFindings);

  // Build recommendations from each finding
  const rawRecs = findings.map((f) =>
    buildRecommendationFromFinding(f, primaryLanguage, primaryFramework),
  );

  const recommendations = deduplicateRecommendations(rawRecs);

  return { findings, recommendations };
}
