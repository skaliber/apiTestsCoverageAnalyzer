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
  .action(async (options) => {
    const specPath = path.resolve(options.spec);
    const testsGlob = options.tests as string;
    const reportsDir = path.resolve('reports');

    console.log(`Parsing spec: ${specPath}`);
    const endpoints = await parseOpenApiSpec(specPath);

    console.log(`Analyzing tests matching: ${testsGlob}`);
    const coverageMap = await analyzeTestCoverage(endpoints, testsGlob);

    const report = buildCoverageReport(coverageMap);

    generateReports(report, reportsDir);

    const jsonReport = path.join(reportsDir, 'endpoint-coverage.json');
    const htmlReport = path.join(reportsDir, 'endpoint-coverage.html');

    console.log(
      `Endpoint coverage: ${report.covered}/${report.total} endpoints covered (${report.percentage}%)`,
    );
    console.log(`JSON report: ${jsonReport}`);
    console.log(`HTML report: ${htmlReport}`);
  });

program
  .command('parameter-coverage')
  .description('Analyze how thoroughly each API parameter is tested (valid, boundary, missing, invalid)')
  .option('--spec <path>', 'Path to the OpenAPI/Swagger spec file', 'sample/openapi-parameters.yaml')
  .option('--tests <glob>', 'Glob pattern for test files', 'sample/tests/**/*.ts')
  .action(async (options) => {
    const specPath = path.resolve(options.spec);
    const testsGlob = options.tests as string;
    const reportsDir = path.resolve('reports');

    console.log(`Parsing spec: ${specPath}`);
    const parameters = await parseParameters(specPath);

    console.log(`Analyzing tests matching: ${testsGlob}`);
    const coverages = await analyzeParameterCoverage(parameters, testsGlob);

    const report = buildParameterCoverageReport(coverages);

    generateParameterReports(report, reportsDir);

    const jsonReport = path.join(reportsDir, 'parameter-coverage.json');
    const htmlReport = path.join(reportsDir, 'parameter-coverage.html');

    console.log(
      `Parameter coverage: ${report.totalParameters} parameters analysed, average coverage ${report.averageCoverage}%`,
    );
    console.log(`JSON report: ${jsonReport}`);
    console.log(`HTML report: ${htmlReport}`);
  });

program
  .command('business-coverage')
  .description('Analyze how well tests cover defined business rules and scenarios')
  .option('--rules <file>', 'Path to the business rules definition file (YAML or JSON)', 'sample/business-rules.yaml')
  .option('--tests <glob>', 'Glob pattern for test files', 'sample/tests/**/*.ts')
  .action(async (options) => {
    const rulesPath = path.resolve(options.rules);
    const testsGlob = options.tests as string;
    const reportsDir = path.resolve('reports');

    console.log(`Parsing business rules: ${rulesPath}`);
    const rules = parseBusinessRules(rulesPath);

    console.log(`Analyzing tests matching: ${testsGlob}`);
    const coverages = await analyzeBusinessCoverage(rules, testsGlob);

    const report = buildBusinessCoverageReport(coverages);

    generateBusinessReports(report, reportsDir);

    const jsonReport = path.join(reportsDir, 'business-coverage.json');
    const htmlReport = path.join(reportsDir, 'business-coverage.html');

    console.log(
      `Business coverage: ${report.covered}/${report.total} rules covered (${report.percentage}%)`,
    );
    if (report.uncoveredRules.length > 0) {
      console.log('Uncovered rules:');
      for (const rule of report.uncoveredRules) {
        console.log(`  - ${rule.id}: ${rule.description}`);
      }
    }
    console.log(`JSON report: ${jsonReport}`);
    console.log(`HTML report: ${htmlReport}`);
  });

program
  .command('integration-coverage')
  .description('Analyze how well integration tests exercise defined end-to-end flows')
  .option('--flows <file>', 'Path to the integration flows definition file (YAML or JSON)', 'sample/integration-flows.yaml')
  .option('--tests <glob>', 'Glob pattern for test files', 'sample/tests/**/*.ts')
  .action(async (options) => {
    const flowsPath = path.resolve(options.flows);
    const testsGlob = options.tests as string;
    const reportsDir = path.resolve('reports');

    console.log(`Parsing integration flows: ${flowsPath}`);
    const flows = parseIntegrationFlows(flowsPath);

    console.log(`Analyzing tests matching: ${testsGlob}`);
    const coverages = await analyzeIntegrationCoverage(flows, testsGlob);

    const report = buildIntegrationCoverageReport(coverages);

    generateIntegrationReports(report, reportsDir);

    const jsonReport = path.join(reportsDir, 'integration-coverage.json');
    const htmlReport = path.join(reportsDir, 'integration-coverage.html');

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
    console.log(`JSON report: ${jsonReport}`);
    console.log(`HTML report: ${htmlReport}`);
  });

// Parse the command-line arguments
program.parse(process.argv);

// When invoked with no arguments (no subcommand), display help
if (process.argv.length <= 2) {
  program.help();
}
