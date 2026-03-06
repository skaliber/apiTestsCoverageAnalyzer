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
  parseFormats,
  generateMultiFormatReports,
  checkThresholds,
  CoverageResult,
} from './reporting';

const program = new Command();

program
  .name('api-tests-coverage-analyzer')
  .description('Analyze API test coverage based on OpenAPI specs')
  .version('0.1.0');

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
    const specPath = path.resolve(options.spec);
    const testsGlob = options.tests as string;
    const reportsDir = path.resolve('reports');
    const formats = parseFormats(options.format as string);
    const thresholdEndpoint = options.thresholdEndpoint as number;

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

    const thresholds: Record<string, number> = {};
    if (thresholdEndpoint > 0) thresholds['endpoint'] = thresholdEndpoint;

    generateMultiFormatReports([result], formats, reportsDir, thresholds);

    console.log(
      `Endpoint coverage: ${report.covered}/${report.total} endpoints covered (${report.percentage}%)`,
    );
    console.log(`Reports written to: ${reportsDir}`);

    // Threshold check
    const failures = checkThresholds([result], thresholds);
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
    const specPath = path.resolve(options.spec);
    const testsGlob = options.tests as string;
    const reportsDir = path.resolve('reports');
    const formats = parseFormats(options.format as string);
    const thresholdParameter = options.thresholdParameter as number;

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

    const thresholds: Record<string, number> = {};
    if (thresholdParameter > 0) thresholds['parameter'] = thresholdParameter;

    generateMultiFormatReports([result], formats, reportsDir, thresholds);

    console.log(
      `Parameter coverage: ${report.totalParameters} parameters analysed, average coverage ${report.averageCoverage}%`,
    );
    console.log(`Reports written to: ${reportsDir}`);

    const failures = checkThresholds([result], thresholds);
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
    const rulesPath = path.resolve(options.rules);
    const testsGlob = options.tests as string;
    const reportsDir = path.resolve('reports');
    const formats = parseFormats(options.format as string);
    const thresholdBusiness = options.thresholdBusiness as number;

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

    const thresholds: Record<string, number> = {};
    if (thresholdBusiness > 0) thresholds['business'] = thresholdBusiness;

    generateMultiFormatReports([result], formats, reportsDir, thresholds);

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

    const failures = checkThresholds([result], thresholds);
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
    const flowsPath = path.resolve(options.flows);
    const testsGlob = options.tests as string;
    const reportsDir = path.resolve('reports');
    const formats = parseFormats(options.format as string);
    const thresholdIntegration = options.thresholdIntegration as number;

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

    const thresholds: Record<string, number> = {};
    if (thresholdIntegration > 0) thresholds['integration'] = thresholdIntegration;

    generateMultiFormatReports([result], formats, reportsDir, thresholds);

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

    const failures = checkThresholds([result], thresholds);
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
    const specPath = path.resolve(options.spec);
    const testsGlob = options.tests as string;
    const reportsDir = path.resolve('reports');
    const formats = parseFormats(options.format as string);
    const thresholdError = options.thresholdError as number;

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

    const thresholds: Record<string, number> = {};
    if (thresholdError > 0) thresholds['error'] = thresholdError;

    generateMultiFormatReports([result], formats, reportsDir, thresholds);

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
    const failures = checkThresholds([result], thresholds);
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
