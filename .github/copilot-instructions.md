# API Test Coverage Analyzer — AI Agent Instructions

## Core Working Style

Treat this as a **production-grade developer tool**, not a demo. Prefer root-cause fixes over superficial patches. Do not leave partial implementations, dead code, placeholder logic, or broken intermediate states. If a feature spans CLI, library, dashboard, CI, docs, and tests — complete it across **all affected layers**.

## Completion Standard

A task is **not complete** unless all of the following are true:

1. Implementation is finished end-to-end
2. All impacted tests are updated and pass
3. `make build` succeeds with no TypeScript errors
4. Documentation is updated if behaviour changed
5. CI/reporting behaviour is updated if affected
6. Any new config, report, summary, or UI behaviour is covered by tests

Do not stop after code compiles. Do not stop after unit tests only. Do not stop after "main path works."

## Required Commands — Run Before Marking Done

```bash
make build             # tsc → dist/ — must be clean
make test              # Jest full suite (1400+ tests) — all must pass
make test-unit         # Unit tests only (faster iteration)
make self-analysis-all # Run all 8 metrics against this repo — regression check
make summary           # coverage-intelligence + coverage-summary-report
make ci                # Full pipeline: install → build → test → self-analysis → summary
```

Evaluate and run whichever layers are applicable after any change: unit, integration, Cypress/e2e, docs build, self-analysis, config validation, dashboard rendering, report generation. If a test layer exists and is affected — run it.

## Architecture Overview

This project is a **CLI + library** that measures API test coverage across 8 metric types: `endpoint`, `parameter`, `business`, `integration`, `error`, `security`, `performance`, `compatibility`. The project **analyzes itself** — all 8 metrics run against this codebase at 100% threshold in CI.

**Key source directories:**
- `src/` — CLI (`src/index.ts`), one module per coverage type, `src/summary/`, `src/intelligence/`, `src/security/`
- `tests/` — Jest suites mirroring `src/` layout
- `dashboard/` — React/Vite visualization app (reads `reports/` JSON)
- `reports/` — Generated output; never edit manually

## Core Data Flow

```
config.yaml → [analyzer command] → CoverageResult → writeJson() merge
                                                          ↓
                                           reports/coverage-summary.json
                                                          ↓
                             coverage-intelligence → findings + recommendations
                                                          ↓
                             coverage-summary-report → build-summary.md, pr-summary.md
```

`writeJson()` (`src/reporting.ts`) **merges** rather than overwrites — each of the 8 sequential commands accumulates its result into `coverage-summary.json`.

## Critical Conventions

**MetricStatus** (`src/summary/summaryTypes.ts`) — four valid states, evaluated in order:

| Condition | Status |
|---|---|
| Type not in results | `SKIPPED` |
| `totalItems === 0` | `N/A` — even with threshold configured |
| No threshold configured | `N/A` |
| Threshold met | `PASS` |
| Threshold missed | `FAIL` |

`⚠️ PASS` **does not exist**. `totalItems === 0` is always `N/A`, never `PASS`. No ambiguous statuses (e.g. `0% PASS`, `warning + pass`).

**`evaluateMetrics(results, thresholds, qualityGate)`** (`src/summary/evaluateMetrics.ts`) — always returns all 9 known types in canonical order (endpoint → parameter → business → integration → error → security → performance → resilience → compatibility), plugin types appended at end. Always use this to build status tables — never compute status inline.

**`config.yaml` is the single source of truth** for thresholds, quality gate, and scan settings. CLI `--threshold-*` flags are deprecated. Load via `loadCentralConfig(configPath?)` from `src/config.ts`. Route new behaviour through the central config model; do not introduce scattered config files.

**`CoverageResult` shape** — `{ type, totalItems, coveredItems, coveragePercent, details }`. The `details` field is type-specific and used by both the dashboard and the intelligence linkage engine.

## Summary Engine

- `src/summary/buildSummary.ts` — full build/CI markdown; includes interpretation section via `renderInterpretationSection()`
- `src/summary/prSummary.ts` — compact PR comment table
- `src/summary/markdownRenderer.ts` — shared primitives (`metricStatusCell`, `pct`, `tableRow`, `extractGaps`, `renderInterpretationSection`)
- Both summary generators use `evaluateMetrics()` for the status column; **never** compute status inline

## Intelligence Engine

`src/intelligence/` — linkage engine maps coverage gaps → `FunctionalFinding[]` → `MissingTestRecommendation[]` with risk scores 0–100. Outputs are read by `CoverageIntelligencePage.tsx` in the dashboard and included in `build-summary.md`.

## Adding a New Coverage Metric Type

1. Add `src/<type>Coverage.ts` exporting `parse*`, `analyze*`, `build*Report`, `generate*Reports`
2. Register a CLI command in `src/index.ts` (follow the `error-coverage` pattern)
3. Add `<type>` to `KNOWN_METRIC_TYPES` in `src/summary/summaryTypes.ts`
4. Add a title in `coverageTypeTitle()` in `src/summary/markdownRenderer.ts`
5. Add a `normalizeDetailsForIntelligence()` case in `src/index.ts`
6. Add a self-analysis Make target and include it in `self-analysis-all`
7. Update `config.yaml`, docs, business rules, and relevant tests

## Coverage and Gates Policy

- Thresholds and gate enforcement belong in the library, not ad hoc shell logic.
- Summaries must include **all** metrics — not a subset.
- Self-analysis must pass at 100% on all implemented metrics.
- If changes affect reports, summaries, dashboard pages, or PR comments: update renderers, regenerated outputs, and browser/e2e tests.

## Testing Patterns

Fixture helpers (`makeResult`, `makeGate`) build `CoverageResult` and `QualityGateResult` objects. Tests assert on rendered markdown strings, not internal state. Key test files: `tests/evaluatedMetrics.test.ts` (MetricStatus logic), `tests/summary.test.ts` (PR/build rendering), `tests/buildSummary.test.ts`.

## Self-Analysis Expectations

If changes affect metrics, reports, gates, or summaries: run `make self-analysis-all` and verify it completes at 100% on all metrics. Never leave self-analysis failing or producing incomplete outputs.

## File Hygiene

Do not create duplicate files with slightly different purposes. Remove obsolete code when safe. Keep naming stable. If a new canonical file replaces an old one, migrate all callers.

## When in Doubt

If unsure whether a test suite, doc page, report, or config path is affected — assume it **is** and verify it. The correct default: implement fully → test broadly → update docs → verify outputs → only then consider the task complete.

## Test Generation Engine (Feature 28)

`src/generation/` — generates test scaffolds from coverage gaps.

**Key files:**
- `src/generation/engine.ts` — main `TestGenerationEngine` class
- `src/generation/template-renderer.ts` — renders test code for each language/framework/test type
- `src/generation/context-builder.ts` — assembles `GenerationContext` from gap + endpoint data
- `src/generation/file-router.ts` — computes output file paths from gap context
- `src/generation/quality-scorer.ts` — scores existing tests on 5 dimensions (0–100)
- `src/generation/ai-flow-exporter.ts` — produces `ai-ready-flows.md` and `ai-ready-flows.json`
- `src/generation/gap-extractor.ts` — reads coverage-summary.json and extracts gap objects

**CLI commands:**
- `generate-tests` — generate test scaffolds for detected gaps
- `export-ai-flows` — export AI-ready flow documentation
- `score-tests` — score quality of existing test suite

## Test Generation Rules — Non-Negotiable

When implementing or modifying `src/generation/`:

1. **Generated files ALWAYS start with the AUTO-GENERATED comment block** — gapId, risk, priority.
2. **Placeholder values ALWAYS have TODO comments** — auth tokens, URLs, test data.
3. **Auth tests ALWAYS generated** for auth-required endpoints — never skipped.
4. **Status code assertion BEFORE body assertion** in every generated test.
5. **No weak assertions** — never `toBeTruthy()`, always specific matchers.
6. **Generated TypeScript MUST compile** — run `tsc --noEmit` on generated output in tests.
7. **Cypress tests go in `cypress/e2e/generated/`** — never in root `cypress/e2e/`.
8. **Security test IDs in labels** — `[SEC-AUTH-01]`, `[SEC-INJ-01]` etc.
9. **Injection tests use `not.toBe(500)`** as primary assertion — a 500 is always a defect.
10. **AI prompt max 800 tokens** — split into multiple prompts if needed.

**AI Flow Export Rules (RULE-AI01–AI06) — applied to `src/generation/ai-flow-exporter.ts`:**

- RULE-AI01 — `suggestedOutputPath` MUST be an exact, relative file path (e.g. `generated-tests/api-users-post.test.ts`). Never a directory. Never abstract.
- RULE-AI02 — Each `copilotPrompt` MUST reference the import path (`import { app } from 'src/app'`). Never leave the import for the user to guess.
- RULE-AI03 — Each `copilotPrompt` MUST list ALL missing test cases (happy path + auth + error scenarios). Do not summarise.
- RULE-AI04 — Each `copilotPrompt` MUST reference `existingSimilarTests[0]` if available: "Follow the pattern in `tests/xxx.test.ts`".
- RULE-AI05 — Each `copilotPrompt` MUST be ≤ 800 tokens (~3200 characters). If longer, truncate at the last complete sentence before the limit.
- RULE-AI06 — All `copilotPrompt` content MUST be written in English, regardless of project locale settings.

When adding a new coverage metric type, also:
8. Add a gap-to-generator mapping entry in `src/generation/engine.ts` `GAP_GENERATOR_MAP`
9. Add rendering logic in `src/generation/template-renderer.ts` for the new test type
10. Add quality scorer rules for the new test type in `src/generation/quality-scorer.ts`

**Copilot constraints for `src/generation/`:**
- DO NOT change `GenerationContext` interface without updating all rendering functions that use it.
- DO NOT add logic to templates — all intelligence lives in the renderer functions and `ContextBuilder`.
- DO NOT generate tests that import from `dist/` — always import from `src/`.
- DO NOT hardcode language detection in the engine — always read from `discoveryInfo`.
- DO NOT write files outside `generation.outputDir` without explicit user config.
