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
} from './errorCoverage';
import {
  parseSecurityControls,
  analyzeSecurityCoverage,
  buildSecurityCoverageReport,
  generateSecurityReports,
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
import { resolveConfig, mergeConfig, CoverageConfig } from './config';
import {
  runSecurityScan,
  SecurityScanConfig,
} from './security/index';
import { runPlugins, PluginContext } from './pluginLoader';
import {
  initLogger,
  initMetrics,
  recordCoverageMetrics,
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

const program = new Command();

program
  .name('api-tests-coverage-analyzer')
  .description('Analyze API test coverage based on OpenAPI specs')
  .version('0.1.0')
  .option('--config <file>', 'Path to a coverage configuration file (default: coverage.config.json)')
  .option('--log-level <level>', 'Log verbosity level: trace|debug|info|warn|error|silent', 'info')
  .option('--metrics-port <port>', 'Start a Prometheus /metrics HTTP server on this port after analysis', parseInt)
  .option('--service-name <name>', 'Service name label added to all Prometheus metrics', 'api-coverage-analyzer')
  .option('--trace', 'Enable OpenTelemetry tracing (spans recorded in memory or exported via OTLP)')
  .option('--trace-endpoint <url>', 'OTLP HTTP endpoint for trace export (e.g. http://localhost:4318)');

// ─── Config helper ─────────────────────────────────────────────────────────────

/**
 * Load and return the resolved CoverageConfig for a command invocation.
 * CLI threshold flags (non-zero values) take precedence over config-file values.
 */
function loadCoverageConfig(
  configPath: string | undefined,
  cliThresholds: Record<string, number>,
): CoverageConfig {
  const fileConfig = resolveConfig(configPath);
  const cliOverrides: Partial<CoverageConfig> = {};
  // Only apply CLI thresholds that were explicitly set (non-zero)
  const activeThresholds: Record<string, number> = {};
  for (const [key, value] of Object.entries(cliThresholds)) {
    if (value > 0) activeThresholds[key] = value;
  }
  if (Object.keys(activeThresholds).length > 0) {
    cliOverrides.thresholds = activeThresholds;
  }
  return mergeConfig(fileConfig, cliOverrides);
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
    const coverageMap = await analyzeTestCoverage(endpoints, testsGlob, languages);

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

    await finaliseObservability([result], {}, metricsPort, serviceName);

    if (summary.gateResult && !summary.gateResult.passed) {
      process.exitCode = 1;
    }
  });

// Parse the command-line arguments
program.parse(process.argv);

// When invoked with no arguments (no subcommand), display help
if (process.argv.length <= 2) {
  program.help();
}
