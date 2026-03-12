#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import {
  parseOpenApiSpec,
  analyzeTestCoverage,
  buildCoverageReport,
  generateReports,
} from './endpointCoverage';
import {
  parseParameters,
  analyzeParameterCoverage,
  buildParameterCoverageReport,
  generateParameterReports,
  AstParameterAnalysisOptions,
} from './parameterCoverage';
import {
  parseBusinessRules,
  analyzeBusinessCoverage,
  buildBusinessCoverageReport,
  generateBusinessReports,
} from './businessCoverage';
import {
  parseIntegrationFlows,
  analyzeIntegrationCoverage,
  buildIntegrationCoverageReport,
  generateIntegrationReports,
} from './integrationCoverage';
import {
  parseErrorScenarios,
  analyzeErrorCoverage,
  buildErrorCoverageReport,
  generateErrorReports,
  AstErrorAnalysisOptions,
} from './errorCoverage';
import {
  parseSecurityControls,
  analyzeSecurityCoverage,
  buildSecurityCoverageReport,
  generateSecurityReports,
  AstSecurityAnalysisOptions,
} from './securityCoverage';
import {
  parseEndpointsFromSpec,
  parseLoadTestResults,
  buildResilienceScenarios,
  analyzeResilienceCoverage,
  analyzePerformanceCoverage,
  buildPerfResilienceReport,
  generatePerfResilienceReports,
  PerformanceThresholds,
} from './perfResilienceCoverage';
import {
  loadSpec,
  compareSpecs,
  parseContractFiles,
  verifyContracts,
  buildCompatibilityReport,
  generateCompatibilityReports,
} from './compatibilityCoverage';
import {
  parseFormats,
  generateMultiFormatReports,
  checkThresholds,
  CoverageResult,
} from './reporting';
import { resolveConfig, mergeConfig, CoverageConfig, loadCentralConfig } from './config';
import { DEFAULT_DEEP_ANALYSIS_CONFIG } from './coverage/deep-analysis/index';
import type { DeepAnalysisConfig } from './coverage/deep-analysis/index';
import {
  runSecurityScan,
  SecurityScanConfig,
} from './security/index';
import { runPlugins, PluginContext } from './pluginLoader';
import {
  initLogger,
  initMetrics,
  recordCoverageMetrics,
  recordSecurityScanMetrics,
  startMetricsServer,
  stopMetricsServer,
  initTracing,
  startSpan,
  buildObservabilityInfo,
  logCoverageResult,
  logThresholdBreach,
  getLogger,
  LogLevel,
} from './observability';
import {
  SupportedLanguage,
  parseLanguageOption,
  getDefaultGlobsForLanguage,
  SUPPORTED_LANGUAGES,
} from './languageDetection';
import { runIntelligenceEngine } from './intelligence/index';
import { recordIntelligenceMetrics } from './observability';
import { generateBuildSummary } from './summary/buildSummary';
import { generatePrSummary } from './summary/prSummary';
import type { SummaryInput } from './summary/markdownRenderer';
import { KNOWN_METRIC_TYPES } from './summary/summaryTypes';
import { registerAllAnalyzers } from './ast/astAnalysisOrchestrator';
import { discoverProject } from './discovery/projectDiscovery';
import { inferBusinessRules, writeInferredBusinessRules, KEYWORD_STOP_WORDS } from './inference/businessRuleInference';
import { inferIntegrationFlows, writeInferredIntegrationFlows } from './inference/integrationFlowInference';
import { inferRoutes, writeInferredRoutes } from './inference/routeInference';
import { writeScanManifest } from './inference/scanManifest';
import type { ScanTypeEntry } from './inference/scanManifest';
import { serveDashboard } from './serveDashboard';
import { generateTests, exportAiFlows, scoreTests } from './generation/index';
import type { GapPriority, GapType } from './generation/types';

// Register all language AST analyzers at startup.
// This side-effect import ensures each language module's registerAnalyzer() call runs.
registerAllAnalyzers();

/** Keywords that indicate a test is exercising an error/failure path. */
const ERROR_TEST_KEYWORDS = ['error', 'fail', 'throw', 'exception', 'reject', 'invalid', 'blank', 'missing'] as const;

const program = new Command();

program
  .name('api-tests-coverage-analyzer')
  .description('Analyze API test coverage based on OpenAPI specs')
  .version('0.1.0')
  .option('--config <file>', 'Path to a coverage configuration file (default: config.yaml)')
  .option('--log-level <level>', 'Log verbosity level: trace|debug|info|warn|error|silent', 'info')
  .option('--metrics-port <port>', 'Start a Prometheus /metrics HTTP server on this port after analysis', parseInt)
  .option('--service-name <name>', 'Service name label added to all Prometheus metrics', 'api-coverage-analyzer')
  .option('--trace', 'Enable OpenTelemetry tracing (spans recorded in memory or exported via OTLP)')
  .option('--trace-endpoint <url>', 'OTLP HTTP endpoint for trace export (e.g. http://localhost:4318)');

// ─── Config helper ─────────────────────────────────────────────────────────────

/**
 * Load and return the resolved CoverageConfig for a command invocation.
 *
 * Loads via the central config loader (config.yaml) first.  CLI threshold
 * flags (non-zero values) take precedence and emit a deprecation warning.
 * Legacy `testPatterns` / `plugins` are preserved via the old JSON loader
 * for backward compatibility during the config.yaml migration.
 */
function loadCoverageConfig(
  configPath: string | undefined,
  cliThresholds: Record<string, number>,
): CoverageConfig {
  // Load via central config (config.yaml). Emits missing-config warning if absent.
  const analyzerCfg = loadCentralConfig(configPath);

  // Emit deprecation warnings for explicitly-set CLI threshold flags.
  const activeCliThresholds: Record<string, number> = {};
  for (const [key, value] of Object.entries(cliThresholds)) {
    if (value > 0) {
      process.stderr.write(
        `[DEPRECATED] --threshold-${key} CLI flag is deprecated. ` +
          `Use thresholds.${key} in config.yaml instead.\n`,
      );
      activeCliThresholds[key] = value;
    }
  }

  // Merge: central config thresholds < CLI threshold overrides.
  const mergedThresholds = {
    ...(analyzerCfg.thresholds as Record<string, number | undefined>),
    ...activeCliThresholds,
  };

  // For fields not covered by the new AnalyzerConfig schema (testPatterns,
  // plugins, exclude), fall back to the legacy JSON config loader — these are
  // only read when a legacy coverage.config.json is still present.  They are
  // not required and default to empty when absent.
  let legacyTestPatterns: string[] = [];
  let legacyPlugins: string[] = [];
  let legacyExclude = { paths: [] as string[], methods: [] as string[] };

  if (!configPath) {
    try {
      const legacyCfg = resolveConfig(undefined);
      legacyTestPatterns = legacyCfg.testPatterns ?? [];
      legacyPlugins = legacyCfg.plugins ?? [];
      if (legacyCfg.exclude) legacyExclude = {
        paths: legacyCfg.exclude.paths ?? [],
        methods: legacyCfg.exclude.methods ?? [],
      };
    } catch {
      // No legacy JSON config present — safe to ignore.
    }
  }

  return {
    thresholds: mergedThresholds,
    testPatterns: legacyTestPatterns,
    plugins: legacyPlugins,
    exclude: legacyExclude,
    qualityGate: analyzerCfg.qualityGate,
    mcp: analyzerCfg.mcp,
    publishing: analyzerCfg.publishing
      ? {
          enabled: analyzerCfg.publishing.enabled,
          githubPages: analyzerCfg.publishing.githubPages,
        }
      : undefined,
  };
}

/**
 * Initialise all observability subsystems from the parent program options.
 * Safe to call multiple times; subsequent calls are no-ops if already set up.
 */
function setupObservability(): { metricsPort?: number; serviceName: string } {
  const opts = program.opts();
  const logLevel = (opts.logLevel as LogLevel) || 'info';
  const metricsPort = opts.metricsPort as number | undefined;
  const serviceName = (opts.serviceName as string) || 'api-coverage-analyzer';
  const traceEnabled = Boolean(opts.trace);
  const traceEndpoint = opts.traceEndpoint as string | undefined;

  initLogger(logLevel);
  initMetrics(serviceName);
  initTracing(traceEnabled, traceEndpoint);

  return { metricsPort, serviceName };
}

/**
 * After each command completes, record metrics, start the server (if requested),
 * log results, and check thresholds.
 */
async function finaliseObservability(
  allResults: CoverageResult[],
  thresholds: Record<string, number>,
  metricsPort: number | undefined,
  serviceName: string,
): Promise<void> {
  const logger = getLogger();

  // Record into Prometheus gauges
  recordCoverageMetrics(allResults, thresholds, serviceName);

  // Structured log each result
  for (const r of allResults) {
    logCoverageResult(logger, r, thresholds[r.type]);
  }

  // Log threshold breaches
  for (const r of allResults) {
    const t = thresholds[r.type];
    if (t !== undefined && r.coveragePercent < t) {
      logThresholdBreach(logger, r.type, r.coveragePercent, t);
    }
  }

  // Start metrics HTTP server if requested
  if (metricsPort) {
    await startMetricsServer(metricsPort);
    logger.info({ event: 'metrics_server_start', port: metricsPort }, `Prometheus metrics available at http://localhost:${metricsPort}/metrics`);
    console.log(`Prometheus metrics available at http://localhost:${metricsPort}/metrics`);

    // Keep the server alive until the process is signalled; handle graceful shutdown
    process.once('SIGINT', () => {
      void stopMetricsServer().then(() => process.exit(0));
    });
    process.once('SIGTERM', () => {
      void stopMetricsServer().then(() => process.exit(0));
    });
  }
}

program
  .command('endpoint-coverage')
  .description('Analyze which API endpoints are covered by integration tests')
  .option('--spec <path>', 'Path to the OpenAPI/Swagger spec file', 'sample/openapi.yaml')
  .option('--tests <glob>', 'Glob pattern for test files', 'tests/**/*.ts')
  .option(
    '--language <lang>',
    `Test language(s) to analyse. Accepted values: ${SUPPORTED_LANGUAGES.join(', ')}. ` +
      'Use a comma-separated list or repeat the flag for multiple languages. ' +
      "Default: 'auto' (inferred from file extensions).",
    (val: string, prev: SupportedLanguage[]) => {
      const parsed = parseLanguageOption(val);
      return prev ? [...prev, ...parsed] : parsed;
    },
    [] as SupportedLanguage[],
  )
  .option(
    '--format <formats>',
    'Comma-separated list of report formats: json,html,csv,junit (default: json,html)',
    'json,html',
  )
  .option(
    '--threshold-endpoint <percent>',
    'Minimum required endpoint coverage percentage (0-100)',
    parseFloat,
    0,
  )
  .action(async (options) => {
    const { metricsPort, serviceName } = setupObservability();
    const logger = getLogger();

    const parentOpts = program.opts();
    const config = loadCoverageConfig(parentOpts.config as string | undefined, {
      endpoint: options.thresholdEndpoint as number,
    });

    const specPath = path.resolve(options.spec);
    const languages: SupportedLanguage[] = (options.language as SupportedLanguage[]).length > 0
      ? (options.language as SupportedLanguage[])
      : ['auto'];

    // Determine the test glob: config overrides CLI, and language overrides the default
    let testsGlob: string;
    if (config.testPatterns && config.testPatterns.length > 0) {
      testsGlob = config.testPatterns[0];
    } else if (options.tests !== 'tests/**/*.ts') {
      // User explicitly passed --tests
      testsGlob = options.tests as string;
    } else if (!languages.includes('auto') && languages.length === 1) {
      // Use language-specific default glob when a single language is specified
      const langGlobs = getDefaultGlobsForLanguage(languages[0]);
      testsGlob = langGlobs[0];
    } else {
      testsGlob = options.tests as string;
    }

    const reportsDir = path.resolve('reports');
    const formats = parseFormats(options.format as string);

    const span = startSpan('endpoint-coverage', { specPath, testsGlob });

    logger.info({ event: 'analysis_start', coverageType: 'endpoint', specPath, testsGlob, languages }, `Parsing spec: ${specPath}`);
    console.log(`Parsing spec: ${specPath}`);
    const endpoints = await parseOpenApiSpec(specPath);

    console.log(`Analyzing tests matching: ${testsGlob} (language: ${languages.join(', ')})`);
    const analyzerCfgForDeep = loadCentralConfig(parentOpts.config as string | undefined);
    const deepCfg = analyzerCfgForDeep.scans.coverage?.deepAnalysis;
    const deepAnalysisConfig: DeepAnalysisConfig = {
      ...DEFAULT_DEEP_ANALYSIS_CONFIG,
      ...(deepCfg ?? {}),
    };
    const coverageMap = await analyzeTestCoverage(endpoints, testsGlob, languages, deepAnalysisConfig);

    const report = buildCoverageReport(coverageMap);

    // Write per-command legacy reports (JSON + HTML files named endpoint-coverage.*)
    generateReports(report, reportsDir);

    // Build standardised result and write multi-format summary reports
    const result: CoverageResult = {
      type: 'endpoint',
      totalItems: report.total,
      coveredItems: report.covered,
      coveragePercent: report.percentage,
      details: report,
    };

    const thresholds: Record<string, number> = { ...(config.thresholds ?? {}) } as Record<string, number>;

    // Run plugins
    const pluginContext: PluginContext = {
      testPatterns: config.testPatterns ?? [],
      results: [result],
      config,
    };
    const pluginResults = await runPlugins(config, pluginContext);
    const allResults = [result, ...pluginResults];

    const observabilityInfo = buildObservabilityInfo(metricsPort);
    generateMultiFormatReports(allResults, formats, reportsDir, thresholds, observabilityInfo);

    console.log(
      `Endpoint coverage: ${report.covered}/${report.total} endpoints covered (${report.percentage}%)`,
    );
    console.log(`Reports written to: ${reportsDir}`);

    span.end({ totalItems: report.total, coveredItems: report.covered, coveragePercent: report.percentage });
    logger.info({ event: 'analysis_complete', coverageType: 'endpoint' }, 'Endpoint coverage analysis complete');

    await finaliseObservability(allResults, thresholds, metricsPort, serviceName);

    // Threshold check
    const failures = checkThresholds(allResults, thresholds);
    if (failures.length > 0) {
      for (const msg of failures) {
        console.error(`THRESHOLD FAILURE: ${msg}`);
      }
      process.exitCode = 1;
    }
  });

program
  .command('parameter-coverage')
  .description('Analyze how thoroughly each API parameter is tested (valid, boundary, missing, invalid)')
  .option('--spec <path>', 'Path to the OpenAPI/Swagger spec file', 'sample/openapi-parameters.yaml')
  .option('--tests <glob>', 'Glob pattern for test files', 'sample/tests/**/*.ts')
  .option(
    '--format <formats>',
    'Comma-separated list of report formats: json,html,csv,junit (default: json,html)',
    'json,html',
  )
  .option(
    '--threshold-parameter <percent>',
    'Minimum required parameter coverage percentage (0-100)',
    parseFloat,
    0,
  )
  .action(async (options) => {
    const { metricsPort, serviceName } = setupObservability();
    const logger = getLogger();

    const parentOpts = program.opts();
    const config = loadCoverageConfig(parentOpts.config as string | undefined, {
      parameter: options.thresholdParameter as number,
    });

    const specPath = path.resolve(options.spec);
    const testsGlob = (config.testPatterns && config.testPatterns.length > 0)
      ? config.testPatterns[0]
      : (options.tests as string);
    const reportsDir = path.resolve('reports');
    const formats = parseFormats(options.format as string);

    const span = startSpan('parameter-coverage', { specPath, testsGlob });

    logger.info({ event: 'analysis_start', coverageType: 'parameter', specPath }, `Parsing spec: ${specPath}`);
    console.log(`Parsing spec: ${specPath}`);
    const parameters = await parseParameters(specPath);

    console.log(`Analyzing tests matching: ${testsGlob}`);
    const analyzerCfgForParam = loadCentralConfig(parentOpts.config as string | undefined);
    const astParamOptions: AstParameterAnalysisOptions = {
      astConfig: analyzerCfgForParam.analysis.ast ?? {},
      deepConfig: analyzerCfgForParam.scans.coverage?.deepAnalysis,
    };
    const coverages = await analyzeParameterCoverage(parameters, testsGlob, astParamOptions);

    const report = buildParameterCoverageReport(coverages);

    generateParameterReports(report, reportsDir);

    const result: CoverageResult = {
      type: 'parameter',
      totalItems: report.totalParameters,
      coveredItems: coverages.filter((c) => c.ratio > 0).length,
      coveragePercent: report.averageCoverage,
      details: report,
    };

    const thresholds: Record<string, number> = { ...(config.thresholds ?? {}) } as Record<string, number>;

    // Run plugins
    const pluginContext: PluginContext = {
      testPatterns: config.testPatterns ?? [],
      results: [result],
      config,
    };
    const pluginResults = await runPlugins(config, pluginContext);
    const allResults = [result, ...pluginResults];

    const observabilityInfo = buildObservabilityInfo(metricsPort);
    generateMultiFormatReports(allResults, formats, reportsDir, thresholds, observabilityInfo);

    console.log(
      `Parameter coverage: ${report.totalParameters} parameters analysed, average coverage ${report.averageCoverage}%`,
    );
    console.log(`Reports written to: ${reportsDir}`);

    span.end({ totalItems: report.totalParameters, coveragePercent: report.averageCoverage });
    logger.info({ event: 'analysis_complete', coverageType: 'parameter' }, 'Parameter coverage analysis complete');

    await finaliseObservability(allResults, thresholds, metricsPort, serviceName);

    const failures = checkThresholds(allResults, thresholds);
    if (failures.length > 0) {
      for (const msg of failures) {
        console.error(`THRESHOLD FAILURE: ${msg}`);
      }
      process.exitCode = 1;
    }
  });

program
  .command('business-coverage')
  .description('Analyze how well tests cover defined business rules and scenarios')
  .option('--rules <file>', 'Path to the business rules definition file (YAML or JSON)', 'sample/business-rules.yaml')
  .option('--tests <glob>', 'Glob pattern for test files', 'sample/tests/**/*.ts')
  .option(
    '--format <formats>',
    'Comma-separated list of report formats: json,html,csv,junit (default: json,html)',
    'json,html',
  )
  .option(
    '--threshold-business <percent>',
    'Minimum required business logic coverage percentage (0-100)',
    parseFloat,
    0,
  )
  .action(async (options) => {
    const { metricsPort, serviceName } = setupObservability();
    const logger = getLogger();

    const parentOpts = program.opts();
    const config = loadCoverageConfig(parentOpts.config as string | undefined, {
      business: options.thresholdBusiness as number,
    });

    const rulesPath = path.resolve(options.rules);
    const testsGlob = (config.testPatterns && config.testPatterns.length > 0)
      ? config.testPatterns[0]
      : (options.tests as string);
    const reportsDir = path.resolve('reports');
    const formats = parseFormats(options.format as string);

    const span = startSpan('business-coverage', { rulesPath, testsGlob });

    logger.info({ event: 'analysis_start', coverageType: 'business', rulesPath }, `Parsing business rules: ${rulesPath}`);
    console.log(`Parsing business rules: ${rulesPath}`);
    const rules = parseBusinessRules(rulesPath);

    console.log(`Analyzing tests matching: ${testsGlob}`);
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

    const thresholds: Record<string, number> = { ...(config.thresholds ?? {}) } as Record<string, number>;

    // Run plugins
    const pluginContext: PluginContext = {
      testPatterns: config.testPatterns ?? [],
      results: [result],
      config,
    };
    const pluginResults = await runPlugins(config, pluginContext);
    const allResults = [result, ...pluginResults];

    const observabilityInfo = buildObservabilityInfo(metricsPort);
    generateMultiFormatReports(allResults, formats, reportsDir, thresholds, observabilityInfo);

    console.log(
      `Business coverage: ${report.covered}/${report.total} rules covered (${report.percentage}%)`,
    );
    if (report.uncoveredRules.length > 0) {
      console.log('Uncovered rules:');
      for (const rule of report.uncoveredRules) {
        console.log(`  - ${rule.id}: ${rule.description}`);
      }
    }
    console.log(`Reports written to: ${reportsDir}`);

    span.end({ totalItems: report.total, coveredItems: report.covered, coveragePercent: report.percentage });
    logger.info({ event: 'analysis_complete', coverageType: 'business' }, 'Business coverage analysis complete');

    await finaliseObservability(allResults, thresholds, metricsPort, serviceName);

    const failures = checkThresholds(allResults, thresholds);
    if (failures.length > 0) {
      for (const msg of failures) {
        console.error(`THRESHOLD FAILURE: ${msg}`);
      }
      process.exitCode = 1;
    }
  });

program
  .command('integration-coverage')
  .description('Analyze how well integration tests exercise defined end-to-end flows')
  .option('--flows <file>', 'Path to the integration flows definition file (YAML or JSON)', 'sample/integration-flows.yaml')
  .option('--tests <glob>', 'Glob pattern for test files', 'sample/tests/**/*.ts')
  .option(
    '--format <formats>',
    'Comma-separated list of report formats: json,html,csv,junit (default: json,html)',
    'json,html',
  )
  .option(
    '--threshold-integration <percent>',
    'Minimum required integration flow coverage percentage (0-100)',
    parseFloat,
    0,
  )
  .action(async (options) => {
    const { metricsPort, serviceName } = setupObservability();
    const logger = getLogger();

    const parentOpts = program.opts();
    const config = loadCoverageConfig(parentOpts.config as string | undefined, {
      integration: options.thresholdIntegration as number,
    });

    const flowsPath = path.resolve(options.flows);
    const testsGlob = (config.testPatterns && config.testPatterns.length > 0)
      ? config.testPatterns[0]
      : (options.tests as string);
    const reportsDir = path.resolve('reports');
    const formats = parseFormats(options.format as string);

    const span = startSpan('integration-coverage', { flowsPath, testsGlob });

    logger.info({ event: 'analysis_start', coverageType: 'integration', flowsPath }, `Parsing integration flows: ${flowsPath}`);
    console.log(`Parsing integration flows: ${flowsPath}`);
    const flows = parseIntegrationFlows(flowsPath);

    console.log(`Analyzing tests matching: ${testsGlob}`);
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

    const thresholds: Record<string, number> = { ...(config.thresholds ?? {}) } as Record<string, number>;

    // Run plugins
    const pluginContext: PluginContext = {
      testPatterns: config.testPatterns ?? [],
      results: [result],
      config,
    };
    const pluginResults = await runPlugins(config, pluginContext);
    const allResults = [result, ...pluginResults];

    const observabilityInfo = buildObservabilityInfo(metricsPort);
    generateMultiFormatReports(allResults, formats, reportsDir, thresholds, observabilityInfo);

    console.log(
      `Integration coverage: ${report.complete}/${report.total} flows complete, ${report.partial} partial, ${report.missing} missing (${report.percentage}%)`,
    );
    const partialFlows = coverages.filter((c) => c.status === 'partial');
    if (partialFlows.length > 0) {
      console.log('Partially covered flows:');
      for (const fc of partialFlows) {
        const uncoveredSteps = fc.steps.filter((s) => !s.covered).map((s) => s.step.id);
        console.log(`  - ${fc.flow.id}: ${fc.flow.name} (missing steps: ${uncoveredSteps.join(', ')})`);
      }
    }
    const missingFlows = coverages.filter((c) => c.status === 'missing');
    if (missingFlows.length > 0) {
      console.log('Missing flows:');
      for (const fc of missingFlows) {
        console.log(`  - ${fc.flow.id}: ${fc.flow.name}`);
      }
    }
    console.log(`Reports written to: ${reportsDir}`);

    span.end({ totalItems: report.total, coveredItems: report.complete, coveragePercent: report.percentage });
    logger.info({ event: 'analysis_complete', coverageType: 'integration' }, 'Integration coverage analysis complete');

    await finaliseObservability(allResults, thresholds, metricsPort, serviceName);

    const failures = checkThresholds(allResults, thresholds);
    if (failures.length > 0) {
      for (const msg of failures) {
        console.error(`THRESHOLD FAILURE: ${msg}`);
      }
      process.exitCode = 1;
    }
  });

program
  .command('error-coverage')
  .description('Analyze how thoroughly tests cover error handling and negative scenarios defined in the API spec')
  .option('--spec <path>', 'Path to the OpenAPI/Swagger spec file', 'sample/openapi-errors.yaml')
  .option('--tests <glob>', 'Glob pattern for test files', 'sample/tests/**/*.ts')
  .option(
    '--format <formats>',
    'Comma-separated list of report formats: json,html,csv,junit (default: json,html)',
    'json,html',
  )
  .option(
    '--threshold-error <percent>',
    'Minimum required error handling coverage percentage (0-100)',
    parseFloat,
    0,
  )
  .action(async (options) => {
    const { metricsPort, serviceName } = setupObservability();
    const logger = getLogger();

    const parentOpts = program.opts();
    const config = loadCoverageConfig(parentOpts.config as string | undefined, {
      error: options.thresholdError as number,
    });

    const specPath = path.resolve(options.spec);
    const testsGlob = (config.testPatterns && config.testPatterns.length > 0)
      ? config.testPatterns[0]
      : (options.tests as string);
    const reportsDir = path.resolve('reports');
    const formats = parseFormats(options.format as string);

    const span = startSpan('error-coverage', { specPath, testsGlob });

    logger.info({ event: 'analysis_start', coverageType: 'error', specPath }, `Parsing spec: ${specPath}`);
    console.log(`Parsing spec: ${specPath}`);
    const scenarios = await parseErrorScenarios(specPath);
    console.log(`Found ${scenarios.length} error scenarios`);

    console.log(`Analyzing tests matching: ${testsGlob}`);
    const analyzerCfgForError = loadCentralConfig(parentOpts.config as string | undefined);
    const astErrorOptions: AstErrorAnalysisOptions = {
      astConfig: analyzerCfgForError.analysis.ast ?? {},
      deepConfig: analyzerCfgForError.scans.coverage?.deepAnalysis,
    };
    const coverages = await analyzeErrorCoverage(scenarios, testsGlob, astErrorOptions);

    const report = buildErrorCoverageReport(coverages);

    generateErrorReports(report, reportsDir);

    const result: CoverageResult = {
      type: 'error',
      totalItems: report.total,
      coveredItems: report.covered,
      coveragePercent: report.percentage,
      details: report,
    };

    const thresholds: Record<string, number> = { ...(config.thresholds ?? {}) } as Record<string, number>;

    // Run plugins
    const pluginContext: PluginContext = {
      testPatterns: config.testPatterns ?? [],
      results: [result],
      config,
    };
    const pluginResults = await runPlugins(config, pluginContext);
    const allResults = [result, ...pluginResults];

    const observabilityInfo = buildObservabilityInfo(metricsPort);
    generateMultiFormatReports(allResults, formats, reportsDir, thresholds, observabilityInfo);

    console.log(
      `Error coverage: ${report.covered}/${report.total} error scenarios covered (${report.percentage}%)`,
    );

    // Print category summary
    for (const [cat, summary] of Object.entries(report.categorySummary)) {
      if (summary.total > 0) {
        const pct = Math.round((summary.covered / summary.total) * 100);
        console.log(`  ${cat}: ${summary.covered}/${summary.total} (${pct}%)`);
      }
    }

    const uncovered = coverages.filter((c) => !c.covered);
    if (uncovered.length > 0) {
      console.log('Uncovered error scenarios:');
      for (const c of uncovered) {
        console.log(`  - ${c.scenario.id}: ${c.scenario.description}`);
      }
    }

    console.log(`Reports written to: ${reportsDir}`);

    span.end({ totalItems: report.total, coveredItems: report.covered, coveragePercent: report.percentage });
    logger.info({ event: 'analysis_complete', coverageType: 'error' }, 'Error coverage analysis complete');

    await finaliseObservability(allResults, thresholds, metricsPort, serviceName);

    // Threshold check
    const failures = checkThresholds(allResults, thresholds);
    if (failures.length > 0) {
      for (const msg of failures) {
        console.error(`THRESHOLD FAILURE: ${msg}`);
      }
      process.exitCode = 1;
    }
  });

program
  .command('security-coverage')
  .description('Analyze how comprehensively tests cover security controls defined in the API spec')
  .option('--spec <path>', 'Path to the OpenAPI/Swagger spec file', 'sample/openapi-security.yaml')
  .option('--tests <glob>', 'Glob pattern for test files', 'sample/tests/**/*.ts')
  .option(
    '--scan-report <file>',
    'Path to an external security scanner report (ZAP JSON/XML or generic JSON) for enrichment',
  )
  .option(
    '--format <formats>',
    'Comma-separated list of report formats: json,html,csv,junit (default: json,html)',
    'json,html',
  )
  .option(
    '--threshold-security <percent>',
    'Minimum required security coverage percentage (0-100)',
    parseFloat,
    0,
  )
  .action(async (options) => {
    const { metricsPort, serviceName } = setupObservability();
    const logger = getLogger();

    const parentOpts = program.opts();
    const config = loadCoverageConfig(parentOpts.config as string | undefined, {
      security: options.thresholdSecurity as number,
    });

    const specPath = path.resolve(options.spec);
    const testsGlob = (config.testPatterns && config.testPatterns.length > 0)
      ? config.testPatterns[0]
      : (options.tests as string);
    const scanReportPath = options.scanReport ? path.resolve(options.scanReport as string) : undefined;
    const reportsDir = path.resolve('reports');
    const formats = parseFormats(options.format as string);

    const span = startSpan('security-coverage', { specPath, testsGlob });

    logger.info({ event: 'analysis_start', coverageType: 'security', specPath }, `Parsing spec: ${specPath}`);
    console.log(`Parsing spec: ${specPath}`);
    const controls = await parseSecurityControls(specPath);
    console.log(`Found ${controls.length} security controls`);

    console.log(`Analyzing tests matching: ${testsGlob}`);
    const analyzerCfgForSec = loadCentralConfig(parentOpts.config as string | undefined);
    const astSecOptions: AstSecurityAnalysisOptions = {
      astConfig: analyzerCfgForSec.analysis.ast ?? {},
      deepConfig: analyzerCfgForSec.scans.coverage?.deepAnalysis,
    };
    const coverages = await analyzeSecurityCoverage(controls, testsGlob, scanReportPath, astSecOptions);

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

    const thresholds: Record<string, number> = { ...(config.thresholds ?? {}) } as Record<string, number>;

    // Run plugins
    const pluginContext: PluginContext = {
      testPatterns: config.testPatterns ?? [],
      results: [result],
      config,
    };
    const pluginResults = await runPlugins(config, pluginContext);
    const allResults = [result, ...pluginResults];

    const observabilityInfo = buildObservabilityInfo(metricsPort);
    generateMultiFormatReports(allResults, formats, reportsDir, thresholds, observabilityInfo);

    console.log(
      `Security coverage: ${report.covered}/${report.total} controls covered (${report.percentage}%)`,
    );

    // Print per-category summary
    for (const [cat, summary] of Object.entries(report.categorySummary)) {
      if (summary.total > 0) {
        const pct = Math.round((summary.covered / summary.total) * 100);
        console.log(`  ${cat}: ${summary.covered}/${summary.total} (${pct}%)`);
      }
    }

    if (report.scanFindings > 0) {
      console.log(`  External scan findings credited: ${report.scanFindings}`);
    }

    const uncovered = coverages.filter((c) => !c.covered);
    if (uncovered.length > 0) {
      console.log('Uncovered security controls:');
      for (const c of uncovered) {
        console.log(`  - ${c.control.id}: ${c.control.description}`);
      }
    }

    console.log(`Reports written to: ${reportsDir}`);

    span.end({ totalItems: report.total, coveredItems: report.covered, coveragePercent: report.percentage });
    logger.info({ event: 'analysis_complete', coverageType: 'security' }, 'Security coverage analysis complete');

    await finaliseObservability(allResults, thresholds, metricsPort, serviceName);

    const failures = checkThresholds(allResults, thresholds);
    if (failures.length > 0) {
      for (const msg of failures) {
        console.error(`THRESHOLD FAILURE: ${msg}`);
      }
      process.exitCode = 1;
    }
  });

program
  .command('perf-resilience-coverage')
  .description(
    'Analyze how well tests cover performance under load and resilience to failure conditions',
  )
  .option(
    '--spec <path>',
    'Path to the OpenAPI/Swagger spec file (used to enumerate endpoints)',
    'sample/openapi.yaml',
  )
  .option('--tests <glob>', 'Glob pattern for test files', 'sample/tests/**/*.ts')
  .option(
    '--load-results <paths>',
    'Comma-separated paths to load-test result files (JMeter .jtl/.csv or k6 .json)',
  )
  .option(
    '--threshold-response-ms <ms>',
    'Maximum acceptable median response time in milliseconds',
    parseFloat,
    500,
  )
  .option(
    '--threshold-error-rate <rate>',
    'Maximum acceptable error rate as a decimal fraction (0–1, e.g. 0.05 = 5%)',
    parseFloat,
    0.05,
  )
  .option(
    '--format <formats>',
    'Comma-separated list of report formats: json,html,csv,junit (default: json,html)',
    'json,html',
  )
  .option(
    '--threshold-performance <percent>',
    'Minimum required performance coverage percentage (0-100)',
    parseFloat,
    0,
  )
  .option(
    '--threshold-resilience <percent>',
    'Minimum required resilience coverage percentage (0-100)',
    parseFloat,
    0,
  )
  .action(async (options) => {
    const { metricsPort, serviceName } = setupObservability();
    const logger = getLogger();

    const parentOpts = program.opts();
    const config = loadCoverageConfig(parentOpts.config as string | undefined, {
      performance: options.thresholdPerformance as number,
      resilience: options.thresholdResilience as number,
    });

    const specPath = path.resolve(options.spec);
    const testsGlob = (config.testPatterns && config.testPatterns.length > 0)
      ? config.testPatterns[0]
      : (options.tests as string);
    const reportsDir = path.resolve('reports');
    const formats = parseFormats(options.format as string);
    const thresholdResponseMs = options.thresholdResponseMs as number;
    const thresholdErrorRate = options.thresholdErrorRate as number;

    const perfThresholds: PerformanceThresholds = {
      responseMs: thresholdResponseMs,
      errorRate: thresholdErrorRate,
    };

    const span = startSpan('perf-resilience-coverage', { specPath, testsGlob });

    logger.info({ event: 'analysis_start', coverageType: 'perf-resilience', specPath }, `Parsing spec: ${specPath}`);
    console.log(`Parsing spec: ${specPath}`);
    const endpoints = await parseEndpointsFromSpec(specPath);
    console.log(`Found ${endpoints.length} endpoints`);

    // Load-test results
    const loadResultPaths: string[] = options.loadResults
      ? (options.loadResults as string).split(',').map((p: string) => path.resolve(p.trim()))
      : [];

    const metricsMap = loadResultPaths.length > 0
      ? parseLoadTestResults(loadResultPaths)
      : new Map();

    if (loadResultPaths.length > 0) {
      console.log(`Loaded ${metricsMap.size} metric entries from ${loadResultPaths.length} file(s)`);
    }

    // Performance coverage
    const performanceCoverages = analyzePerformanceCoverage(endpoints, metricsMap, perfThresholds);

    // Resilience scenarios and coverage
    const scenarios = buildResilienceScenarios(endpoints);
    console.log(`Analyzing resilience tests matching: ${testsGlob}`);
    const resilienceCoverages = await analyzeResilienceCoverage(scenarios, testsGlob);

    // Build report
    const report = buildPerfResilienceReport(performanceCoverages, resilienceCoverages);

    // Write dedicated JSON + HTML reports
    generatePerfResilienceReports(report, reportsDir);

    // Build standardised results for multi-format output
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

    const thresholds: Record<string, number> = { ...(config.thresholds ?? {}) } as Record<string, number>;

    // Run plugins
    const pluginContext: PluginContext = {
      testPatterns: config.testPatterns ?? [],
      results: [perfResult, resilienceResult],
      config,
    };
    const pluginResults = await runPlugins(config, pluginContext);
    const allResults = [perfResult, resilienceResult, ...pluginResults];

    const observabilityInfo = buildObservabilityInfo(metricsPort);
    generateMultiFormatReports(allResults, formats, reportsDir, thresholds, observabilityInfo);

    console.log(
      `Performance coverage: ${report.endpointsWithLoadData}/${report.totalEndpoints} endpoints with load-test data (${report.performanceCoveragePercent}%)`,
    );
    console.log(
      `Resilience coverage: ${report.coveredResilienceScenarios}/${report.totalResilienceScenarios} scenarios covered (${report.resilienceCoveragePercent}%)`,
    );

    // Per-category resilience summary
    for (const [cat, summary] of Object.entries(report.resilienceCategorySummary)) {
      if (summary.total > 0) {
        const pct = Math.round((summary.covered / summary.total) * 100);
        console.log(`  ${cat}: ${summary.covered}/${summary.total} (${pct}%)`);
      }
    }

    // Endpoints missing load-test data
    const missingPerf = report.performanceCoverages.filter((c) => !c.hasLoadTestData);
    if (missingPerf.length > 0) {
      console.log('Endpoints missing load-test data:');
      for (const c of missingPerf) {
        console.log(`  - ${c.endpoint.id}`);
      }
    }

    // Endpoints needing improvement
    const needsImprovement = report.performanceCoverages.filter(
      (c) => c.status === 'needs-improvement',
    );
    if (needsImprovement.length > 0) {
      console.log('Endpoints not meeting performance thresholds:');
      for (const c of needsImprovement) {
        console.log(
          `  - ${c.endpoint.id}: median=${c.metrics?.median}ms (threshold: ${thresholdResponseMs}ms), errorRate=${((c.metrics?.errorRate ?? 0) * 100).toFixed(2)}% (threshold: ${(thresholdErrorRate * 100).toFixed(2)}%)`,
        );
      }
    }

    console.log(`Reports written to: ${reportsDir}`);

    span.end({ coveragePercent: report.performanceCoveragePercent });
    logger.info({ event: 'analysis_complete', coverageType: 'perf-resilience' }, 'Perf/resilience coverage analysis complete');

    await finaliseObservability(allResults, thresholds, metricsPort, serviceName);

    // Threshold check
    const failures = checkThresholds(allResults, thresholds);
    if (failures.length > 0) {
      for (const msg of failures) {
        console.error(`THRESHOLD FAILURE: ${msg}`);
      }
      process.exitCode = 1;
    }
  });

program
  .command('compatibility-check')
  .description(
    'Compare two API spec versions for breaking/non-breaking changes and verify consumer-driven contracts against the new spec',
  )
  .option('--old-spec <path>', 'Path to the previous (published) OpenAPI/Swagger spec')
  .option('--new-spec <path>', 'Path to the current spec to be published')
  .option(
    '--contracts <glob>',
    'Glob pattern or directory for consumer contract files (e.g. Pact JSON files)',
  )
  .option(
    '--threshold-compat <percent>',
    'Minimum required compatibility percentage (0-100). Exits non-zero if not met.',
    parseFloat,
    0,
  )
  .action(async (options) => {
    const { metricsPort, serviceName } = setupObservability();
    const logger = getLogger();

    const oldSpecPath = options.oldSpec ? path.resolve(options.oldSpec as string) : undefined;
    const newSpecPath = options.newSpec ? path.resolve(options.newSpec as string) : undefined;
    const contractsGlob = options.contracts as string | undefined;
    const thresholdCompat = options.thresholdCompat as number;
    const reportsDir = path.resolve('reports');

    if (!oldSpecPath || !newSpecPath) {
      console.error('ERROR: --old-spec and --new-spec are required.');
      process.exitCode = 1;
      return;
    }

    const span = startSpan('compatibility-check', { oldSpecPath, newSpecPath });

    logger.info({ event: 'analysis_start', coverageType: 'compatibility', oldSpecPath, newSpecPath }, `Loading old spec: ${oldSpecPath}`);
    console.log(`Loading old spec: ${oldSpecPath}`);
    const oldApi = await loadSpec(oldSpecPath);

    console.log(`Loading new spec: ${newSpecPath}`);
    const newApi = await loadSpec(newSpecPath);

    // Compare specs
    const changes = compareSpecs(oldApi, newApi);
    const breakingChanges = changes.filter((c) => c.breaking);
    const nonBreakingChanges = changes.filter((c) => !c.breaking);

    // Load and verify contracts
    const contracts = contractsGlob ? await parseContractFiles(contractsGlob) : [];
    if (contracts.length > 0) {
      console.log(`Loaded ${contracts.length} consumer contract(s)`);
    }
    const verificationResults = verifyContracts(contracts, newApi);

    // Build and write reports
    const report = buildCompatibilityReport(
      oldApi,
      newApi,
      changes,
      verificationResults,
      oldSpecPath,
      newSpecPath,
    );

    generateCompatibilityReports(report, reportsDir);

    // Also write multi-format summary reports via the shared reporting module
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
    if (thresholdCompat > 0) {
      thresholds['compatibility'] = thresholdCompat;
      thresholds['contract-coverage'] = thresholdCompat;
    }
    const observabilityInfo = buildObservabilityInfo(metricsPort);
    generateMultiFormatReports([compatResult, contractResult], formats, reportsDir, thresholds, observabilityInfo);

    // Console summary
    console.log(
      `\nCompatibility: ${report.compatibilityPercent}% (${breakingChanges.length} breaking change${breakingChanges.length !== 1 ? 's' : ''}, ${nonBreakingChanges.length} non-breaking)`,
    );
    if (breakingChanges.length > 0) {
      console.log('Breaking changes:');
      for (const c of breakingChanges) {
        console.log(`  ❌ ${c.description}`);
      }
    }
    if (nonBreakingChanges.length > 0) {
      console.log('Non-breaking changes:');
      for (const c of nonBreakingChanges) {
        console.log(`  ✅ ${c.description}`);
      }
    }

    if (verificationResults.length > 0) {
      const passedContracts = verificationResults.filter((r) => r.passed).length;
      console.log(
        `\nContract verification: ${passedContracts}/${verificationResults.length} contracts passed`,
      );
      console.log(
        `Contract coverage: ${report.contractCoveredEndpoints}/${report.totalNewEndpoints} endpoints covered (${report.contractCoveragePercent}%)`,
      );
      for (const result of verificationResults) {
        const failedInteractions = result.interactionResults.filter((ir) => !ir.passed);
        if (failedInteractions.length > 0) {
          console.log(
            `  Contract [${result.contract.consumer} → ${result.contract.provider}] failed:`,
          );
          for (const ir of failedInteractions) {
            console.log(`    ❌ ${ir.interaction.description}: ${ir.reason}`);
          }
        }
      }
    }

    console.log(`\nReports written to: ${reportsDir}`);

    span.end({ coveragePercent: report.compatibilityPercent });
    logger.info({ event: 'analysis_complete', coverageType: 'compatibility' }, 'Compatibility check complete');

    await finaliseObservability([compatResult, contractResult], thresholds, metricsPort, serviceName);

    // Threshold enforcement
    const failures = checkThresholds([compatResult, contractResult], thresholds);
    if (failures.length > 0) {
      for (const msg of failures) {
        console.error(`THRESHOLD FAILURE: ${msg}`);
      }
      process.exitCode = 1;
    }
  });

program
  .command('security-scan')
  .description(
    'Run integrated security scanners (Semgrep, Trivy, ZAP) and evaluate a security gate',
  )
  .option(
    '--workspace <path>',
    'Root directory to scan (default: current working directory)',
    '.',
  )
  .option(
    '--semgrep',
    'Enable Semgrep SAST scanning (requires semgrep binary or --semgrep-report)',
  )
  .option('--semgrep-config <config>', 'Semgrep config/ruleset (e.g. p/default, p/security-audit)', 'p/default')
  .option('--semgrep-report <file>', 'Import pre-generated Semgrep JSON report instead of running binary')
  .option(
    '--trivy',
    'Enable Trivy vulnerability/secret/misconfig scanning (requires trivy binary or --trivy-report)',
  )
  .option(
    '--trivy-scanners <list>',
    'Comma-separated Trivy scanners: vuln,secret,misconfig',
    'vuln,secret',
  )
  .option('--trivy-report <file>', 'Import pre-generated Trivy JSON report instead of running binary')
  .option('--zap-report <file>', 'Import pre-generated ZAP JSON report (enables ZAP findings)')
  .option(
    '--fail-on-critical',
    'Fail the gate if any CRITICAL finding exists',
  )
  .option(
    '--fail-on-high',
    'Fail the gate if any HIGH finding exists',
  )
  .option('--max-medium <n>', 'Maximum allowed MEDIUM findings', parseInt)
  .option('--max-secrets <n>', 'Maximum allowed secrets (any severity)', parseInt)
  .option('--max-misconfig-high <n>', 'Maximum allowed HIGH/CRITICAL misconfigurations', parseInt)
  .option('--max-critical-vulns <n>', 'Maximum allowed CRITICAL vulnerabilities', parseInt)
  .option('--max-high-vulns <n>', 'Maximum allowed HIGH vulnerabilities', parseInt)
  .action(async (options) => {
    const { metricsPort, serviceName } = setupObservability();
    const logger = getLogger();

    const workspace = path.resolve(options.workspace as string ?? '.');
    const reportsDir = path.resolve('reports');

    // Build scanner configuration from CLI flags
    const scanConfig: SecurityScanConfig = {
      enabled: true,
      workspace,
      scanners: {},
      gate: {},
    };

    // Semgrep
    if (options.semgrep || options.semgrepReport) {
      const mode = options.semgrepReport ? 'import' : 'embedded';
      scanConfig.scanners!.semgrep = {
        enabled: true,
        mode,
        config: options.semgrepConfig as string,
        reportPath: options.semgrepReport as string | undefined,
      };
    }

    // Trivy
    if (options.trivy || options.trivyReport) {
      const mode = options.trivyReport ? 'import' : 'embedded';
      const trivyScanners = ((options.trivyScanners as string) ?? 'vuln,secret')
        .split(',')
        .map((s: string) => s.trim())
        .filter((s: string) => ['vuln', 'misconfig', 'secret'].includes(s)) as Array<'vuln' | 'misconfig' | 'secret'>;
      scanConfig.scanners!.trivy = {
        enabled: true,
        mode,
        scanners: trivyScanners,
        reportPath: options.trivyReport as string | undefined,
      };
    }

    // ZAP
    if (options.zapReport) {
      scanConfig.scanners!.zap = {
        enabled: true,
        mode: 'import',
        reportPath: options.zapReport as string,
      };
    }

    // Gate configuration
    if (options.failOnCritical) scanConfig.gate!.failOnCritical = true;
    if (options.failOnHigh) scanConfig.gate!.failOnHigh = true;
    if (options.maxMedium !== undefined) scanConfig.gate!.maxMedium = options.maxMedium as number;
    if (options.maxSecrets !== undefined) scanConfig.gate!.maxSecrets = options.maxSecrets as number;
    if (options.maxMisconfigHigh !== undefined) scanConfig.gate!.maxMisconfigHigh = options.maxMisconfigHigh as number;
    if (options.maxCriticalVulns !== undefined) scanConfig.gate!.maxCriticalVulns = options.maxCriticalVulns as number;
    if (options.maxHighVulns !== undefined) scanConfig.gate!.maxHighVulns = options.maxHighVulns as number;

    // Remove empty gate/scanners objects if nothing was configured
    if (Object.keys(scanConfig.gate!).length === 0) delete scanConfig.gate;
    if (Object.keys(scanConfig.scanners!).length === 0) delete scanConfig.scanners;

    const span = startSpan('security-scan', { workspace });
    logger.info({ event: 'analysis_start', coverageType: 'security-scan', workspace }, 'Starting security scan');
    console.log(`Running security scan in workspace: ${workspace}`);

    const summary = await runSecurityScan(scanConfig, reportsDir);

    // Console summary
    console.log(`\nSecurity Scan Results:`);
    console.log(`  Scanners run: ${summary.scannersRun.join(', ') || 'none'}`);
    console.log(`  Total findings: ${summary.totalFindings}`);
    console.log(`  CRITICAL: ${summary.bySeverity.CRITICAL}`);
    console.log(`  HIGH: ${summary.bySeverity.HIGH}`);
    console.log(`  MEDIUM: ${summary.bySeverity.MEDIUM}`);
    console.log(`  LOW: ${summary.bySeverity.LOW}`);

    if (summary.gateResult) {
      const gateStatus = summary.gateResult.passed ? '✅ PASSED' : '❌ FAILED';
      console.log(`\nSecurity Gate: ${gateStatus}`);
      if (!summary.gateResult.passed) {
        for (const reason of summary.gateResult.reasons) {
          console.error(`  GATE FAILURE: ${reason}`);
        }
      }
    }

    console.log(`\nReports written to: ${reportsDir}`);

    span.end({ totalFindings: summary.totalFindings });
    logger.info({ event: 'analysis_complete', coverageType: 'security-scan' }, 'Security scan complete');

    const result: CoverageResult = {
      type: 'security-scan',
      totalItems: summary.totalFindings,
      coveredItems: summary.totalFindings,
      coveragePercent: 100,
      details: summary,
    };

    // Record security-specific Prometheus metrics (by severity/category/scanner + gate status)
    recordSecurityScanMetrics(summary, serviceName);

    await finaliseObservability([result], {}, metricsPort, serviceName);

    if (summary.gateResult && !summary.gateResult.passed) {
      process.exitCode = 1;
    }
  });

// ─── coverage-intelligence command ──────────────────────────────────────────


// ─── Intelligence details normalizer ─────────────────────────────────────────
// The linkage engine expects `details` to be a flat array of
// { endpoint?, covered, name?, ... } objects.  Each coverage command stores
// its raw report object in CoverageResult.details, so we normalise here at
// read time to avoid touching the 11 coverage command implementations.

function normalizeDetailsForIntelligence(type: string, raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw; // already normalised (e.g. dashboard sample)
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;

  switch (type) {
    case 'endpoint': {
      // Spec-based: { endpoints: [{ method, path, covered }] }
      // Inferred:   { items: [{ id: "GET /path", covered, matchedTests, source_file }] }
      const eps = (obj.endpoints ?? obj.items) as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(eps)) return [];
      return eps.map((e) => {
        let method = e.method as string | undefined;
        let epPath = e.path as string | undefined;
        // Inferred format stores id as "METHOD /path"
        if (!method && !epPath && typeof e.id === 'string') {
          const parts = (e.id as string).split(' ');
          if (parts.length >= 2) { method = parts[0]; epPath = parts.slice(1).join(' '); }
        }
        return {
          endpoint: { method, path: epPath },
          covered: e.covered ?? false,
        };
      });
    }
    case 'parameter': {
      const params = obj.parameters;
      if (!Array.isArray(params)) return [];
      return (params as Array<Record<string, unknown>>).map((p) => {
        const param = p.parameter as Record<string, unknown> | undefined;
        return {
          endpoint: param ? { method: param.method, path: param.path } : undefined,
          covered: ((p.ratio as number) ?? 0) > 0,
          name: param?.name ?? param?.id,
        };
      });
    }
    case 'business': {
      const rules = obj.rules;
      if (!Array.isArray(rules)) return [];
      return (rules as Array<Record<string, unknown>>).flatMap((r) => {
        const endpoints = (r.rule as Record<string, unknown>)?.endpoints;
        if (!Array.isArray(endpoints) || endpoints.length === 0) {
          return [{ covered: r.covered ?? false, name: (r.rule as Record<string, unknown>)?.id }];
        }
        return (endpoints as string[]).map((ep) => {
          const parts = ep.split(' ');
          return {
            endpoint: parts.length > 1 ? { method: parts[0], path: parts[1] } : { path: parts[0] },
            covered: r.covered ?? false,
            name: (r.rule as Record<string, unknown>)?.id,
          };
        });
      });
    }
    case 'integration': {
      const flows = obj.flows;
      if (!Array.isArray(flows)) return [];
      return (flows as Array<Record<string, unknown>>).flatMap((f) => {
        const steps = ((f.flow as Record<string, unknown>)?.steps ?? []) as Array<Record<string, unknown>>;
        return steps
          .filter((s) => s.method && s.path)
          .map((s) => ({
            endpoint: { method: s.method, path: s.path },
            covered: f.status !== 'missing',
            name: (s.id ?? s.name) as string | undefined,
          }));
      });
    }
    case 'error': {
      // Spec-based: { scenarios: [{ scenario: { method, path, errorCode }, covered }] }
      // Inferred:   { items: [{ id, description, covered, source_location, code_snippet }] }
      const rawItems = (obj.scenarios ?? obj.items) as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(rawItems)) return [];
      return rawItems.map((s) => {
        const sc = s.scenario as Record<string, unknown> | undefined;
        if (sc) {
          // Spec-based format
          return {
            endpoint: sc ? { method: sc.method, path: sc.path } : undefined,
            covered: s.covered ?? false,
            errorCodes: sc?.errorCode ? [String(sc.errorCode)] : [],
            name: sc?.id,
          };
        }
        // Inferred format — synthesize errorCodes from exception/condition patterns
        const desc = ((s.description as string) ?? '').toLowerCase();
        const id = (s.id as string) ?? '';
        const syntheticCodes: string[] = [];
        if (/unauthorized|no.*authorization|forbidden/.test(desc + id)) syntheticCodes.push('403');
        else if (/authentication|invalid.*auth|invalid_auth/.test(desc + id)) syntheticCodes.push('401');
        else if (/not.*found|resource.*not/.test(desc + id)) syntheticCodes.push('404');
        else if (/illegal.*argument|invalid.*param|bad.*request/.test(desc + id)) syntheticCodes.push('400');
        else if (/null.*check|npe|null_check/.test(desc + id)) syntheticCodes.push('500');
        // Fall back to a generic code so the intelligence engine generates a finding
        if (syntheticCodes.length === 0) syntheticCodes.push('exception');
        // Extract a rough endpoint path from source_location (e.g. "...api/ArticleApi.java:54")
        // Handle Api, Controller, Resource, Handler, Mutation, Datafetcher, Filter, Service
        const sourceLocation = (s.source_location as string) ?? '';
        const fileMatch = sourceLocation.match(
          /\/([A-Z][a-zA-Z]+?)(?:Api|Controller|Resource|Handler|Mutation|Datafetcher|Filter|QueryService|Repository)\.java/i,
        );
        const endpointPath = fileMatch
          ? `/${fileMatch[1].toLowerCase()}`
          : undefined;
        return {
          endpoint: endpointPath ? { path: endpointPath } : undefined,
          covered: s.covered ?? false,
          errorCodes: syntheticCodes,
          name: id,
        };
      });
    }
    case 'security': {
      const controls = obj.controls;
      if (!Array.isArray(controls)) return [];
      return (controls as Array<Record<string, unknown>>)
        .map((c) => {
          const epStr = ((c.control as Record<string, unknown>)?.endpoint as string) ?? '';
          const parts = epStr.split(' ');
          return {
            endpoint: parts.length > 1 ? { method: parts[0], path: parts[1] } : undefined,
            covered: c.covered ?? false,
            name: (c.control as Record<string, unknown>)?.id,
          };
        })
        .filter((item) => item.endpoint?.path);
    }
    case 'performance': {
      const coverages = obj.performanceCoverages;
      if (!Array.isArray(coverages)) return [];
      return (coverages as Array<Record<string, unknown>>).map((c) => {
        const ep = c.endpoint as Record<string, unknown> | undefined;
        return {
          endpoint: ep ? { method: ep.method, path: ep.path } : undefined,
          covered: (c.hasLoadTestData as boolean) ?? false,
          hasThreshold: true,
          name: ep?.id,
        };
      });
    }
    case 'resilience': {
      const coverages = obj.resilienceCoverages;
      if (!Array.isArray(coverages)) return [];
      return (coverages as Array<Record<string, unknown>>)
        .filter((c) => (c.scenario as Record<string, unknown>)?.endpoint)
        .map((c) => {
          const sc = c.scenario as Record<string, unknown>;
          return {
            endpoint: sc.endpoint as Record<string, unknown>,
            covered: c.covered ?? false,
            resilience: true,
            name: sc.id,
          };
        });
    }
    default:
      return [];
  }
}

program
  .command('coverage-intelligence')
  .description('Run the coverage intelligence engine to identify functional findings and missing tests')
  .option('--reports-dir <dir>', 'Directory containing existing coverage reports to analyse', 'reports')
  .option('--out-dir <dir>', 'Output directory for intelligence reports', 'reports')
  .option('--project-name <name>', 'Project / service name', 'unknown')
  .option('--languages <langs>', 'Comma-separated list of languages (e.g. typescript,java)')
  .option('--frameworks <fws>', 'Comma-separated list of test frameworks (e.g. jest,rest-assured)')
  .action(async (options) => {
    const { metricsPort, serviceName } = setupObservability();
    const logger = getLogger();

    const reportsDir = path.resolve(options.reportsDir as string);
    const outDir = path.resolve(options.outDir as string);
    const projectName = options.projectName as string;
    const languages = options.languages
      ? (options.languages as string).split(',').map((l: string) => l.trim())
      : [];
    const frameworks = options.frameworks
      ? (options.frameworks as string).split(',').map((f: string) => f.trim())
      : [];

    // Attempt to load existing coverage-summary.json from reportsDir
    let coverageResults: Array<{
      type: string;
      totalItems: number;
      coveredItems: number;
      coveragePercent: number;
      details: unknown;
    }> = [];

    const summaryPath = path.join(reportsDir, 'coverage-summary.json');
    try {
      if (require('fs').existsSync(summaryPath)) {
        const raw = require('fs').readFileSync(summaryPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.summary)) {
          coverageResults = parsed.summary.map((s: Record<string, unknown>) => ({
            type: s.type as string,
            totalItems: (s.totalItems as number) ?? 0,
            coveredItems: (s.coveredItems as number) ?? 0,
            coveragePercent: (s.coveragePercent as number) ?? 0,
            details: normalizeDetailsForIntelligence(
              s.type as string,
              (parsed.details as Record<string, unknown>)?.[s.type as string] ?? [],
            ),
          }));
        }
      }
    } catch (err) {
      logger.warn({ event: 'intelligence_load_warning', error: String(err) }, 'Could not load coverage-summary.json');
    }

    const report = runIntelligenceEngine({
      coverageResults,
      languages,
      frameworks,
      projectName,
      outDir,
    });

    // Record intelligence metrics
    recordIntelligenceMetrics({
      projectName,
      totalFindings: report.summary.totalFindings,
      totalRecommendations: report.summary.totalRecommendations,
      recommendationsByPriority: report.summary.recommendationsByPriority,
      maxRiskScore: report.summary.maxRiskScore,
      avgRiskScore: report.summary.avgRiskScore,
      criticalUncoveredItems: report.summary.criticalUncoveredItems,
      unprotectedSecurityFindings: report.summary.unprotectedSecurityFindings,
      languages,
      frameworks,
    }, projectName);

    console.log(`\n=== Coverage Intelligence Results ===`);
    console.log(`  Project: ${projectName}`);
    console.log(`  Functional Findings: ${report.summary.totalFindings}`);
    console.log(`  Missing Test Recommendations: ${report.summary.totalRecommendations}`);
    console.log(`  Max Risk Score: ${report.summary.maxRiskScore}`);
    console.log(`  Avg Risk Score: ${report.summary.avgRiskScore}`);
    console.log(`  Critical Uncovered Items: ${report.summary.criticalUncoveredItems}`);
    console.log(`  Unprotected Security Findings: ${report.summary.unprotectedSecurityFindings}`);
    if (report.summary.recommendationsByPriority.P0 > 0) {
      console.log(`\n⚠️  P0 Recommendations: ${report.summary.recommendationsByPriority.P0} — immediate action required`);
    }
    console.log(`\nIntelligence reports written to: ${outDir}`);

    logger.info({ event: 'analysis_complete', coverageType: 'intelligence' }, 'Coverage intelligence analysis complete');

    await finaliseObservability(
      [{
        type: 'intelligence',
        totalItems: report.summary.totalRecommendations,
        coveredItems: 0,
        coveragePercent: 0,
        details: report.summary,
      }],
      {},
      metricsPort,
      serviceName,
    );
  });

// ─── coverage-summary-report command ─────────────────────────────────────────

program
  .command('coverage-summary-report')
  .description('Generate build-summary.md and pr-summary.md from accumulated coverage-summary.json')
  .option('--reports-dir <dir>', 'Directory containing coverage-summary.json', 'reports')
  .option('--out-dir <dir>', 'Output directory for summary files', 'reports')
  .option('--project-name <name>', 'Project / service name', 'unknown')
  .option('--branch <branch>', 'Branch name for display in summary')
  .option('--commit-sha <sha>', 'Commit SHA for display in summary')
  .option('--build-id <id>', 'Build identifier for display in summary')
  .option('--write-step-summary', 'Append build-summary.md to $GITHUB_STEP_SUMMARY')
  .action(async (options) => {
    const logger = getLogger();
    const parentOpts = program.opts();

    const reportsDir = path.resolve(options.reportsDir as string);
    const outDir = path.resolve(options.outDir as string);
    const projectName = options.projectName as string;

    // Load thresholds from config
    const analyzerCfg = loadCentralConfig(parentOpts.config as string | undefined);
    const thresholds = (analyzerCfg.thresholds ?? {}) as Record<string, number | undefined>;

    // Read accumulated coverage-summary.json
    let coverageResults: import('./reporting').CoverageResult[] = [];
    let qualityGateResult: import('./qualityGate').QualityGateResult | undefined;

    const summaryPath = require('path').join(reportsDir, 'coverage-summary.json');
    try {
      if (require('fs').existsSync(summaryPath)) {
        const raw = require('fs').readFileSync(summaryPath, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (Array.isArray(parsed.summary)) {
          coverageResults = (parsed.summary as Array<Record<string, unknown>>).map((s) => ({
            type: s.type as string,
            totalItems: (s.totalItems as number) ?? 0,
            coveredItems: (s.coveredItems as number) ?? 0,
            coveragePercent: (s.coveragePercent as number) ?? 0,
            details: s.details ?? {},
          }));
        }
        if (parsed.qualityGate && typeof parsed.qualityGate === 'object') {
          qualityGateResult = parsed.qualityGate as import('./qualityGate').QualityGateResult;
        }
      }
    } catch (err) {
      logger.warn({ event: 'summary_report_load_warning', error: String(err) }, 'Could not load coverage-summary.json');
    }

    // Optionally load coverage-intelligence.json for intelligence section
    let intelligenceSummary: SummaryInput['intelligenceSummary'] | undefined;
    const intelligencePath = require('path').join(reportsDir, 'coverage-intelligence.json');
    try {
      if (require('fs').existsSync(intelligencePath)) {
        const raw = require('fs').readFileSync(intelligencePath, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed.summary && typeof parsed.summary === 'object') {
          const s = parsed.summary as Record<string, unknown>;
          intelligenceSummary = {
            totalFindings: (s.totalFindings as number) ?? 0,
            totalRecommendations: (s.totalRecommendations as number) ?? 0,
            maxRiskScore: (s.maxRiskScore as number) ?? 0,
            avgRiskScore: (s.avgRiskScore as number) ?? 0,
            criticalUncoveredItems: (s.criticalUncoveredItems as number) ?? 0,
            unprotectedSecurityFindings: (s.unprotectedSecurityFindings as number) ?? 0,
            recommendationsByPriority: (s.recommendationsByPriority as Record<string, number>) ?? {},
            topRiskAreas: (s.topRiskAreas as string[]) ?? [],
          };
        }
      }
    } catch (_) {
      // intelligence report is optional — ignore read errors
    }

    const summaryInput: SummaryInput = {
      results: coverageResults,
      qualityGate: qualityGateResult,
      thresholds,
      projectName,
      branch: options.branch as string | undefined,
      commitSha: options.commitSha as string | undefined,
      buildId: options.buildId as string | undefined,
      intelligenceSummary,
    };

    const buildResult = await generateBuildSummary(summaryInput, outDir);
    await generatePrSummary(summaryInput, outDir);

    // Optionally write to GITHUB_STEP_SUMMARY
    if (options.writeStepSummary) {
      const stepSummaryPath = process.env['GITHUB_STEP_SUMMARY'];
      if (stepSummaryPath) {
        require('fs').appendFileSync(stepSummaryPath, buildResult.markdown + '\n', 'utf-8');
        console.log(`Step summary written to ${stepSummaryPath}`);
      } else {
        logger.warn({ event: 'step_summary_missing_env' }, 'GITHUB_STEP_SUMMARY env var not set; skipping step summary write');
      }
    }

    console.log(`\n=== Coverage Summary Report ===`);
    console.log(`  Project: ${projectName}`);
    console.log(`  Metrics: ${coverageResults.length}`);
    if (qualityGateResult !== undefined) {
      console.log(`  Overall: ${qualityGateResult.passed ? 'PASSED' : 'FAILED'}`);
    }
    console.log(`\nSummary reports written to: ${outDir}`);

    logger.info({ event: 'summary_report_complete' }, 'Coverage summary report generated');
  });

// ─── analyze command ─────────────────────────────────────────────────────────

program
  .command('analyze')
  .description(
    'Zero-config full analysis: discover project artifacts, infer missing rules/flows, compute coverage.',
  )
  .option('--root <dir>', 'Project root to analyze (default: current working directory)')
  .option('--reports-dir <dir>', 'Directory to write reports to (default: reports/)')
  .option('--export-inferred-rules', 'Export inferred rules/flows as editable YAML files')
  .option('--no-infer-business-rules', 'Disable business rule inference')
  .option('--no-infer-integration-flows', 'Disable integration flow inference')
  .option('--dashboard', 'Start the coverage dashboard after analysis')
  .option('--port <port>', 'Port for the dashboard server (requires --dashboard)', parseInt)
  .option('--open', 'Open the dashboard in your browser automatically (requires --dashboard)')
  .action(async (options: Record<string, unknown>) => {
    const { metricsPort, serviceName } = setupObservability();
    const logger = getLogger();
    const configPath = (program.opts()['config'] as string | undefined);
    const analyzerCfg = loadCentralConfig(configPath);

    const rootDir         = (options['root'] as string | undefined) ?? process.cwd();
    const reportsDir      = (options['reportsDir'] as string | undefined) ??
                            analyzerCfg.reports?.outputDir ?? 'reports';
    const doInferRules    = options['inferBusinessRules'] !== false &&
                            (analyzerCfg.analysis?.inferBusinessRules ?? true);
    const doInferFlows    = options['inferIntegrationFlows'] !== false &&
                            (analyzerCfg.analysis?.inferIntegrationFlows ?? true);
    const agnosticDisc    = analyzerCfg.analysis?.agnosticDiscovery ?? true;

    logger.info({ event: 'analyze_start', rootDir }, 'Starting agnostic project analysis');

    // ── 1. Discover project artifacts ──────────────────────────────────────
    const artifacts = discoverProject({ rootDir });

    console.log('\n=== API Test Coverage Analyzer ===');
    console.log(`Project root: ${rootDir}`);
    console.log(`Languages detected: ${artifacts.languages.join(', ') || 'none'}`);
    console.log(`Frameworks detected: ${artifacts.frameworks.join(', ') || 'none'}`);
    console.log(`API specs found: ${artifacts.specs.length}`);
    console.log(`Test files found: ${artifacts.testFiles.length}`);
    console.log(`Service files found: ${artifacts.serviceFiles.length}`);

    if (!agnosticDisc && artifacts.specs.length === 0) {
      console.error('\n[ERROR] No API spec found and agnosticDiscovery is disabled. Aborting.');
      process.exitCode = 1;
      return;
    }

    const warnings: string[] = [];
    let inferredRulesResult: ReturnType<typeof inferBusinessRules> | null = null;
    let inferredFlowsResult: ReturnType<typeof inferIntegrationFlows> | null = null;

    // ── 2. Business rule inference ─────────────────────────────────────────
    if (doInferRules) {
      inferredRulesResult = inferBusinessRules(artifacts.serviceFiles, warnings);
      const rulesPath = writeInferredBusinessRules(inferredRulesResult, reportsDir);

      console.log(`\nBusiness Rule Inference`);
      console.log(`  Rules detected in service code: ${inferredRulesResult.rules.length}`);
      console.log(`  Written to: ${rulesPath}`);

      if (options['exportInferredRules']) {
        const fsMod = require('fs') as typeof import('fs');
        const yaml = inferredRulesResult.rules.map((r) => [
          `- id: ${r.id}`,
          `  name: ${r.name}`,
          `  type: ${r.type}`,
          r.endpoint ? `  endpoint: "${r.endpoint}"` : null,
          `  condition: "${r.condition.replace(/"/g, "'")}"`,
          `  source: ${r.source_location}`,
        ].filter(Boolean).join('\n')).join('\n');
        fsMod.writeFileSync(path.join(rootDir, 'generated-business-rules.yaml'), yaml, 'utf-8');
        console.log('  Exported: generated-business-rules.yaml');
      }
    }

    // ── 3. Integration flow inference ──────────────────────────────────────
    if (doInferFlows) {
      inferredFlowsResult = inferIntegrationFlows(artifacts.testFiles, warnings);
      const flowsPath = writeInferredIntegrationFlows(inferredFlowsResult, reportsDir);

      console.log(`\nIntegration Flow Inference`);
      console.log(`  Multi-step flows detected in tests: ${inferredFlowsResult.flows.length}`);
      console.log(`  Written to: ${flowsPath}`);

      if (options['exportInferredRules']) {
        const fs = require('fs') as typeof import('fs');
        const yaml = inferredFlowsResult.flows.map((f) => [
          `- id: ${f.id}`,
          `  name: "${f.name}"`,
          `  steps:`,
          ...f.steps.map((s) => `    - { method: ${s.method}, path: "${s.path}" }`),
        ].join('\n')).join('\n');
        fs.writeFileSync(path.join(rootDir, 'generated-integration-flows.yaml'), yaml, 'utf-8');
        console.log('  Exported: generated-integration-flows.yaml');
      }
    }

    // ── 4. Full coverage analysis → coverage-summary.json ─────────────────
    const allCoverageResults: CoverageResult[] = [];
    const fsMod = require('fs') as typeof import('fs');
    // When test files are explicitly discovered, use them directly.
    // Otherwise fall back to a test-file-pattern glob (avoids scanning node_modules
    // or the entire project tree, which can hang on large repositories).
    const testsGlob = artifacts.testFiles.length > 0
      ? '{' + artifacts.testFiles.join(',') + '}'
      : path.join(rootDir, '**', '*.{test,spec}.{js,ts,jsx,tsx,mjs,cjs,py,rb}');
    const detectedLanguages = artifacts.languages as SupportedLanguage[];

    // Pre-compute test entries once from the discovered test files.
    // These are reused for endpoint, error, and business-rule coverage matching
    // (avoids multiple glob expansions which can hang on large projects).
    const TEST_DECL_RE = /\b(?:test|it)\s*\(\s*(['"`])([\s\S]*?)\1/g;
    // Java/Kotlin JUnit: @Test followed by a method declaration
    const JAVA_TEST_RE = /@Test\b[^{]*?(?:public|protected|private|default)?\s+(?:\w+\s+)?(\w+)\s*\(\s*\)/g;
    interface TestFileEntry { file: string; contentLower: string; descriptions: string[]; isJavaLike: boolean }
    const testEntries: TestFileEntry[] = artifacts.testFiles.flatMap((tf) => {
      let content = '';
      try { content = fsMod.readFileSync(tf, 'utf-8'); } catch { return []; }
      const descriptions: string[] = [];
      const contentLower = content.toLowerCase();
      const ext = path.extname(tf).toLowerCase();
      const isJavaLike = ext === '.java' || ext === '.kt' || ext === '.kts';
      let m: RegExpExecArray | null;
      if (isJavaLike) {
        // Extract @Test-annotated method names; convert snake_case to spaces for keyword matching
        JAVA_TEST_RE.lastIndex = 0;
        while ((m = JAVA_TEST_RE.exec(content)) !== null) {
          descriptions.push(m[1].replace(/_/g, ' ').toLowerCase());
        }
      } else {
        TEST_DECL_RE.lastIndex = 0;
        while ((m = TEST_DECL_RE.exec(content)) !== null) {
          descriptions.push(m[2].toLowerCase());
        }
      }
      return [{ file: tf, contentLower, descriptions, isJavaLike }];
    });

    if (artifacts.specs.length > 0) {
      for (const specPath of artifacts.specs) {
        // ── 4a. Endpoint coverage ───────────────────────────────────────────
        try {
          console.log(`\nAnalyzing endpoint coverage for: ${path.basename(specPath)}`);
          const endpoints  = await parseOpenApiSpec(specPath);
          const coverageMap = await analyzeTestCoverage(endpoints, testsGlob, detectedLanguages);
          const report     = buildCoverageReport(coverageMap);
          const result: CoverageResult = {
            type: 'endpoint',
            totalItems: report.total,
            coveredItems: report.covered,
            coveragePercent: report.percentage,
            details: report,
          };
          allCoverageResults.push(result);
          console.log(`  ${report.covered}/${report.total} endpoints covered (${report.percentage}%)`);
        } catch (err) {
          warnings.push(
            `Endpoint coverage failed for ${path.basename(specPath)}: ` +
            `${err instanceof Error ? err.message : String(err)}`,
          );
        }

        // ── 4b. Parameter coverage ──────────────────────────────────────────
        try {
          const parameters = await parseParameters(specPath);
          const astParamOptions: AstParameterAnalysisOptions = {
            astConfig: analyzerCfg.analysis?.ast ?? {},
            deepConfig: undefined,
          };
          const paramCoverages = await analyzeParameterCoverage(parameters, testsGlob, astParamOptions);
          const paramReport    = buildParameterCoverageReport(paramCoverages);
          const paramResult: CoverageResult = {
            type: 'parameter',
            totalItems: paramReport.totalParameters,
            coveredItems: paramCoverages.filter((c) => c.ratio > 0).length,
            coveragePercent: paramReport.averageCoverage,
            details: paramReport,
          };
          allCoverageResults.push(paramResult);
          console.log(`  ${paramResult.coveredItems}/${paramResult.totalItems} parameters covered (${paramReport.averageCoverage}%)`);
        } catch (err) {
          warnings.push(
            `Parameter coverage failed for ${path.basename(specPath)}: ` +
            `${err instanceof Error ? err.message : String(err)}`,
          );
        }

        // ── 4c. Error scenario coverage ─────────────────────────────────────
        try {
          const scenarios = await parseErrorScenarios(specPath);
          if (scenarios.length > 0) {
            const astErrorOptions: AstErrorAnalysisOptions = {
              astConfig: analyzerCfg.analysis?.ast ?? {},
              deepConfig: undefined,
            };
            const errorCoverages = await analyzeErrorCoverage(scenarios, testsGlob, astErrorOptions);
            const errorReport    = buildErrorCoverageReport(errorCoverages);
            const errorResult: CoverageResult = {
              type: 'error',
              totalItems: errorReport.total,
              coveredItems: errorReport.covered,
              coveragePercent: errorReport.percentage,
              details: errorReport,
            };
            allCoverageResults.push(errorResult);
            console.log(`  ${errorReport.covered}/${errorReport.total} error scenarios covered (${errorReport.percentage}%)`);
          }
        } catch (err) {
          warnings.push(
            `Error coverage failed for ${path.basename(specPath)}: ` +
            `${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } else {
      warnings.push('No API spec files found; attempting route inference for endpoint/error coverage.');

      // ── 4a-alt. Inferred route endpoint coverage ──────────────────────────
      try {
        const routeResult = inferRoutes(artifacts.serviceFiles);
        if (routeResult.routes.length > 0) {
          const routesPath = writeInferredRoutes(routeResult, reportsDir);
          console.log(`\nRoute Inference`);
          console.log(`  Routes detected in service code: ${routeResult.routes.length}`);
          console.log(`  Written to: ${routesPath}`);

          console.log(`\nAnalyzing endpoint coverage (from inferred routes)...`);

          const endpointItems = routeResult.routes.map((route) => {
            const pathSegments = route.path.split('/').filter(
              (s) => s.length > 1 && !s.startsWith(':'),
            );
            const method = route.method.toLowerCase();
            // Leaf path segment is the most specific identifier (e.g., "comments", "favorite", "feed")
            const leafSegment = pathSegments[pathSegments.length - 1] ?? '';
            const matchedTests: string[] = [];

            for (const { file, contentLower, descriptions } of testEntries) {
              let matched = false;

              // Priority 1: handler function name appears in test file imports/calls
              if (route.handlerFunction) {
                const fnLower = route.handlerFunction.toLowerCase();
                if (contentLower.includes(fnLower)) {
                  matched = true;
                }
              }

              // Priority 2: test description mentions method + leaf path segment
              if (!matched && leafSegment.length > 2) {
                matched = descriptions.some((desc) =>
                  desc.includes(method) && desc.includes(leafSegment),
                );
              }

              // Priority 3: test description mentions the exact path
              if (!matched && route.path.length >= 1) {
                matched = descriptions.some((desc) => desc.includes(route.path.toLowerCase()));
              }

              // Priority 4: test file directly calls the URL path (e.g., axios.get('/articles'))
              if (!matched && pathSegments.length > 0) {
                // Check for full path string in file (e.g., axios.get('/articles/feed'))
                const quotedPathPattern = new RegExp(
                  `['"\`]${route.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`,
                );
                if (quotedPathPattern.test(contentLower)) {
                  matched = true;
                }
              }

              if (matched) {
                matchedTests.push(path.basename(file));
              }
            }

            const covered = matchedTests.length > 0;
            return {
              id: `${route.method.toUpperCase()} ${route.path}`,
              covered,
              matchedTests,
              handler_function: route.handlerFunction,
              source_file: route.sourceFile,
              line_number: route.lineNumber,
            };
          });

          const coveredCount = endpointItems.filter((i) => i.covered).length;
          const pct = endpointItems.length > 0 ? Math.round((coveredCount / endpointItems.length) * 100) : 0;

          const endpointResult: CoverageResult = {
            type: 'endpoint',
            totalItems: endpointItems.length,
            coveredItems: coveredCount,
            coveragePercent: pct,
            details: {
              total: endpointItems.length,
              covered: coveredCount,
              percentage: pct,
              items: endpointItems,
              source: 'inferred',
            },
          };
          allCoverageResults.push(endpointResult);
          console.log(`  ${coveredCount}/${endpointItems.length} inferred routes have test coverage (${pct}%)`);

          // ── 4c-alt. Error coverage from inferred routes + rules ──────────
          if (inferredRulesResult && inferredRulesResult.rules.length > 0) {
            console.log(`\nAnalyzing error coverage (from inferred business rules)...`);
            const errorCandidateRules = inferredRulesResult.rules.filter(
              (r) => r.type === 'validation' || r.type === 'business_logic',
            );

            const errorItems = errorCandidateRules.map((rule) => {
              const matchedTestDescriptions: string[] = [];
              for (const { file, descriptions, isJavaLike, contentLower } of testEntries) {
                // Match at TEST DESCRIPTION level, not file level
                // Require: description contains an error indicator + at least one specific keyword
                const specificKws = rule.specificKeywords ?? [];
                const matchingDescs = descriptions.filter((desc) => {
                  const hasErrorKeyword = ERROR_TEST_KEYWORDS.some((kw) => desc.includes(kw));
                  if (!hasErrorKeyword) return false;
                  // If we have specific keywords, at least one must match in the description
                  if (specificKws.length > 0) {
                    return specificKws.some((kw) => desc.includes(kw.toLowerCase()));
                  }
                  // No specific keywords — use handler function name as fallback
                  return true;
                });
                if (matchingDescs.length > 0) {
                  matchedTestDescriptions.push(...matchingDescs.map((d) => `[${path.basename(file)}] ${d}`));
                } else if (isJavaLike) {
                  // Java/Kotlin: test method names rarely contain exception class names.
                  // Check file body for specific long keywords (≥8 chars, e.g. "authorization")
                  // combined with HTTP 4xx status checks or exception throws.
                  const specificLongKws = specificKws
                    .filter((k) => k.length >= 8)
                    .map((k) => k.toLowerCase());
                  if (specificLongKws.length > 0 && specificLongKws.some((kw) => contentLower.includes(kw))) {
                    const hasErrorInContent =
                      /\.statuscode\s*\(\s*[45]\d{2}|throw\s+new\s+\w*exception/i.test(contentLower);
                    if (hasErrorInContent) {
                      // Prefer test methods that look like error/boundary tests
                      const errorDescs = descriptions.filter((d) =>
                        /\b(4\d\d|error|fail|forbidden|unauthorized|invalid|exception|not.?found)\b/.test(d),
                      );
                      const descsToReport = errorDescs.length > 0 ? errorDescs : descriptions.slice(0, 1);
                      matchedTestDescriptions.push(
                        ...descsToReport.map((d) => `[${path.basename(file)}] ${d}`),
                      );
                    }
                  }
                }
              }
              return {
                id: rule.id,
                description: rule.condition,
                covered: matchedTestDescriptions.length > 0,
                matchedTests: matchedTestDescriptions,
                source_location: rule.source_location,
                code_snippet: rule.code_snippet,
              };
            });

            const errorCovered = errorItems.filter((i) => i.covered).length;
            const errorPct = errorItems.length > 0 ? Math.round((errorCovered / errorItems.length) * 100) : 0;

            const errorResult: CoverageResult = {
              type: 'error',
              totalItems: errorItems.length,
              coveredItems: errorCovered,
              coveragePercent: errorPct,
              details: {
                total: errorItems.length,
                covered: errorCovered,
                percentage: errorPct,
                items: errorItems,
                source: 'inferred',
              },
            };
            allCoverageResults.push(errorResult);
            console.log(`  ${errorCovered}/${errorItems.length} inferred error scenarios have test coverage (${errorPct}%)`);
          }
        } else {
          warnings.push('No routes detected in service files; endpoint coverage skipped.');
        }
      } catch (err) {
        warnings.push(
          `Route/error inference failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // ── 4d. Business rules coverage ─────────────────────────────────────────
    const businessRulesYaml = path.join(rootDir, 'business-rules.yaml');
    if (fsMod.existsSync(businessRulesYaml)) {
      // Explicit YAML takes precedence
      try {
        console.log(`\nAnalyzing business rules coverage...`);
        const rules         = parseBusinessRules(businessRulesYaml);
        const bizCoverages  = await analyzeBusinessCoverage(rules, testsGlob);
        const bizReport     = buildBusinessCoverageReport(bizCoverages);
        const bizResult: CoverageResult = {
          type: 'business',
          totalItems: bizReport.total,
          coveredItems: bizReport.covered,
          coveragePercent: bizReport.percentage,
          details: bizReport,
        };
        allCoverageResults.push(bizResult);
        console.log(`  ${bizReport.covered}/${bizReport.total} business rules covered (${bizReport.percentage}%)`);
      } catch (err) {
        warnings.push(
          `Business rules coverage failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else if (inferredRulesResult && inferredRulesResult.rules.length > 0) {
      // Auto-inferred: use specificKeywords from rule for accurate test matching.
      // Reuse the testEntries already computed for endpoint coverage — avoids
      // a second glob expansion (which can be slow/hang on large projects).
      try {
        console.log(`\nAnalyzing business rules coverage (from inferred rules)...`);
        const syntheticRules = inferredRulesResult.rules.map((r) => {
          const kwSet = new Set<string>();
          // Use specificKeywords extracted from the condition (most accurate)
          if (r.specificKeywords && r.specificKeywords.length > 0) {
            r.specificKeywords.forEach((kw) => { if (!KEYWORD_STOP_WORDS.has(kw)) kwSet.add(kw); });
          } else {
            // Fallback: words from rule name only (filter stop words)
            r.name.toLowerCase().split(/[-_\s]+/).forEach((w) => {
              if (w.length > 2 && !KEYWORD_STOP_WORDS.has(w)) kwSet.add(w);
            });
          }
          // Non-trivial path segments from endpoint
          if (r.endpoint) {
            r.endpoint.toLowerCase().split(/[/.\s:]+/)
              .forEach((w) => { if (w.length > 2 && !/^(api|v\d)$/.test(w) && !KEYWORD_STOP_WORDS.has(w)) kwSet.add(w); });
          }
          return {
            id: r.id,
            description: r.name,
            endpoints: r.endpoint ? [r.endpoint] : [],
            keywords: [...kwSet],
            scenarios: [],
          };
        });

        // Match rules against the testEntries already built for endpoint coverage.
        // This avoids a second glob expansion and is safe when there are no test files.
        const bizCoverages = syntheticRules.map((rule) => {
          const kwsLower = rule.keywords.map((k) => k.toLowerCase());
          const matchedDescs: string[] = [];
          const matchedFileSet = new Set<string>();
          for (const { file, descriptions, isJavaLike, contentLower } of testEntries) {
            const hitting = descriptions.filter((desc) =>
              kwsLower.length > 0 && kwsLower.some((kw) => desc.includes(kw)),
            );
            if (hitting.length > 0) {
              matchedDescs.push(...hitting);
              matchedFileSet.add(file);
            } else if (isJavaLike) {
              // Java/Kotlin: test method names may not contain exception class names.
              // Fall back to checking the file body for specific long keywords (≥8 chars).
              const specificLongKws = kwsLower.filter((k) => k.length >= 8);
              if (specificLongKws.length > 0 && specificLongKws.some((kw) => contentLower.includes(kw))) {
                // Prefer tests that look like error/boundary tests; otherwise include all
                const relevantDescs = descriptions.filter((d) =>
                  /\b(4\d\d|error|fail|forbidden|unauthorized|invalid|exception|not.?found)\b/.test(d),
                );
                const descsToAdd = relevantDescs.length > 0 ? relevantDescs : descriptions;
                matchedDescs.push(...descsToAdd);
                matchedFileSet.add(file);
              }
            }
          }
          return {
            rule,
            covered: matchedDescs.length > 0,
            testFiles: [...matchedFileSet],
            matchedTests: matchedDescs,
            scenarios: [],
          };
        });

        const bizReport    = buildBusinessCoverageReport(bizCoverages);
        const bizResult: CoverageResult = {
          type: 'business',
          totalItems: bizReport.total,
          coveredItems: bizReport.covered,
          coveragePercent: bizReport.percentage,
          details: {
            ...bizReport,
            inferred_details: inferredRulesResult.rules.reduce((acc, r) => {
              acc[r.id] = {
                source_location: r.source_location,
                condition: r.condition,
                code_snippet: r.code_snippet,
                type: r.type,
                specificKeywords: r.specificKeywords,
              };
              return acc;
            }, {} as Record<string, unknown>),
          },
        };
        allCoverageResults.push(bizResult);
        console.log(`  ${bizReport.covered}/${bizReport.total} inferred business rules have test coverage (${bizReport.percentage}%)`);
      } catch (err) {
        warnings.push(
          `Business rules coverage failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // ── 4e. Integration flows coverage ──────────────────────────────────────
    const integrationFlowsYaml = path.join(rootDir, 'integration-flows.yaml');
    if (fsMod.existsSync(integrationFlowsYaml)) {
      // Explicit YAML takes precedence
      try {
        console.log(`\nAnalyzing integration flows coverage...`);
        const flows        = parseIntegrationFlows(integrationFlowsYaml);
        const flowCoverages = await analyzeIntegrationCoverage(flows, testsGlob);
        const flowReport   = buildIntegrationCoverageReport(flowCoverages);
        const flowResult: CoverageResult = {
          type: 'integration',
          totalItems: flowReport.total,
          coveredItems: flowReport.complete,
          coveragePercent: flowReport.percentage,
          details: flowReport,
        };
        allCoverageResults.push(flowResult);
        console.log(`  ${flowReport.complete}/${flowReport.total} integration flows covered (${flowReport.percentage}%)`);
      } catch (err) {
        warnings.push(
          `Integration flows coverage failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else if (inferredFlowsResult && inferredFlowsResult.flows.length > 0) {
      // Auto-inferred: flows are extracted FROM tests, so by definition they're all covered
      console.log(`\nIntegration flows coverage (from inferred flows)...`);
      const syntheticItems = inferredFlowsResult.flows.map((f) => ({
        id: f.id,
        name: f.name,
        total: f.steps.length,
        covered: f.steps.length,
        complete: true,
        percentage: 100,
        uncoveredSteps: [] as string[],
      }));
      const syntheticReport = {
        total: syntheticItems.length,
        complete: syntheticItems.length,
        percentage: 100,
        items: syntheticItems,
      };
      const flowResult: CoverageResult = {
        type: 'integration',
        totalItems: syntheticReport.total,
        coveredItems: syntheticReport.complete,
        coveragePercent: syntheticReport.percentage,
        details: syntheticReport,
      };
      allCoverageResults.push(flowResult);
      console.log(`  ${syntheticReport.complete}/${syntheticReport.total} multi-step flows detected and covered (100%)`);
    }

    if (allCoverageResults.length > 0) {
      const observabilityInfo = buildObservabilityInfo(metricsPort);
      generateMultiFormatReports(allCoverageResults, ['json'], reportsDir, {}, observabilityInfo);

      // Append discoveryInfo to coverage-summary.json for the dashboard
      const summaryPath = path.join(reportsDir, 'coverage-summary.json');
      try {
        const summaryJson = JSON.parse(fsMod.readFileSync(summaryPath, 'utf-8')) as Record<string, unknown>;
        summaryJson.discoveryInfo = {
          projectRoot: rootDir,
          analyzedAt: new Date().toISOString(),
          languages: artifacts.languages,
          frameworks: artifacts.frameworks,
          serviceFilesCount: artifacts.serviceFiles.length,
          testFilesCount: artifacts.testFiles.length,
          specFilesCount: artifacts.specs.length,
          analysisMode: artifacts.specs.length > 0 ? 'explicit-spec' : 'inferred',
        };
        fsMod.writeFileSync(summaryPath, JSON.stringify(summaryJson, null, 2), 'utf-8');
      } catch {
        // Non-fatal — discovery info is also in scan-manifest.json
      }

      console.log(`\nReports written to: ${reportsDir}`);

      // ── 4f-intel. Run coverage intelligence automatically ─────────────────
      try {
        const coverageResultsForIntel = allCoverageResults.map((r) => ({
          type: r.type,
          totalItems: r.totalItems,
          coveredItems: r.coveredItems,
          coveragePercent: r.coveragePercent,
          details: normalizeDetailsForIntelligence(r.type, r.details),
        }));
        const intelReport = runIntelligenceEngine({
          coverageResults: coverageResultsForIntel,
          languages: artifacts.languages,
          frameworks: artifacts.frameworks,
          projectName: path.basename(rootDir),
          outDir: reportsDir,
        });
        console.log(`\nCoverage Intelligence: ${intelReport.summary.totalFindings} findings, ` +
          `${intelReport.summary.totalRecommendations} recommendations ` +
          `(${intelReport.summary.criticalUncoveredItems} critical uncovered)`);
        if (intelReport.summary.recommendationsByPriority.P0 > 0) {
          console.log(`⚠️  P0 Recommendations: ${intelReport.summary.recommendationsByPriority.P0} — immediate action required`);
        }
      } catch (intelErr) {
        warnings.push(`Coverage intelligence failed: ${intelErr instanceof Error ? intelErr.message : String(intelErr)}`);
      }
    }

    // ── 4f. Write scan manifest ────────────────────────────────────────────
    try {
      const scanTypes: ScanTypeEntry[] = allCoverageResults.map((r) => ({
        type: r.type,
        source: artifacts.specs.length > 0 ? 'explicit' : 'inferred',
        itemsFound: r.totalItems,
        itemsCovered: r.coveredItems,
        coveragePercent: r.coveragePercent,
      }));
      // Add skipped types (exclude 'business' and 'integration' since these are always attempted
      // via rule/flow inference regardless of whether a spec file is present; their absence from
      // allCoverageResults means no rules or flows were discovered, which is informative on its own.)
      const coveredTypes = new Set(allCoverageResults.map((r) => r.type));
      for (const skippedType of KNOWN_METRIC_TYPES.filter((t) => t !== 'business' && t !== 'integration')) {
        if (!coveredTypes.has(skippedType as CoverageResult['type'])) {
          scanTypes.push({
            type: skippedType,
            source: 'skipped',
            reason: artifacts.specs.length === 0 ? 'No API spec and no routes detected' : 'No data available',
            itemsFound: 0,
            itemsCovered: 0,
            coveragePercent: 0,
          });
        }
      }
      const manifestPath = writeScanManifest(
        {
          projectRoot: rootDir,
          analyzedAt: new Date().toISOString(),
          discoveredFiles: {
            serviceFiles: artifacts.serviceFiles,
            testFiles: artifacts.testFiles,
            specFiles: artifacts.specs,
          },
          languages: artifacts.languages,
          frameworks: artifacts.frameworks,
          scanTypes,
        },
        reportsDir,
      );
      console.log(`Scan manifest written to: ${manifestPath}`);
    } catch (err) {
      warnings.push(`Scan manifest write failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── 5. Emit warnings ───────────────────────────────────────────────────
    for (const w of warnings) {
      console.warn(`[WARN] ${w}`);
    }

    // ── 6. Configuration override log ──────────────────────────────────────
    if (options['inferBusinessRules'] === false) {
      console.log('\nConfiguration override detected: business rule inference disabled via CLI');
    }
    if (options['inferIntegrationFlows'] === false) {
      console.log('\nConfiguration override detected: integration flow inference disabled via CLI');
    }

    logger.info(
      { event: 'analyze_complete', warnings: warnings.length },
      'Agnostic project analysis complete',
    );

    await finaliseObservability(allCoverageResults, {}, metricsPort, serviceName);

    // ── 7. Optionally launch the dashboard ─────────────────────────────────
    if (options['dashboard']) {
      serveDashboard({
        reportsDir: reportsDir,
        port: (options['port'] as number | undefined) ?? 4000,
        open: Boolean(options['open']),
      });
      // Keep the process alive — the HTTP server holds the event loop open
    }
  });

// ─── serve command ────────────────────────────────────────────────────────────

program
  .command('serve')
  .description(
    'Start the coverage dashboard UI and serve reports from your reports directory.',
  )
  .option('--reports-dir <dir>', 'Directory containing report JSON files (default: reports/)')
  .option('--port <port>', 'Port to listen on (default: 4000)', parseInt)
  .option('--open', 'Open the dashboard in your browser automatically')
  .action((options: Record<string, unknown>) => {
    const configPath  = (program.opts()['config'] as string | undefined);
    const analyzerCfg = loadCentralConfig(configPath);
    const reportsDir  = (options['reportsDir'] as string | undefined) ??
                        analyzerCfg.reports?.outputDir ?? 'reports';
    const port        = (options['port'] as number | undefined) ?? 4000;

    serveDashboard({
      reportsDir,
      port,
      open: Boolean(options['open']),
    });
    // Keep the process alive while the server runs
  });

program
  .command('generate-tests')
  .description('Generate test scaffolds for detected coverage gaps')
  .option('--reports-dir <dir>', 'Directory with coverage reports', 'reports/')
  .option('--out-dir <dir>', 'Output directory for generated tests', 'generated-tests/')
  .option('--language <lang>', 'Target language override (auto-detected if omitted)')
  .option('--framework <fw>', 'Test framework override (auto-detected if omitted)')
  .option('--priority <p>', 'Only generate for gaps at this priority or higher', 'P1')
  .option('--dry-run', 'Print generated tests to stdout, do not write files', false)
  .option('--overwrite', 'Overwrite existing generated files', false)
  .option('--gap-id <id>', 'Generate tests for a single specific gap')
  .option('--types <list>', 'Comma-separated gap types to generate (default: all)')
  .option('--no-security', 'Skip security test generation')
  .option('--no-cypress', 'Skip Cypress test generation')
  .action(async (options) => {
    const types = options.types
      ? (options.types as string).split(',').map(t => t.trim()) as GapType[]
      : undefined;

    const result = await generateTests({
      reportsDir: options.reportsDir as string,
      outDir: options.outDir as string,
      language: options.language as string | undefined,
      framework: options.framework as string | undefined,
      priority: options.priority as GapPriority,
      dryRun: Boolean(options.dryRun),
      overwrite: Boolean(options.overwrite),
      gapId: options.gapId as string | undefined,
      types,
      noSecurity: Boolean(options.noSecurity),
      noCypress: Boolean(options.noCypress),
    });

    if (result.dryRun) {
      for (const file of result.files) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`// FILE: ${file.relativePath}`);
        console.log(`${'='.repeat(60)}`);
        console.log(file.content);
      }
    } else {
      console.log(`\nTest generation complete:`);
      console.log(`  Gaps processed:  ${result.totalGaps}`);
      console.log(`  Files generated: ${result.generatedCount}`);
      console.log(`  Errors:          ${result.errors.length}`);
      if (result.errors.length > 0) {
        for (const err of result.errors) {
          console.error(`  ERROR [${err.gapId}]: ${err.message}`);
        }
      }
    }
  });

program
  .command('export-ai-flows')
  .description('Export AI-ready flow documentation for Copilot/Cursor/Claude')
  .option('--reports-dir <dir>', 'Directory with coverage reports', 'reports/')
  .option('--out-dir <dir>', 'Output directory for AI flow files', 'reports/')
  .option('--format <fmt>', 'Output format: markdown, json, or both', 'both')
  .option('--max-gaps <n>', 'Maximum number of gaps to include', '50')
  .option('--priority <p>', 'Only include gaps at this priority or higher', 'P3')
  .action(async (options) => {
    const flows = await exportAiFlows({
      reportsDir: options.reportsDir as string,
      outDir: options.outDir as string,
      format: options.format as 'markdown' | 'json' | 'both',
      maxGaps: parseInt(options.maxGaps as string, 10),
      priority: options.priority as GapPriority,
    });

    console.log(`\nAI flows export complete:`);
    console.log(`  Gaps exported: ${flows.gaps.length}`);
    console.log(`  Project:       ${flows.project.name}`);
    console.log(`  Language:      ${flows.project.language}`);
  });

program
  .command('score-tests')
  .description('Score quality of existing test suite on 5 dimensions (0-100)')
  .option('--tests <glob>', 'Glob pattern for test files to score', 'tests/**/*.test.ts')
  .option('--reports-dir <dir>', 'Directory to write quality score output', 'reports/')
  .option('--fail-below <score>', 'Exit non-zero if any file scores below this', '0')
  .action(async (options) => {
    try {
      const report = await scoreTests({
        testsGlob: options.tests as string,
        reportsDir: options.reportsDir as string,
        failBelow: parseInt(options.failBelow as string, 10),
      });

      console.log(`\nTest Quality Score Report:`);
      console.log(`  Overall score: ${report.overallScore}/100`);
      console.log(`  Files scored:  ${report.byFile.length}`);

      if (report.lowestQualityFiles.length > 0) {
        console.log(`\n  Lowest quality files:`);
        for (const f of report.lowestQualityFiles) {
          const entry = report.byFile.find(b => b.file === f);
          console.log(`    ${f}: ${entry?.score ?? '?'}/100`);
        }
      }

      if (report.highestRiskLowQualityGaps.length > 0) {
        console.log(`\n  High risk + low quality:`);
        for (const g of report.highestRiskLowQualityGaps) {
          console.log(`    ${g.endpoint}: quality=${g.qualityScore}, risk=${g.riskScore}`);
          console.log(`      → ${g.primaryIssue}`);
        }
      }

      console.log(`\n  Report written to: ${options.reportsDir}/test-quality.json`);
    } catch (err) {
      if (err instanceof Error) {
        console.error(err.message);
      }
      process.exit(1);
    }
  });

// Parse the command-line arguments
program.parse(process.argv);

// When invoked with no arguments (no subcommand), display help
if (process.argv.length <= 2) {
  program.help();
}
