#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import {
  parseOpenApiSpec,
  analyzeTestCoverage,
  buildCoverageReport,
  generateReports,
} from './endpointCoverage';

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

// Parse the command-line arguments
program.parse(process.argv);

// When invoked with no arguments (no subcommand), display help
if (process.argv.length <= 2) {
  program.help();
}
