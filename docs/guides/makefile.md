# Makefile Reference

## Overview

The repository root `Makefile` is the central entrypoint for all development, CI, and
self-analysis workflows. CI pipelines call Makefile targets — no pipeline contains inline
coverage logic. Threshold enforcement is delegated to the analyzer library.

## How to run

```bash
make help                # Print all targets with descriptions
make ci                  # Full CI pipeline
make self-analysis-all   # Run all metrics against this repository
make test                # Run all tests
```

## Configurable variables

Override on the command line with `make VAR=value`:

| Variable | Default | Description |
|---|---|---|
| `NODE` | `node` | Node.js executable |
| `NPM` | `npm` | npm executable |
| `ANALYZER_CMD` | `node dist/src/index.js` | Analyzer CLI command |
| `SELF_SPEC` | `openapi.self-analysis.yaml` | OpenAPI spec for self-analysis |
| `SELF_TESTS` | `tests/**/*.ts` | Test glob for self-analysis |
| `SELF_RULES` | `business-rules.self-analysis.yaml` | Rules file for self-analysis |
| `SELF_FLOWS` | `integration-flows.self-analysis.yaml` | Flows file for self-analysis |
| `SELF_LOAD` | `load-results.self-analysis.json` | Load results for perf analysis |
| `REPORTS_DIR` | `reports` | Output directory for report files |
| `FORMATS` | `json,html,csv,junit` | Output formats |

## Setup and build targets

| Target | Description |
|---|---|
| `install` | `npm ci --ignore-scripts` |
| `build` | `npm run build` — compiles TypeScript → `dist/` |
| `lint` | Run ESLint (skipped gracefully if no lint script) |
| `clean` | Remove `dist/`, `node_modules/.cache`, `.nyc_output` |
| `reports-clean` | Remove all files from `reports/` |

## Testing targets

| Target | Description |
|---|---|
| `test` | Run all test suites |
| `test-unit` | Run unit tests only (excludes integration, smoke) |
| `test-integration` | Run integration tests only |
| `test-e2e` | Run Cypress tests (docs + dashboard) |
| `test-smoke` | Run self-analysis smoke test |
| `docs-build` | Build VitePress documentation site |

## Self-analysis per metric

These targets each run the named metric against the repository's own source and tests.
All use 100% thresholds by default.

| Target | Metric |
|---|---|
| `self-analysis-endpoint` | Endpoint coverage |
| `self-analysis-parameter` | Parameter coverage |
| `self-analysis-business` | Business rule coverage |
| `self-analysis-integration` | Integration flow coverage |
| `self-analysis-error` | Error scenario coverage |
| `self-analysis-security` | Security control coverage |
| `self-analysis-performance` | Performance/resilience coverage |
| `self-analysis-compatibility` | Compatibility/contract coverage |

## Aggregated self-analysis

| Target | Description |
|---|---|
| `self-analysis-all` | Runs all 8 metric types + intelligence engine. Produces all report files. Exits non-zero if any metric is below threshold. |

## Security scanning

| Target | Description |
|---|---|
| `security-scan` | Runs Trivy and Semgrep if installed, then enforces the security gate (zero criticals, zero secrets). Gracefully skips individual scanners that are not installed. |

## Summary and reporting

| Target | Description |
|---|---|
| `summary` | Runs the intelligence engine to produce `reports/coverage-intelligence.json` |
| `pr-summary` | Generates `reports/pr-summary.md` with all metric results |
| `build-summary` | Generates `reports/build-summary.md` for CI build logs |

## CI entrypoint

| Target | Description |
|---|---|
| `ci` | Full pipeline: `install` → `build` → `test` → `self-analysis-all` → `summary`. Exits non-zero on any failure. |

## Quality standards

- Every target exits non-zero if the operation fails.
- `ci` calls lower-level targets; it does not inline shell commands.
- Threshold pass/fail logic lives inside the analyzer library — the Makefile only interprets
  the process exit code.
- Reports are always written, even when a threshold is breached.
