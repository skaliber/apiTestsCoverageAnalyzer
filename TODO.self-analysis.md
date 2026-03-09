# TODO: Self-Analysis System — Spec 17

Active development checklist. All items must be completed before spec 17 is closed.

## A. Self-Analysis Execution

- [x] Identify all analyzer metric types currently implemented
- [x] Define self-analysis input files (OpenAPI spec, test files, rules, flows, contracts, security configs)
- [x] Define self-analysis configuration per metric type (`coverage.self-analysis.json`)
- [x] Ensure every metric can run against this repository
- [x] Create missing minimal artifacts needed for self-analysis
  - [x] `openapi.self-analysis.yaml` — CLI/library API surface
  - [x] `business-rules.self-analysis.yaml` — capability rules
  - [x] `integration-flows.self-analysis.yaml` — multi-step analyzer flows
  - [x] `load-results.self-analysis.json` — perf/resilience reference data

## B. Build and Make Targets

- [x] Create `Makefile` with all required targets
- [x] Create aggregated `self-analysis-all` target
- [x] Create `ci` target (install → build → test → self-analysis-all → summary → exit non-zero on failure)
- [x] Create `clean`, `reports-clean`, and `summary` targets
- [x] Validate all targets exit non-zero on failure

## C. Pipeline Integration

- [x] Create `.github/workflows/self-analysis.yml` using Makefile
- [x] Update `ci/examples/github-actions.yaml` to use Makefile
- [x] Update `ci/examples/jenkins-pipeline.groovy` to use Makefile
- [x] Ensure PR summaries include all metric outputs
- [x] Ensure build fails based on analyzer process exit code

## D. Reporting

- [x] `reports/{metric}-report.json` per metric
- [x] `reports/{metric}-report.html` per metric
- [x] `reports/pr-summary.md`
- [x] `reports/build-summary.md`
- [x] `reports/summary.json` (aggregated)
- [x] `reports/self-analysis-all.json`

## E. Business Rules

- [x] Inventory all current analyzer capabilities
- [x] Convert capabilities into `business-rules.self-analysis.yaml` with stable IDs
- [x] Validate each rule has: id, title, description, acceptanceCriteria, category
- [x] All required categories populated

## F. Testing

- [x] Unit tests: self-analysis config validation, quality gate 100% default, business rule schema
- [x] Integration / smoke test (`tests/selfAnalysis.smoke.test.ts`)
- [x] Business rule schema tests (`tests/businessRules.self-analysis.test.ts`)
- [x] Dashboard Cypress tests: pages load, navigation works

## G. Docs

- [x] `docs/guides/self-analysis.md`
- [x] `docs/guides/makefile.md`
- [x] `docs/guides/thresholds.md`
- [x] `docs/guides/business-rules.md`
- [x] Update `docs/guide/ci-cd.md`
- [x] Update `docs/guide/troubleshooting.md`
- [x] Update `README.md`
- [x] `docs/implementation/self-analysis-rollout.md`
