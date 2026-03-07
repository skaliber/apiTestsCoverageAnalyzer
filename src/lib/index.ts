/**
 * api-test-coverage-analyzer – Public Library API
 *
 * Import individual analyze* functions in your own scripts:
 *
 *   const { analyzeEndpoints } = require('api-test-coverage-analyzer');
 *   const results = await analyzeEndpoints({ spec: 'openapi.yaml', tests: 'tests/**\/*.ts' });
 */

import * as path from 'path';
import {
  parseOpenApiSpec,
  analyzeTestCoverage,
  buildCoverageReport,
  generateReports,
} from '../endpointCoverage';
import {
  parseParameters,
  analyzeParameterCoverage,
  buildParameterCoverageReport,
  generateParameterReports,
} from '../parameterCoverage';
import {
  parseBusinessRules,
  analyzeBusinessCoverage,
  buildBusinessCoverageReport,
  generateBusinessReports,
} from '../businessCoverage';
import {
  parseIntegrationFlows,
  analyzeIntegrationCoverage,
  buildIntegrationCoverageReport,
  generateIntegrationReports,
} from '../integrationCoverage';
import {
  parseErrorScenarios,
  analyzeErrorCoverage,
  buildErrorCoverageReport,
  generateErrorReports,
} from '../errorCoverage';
import {
  parseSecurityControls,
  analyzeSecurityCoverage,
  buildSecurityCoverageReport,
  generateSecurityReports,
} from '../securityCoverage';
import {
  parseEndpointsFromSpec,
  parseLoadTestResults,
  buildResilienceScenarios,
  analyzeResilienceCoverage,
  analyzePerformanceCoverage,
  buildPerfResilienceReport,
  generatePerfResilienceReports,
  PerformanceThresholds,
} from '../perfResilienceCoverage';
import {
  loadSpec,
  compareSpecs,
  parseContractFiles,
  verifyContracts,
  buildCompatibilityReport,
  generateCompatibilityReports,
} from '../compatibilityCoverage';
import {
  parseFormats,
  generateMultiFormatReports,
  checkThresholds,
  CoverageResult,
  ReportFormat,
} from '../reporting';
import { SupportedLanguage, parseLanguageOption } from '../languageDetection';
import {
  runSecurityScan,
  buildSecurityScanSummary,
  generateSecurityScanReports,
  evaluateSecurityGate,
  normalizeSemgrepOutput,
  normalizeTrivyOutput,
  normalizeZapOutput,
  SecurityScanConfig,
  SecurityFinding,
  SecurityGateConfig,
  SecurityGateResult,
  SecurityScanSummary,
  ScannerResult,
} from '../security/index';

// Re-export shared types so consumers can use them without diving into sub-modules
export type { CoverageResult, ReportFormat };
export { parseFormats, checkThresholds };

// Re-export security scanning types and functions
export type {
  SecurityFinding,
  SecurityGateConfig,
  SecurityGateResult,
  SecurityScanConfig,
  SecurityScanSummary,
  ScannerResult,
};
export {
  runSecurityScan,
  buildSecurityScanSummary,
  generateSecurityScanReports,
  evaluateSecurityGate,
  normalizeSemgrepOutput,
  normalizeTrivyOutput,
  normalizeZapOutput,
};

// ─── Shared option types ──────────────────────────────────────────────────────

export interface BaseOptions {
  /** Glob pattern(s) for test files */
  tests: string | string[];
  /** Comma-separated list of output formats (json,html,csv,junit). Default: json,html */
  format?: string;
  /** Directory to write reports into. Default: reports/ */
  reportsDir?: string;
}

export interface EndpointOptions extends BaseOptions {
  /** Path to the OpenAPI/Swagger spec file */
  spec: string;
  /** Language(s) to analyse. Default: auto */
  language?: string | string[];
  /** Minimum required endpoint coverage percentage */
  thresholdEndpoint?: number;
}

export interface ParameterOptions extends BaseOptions {
  /** Path to the OpenAPI/Swagger spec file */
  spec: string;
  /** Minimum required parameter coverage percentage */
  thresholdParameter?: number;
}

export interface BusinessOptions extends BaseOptions {
  /** Path to the business rules YAML/JSON file */
  rules: string;
  /** Minimum required business rule coverage percentage */
  thresholdBusiness?: number;
}

export interface IntegrationOptions extends BaseOptions {
  /** Path to the integration flows YAML/JSON file */
  flows: string;
  /** Minimum required integration flow coverage percentage */
  thresholdIntegration?: number;
}

export interface ErrorOptions extends BaseOptions {
  /** Path to the OpenAPI/Swagger spec file (for error scenarios) */
  spec: string;
  /** Minimum required error coverage percentage */
  thresholdError?: number;
}

export interface SecurityOptions extends BaseOptions {
  /** Path to the OpenAPI/Swagger security spec file */
  spec: string;
  /** Path to an external security scanner report */
  scanReport?: string;
  /** Minimum required security coverage percentage */
  thresholdSecurity?: number;
}

export interface PerfResilienceOptions extends BaseOptions {
  /** Path to the OpenAPI/Swagger spec file */
  spec: string;
  /** Comma-separated paths to load-test result files (JMeter .jtl/.csv or k6 .json) */
  loadResults?: string;
  /** Maximum acceptable median response time in ms. Default: 500 */
  thresholdResponseMs?: number;
  /** Maximum acceptable error rate as a decimal (0–1). Default: 0.05 */
  thresholdErrorRate?: number;
  /** Minimum required performance coverage percentage */
  thresholdPerformance?: number;
  /** Minimum required resilience coverage percentage */
  thresholdResilience?: number;
}

export interface CompatibilityOptions {
  /** Path to the previous (published) OpenAPI/Swagger spec */
  oldSpec: string;
  /** Path to the current spec to be published */
  newSpec: string;
  /** Glob pattern for consumer contract files (e.g. Pact JSON files) */
  contracts?: string;
  /** Minimum required compatibility percentage */
  thresholdCompat?: number;
  /** Directory to write reports into. Default: reports/ */
  reportsDir?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveTestsGlob(tests: string | string[]): string {
  return Array.isArray(tests) ? tests[0] : tests;
}

function resolveReportsDir(opts: { reportsDir?: string }): string {
  return path.resolve(opts.reportsDir ?? 'reports');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyse which API endpoints are covered by integration tests.
 *
 * @example
 * const { analyzeEndpoints } = require('api-test-coverage-analyzer');
 * const result = await analyzeEndpoints({ spec: 'openapi.yaml', tests: 'tests/**\/*.ts' });
 */
export async function analyzeEndpoints(options: EndpointOptions): Promise<CoverageResult> {
  const specPath = path.resolve(options.spec);
  const testsGlob = resolveTestsGlob(options.tests);
  const reportsDir = resolveReportsDir(options);
  const formats = parseFormats(options.format ?? 'json,html');

  const languages: SupportedLanguage[] = options.language
    ? parseLanguageOption(Array.isArray(options.language) ? options.language.join(',') : options.language)
    : ['auto'];

  const endpoints = await parseOpenApiSpec(specPath);
  const coverageMap = await analyzeTestCoverage(endpoints, testsGlob, languages);
  const report = buildCoverageReport(coverageMap);
  generateReports(report, reportsDir);

  const result: CoverageResult = {
    type: 'endpoint',
    totalItems: report.total,
    coveredItems: report.covered,
    coveragePercent: report.percentage,
    details: report,
  };

  const thresholds: Record<string, number> = {};
  if (options.thresholdEndpoint !== undefined && options.thresholdEndpoint > 0) {
    thresholds['endpoint'] = options.thresholdEndpoint;
  }

  generateMultiFormatReports([result], formats, reportsDir, thresholds);
  return result;
}

/**
 * Analyse how thoroughly each API parameter is tested.
 *
 * @example
 * const { analyzeParameters } = require('api-test-coverage-analyzer');
 * const result = await analyzeParameters({ spec: 'openapi.yaml', tests: 'tests/**\/*.ts' });
 */
export async function analyzeParameters(options: ParameterOptions): Promise<CoverageResult> {
  const specPath = path.resolve(options.spec);
  const testsGlob = resolveTestsGlob(options.tests);
  const reportsDir = resolveReportsDir(options);
  const formats = parseFormats(options.format ?? 'json,html');

  const parameters = await parseParameters(specPath);
  const coverages = await analyzeParameterCoverage(parameters, testsGlob);
  const report = buildParameterCoverageReport(coverages);
  generateParameterReports(report, reportsDir);

  const result: CoverageResult = {
    type: 'parameter',
    totalItems: report.totalParameters,
    coveredItems: coverages.filter((c) => c.ratio > 0).length,
    coveragePercent: report.averageCoverage,
    details: report,
  };

  const thresholds: Record<string, number> = {};
  if (options.thresholdParameter !== undefined && options.thresholdParameter > 0) {
    thresholds['parameter'] = options.thresholdParameter;
  }

  generateMultiFormatReports([result], formats, reportsDir, thresholds);
  return result;
}

/**
 * Analyse how well tests cover defined business rules.
 *
 * @example
 * const { analyzeBusinessRules } = require('api-test-coverage-analyzer');
 * const result = await analyzeBusinessRules({ rules: 'business-rules.yaml', tests: 'tests/**\/*.ts' });
 */
export async function analyzeBusinessRules(options: BusinessOptions): Promise<CoverageResult> {
  const rulesPath = path.resolve(options.rules);
  const testsGlob = resolveTestsGlob(options.tests);
  const reportsDir = resolveReportsDir(options);
  const formats = parseFormats(options.format ?? 'json,html');

  const rules = parseBusinessRules(rulesPath);
  const coverages = await analyzeBusinessCoverage(rules, testsGlob);
  const report = buildBusinessCoverageReport(coverages);
  generateBusinessReports(report, reportsDir);

  const result: CoverageResult = {
    type: 'business',
    totalItems: report.total,
    coveredItems: report.covered,
    coveragePercent: report.percentage,
    details: report,
  };

  const thresholds: Record<string, number> = {};
  if (options.thresholdBusiness !== undefined && options.thresholdBusiness > 0) {
    thresholds['business'] = options.thresholdBusiness;
  }

  generateMultiFormatReports([result], formats, reportsDir, thresholds);
  return result;
}

/**
 * Analyse how well integration tests exercise defined end-to-end flows.
 *
 * @example
 * const { analyzeIntegrationFlows } = require('api-test-coverage-analyzer');
 * const result = await analyzeIntegrationFlows({ flows: 'integration-flows.yaml', tests: 'tests/**\/*.ts' });
 */
export async function analyzeIntegrationFlows(options: IntegrationOptions): Promise<CoverageResult> {
  const flowsPath = path.resolve(options.flows);
  const testsGlob = resolveTestsGlob(options.tests);
  const reportsDir = resolveReportsDir(options);
  const formats = parseFormats(options.format ?? 'json,html');

  const flows = parseIntegrationFlows(flowsPath);
  const coverages = await analyzeIntegrationCoverage(flows, testsGlob);
  const report = buildIntegrationCoverageReport(coverages);
  generateIntegrationReports(report, reportsDir);

  const result: CoverageResult = {
    type: 'integration',
    totalItems: report.total,
    coveredItems: report.complete,
    coveragePercent: report.percentage,
    details: report,
  };

  const thresholds: Record<string, number> = {};
  if (options.thresholdIntegration !== undefined && options.thresholdIntegration > 0) {
    thresholds['integration'] = options.thresholdIntegration;
  }

  generateMultiFormatReports([result], formats, reportsDir, thresholds);
  return result;
}

/**
 * Analyse how thoroughly tests cover error handling and negative scenarios.
 *
 * @example
 * const { analyzeErrorCoverage } = require('api-test-coverage-analyzer');
 * const result = await analyzeErrorCoverage({ spec: 'openapi.yaml', tests: 'tests/**\/*.ts' });
 */
export async function analyzeErrorHandling(options: ErrorOptions): Promise<CoverageResult> {
  const specPath = path.resolve(options.spec);
  const testsGlob = resolveTestsGlob(options.tests);
  const reportsDir = resolveReportsDir(options);
  const formats = parseFormats(options.format ?? 'json,html');

  const scenarios = await parseErrorScenarios(specPath);
  const coverages = await analyzeErrorCoverage(scenarios, testsGlob);
  const report = buildErrorCoverageReport(coverages);
  generateErrorReports(report, reportsDir);

  const result: CoverageResult = {
    type: 'error',
    totalItems: report.total,
    coveredItems: report.covered,
    coveragePercent: report.percentage,
    details: report,
  };

  const thresholds: Record<string, number> = {};
  if (options.thresholdError !== undefined && options.thresholdError > 0) {
    thresholds['error'] = options.thresholdError;
  }

  generateMultiFormatReports([result], formats, reportsDir, thresholds);
  return result;
}

/**
 * Analyse how comprehensively tests cover security controls defined in the API spec.
 *
 * @example
 * const { analyzeSecurityCoverage } = require('api-test-coverage-analyzer');
 * const result = await analyzeSecurityCoverage({ spec: 'openapi-security.yaml', tests: 'tests/**\/*.ts' });
 */
export async function analyzeSecurityControls(options: SecurityOptions): Promise<CoverageResult> {
  const specPath = path.resolve(options.spec);
  const testsGlob = resolveTestsGlob(options.tests);
  const scanReportPath = options.scanReport ? path.resolve(options.scanReport) : undefined;
  const reportsDir = resolveReportsDir(options);
  const formats = parseFormats(options.format ?? 'json,html');

  const controls = await parseSecurityControls(specPath);
  const coverages = await analyzeSecurityCoverage(controls, testsGlob, scanReportPath);
  const report = buildSecurityCoverageReport(
    coverages,
    scanReportPath ? coverages.filter((c) => c.coveredByScanReport).length : 0,
  );
  generateSecurityReports(report, reportsDir);

  const result: CoverageResult = {
    type: 'security',
    totalItems: report.total,
    coveredItems: report.covered,
    coveragePercent: report.percentage,
    details: report,
  };

  const thresholds: Record<string, number> = {};
  if (options.thresholdSecurity !== undefined && options.thresholdSecurity > 0) {
    thresholds['security'] = options.thresholdSecurity;
  }

  generateMultiFormatReports([result], formats, reportsDir, thresholds);
  return result;
}

/**
 * Analyse performance and resilience coverage.
 *
 * @example
 * const { analyzePerfResilience } = require('api-test-coverage-analyzer');
 * const results = await analyzePerfResilience({ spec: 'openapi.yaml', tests: 'tests/**\/*.ts' });
 */
export async function analyzePerfResilience(
  options: PerfResilienceOptions,
): Promise<[CoverageResult, CoverageResult]> {
  const specPath = path.resolve(options.spec);
  const testsGlob = resolveTestsGlob(options.tests);
  const reportsDir = resolveReportsDir(options);
  const formats = parseFormats(options.format ?? 'json,html');

  const perfThresholds: PerformanceThresholds = {
    responseMs: options.thresholdResponseMs ?? 500,
    errorRate: options.thresholdErrorRate ?? 0.05,
  };

  const endpoints = await parseEndpointsFromSpec(specPath);

  const loadResultPaths: string[] = options.loadResults
    ? options.loadResults.split(',').map((p) => path.resolve(p.trim()))
    : [];
  const metricsMap = loadResultPaths.length > 0 ? parseLoadTestResults(loadResultPaths) : new Map();

  const performanceCoverages = analyzePerformanceCoverage(endpoints, metricsMap, perfThresholds);
  const scenarios = buildResilienceScenarios(endpoints);
  const resilienceCoverages = await analyzeResilienceCoverage(scenarios, testsGlob);
  const report = buildPerfResilienceReport(performanceCoverages, resilienceCoverages);
  generatePerfResilienceReports(report, reportsDir);

  const perfResult: CoverageResult = {
    type: 'performance',
    totalItems: report.totalEndpoints,
    coveredItems: report.endpointsWithLoadData,
    coveragePercent: report.performanceCoveragePercent,
    details: report,
  };
  const resilienceResult: CoverageResult = {
    type: 'resilience',
    totalItems: report.totalResilienceScenarios,
    coveredItems: report.coveredResilienceScenarios,
    coveragePercent: report.resilienceCoveragePercent,
    details: report,
  };

  const thresholds: Record<string, number> = {};
  if (options.thresholdPerformance !== undefined && options.thresholdPerformance > 0) {
    thresholds['performance'] = options.thresholdPerformance;
  }
  if (options.thresholdResilience !== undefined && options.thresholdResilience > 0) {
    thresholds['resilience'] = options.thresholdResilience;
  }

  generateMultiFormatReports([perfResult, resilienceResult], formats, reportsDir, thresholds);
  return [perfResult, resilienceResult];
}

/**
 * Compare two API spec versions and verify consumer contracts.
 *
 * @example
 * const { analyzeCompatibility } = require('api-test-coverage-analyzer');
 * const results = await analyzeCompatibility({ oldSpec: 'v1.yaml', newSpec: 'v2.yaml' });
 */
export async function analyzeCompatibility(
  options: CompatibilityOptions,
): Promise<[CoverageResult, CoverageResult]> {
  const oldSpecPath = path.resolve(options.oldSpec);
  const newSpecPath = path.resolve(options.newSpec);
  const reportsDir = resolveReportsDir(options);

  const oldApi = await loadSpec(oldSpecPath);
  const newApi = await loadSpec(newSpecPath);
  const changes = compareSpecs(oldApi, newApi);
  const breakingChanges = changes.filter((c) => c.breaking);
  const contracts = options.contracts ? await parseContractFiles(options.contracts) : [];
  const verificationResults = verifyContracts(contracts, newApi);
  const report = buildCompatibilityReport(oldApi, newApi, changes, verificationResults, oldSpecPath, newSpecPath);
  generateCompatibilityReports(report, reportsDir);

  const formats = parseFormats('json,html');
  const uniqueAffectedEndpoints = new Set(
    breakingChanges.filter((c) => c.changeType !== 'added').map((c) => `${c.method}:${c.path}`),
  ).size;
  const endpointsUnaffectedByBreakingChanges = report.totalOldEndpoints - uniqueAffectedEndpoints;

  const compatResult: CoverageResult = {
    type: 'compatibility',
    totalItems: report.totalOldEndpoints,
    coveredItems: endpointsUnaffectedByBreakingChanges,
    coveragePercent: report.compatibilityPercent,
    details: report,
  };
  const contractResult: CoverageResult = {
    type: 'contract-coverage',
    totalItems: report.totalNewEndpoints,
    coveredItems: report.contractCoveredEndpoints,
    coveragePercent: report.contractCoveragePercent,
    details: report,
  };

  const thresholds: Record<string, number> = {};
  if (options.thresholdCompat !== undefined && options.thresholdCompat > 0) {
    thresholds['compatibility'] = options.thresholdCompat;
    thresholds['contract-coverage'] = options.thresholdCompat;
  }

  generateMultiFormatReports([compatResult, contractResult], formats, reportsDir, thresholds);
  return [compatResult, contractResult];
}

// ─── Security scanning API ────────────────────────────────────────────────────

/**
 * Options for running the integrated security scanner.
 */
export interface SecurityScanOptions {
  /** Security scanning configuration */
  config: SecurityScanConfig;
  /** Directory to write reports into. Default: reports/ */
  reportsDir?: string;
}

/**
 * Run the integrated security scanning workflow.
 * Executes configured scanners (Semgrep, Trivy, ZAP), normalizes findings,
 * evaluates the security gate, and generates reports.
 *
 * @example
 * const { runSecurityAnalysis } = require('api-test-coverage-analyzer');
 * const summary = await runSecurityAnalysis({
 *   config: {
 *     enabled: true,
 *     workspace: '.',
 *     scanners: { trivy: { enabled: true, mode: 'import', reportPath: 'trivy.json' } },
 *     gate: { failOnCritical: true, maxSecrets: 0 }
 *   }
 * });
 */
export async function runSecurityAnalysis(
  options: SecurityScanOptions,
): Promise<SecurityScanSummary> {
  const reportsDir = path.resolve(options.reportsDir ?? 'reports');
  return runSecurityScan(options.config, reportsDir);
}
