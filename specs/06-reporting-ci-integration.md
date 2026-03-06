# 06 - Reporting and CI Integration

This specification outlines how to produce comprehensive coverage reports and integrate the analyzer into continuous integration pipelines.

## Objective

Explain to the agent how to generate coverage reports in multiple formats and enforce quality gates in CI pipelines.

## Steps for the agent

1. **Generate coverage report formats**
   - After performing endpoint, parameter, business logic and integration flow coverage analysis, the agent should produce standardized reports:
     - **Human‑readable HTML report** summarizing endpoint coverage, parameter coverage, business rule coverage, and flow coverage with tables, charts and color‑coded statuses.
     - **Machine‑readable JSON report** containing detailed metrics and lists of endpoints, parameters, business rules, flows with coverage percentages.
     - **CSV or TSV** exports for easy importing into spreadsheets.
     - Optionally generate a **JUnit XML** file representing coverage as test cases so that CI tools can consume results.

   - Place these reports in a `reports/` directory at the project root. Name files with a timestamp or commit hash to avoid overwriting.

   - Use existing Node.js libraries (e.g., `fs` for writing files, `json2csv` for CSV) or write custom functions to serialize coverage data.

2. **Provide configurable thresholds and gating**
   - Allow users to specify minimum coverage thresholds for each dimension (endpoints, parameters, business rules, flows) via CLI options or a config file (e.g., `coverage.config.json`).
   - When coverage is below thresholds, the agent should:
     - Exit the CLI process with a non‑zero exit code.
     - Print a summary of failures highlighting the areas below threshold.
   - Provide sensible default thresholds (e.g., 80% for endpoints, 70% for parameters, etc.) but allow overrides.

3. **Integrate with CI pipelines**
   - Document how to run the analyzer in popular CI environments:
     - **GitHub Actions**:
       - Provide a sample workflow YAML that installs dependencies, runs the analyzer against tests, uploads HTML reports as build artifacts, and uses the exit code to fail the workflow if thresholds are not met.
       - Show how to use the `actions/upload-artifact` action to persist reports.
       - Optionally post a comment on the pull request summarizing coverage using the GitHub API.
     - **Jenkins**:
       - Provide a Pipeline script snippet that checks out code, runs `npm install` and `npm run analyze‑coverage`, archives the reports, and marks the build as unstable or failed based on exit code.
   - Provide guidance for other CI systems (GitLab CI, Azure Pipelines) using similar steps: install dependencies, run the CLI, collect reports, enforce thresholds.

4. **Versioned and historical reports**
   - Implement a mechanism to store historical coverage results (e.g., maintain a `history.json` file or push reports to a dedicated branch) so teams can track trends over time.
   - Offer an optional `--compare` flag that compares current coverage with previous runs and highlights improvements or regressions.

## Validation

- Set up a sample repository with a minimal API specification and test suite.
- Run the analyzer with default thresholds and verify that the HTML, JSON, and CSV reports are generated in the `reports/` folder.
- Test threshold gating by lowering the threshold values and verifying that the CLI exits with appropriate codes and messages.
- Create a sample GitHub Actions workflow file and verify that the CI pipeline fails when coverage is below threshold and uploads reports when passing.
- Validate the JUnit XML output using a CI tool that consumes JUnit reports.

## Completion Criteria

- Reports in all specified formats are generated reliably.
- Coverage thresholds can be configured and are enforced via exit codes.
- Example CI integration documentation and sample configuration files are checked into the repo and proven to work.
- The agent should not consider this feature complete until it has been validated in at least one CI environment and documentation has been updated.
