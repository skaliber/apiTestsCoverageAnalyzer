# Self-Analysis

## Overview

The API Test Coverage Analyzer is a **self-analyzing system**: on every build it runs all
implemented metric types against its own codebase, enforces 100% thresholds, and fails the
build automatically if any metric falls below the configured threshold.

This document describes how to run self-analysis locally and in CI.

## How it works

Self-analysis uses three types of input artifacts:

| Artifact | Path | Purpose |
|---|---|---|
| OpenAPI spec | `openapi.self-analysis.yaml` | Represents the analyzer's CLI/library API surface |
| Business rules | `business-rules.self-analysis.yaml` | One rule per documented analyzer capability |
| Integration flows | `integration-flows.self-analysis.yaml` | Multi-step scenarios the tests must exercise |
| Perf data | `load-results.self-analysis.json` | k6-style reference data for performance metric |
| Config | `coverage.self-analysis.json` | 100% thresholds across all metric types |

All thresholds are set to 100% in `coverage.self-analysis.json`. The build fails automatically
when any threshold is breached. No CI shell logic is needed to determine pass/fail — the analyzer
process exit code governs the result.

## How to run

### Local — single metric

```bash
make self-analysis-endpoint    # endpoint coverage only
make self-analysis-business    # business rule coverage only
make self-analysis-security    # security coverage only
```

### Local — all metrics

```bash
make self-analysis-all         # runs all 8 metric types + intelligence engine
```

Reports are written to `reports/` after each run.

### Full CI pipeline locally

```bash
make ci    # install → build → test → self-analysis-all → summary
```

## Configuration

Self-analysis is configured in `coverage.self-analysis.json`:

```json
{
  "thresholds": {
    "endpoint": 100,
    "parameter": 100,
    "business": 100,
    "integration": 100,
    "error": 100,
    "security": 100,
    "performance": 100,
    "resilience": 100
  },
  "selfAnalysis": {
    "spec": "openapi.self-analysis.yaml",
    "tests": "tests/**/*.ts",
    "rules": "business-rules.self-analysis.yaml",
    "flows": "integration-flows.self-analysis.yaml"
  }
}
```

Override individual thresholds via environment variables:

```bash
THRESHOLD_ENDPOINT=90 make self-analysis-endpoint
```

## Input artifacts

### openapi.self-analysis.yaml

Models the analyzer's public library functions and CLI commands as OpenAPI paths. Each path
(`/analyze/endpoints`, `/analyze/security`, etc.) corresponds to a function in `src/lib/index.ts`.
This allows the analyzer to check its own endpoint, parameter, error, and security coverage.

### business-rules.self-analysis.yaml

Contains 19 rules (RULE-001 through RULE-019), one per documented analyzer capability:
endpoint coverage, parameter coverage, business coverage, integration coverage, error coverage,
security coverage, security scanning, performance/resilience, compatibility, summary generation,
threshold enforcement, self-analysis, reporting, CI integration, AI summaries, plugin behaviour,
MCP integration, configuration loading, and GitHub Pages publishing.

### integration-flows.self-analysis.yaml

Five multi-step flows (SA-FLOW001–SA-FLOW005) that describe the key usage sequences:
- Run single metric and enforce threshold
- Run all metrics and generate aggregated summary
- Threshold failure still produces reports
- Load config, run analysis, generate intelligence
- Security scan and gate enforcement

## Troubleshooting

### "Coverage below 100% threshold" failure

The self-analysis threshold is always 100%. If a metric falls below 100%, identify which
capability is not covered by looking at the report file:

```bash
cat reports/endpoint-report.json | jq '.uncoveredItems'
```

Add or update tests to cover the gap, then re-run:

```bash
make self-analysis-all
```

### Missing input artifact

If an artifact file is missing, the relevant analyzer command will exit non-zero. Run
`make self-analysis-all` with `VERBOSE=1` to see the exact command being executed.

### Build succeeded but reports are empty

Ensure `make build` ran successfully before `make self-analysis-all`. The analyzer reads from
`dist/src/index.js` which must exist.
