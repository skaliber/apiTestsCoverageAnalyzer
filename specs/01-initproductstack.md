# 01 - Initial Product Stack

This document outlines the initial setup for the Test Coverage Analyzer for APIs. Follow these steps to bootstrap the project so that future features can be developed efficiently.

## Objective
Prepare a Node.js + TypeScript project that will be used to implement the API test coverage analyzer. The initial stack should include dependencies for parsing API specifications, scanning test files, computing coverage metrics, and running tests.

## Steps for the agent

1. **Initialize the project**  
   - Use `npm` or `yarn` to initialise a new TypeScript project (`npm init -y` followed by `npm install -D typescript ts-node @types/node`).  
   - Generate a `tsconfig.json` tailored for Node (ES2019 target, module resolution Node, outDir `dist`).  
   - Create the following folders:
     - `src/` – source code for the analyzer.
     - `tests/` – unit tests for the analyzer.
     - `sample/` – sample API specs and test suites used for validation.
     - `reports/` – output for coverage reports.

2. **Install core dependencies**  
   - Add a parser for OpenAPI documents, e.g. `swagger-parser` or `@apidevtools/swagger-parser`.  
   - Add a test file scanner such as `globby` to traverse directories.  
   - Add a library for command‑line interfaces, e.g. `commander`.  
   - Install a test framework such as `jest` plus `ts-jest` for TypeScript support.  
   - Ensure all dependencies are saved in `package.json`.

3. **Scaffold the CLI entry point**  
   - Create `src/index.ts` that parses arguments (e.g. API spec path, test directory) and calls placeholder functions for later features.  
   - Add a `bin` entry in `package.json` so the CLI can be run via `npx api-tests-coverage-analyzer`.

4. **Add basic unit tests**  
   - Create a basic Jest configuration (`jest.config.ts`) and ensure that tests in `tests/` are run.  
   - Write a simple test that asserts the CLI returns a help message when no arguments are provided.

5. **Validate the setup**  
   - Run `npm run build` to compile TypeScript to JavaScript and ensure there are no type errors.  
   - Run `npm test` to confirm Jest executes the initial test successfully.  
   - Execute `npx ts-node src/index.ts --help` to confirm the CLI entry point works.

## Completion criteria
The agent should not stop until:
- A TypeScript project with the folder structure above is committed.  
- The dependencies listed are installed and referenced in the `package.json`.  
- The CLI entry point exists and runs without crashing.  
- The test suite executes successfully.

Once these items are satisfied, the project is ready for implementation of the analyzer features.
