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
  parseFormats,
  generateMultiFormatReports,
  checkThresholds,
  CoverageResult,
} from './reporting';
import { resolveConfig, mergeConfig, CoverageConfig } from './config';
import { runPlugins, PluginContext } from './pluginLoader';

const program = new Command();

program
  .name('api-tests-coverage-analyzer')
  .description('Analyze API test coverage based on OpenAPI specs')
  .version('0.1.0')
  .option('--config <file>', 'Path to a coverage configuration file (default: coverage.config.json)');

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

program
  .command('endpoint-coverage')
  .description('Analyze which API endpoints are covered by integration tests')
  .option('--spec <path>', 'Path to the OpenAPI/Swagger spec file', 'sample/openapi.yaml')
  .option('--tests <glob>', 'Glob pattern for test files', 'tests/**/*.ts')
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
    const parentOpts = program.opts();
    const config = loadCoverageConfig(parentOpts.config as string | undefined, {
      endpoint: options.thresholdEndpoint as number,
    });

    const specPath = path.resolve(options.spec);
    const testsGlob = (config.testPatterns && config.testPatterns.length > 0)
      ? config.testPatterns[0]
      : (options.tests as string);
    const reportsDir = path.resolve('reports');
    const formats = parseFormats(options.format as string);

    console.log(`Parsing spec: ${specPath}`);
    const endpoints = await parseOpenApiSpec(specPath);

    console.log(`Analyzing tests matching: ${testsGlob}`);
    const coverageMap = await analyzeTestCoverage(endpoints, testsGlob);

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

    generateMultiFormatReports(allResults, formats, reportsDir, thresholds);

    console.log(
      `Endpoint coverage: ${report.covered}/${report.total} endpoints covered (${report.percentage}%)`,
    );
    console.log(`Reports written to: ${reportsDir}`);

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

    generateMultiFormatReports(allResults, formats, reportsDir, thresholds);

    console.log(
      `Parameter coverage: ${report.totalParameters} parameters analysed, average coverage ${report.averageCoverage}%`,
    );
    console.log(`Reports written to: ${reportsDir}`);

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

    generateMultiFormatReports(allResults, formats, reportsDir, thresholds);

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

    generateMultiFormatReports(allResults, formats, reportsDir, thresholds);

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

    generateMultiFormatReports(allResults, formats, reportsDir, thresholds);

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

    generateMultiFormatReports(allResults, formats, reportsDir, thresholds);

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

    generateMultiFormatReports(allResults, formats, reportsDir, thresholds);

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

    // Threshold check
    const failures = checkThresholds(allResults, thresholds);
    if (failures.length > 0) {
      for (const msg of failures) {
        console.error(`THRESHOLD FAILURE: ${msg}`);
      }
      process.exitCode = 1;
    }
  });

// Parse the command-line arguments
program.parse(process.argv);

// When invoked with no arguments (no subcommand), display help
if (process.argv.length <= 2) {
  program.help();
}
