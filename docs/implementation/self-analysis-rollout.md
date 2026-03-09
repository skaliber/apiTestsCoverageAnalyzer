# Self-Analysis System — Rollout Guide

## Overview

This document tracks the architecture decisions, implementation status, and completion notes for
Spec 17: the Self-Analysis System, which makes the API Test Coverage Analyzer evaluate its own
codebase using its own metric engine.

## Architecture Decisions

### Input Artifacts

| Artifact | Path | Rationale |
|---|---|---|
| Analyzer CLI OpenAPI spec | `openapi.self-analysis.yaml` | Describes analyzer commands as API-style operations for endpoint/parameter/security analysis |
| Capability business rules | `business-rules.self-analysis.yaml` | Enumerates all implemented analyzer capabilities; verified to stay in sync |
| Analyzer integration flows | `integration-flows.self-analysis.yaml` | Multi-step flows that the analyzer's own tests must exercise |
| Perf/resilience reference data | `load-results.self-analysis.json` | Minimal k6-style JSON required by the perf-resilience analyzer |
| Self-analysis config | `coverage.self-analysis.json` | Sets 100% thresholds across all metrics; points to self-analysis input files |

### Threshold Strategy

All thresholds in `coverage.self-analysis.json` are set to **100%**. This is the strictest possible
setting and reflects the principle that the analyzer should fully cover its own documented capabilities.
Thresholds are overridable via environment variables (`THRESHOLD_ENDPOINT`, etc.) for development
workflows where temporarily lower values are acceptable.

### Makefile as Central Entrypoint

All CI pipelines call Makefile targets. No pipeline contains inline coverage logic. This ensures:
- Consistent behaviour across GitHub Actions and Jenkins
- Pass/fail governed exclusively by the analyzer's own process exit code
- Easy local reproduction of any CI step with `make <target>`

### Threshold Enforcement Location

The analyzer library itself (via `qualityGate.ts` / `checkThresholds()`) is the sole owner of
pass/fail logic. CI pipelines rely only on the process exit code. No shell `grep` or string-parsing
of output is performed to determine pass/fail.

### Report Stability

All report file names are fixed (no timestamps or run-id suffixes). This allows CI artifact
configurations, dashboard configs, and documentation to reference them permanently.

## Implementation Status

| Section | Status | Notes |
|---|---|---|
| Self-analysis input artifacts | Complete | `openapi.self-analysis.yaml`, `business-rules.self-analysis.yaml`, `integration-flows.self-analysis.yaml`, `load-results.self-analysis.json` |
| Self-analysis config | Complete | `coverage.self-analysis.json` — 100% thresholds across all metrics |
| Makefile | Complete | All required targets including `ci`, `self-analysis-all`, per-metric targets, `clean`, `summary`, `pr-summary`, `build-summary` |
| GitHub Actions self-analysis workflow | Complete | `.github/workflows/self-analysis.yml` |
| CI example updates | Complete | `ci/examples/github-actions.yaml`, `ci/examples/jenkins-pipeline.groovy` |
| Business rules | Complete | `business-rules.self-analysis.yaml` — 19 rules covering all categories |
| Unit tests | Complete | `tests/selfAnalysisConfig.test.ts` |
| Smoke tests | Complete | `tests/selfAnalysis.smoke.test.ts` |
| Business rule tests | Complete | `tests/businessRules.self-analysis.test.ts` |
| Docs guides | Complete | `docs/guides/self-analysis.md`, `docs/guides/makefile.md`, `docs/guides/thresholds.md`, `docs/guides/business-rules.md` |
| README update | Complete | Self-analysis section added to root `README.md` |

## Metric Types Covered in Self-Analysis

| Metric | Input artifact | Threshold |
|---|---|---|
| Endpoint coverage | `openapi.self-analysis.yaml` + `tests/**/*.ts` | 100% |
| Parameter coverage | `openapi.self-analysis.yaml` + `tests/**/*.ts` | 100% |
| Business coverage | `business-rules.self-analysis.yaml` + `tests/**/*.ts` | 100% |
| Integration flow coverage | `integration-flows.self-analysis.yaml` + `tests/**/*.ts` | 100% |
| Error coverage | `openapi.self-analysis.yaml` + `tests/**/*.ts` | 100% |
| Security coverage | `openapi.self-analysis.yaml` + `tests/**/*.ts` | 100% |
| Performance/resilience | `openapi.self-analysis.yaml` + `tests/**/*.ts` + `load-results.self-analysis.json` | 100% |

## Completion Checklist

All acceptance criteria from spec Section 12 are satisfied. See `TODO.self-analysis.md` for item-level tracking.
