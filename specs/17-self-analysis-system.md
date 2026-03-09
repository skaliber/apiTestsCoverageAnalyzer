# 17 - Self-Analysis System: The Analyzer Analyzes Itself

## Primary Goal

Turn the **API Test Coverage Analyzer** into a **self-analyzing system** that runs against its own codebase on every build, evaluates all implemented metric types, publishes all metric reports into PR/build summaries, and **fails the build automatically if any metric falls below 100%** (unless explicitly overridden in configuration).

The analyzer must become a self-checking product: every build must prove that the analyzer itself is fully covered and fully documented according to its own standards.

---

## Objectives

1. Make the analyzer execute all available metric types against its own repository.
2. Produce all report outputs from self-analysis.
3. Include every metric in PR/build summaries.
4. Enforce 100% thresholds for every metric from within the library itself.
5. Update all CI pipelines to trigger self-analysis automatically.
6. Update business rules so they enumerate all analyzer capabilities.
7. Add tests at every level: unit, integration, end-to-end, and smoke.
8. Keep all docs current and AI-friendly.

---

## Section 1 — TODO Tracking Files

Before implementation begins, create and maintain the following tracked execution files inside the repository:

- `TODO.self-analysis.md` — top-level checklist used during active development
- `docs/implementation/self-analysis-rollout.md` — detailed rollout guide, architecture decisions, and completion status

### Minimum TODO groups

#### A. Self-analysis execution
- [ ] Identify all analyzer metric types currently implemented
- [ ] Define self-analysis input files (OpenAPI specs, test files, rules, flows, contracts, security configs)
- [ ] Define self-analysis configuration per metric type
- [ ] Ensure every metric can run against this repository
- [ ] Create missing minimal artifacts needed for self-analysis (specs, rules, flows, contracts)

#### B. Build and Make targets
- [ ] Create `Makefile` with all required targets
- [ ] Create aggregated `self-analysis-all` target
- [ ] Create `ci` target covering install, build, test, self-analysis, summaries
- [ ] Create `clean`, `reports-clean`, and `summary` targets
- [ ] Validate all targets exit non-zero on failure

#### C. Pipeline integration
- [ ] Update GitHub Actions workflows
- [ ] Update Jenkins example pipeline
- [ ] Ensure PR summaries include all metric outputs
- [ ] Ensure build fails below threshold using library exit code only (no shell parsing)

#### D. Reporting
- [ ] Ensure every metric writes output artifacts (JSON, HTML, CSV, JUnit, Markdown)
- [ ] Ensure every metric appears in build summary
- [ ] Ensure every metric appears in PR summary
- [ ] Ensure summaries are stable and predictable for CI artifact references

#### E. Business rules
- [ ] Inventory all current analyzer capabilities
- [ ] Convert each capability into an explicit business rule with stable ID
- [ ] Update business rules definition file(s)
- [ ] Validate each rule includes: id, title, description, acceptance criteria, category
- [ ] Add rule categories: summary generation, threshold enforcement, self-analysis, reporting, docs validation, security scanning, dashboard AI summaries, CI integration, GitHub Pages publishing, MCP integration, plugin behaviour

#### F. Testing
- [ ] Unit tests for self-analysis config generation, report generation, summary generation, quality gate logic, business rule loading/validation, metric aggregation, omission/inclusion logic
- [ ] Integration tests for each metric running individually, all metrics running together, all reports generating, threshold failure behaviour, pipeline-style execution flow, self-analysis end-to-end on project inputs
- [ ] End-to-end / Cypress tests for dashboard pages rendering self-analysis results, each report page loading, AI summary panels, summary pages reflecting failed gates, navigation between report pages, published/static report behaviour
- [ ] Smoke test that runs analyzer against its own codebase and verifies all output files exist, summaries are generated, and pass/fail result is correct

#### G. Docs
- [ ] Update `README.md`
- [ ] Update docs guides
- [ ] Document self-analysis flow
- [ ] Document all Makefile targets
- [ ] Document threshold behaviour and override mechanism
- [ ] Document PR/build summary generation
- [ ] Document business rules definition and testing
- [ ] Document troubleshooting self-analysis failures

Maintain and update these TODOs throughout implementation. Do not leave any item unfinished at completion.

---

## Section 2 — Self-Analysis Execution

### 2.1 Metric types to cover

Every metric type that is currently implemented in the project must be executed against the analyzer's own codebase. At minimum this covers:

| Metric | Description |
|---|---|
| Endpoint coverage | API endpoints defined vs. covered by tests |
| Parameter coverage | Query/path/header/body parameters covered by tests |
| Business coverage | Business rules referenced vs. tested |
| Integration flow coverage | Multi-step scenario flows covered |
| Error coverage | Error conditions and status codes covered |
| Security coverage | Security assertions in tests (auth, authz, injection, etc.) |
| Security scanning | SAST / secret / misconfiguration scanning (Semgrep, Trivy, ZAP, etc.) |
| Performance / resilience coverage | Latency, timeout, retry, circuit-breaker tests |
| Compatibility / contract coverage | Schema version and contract compatibility checks |
| Summary generation | PR and build summaries produced across all metrics |
| AI-friendly summaries | Machine-readable and LLM-compatible output where implemented |
| Any additional metric implemented | Must be included and must not be silently skipped |

### 2.2 Required self-analysis input artifacts

The following input artifacts must exist in the repository to support self-analysis. Create minimal but valid versions of any that are missing:

| Artifact | Purpose |
|---|---|
| OpenAPI spec(s) representing the analyzer's CLI/library API surface | Endpoint and parameter coverage input |
| Business rules definition file(s) | Business coverage input |
| Integration flow definition file(s) | Integration flow coverage input |
| Compatibility/contract sample spec(s) | Compatibility coverage input |
| Security scanning configuration | Security scan input |
| Performance/resilience test references or config | Performance coverage input |
| Test files (existing `tests/` directory) | All coverage metric inputs |

All input artifacts must be stored in predictable, documented locations.

### 2.3 Self-analysis configuration

Create a dedicated self-analysis configuration file, for example `coverage.self-analysis.json` or extend `coverage.config.json` with a `selfAnalysis` block.

This configuration must:
- Point to the correct input artifacts for each metric type
- Set thresholds to 100% for every metric by default
- Enable every applicable metric type
- Define output paths for all report artifacts
- Be fully documented

---

## Section 3 — Makefile

Create or update a **comprehensive Makefile** as the main entrypoint for self-analysis and CI usage.

### 3.1 Required targets

#### Setup and build
```make
install          # Install all dependencies
build            # Compile TypeScript and produce dist/
lint             # Run linter
clean            # Remove build artifacts, dist/, temp files
reports-clean    # Remove all generated reports and summaries
```

#### Testing
```make
test             # Run all test suites
test-unit        # Run unit tests only
test-integration # Run integration tests only
test-e2e         # Run Cypress / browser tests
test-smoke       # Run self-analysis smoke test
docs-build       # Build documentation site if applicable
```

#### Self-analysis per metric
```make
self-analysis-endpoint       # Run endpoint coverage against own repo
self-analysis-parameter      # Run parameter coverage against own repo
self-analysis-business       # Run business coverage against own repo
self-analysis-integration    # Run integration flow coverage against own repo
self-analysis-error          # Run error coverage against own repo
self-analysis-security       # Run security coverage against own repo
self-analysis-performance    # Run performance/resilience coverage against own repo
self-analysis-compatibility  # Run compatibility/contract coverage against own repo
```

#### Aggregated self-analysis
```make
self-analysis-all            # Run all metric types, produce all reports, apply all thresholds
```

#### Security scanning
```make
security-scan                # Run security scanner(s)
```

#### Summaries and reporting
```make
summary          # Generate summary files for all metrics into reports/
pr-summary       # Generate PR summary markdown
build-summary    # Generate build summary markdown
```

#### CI entrypoint
```make
ci               # install → build → test → self-analysis-all → summary → exit non-zero on any failure
```

### 3.2 Makefile quality requirements

- Use readable, documented variable names for all configurable paths and thresholds
- Every target must exit non-zero if the operation fails
- Targets must be composable: `ci` calls lower-level targets, not inlined shell commands
- The Makefile must be easy for humans and AI agents to read and extend
- Avoid duplicating logic already owned by the analyzer library (pass/fail logic lives in the library)
- Document each target with a `##` comment so `make help` can auto-print documentation

---

## Section 4 — CI Pipeline Updates

### 4.1 GitHub Actions

Update or create the main GitHub Actions workflow file(s) to:
- Install dependencies using `make install`
- Build the project using `make build`
- Run all tests using `make test`
- Run self-analysis using `make self-analysis-all`
- Generate summaries using `make summary`
- Upload all report artifacts from the `reports/` directory
- Post PR summaries if running on a pull request event
- Fail the workflow if the analyzer exits non-zero (threshold breach or test failure)

#### GitHub Actions requirements in detail

```yaml
# Required workflow steps (pseudocode representation)
- name: Install
  run: make install

- name: Build
  run: make build

- name: Unit Tests
  run: make test-unit

- name: Integration Tests
  run: make test-integration

- name: Self-Analysis (all metrics)
  run: make self-analysis-all

- name: Generate Summaries
  run: make summary

- name: Upload Reports
  uses: actions/upload-artifact@v4
  with:
    name: coverage-reports
    path: reports/

- name: Post PR Summary
  if: github.event_name == 'pull_request'
  # use the generated reports/pr-summary.md as the PR comment body

- name: E2E Tests
  run: make test-e2e
```

The workflow must not hand-parse analyzer output to determine pass/fail. The analyzer process exit code governs the workflow result.

### 4.2 Jenkins

Update the Jenkins example pipeline (e.g., `ci/Jenkinsfile.example`) so it:
- Calls the Makefile for all operations instead of scattered shell commands
- Archives all report artifacts from `reports/`
- Publishes HTML or markdown summaries using Jenkins plugins where applicable
- Fails the pipeline based on the analyzer process exit code
- Includes stages mirroring the GitHub Actions workflow

---

## Section 5 — PR and Build Summaries

Every metric type that runs during self-analysis must appear in the PR and build summaries.

### 5.1 Per-metric summary section

For each metric, the summary must include:

| Field | Description |
|---|---|
| Metric name | Human-readable name |
| What was analyzed | Brief description of the input (e.g., "OpenAPI spec: openapi.self-analysis.yaml") |
| Total items | Total endpoints / parameters / rules / flows / checks scanned |
| Covered items | Number passing the coverage requirement |
| Uncovered items | Number failing the coverage requirement |
| Coverage percent | Ratio as a percentage |
| Threshold | Configured threshold (default: 100%) |
| Status | PASS or FAIL |
| Top gaps | Up to 5 most critical uncovered items |
| Report path | Relative path or URL to the detailed report artifact |

### 5.2 Required summary sections

The PR/build summary must include a section for every metric that ran:

- Endpoint coverage
- Parameter coverage
- Business coverage
- Integration flow coverage
- Error coverage
- Security coverage
- Security scan results (zero criticals / zero highs / zero secrets gate)
- Performance / resilience coverage
- Compatibility / contract coverage
- Overall gate status (aggregated PASS / FAIL)

If a metric is enabled and ran, it must not be omitted from the summary. If a metric was disabled or did not run, its section is omitted.

### 5.3 Summary file outputs

| File | Description |
|---|---|
| `reports/pr-summary.md` | Markdown formatted for PR comment |
| `reports/build-summary.md` | Markdown formatted for CI build log |
| `reports/summary.json` | Machine-readable aggregated summary |
| `reports/ai-summary.md` | LLM-friendly summary if AI summaries are implemented |

---

## Section 6 — Threshold Enforcement

### 6.1 Default thresholds

The default self-analysis threshold must be set to **100% for every metric type**.

These defaults must be defined inside the analyzer/library itself and must apply when no override is configured.

### 6.2 Percentage-based metrics

The following metrics must each enforce a 100% threshold:

- Endpoint coverage
- Parameter coverage
- Business coverage
- Integration flow coverage
- Error coverage
- Security coverage
- Compatibility / contract coverage
- Any additional percentage-based metric implemented

### 6.3 Scanning-based metrics (non-percentage)

For metrics that are not expressed as a percentage, define an equivalent strict gate:

| Metric | Strict gate (equivalent to 100% pass) |
|---|---|
| Critical vulnerabilities | Zero allowed |
| High vulnerabilities | Zero allowed |
| Secrets detected | Zero allowed |
| High-severity misconfigurations | Zero allowed |
| Any other scanner finding category | Define zero-tolerance or document explicit threshold |

### 6.4 Gate enforcement rules

- Threshold enforcement logic must live **inside the analyzer library**, not in CI shell scripts
- The analyzer process must exit non-zero when any threshold is breached
- Even when thresholds fail, all reports and summaries must still be written before exit
- Threshold values must be configurable via the project's configuration file
- The 100% default must be applied when no threshold is set for a metric

---

## Section 7 — Report Generation

### 7.1 Per-metric report outputs

Every metric must produce the following outputs during self-analysis where the format is supported:

| Format | File pattern | Required |
|---|---|---|
| JSON report | `reports/{metric}-report.json` | Yes |
| HTML report | `reports/{metric}-report.html` | Yes |
| CSV summary | `reports/{metric}-summary.csv` | Where supported |
| JUnit XML | `reports/{metric}-junit.xml` | Where supported |
| AI-friendly markdown | `reports/{metric}-ai-summary.md` | Where implemented |

### 7.2 Aggregated outputs

| File | Description |
|---|---|
| `reports/self-analysis-all.json` | Combined JSON output from all metrics |
| `reports/pr-summary.md` | PR summary markdown |
| `reports/build-summary.md` | Build summary markdown |
| `reports/summary.json` | Machine-readable overall pass/fail and all metric results |

### 7.3 Stability requirements

- Report file names must be stable across runs so they can be referenced by CI artifact configs, docs, and dashboards
- Report paths must not include timestamps or random suffixes (use versioned or dated subdirectories only if explicitly configured)
- Reports must always be written, even when the quality gate fails

---

## Section 8 — Business Rules

### 8.1 Capability inventory

Enumerate all current analyzer capabilities and map each one to an explicit business rule.

### 8.2 Business rule schema

Each rule must include:

```json
{
  "id": "RULE-XXX",
  "title": "Human-readable title",
  "description": "What this rule requires or asserts",
  "category": "one of the defined categories",
  "acceptanceCriteria": [
    "Criteria item 1",
    "Criteria item 2"
  ],
  "linkedFeature": "optional reference to spec or source module"
}
```

### 8.3 Required rule categories

| Category | Description |
|---|---|
| `endpoint-coverage` | Rules governing endpoint scanning and coverage |
| `parameter-coverage` | Rules governing parameter scanning and coverage |
| `business-coverage` | Rules governing business logic coverage |
| `integration-coverage` | Rules governing integration flow coverage |
| `error-coverage` | Rules governing error handling coverage |
| `security-coverage` | Rules governing security test coverage |
| `security-scanning` | Rules governing SAST/secret/misconfiguration scanning |
| `performance-coverage` | Rules governing performance and resilience coverage |
| `compatibility-coverage` | Rules governing contract and schema compatibility |
| `summary-generation` | Rules governing PR/build summary output |
| `threshold-enforcement` | Rules governing quality gate and threshold logic |
| `self-analysis` | Rules governing the analyzer's ability to analyze itself |
| `reporting` | Rules governing report file generation and format |
| `docs-validation` | Rules governing documentation completeness |
| `dashboard-ai-summaries` | Rules governing AI/LLM-friendly summary output |
| `ci-integration` | Rules governing GitHub Actions and Jenkins integration |
| `github-pages` | Rules governing GitHub Pages publishing if implemented |
| `mcp-integration` | Rules governing MCP server integration if implemented |
| `plugin-behaviour` | Rules governing plugin loading and extension points |

### 8.4 Business rule completeness requirement

The business rules file must not leave any implemented capability unrepresented. If a feature exists in the codebase, a corresponding rule must exist in the rules file.

---

## Section 9 — Testing Requirements

### 9.1 Unit tests

Add or expand unit tests covering:

- Self-analysis configuration generation and validation
- Report generation per metric type
- Summary generation (PR and build)
- Quality gate and threshold enforcement logic (100% default, configurable override)
- Business rule file loading and schema validation
- Business rule completeness assertion (every capability has a rule)
- Metric aggregation logic
- Summary omission/inclusion logic (disabled metrics excluded, enabled metrics included)
- Makefile-invocable command logic where unit-testable

### 9.2 Integration tests

Add or expand integration tests covering:

- Running each metric individually against the repository
- Running all metrics together via `self-analysis-all`
- Generating all report files and verifying they exist
- Threshold failure behaviour: reports and summaries still written, process exits non-zero
- Pipeline-style execution: `ci` target produces all expected outputs
- Self-analysis end-to-end on project's own input artifacts

### 9.3 End-to-end and Cypress tests

Add or update browser/UI tests covering:

- Dashboard pages rendering self-analysis results correctly
- Each report page loading without errors
- AI summary panels displaying self-analysis content where implemented
- Summary pages correctly reflecting failed and passed gates
- Navigation between report pages working correctly
- Published/static report behaviour if GitHub Pages publishing is implemented

### 9.4 Smoke tests

Create a dedicated smoke test that:

- Runs the analyzer against its own codebase using the CLI or library API
- Verifies all major output files exist under `reports/`
- Verifies PR and build summaries are generated
- Verifies each expected metric section is present in the summaries
- Verifies the pass/fail result is correct given the configured thresholds
- Can be invoked via `make test-smoke`

### 9.5 Business rule tests

Create tests specifically targeting the business rules layer:

- Rule file is valid JSON/YAML and parses without errors
- All required fields are present on every rule
- Every defined rule category is represented
- Core analyzer features are represented by at least one rule each
- Summary and coverage logic produces output consistent with rule expectations
- Gate logic behaves as described by threshold-enforcement rules

### 9.6 Test quality requirements

- All tests must pass before the task is considered complete
- Failing tests must not be skipped or disabled to claim completion
- Test failures must produce clear diagnostic output
- Tests must be deterministic: they must not rely on external network calls or non-reproducible state

---

## Section 10 — Documentation

### 10.1 Files to update

| File | Updates required |
|---|---|
| `README.md` | Self-analysis overview, quick-start for local self-analysis, link to detailed docs |
| `docs/guides/self-analysis.md` | Full self-analysis guide (create if absent) |
| `docs/guides/makefile.md` | All Makefile targets documented (create if absent) |
| `docs/guides/thresholds.md` | Threshold configuration, defaults, override mechanism (create if absent) |
| `docs/guides/ci-integration.md` | GitHub Actions and Jenkins setup updated to reflect self-analysis |
| `docs/guides/business-rules.md` | How rules are defined, tested, and extended (create if absent) |
| `docs/guides/troubleshooting.md` | Troubleshooting self-analysis failures (create or update) |
| `docs/implementation/self-analysis-rollout.md` | Detailed rollout tracking (create as part of TODO system) |

### 10.2 Documentation quality requirements

All documentation must be:

- **Concise** — no unnecessary filler text
- **Structured** — consistent heading hierarchy
- **AI-friendly** — section names are deterministic and parseable by LLMs
- **Accurate** — reflects actual implemented behaviour, not aspirational
- **Complete** — covers all features it claims to document

Each documentation page must include:

- A clear top-level `## Overview` or `## Purpose` section
- A `## Usage` or `## How to run` section with concrete commands
- A `## Configuration` section where applicable
- A `## Troubleshooting` section where applicable

---

## Section 11 — Implementation Quality Standards

The implementation must adhere to the following standards:

| Standard | Requirement |
|---|---|
| No duplicated CI logic | Threshold pass/fail lives in the library, not in shell scripts or workflow steps |
| Stable report paths | Report file names are fixed and documented |
| Makefile as central path | CI pipelines call Makefile targets, not ad-hoc commands |
| No brittle shell parsing | Pipelines use process exit codes, not output string matching |
| Failures produce reports | Reports and summaries are always written, even on gate failure |
| All metrics in summaries | Every enabled metric that ran appears in PR and build summaries |
| Thresholds are configurable | Defaults are 100% but are overridable via config file |
| Consistent naming | Metric names, report file names, and config keys use consistent naming across all contexts |

---

## Section 12 — Acceptance Criteria

This specification is complete only when **all** of the following are true:

### Self-analysis
- [ ] The analyzer runs against its own codebase
- [ ] All available metric types are executed in self-analysis mode
- [ ] All required self-analysis input artifacts exist in the repository

### Makefile
- [ ] A comprehensive Makefile exists with all required targets
- [ ] `make ci` installs, builds, tests, runs self-analysis-all, generates summaries, and exits non-zero on failure
- [ ] `make self-analysis-all` runs all metrics, produces all reports, applies all thresholds
- [ ] `make clean` and `make reports-clean` remove the correct artifacts

### CI Pipelines
- [ ] GitHub Actions workflow is updated and calls the Makefile
- [ ] Jenkins example pipeline is updated and calls the Makefile
- [ ] PR summaries are posted automatically on pull request events
- [ ] Pipelines fail based on analyzer exit code only

### Reporting
- [ ] Every metric produces its JSON, HTML, and applicable format report files
- [ ] Every metric appears in `reports/pr-summary.md` and `reports/build-summary.md`
- [ ] `reports/summary.json` contains aggregated pass/fail for all metrics

### Thresholds
- [ ] Default threshold is 100% for all percentage metrics
- [ ] Scanning metrics have a zero-tolerance gate defined
- [ ] Build fails automatically when any threshold is breached
- [ ] Threshold enforcement logic lives inside the library
- [ ] Thresholds are configurable via the config file

### Business Rules
- [ ] Business rules reflect all analyzer capabilities
- [ ] Every rule has a stable id, title, description, acceptance criteria, and category
- [ ] All required rule categories are populated

### Testing
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All Cypress / end-to-end tests pass
- [ ] Smoke test passes
- [ ] Business rule tests pass
- [ ] No tests are skipped or disabled to claim passing

### Documentation
- [ ] `README.md` is updated with self-analysis information
- [ ] All required docs guides are created or updated
- [ ] `TODO.self-analysis.md` is complete with no open items
- [ ] `docs/implementation/self-analysis-rollout.md` reflects final state

---

## Section 13 — Execution Rules for the Implementing Agent

Work iteratively across all sections. Do not stop early.

For each area:
1. Inspect the current implementation
2. Add or update TODO items in `TODO.self-analysis.md`
3. Implement the required changes
4. Run the relevant tests
5. Fix all failures
6. Update docs to reflect the changes
7. Re-run the full test suite

At the end of implementation:
1. All TODOs must be marked complete
2. Full test suite must pass with no skips
3. Full self-analysis must run without errors
4. All report files must exist under `reports/`
5. PR and build summaries must include every metric
6. Build must fail when any metric is below 100% (verify this explicitly)
7. All documentation must be current and accurate

Do not declare completion until every acceptance criterion in Section 12 is satisfied.
