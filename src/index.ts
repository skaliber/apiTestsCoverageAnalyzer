#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('api-tests-coverage-analyzer')
  .description('Analyze API test coverage based on OpenAPI specs')
  .version('0.1.0')
  .option('-s, --spec <path>', 'Path to the API spec file')
  .option('-t, --tests <pattern>', 'Glob pattern for test files');

// Parse the command-line arguments
program.parse(process.argv);

const options = program.opts();

// For now, just output the provided options
if (Object.keys(options).length === 0) {
  // When no options are provided, display help
  program.help();
} else {
  console.log(options);
}
