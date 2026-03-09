# Spec 21 — Gap Analysis and AI Agent Completion Prompt

This document records the results of a branch review comparing `feature/implement-ast` against `main` and evaluating conformance with **Spec 21: Enable AST Scanning**.

Use the **AI Agent Prompt** in Section 3 to drive a follow-up agent session that closes every remaining gap.

---

## 1. What the Branch Got Right

The following items from Spec 21 are fully implemented and meet the spec requirements.

### Architecture (Spec §3, §4)

- `src/ast/` exists with all 6 core files: `parserRegistry.ts`, `parseFile.ts`, `astTypes.ts`, `languageCapabilities.ts`, `languageAnalyzer.ts`, `astAnalysisOrchestrator.ts`
- `LanguageAnalyzer` interface implemented exactly as specified — all optional methods present
- Two-tier cascade: AST primary → regex fallback only on parse error or when language is disabled
- `registerAllAnalyzers()` bootstrapped at `src/index.ts` line 103

### Language Coverage (Spec §2)

All 6 required languages and Cucumber are implemented:

| Language | Parser | Semantic Features |
|---|---|---|
| Java | tree-sitter-java | Symbol table, enums, constants, assertions, business rule refs, Cucumber step tracing |
| Kotlin | tree-sitter-kotlin | Ktor DSL, enums, assertions, builder patterns |
| Python | tree-sitter-python | Constants, f-string resolution, decorators |
| Ruby | tree-sitter-ruby | Constants, `#{}` interpolation, RSpec block resolution, Cucumber steps |
| JavaScript | typescript-estree | Full call graph, wrapper tracing, template literals, assertions, business/flow refs |
| TypeScript | typescript-estree | Extends JavaScript analyzer with full TS syntax support |
| Cucumber | Regex fallback | Feature file parsing, step definition tracing for Java/Kotlin/Ruby step backends |

### Semantic Model (Spec §5)

`astTypes.ts` defines and all analyzers produce:
- Local variables, constants, enums, string literals, string interpolation/concatenation
- Method/function calls, request builder patterns, helper/wrapper functions
- Response/assertion linkage, basic call graph traversal

### Confidence and Resolution Types (Spec §13)

11 resolution types implemented: `direct`, `constant`, `enum`, `string-template`, `interpolated-path`, `wrapper-method`, `request-builder`, `client-mapping`, `client-abstraction`, `cucumber-step`, `heuristic`

3 confidence levels: `high`, `medium`, `low`

### Report Metadata (Spec §17)

Every `ResolvedHttpInteraction` carries: `sourceLanguage`, `resolutionType`, `confidence`, `assertionLinked`, `assertionType`, `rawCall`

### Configuration (Spec §16)

`config.yaml` has the full `analysis.ast` block with `enabled`, `maxCallDepth`, `assertionAware`, and per-language toggles.

### Unit and Integration Tests (Spec §19 — partial)

- Language-specific unit tests: `tests/languages/{java,kotlin,python,ruby,javascript,typescript}/`
- Orchestrator tests: `tests/ast/`
- Integration test: `tests/integration/ast/coverage.integration.test.ts`

### Examples (Spec §18)

8 multi-language example projects covering Java, Kotlin, Python, Ruby, JavaScript, TypeScript, Cucumber-Ruby, Cucumber-Java.

---

## 2. Identified Gaps

These items are not complete or deviate from Spec 21.

### GAP-1 — Spec §15 Violated: fallbackHeuristics Removed Rather Than Preserved

**Spec requirement (§15):**
> Implement a hybrid architecture: AST + semantic analysis first → fallback heuristics where AST resolution is incomplete → confidence scoring to reflect weaker matches. Do not remove all text/regex heuristics blindly. Fallback heuristics must be clearly marked as lower confidence.

**What the branch did (commit `a30d4dd`):**
Removed `fallbackHeuristics` from config entirely. The commit message states "AST result is authoritative" — meaning if AST finds 0 results, the analyzer returns 0 even when regex may have found real coverage.

**Impact:** Non-zero risk of coverage regression for files where AST parsing succeeds but the semantic extractor misses calls. Spec explicitly requires the fallback to exist and be clearly marked lower confidence, not eliminated.

**Fix required:** Restore the `fallbackHeuristics` config field (defaulting to `true`). When AST parsing succeeds but yields 0 HTTP interactions, run the regex fallback and tag results with `resolutionType: 'heuristic'` + `confidence: 'low'`. When AST yields ≥1 interactions, skip the regex pass entirely. Update config types, default config, `astAnalysisOrchestrator.ts`, and all affected tests and docs.

---

### GAP-2 — Spec §7: Parameter Coverage Not AST-Integrated

**Spec requirement (§7):**
> The parameter coverage engine must become AST/semantic-aware. Must support detecting parameter scenarios (valid, invalid, missing, boundary, null, malformed, oversized, invalid enum, missing required) even when request bodies are built through builders, helpers, payload factories, dictionaries/maps, typed DTOs, fixture generators.

**Current state:** `src/parameterCoverage.ts` exists but uses text-based pattern detection. The AST layer (`src/ast/`) is not wired into the parameter coverage pipeline.

**Fix required:** Wire `astAnalysisOrchestrator.analyzeFile()` into the parameter coverage engine. Use `ResolvedHttpInteraction.parameterScenarios` and the semantic model's request body shapes to detect parameter test intent. Replace or augment naive status-code text search with semantic inference.

---

### GAP-3 — Spec §10: Error Coverage Not AST-Integrated

**Spec requirement (§10):**
> Error coverage must detect negative scenarios from: invalid request builders, missing field construction, invalid enum/type creation, unauthenticated requests, nonexistent IDs, malformed payloads, assertion chains validating error responses. Must infer scenario category (missing parameter, invalid parameter, unauthorized, forbidden, not found, conflict, server error, validation error).

**Current state:** `src/errorCoverage.ts` relies on text scanning. AST semantic layer not connected.

**Fix required:** Integrate `ResolvedHttpInteraction` data (resolutionType, confidence, assertionType) into the error coverage pass so semantic error scenarios surfaced by language analyzers are used for classification instead of or alongside regex patterns.

---

### GAP-4 — Spec §11: Security Coverage Not AST-Integrated

**Spec requirement (§11):**
> Security coverage and security test mapping must work across all languages. Must support semantic detection of: auth header omission, invalid tokens, insufficient role/scope, injection payloads, XSS-like payloads, unsafe input patterns, cookie/session assertions, rate-limit scenarios, sensitive data exposure checks — including through helper clients, wrappers, test DSLs, Cucumber steps.

**Current state:** `src/security/` modules exist. Connection to AST language analyzers not confirmed.

**Fix required:** Extend language analyzers' `extractHttpInteractions` or add dedicated `extractSecuritySignals` methods to surface security intent. Feed these into the security coverage pipeline. Ensure Cucumber step indirection is covered.

---

### GAP-5 — Spec §19: No E2E / Dashboard Tests

**Spec requirement (§19 — End-to-end / dashboard tests):**
> Add or update browser tests to verify: indirect coverage renders correctly, confidence badges render, language filters work if present, AI summary panels include language-aware interpretations, no report page breaks due to new metadata.

**Current state:** No Cypress/Playwright test files covering confidence badges, language filters, or report page integrity with the new AST metadata fields.

**Fix required:** Add or update browser/e2e tests (whichever framework the project uses) to cover: confidence badge rendering, `sourceLanguage` and `resolutionType` visible in endpoint detail views, no visual regressions from new metadata fields, and AI summary panels.

---

### GAP-6 — Spec §20: README Has Stale Config Reference

**Location:** `README.md` line ~339

**Issue:** Still documents `analysis.ast.fallbackHeuristics: true` in a config example block. This field is now removed (commit `a30d4dd`), so the example is wrong.

**Fix required:** Update the README config example to match the current `config.yaml` schema. If GAP-1 is fixed (restoring `fallbackHeuristics`), update the example to reflect the restored field.

---

### GAP-7 — Spec §20: docs/guide/multi-language.md Does Not Cover AST

**Spec requirement (§20):**
> Update language support docs, endpoint coverage docs, parameter coverage docs, Cucumber support docs. Document: supported resolution patterns, confidence scoring, fallback heuristics, limitations per language, how to extend language support, how to debug resolution failures.

**Current state:** `docs/guide/multi-language.md` exists but contains no AST-specific content — no mention of resolution types, confidence scoring, per-language capabilities, or how to extend.

**Fix required:** Add an AST analysis section to `docs/guide/multi-language.md` covering: per-language capabilities and known limitations, resolution types and when each is used, confidence levels and what they mean, how to enable/disable per language, how to add a new language, and how to debug resolution failures.

---

### GAP-8 — Spec §20: No Standalone AST Architecture Documentation

**Spec requirement (§20 — architecture docs):**
> Update architecture docs.

**Current state:** No dedicated AST architecture document exists. The information is scattered across code files and partially in the README.

**Fix required:** Create `docs/architecture/ast-engine.md` documenting: the two-tier cascade model, `LanguageAnalyzer` contract, `SemanticModel` structure, `ResolvedHttpInteraction` fields, parser backends per language, how resolution type and confidence are assigned, the call graph, and how to add a new language plugin.

---

### GAP-9 — Spec §22 Acceptance Criteria Completeness Check

Before considering Spec 21 closed, all 16 acceptance criteria must be verified:

| AC | Criterion | Status |
|---|---|---|
| 1 | AST parsing is primary path for all supported languages | Implemented |
| 2 | All supported languages have analyzer implementations | Implemented |
| 3 | Endpoint resolution works beyond direct literals | Implemented |
| 4 | Parameter analysis is AST/semantic-aware | **GAP-2** |
| 5 | Business rule mapping works across languages | Implemented |
| 6 | Integration flow mapping works across languages | Implemented |
| 7 | Error/security inference is improved semantically | **GAP-3, GAP-4** |
| 8 | Assertion linkage exists | Implemented |
| 9 | Confidence scoring exists | Implemented |
| 10 | Reports include new metadata | Implemented |
| 11 | Examples are updated | Implemented |
| 12 | Docs are updated | **GAP-6, GAP-7, GAP-8** |
| 13 | Unit tests cover all languages | Implemented |
| 14 | Integration tests cover all languages | Implemented (verify breadth) |
| 15 | Dashboard/e2e tests pass | **GAP-5** |
| 16 | Analyzer still works if AST falls back to heuristics | **GAP-1** |

---

## 3. AI Agent Completion Prompt

Use the prompt below verbatim in a new AI agent session on the `feature/implement-ast` branch to close every identified gap.

---

```
You are working on the `feature/implement-ast` branch of the API Test Coverage Analyzer project.

The branch implements Spec 21 (Enable AST Scanning) and is approximately 80% complete.
A gap analysis has identified the following items that must be fixed to reach 100% conformance.
Work through every gap completely. Do not stop until:
  - all gaps are resolved
  - `make build` passes (no TypeScript errors)
  - `make test` passes (all tests)
  - `make self-analysis-all` completes without regression
  - all documentation is accurate and up to date

Read the full spec at: specs/21-enable-ast-scaning.md
Read the copilot instructions at: .github/copilot-instructions.md

---

## GAP-1 — Restore fallbackHeuristics Hybrid Behavior (Spec §15)

Context:
  Commit a30d4dd removed the `fallbackHeuristics` config field entirely, making AST authoritative.
  Spec §15 explicitly requires a hybrid architecture where heuristic fallback runs when AST yields
  zero interactions, and results from fallback are tagged with lower confidence.

Required changes:
  1. Restore `fallbackHeuristics` to `AstAnalysisConfig` in `src/config/types.ts` (default: true)
  2. Restore `fallbackHeuristics: true` to `src/config/defaultConfig.ts`
  3. Restore `fallbackHeuristics: true` to `config.yaml` and `config.yaml.example` (under analysis.ast)
  4. Update `src/ast/astAnalysisOrchestrator.ts`:
     - After AST parsing succeeds: if interactions.length > 0 → return AST results (no change)
     - After AST parsing succeeds: if interactions.length === 0 AND fallbackHeuristics is true
       → run deepResolveFile() regex fallback
       → tag all returned interactions with resolutionType: 'heuristic' and confidence: 'low'
       → return these fallback results
     - If AST is disabled or parse error → existing behavior (deepResolveFile fallback)
  5. Update all unit tests in `tests/ast/` and `tests/languages/` that were broken by a30d4dd
  6. Add test cases covering: AST 0 results with fallbackHeuristics: true → regex results tagged low,
     AST 0 results with fallbackHeuristics: false → empty results returned

---

## GAP-2 — Wire AST Into Parameter Coverage Engine (Spec §7)

Context:
  `src/parameterCoverage.ts` uses text-based pattern detection.
  The AST layer produces `ResolvedHttpInteraction` objects that include `parameterScenarios`
  and structured request body/payload context per language analyzer.
  Spec §7 requires detecting parameter scenarios (valid, invalid, missing, boundary, null,
  malformed, oversized, invalid enum, missing required) even when request bodies are built
  through builders, helpers, payload factories, typed DTOs, fixture generators.

Required changes:
  1. Audit `src/parameterCoverage.ts` to understand the current text-scan detection model
  2. Integrate `astAnalysisOrchestrator.analyzeFile()` into the parameter coverage pipeline
  3. Use `ResolvedHttpInteraction.parameterScenarios` and any request body shape information
     from the semantic model to infer parameter test intent in addition to or replacing naive
     text search
  4. Ensure the parameter coverage result includes `sourceLanguage`, `resolutionType`,
     `confidence` metadata per scenario where available
  5. Add or update unit tests in `tests/parameterCoverage.test.ts` to cover AST-driven
     parameter scenario detection for at least Java, Python, TypeScript
  6. Verify integration test in `tests/integration/ast/coverage.integration.test.ts` covers
     parameter scenarios

---

## GAP-3 — Wire AST Into Error Coverage Engine (Spec §10)

Context:
  `src/errorCoverage.ts` uses text scanning.
  Spec §10 requires semantic detection of negative scenarios from: invalid request builders,
  missing field construction, invalid enum/type creation, unauthenticated/unauthorized requests,
  nonexistent IDs, malformed payloads, assertion chains validating error responses.
  Spec requires inferring scenario category: missing parameter, invalid parameter, unauthorized,
  forbidden, not found, conflict, server error, validation error.

Required changes:
  1. Audit `src/errorCoverage.ts` to understand existing detection patterns
  2. Extend language analyzers or use existing `assertionType` / `resolutionType` data to
     classify HTTP interactions as error-scenario tests where semantic context supports it
  3. Feed `ResolvedHttpInteraction` data (assertionType, resolutionType, confidence,
     parameterScenarios) into the error coverage classification pass
  4. Replace or supplement status-code text search with semantic inference where interactions
     are flagged as invalid/missing/error variants
  5. Add or update tests in `tests/errorCoverage.test.ts` covering AST-driven error classification
  6. Ensure self-analysis still passes for error coverage metric

---

## GAP-4 — Wire AST Into Security Coverage Engine (Spec §11)

Context:
  `src/security/` modules exist but their integration with the AST language analyzers
  is not confirmed. Spec §11 requires semantic detection across all languages of:
  auth header omission, invalid tokens, insufficient role/scope, injection payloads,
  XSS-like payloads, unsafe input patterns, cookie/session assertions, rate-limit scenarios,
  sensitive data exposure checks — including through helper clients, wrappers, test DSLs,
  Cucumber steps.

Required changes:
  1. Audit src/security/ to understand current detection model
  2. Determine whether language analyzers already surface security signal data or need extension
  3. If needed, add optional `extractSecuritySignals?(model: SemanticModel): SecuritySignal[]`
     to the LanguageAnalyzer interface in `src/ast/languageAnalyzer.ts`
  4. Implement `extractSecuritySignals` in language analyzers where feasible (at minimum
     JavaScript/TypeScript and Java)
  5. Wire security signals from AST into the security coverage pipeline
  6. Ensure Cucumber step indirection surfacing security intent flows through correctly
  7. Add or update tests in `tests/security*/` covering AST-driven security detection
  8. Ensure self-analysis still passes for security coverage metric

---

## GAP-5 — Add Dashboard / E2E Tests (Spec §19)

Context:
  Spec §19 requires browser tests verifying: indirect coverage renders correctly,
  confidence badges render, language filters work if present, AI summary panels include
  language-aware interpretations, no report page breaks due to new metadata.
  No such tests currently exist for AST metadata fields.

Required changes:
  1. Identify the existing e2e/browser test framework in use (Cypress/Playwright — check
     package.json and the tests/ or cypress/ or e2e/ directory)
  2. Add or update tests to verify:
     a. Confidence badges (high/medium/low) render without error on the endpoint coverage page
     b. `sourceLanguage` and `resolutionType` fields are visible in endpoint detail views
     c. No report pages show blank/broken UI due to new metadata fields being present
     d. AI summary panels render correctly when coverage data includes AST metadata
     e. Language filter UI (if present on dashboard) works correctly
  3. Run the full e2e suite and confirm it passes

---

## GAP-6 — Fix Stale README Config Example (Spec §20)

Context:
  README.md contains a config example block (around line 339) that still references
  `analysis.ast.fallbackHeuristics: true`. After commit a30d4dd this field was removed.
  After GAP-1 is fixed the field exists again — but the README must accurately reflect
  the current canonical schema.

Required changes:
  1. After completing GAP-1, update the README config example to include
     `fallbackHeuristics: true` consistent with the restored default
  2. If there are any other stale config examples in the README referencing removed or
     renamed fields, fix them
  3. Verify the README AST section accurately describes the two-tier cascade behavior
     as implemented after GAP-1

---

## GAP-7 — Update docs/guide/multi-language.md With AST Content (Spec §20)

Context:
  The file exists but contains no AST-specific content.
  Spec §20 requires documenting: supported resolution patterns, confidence scoring,
  fallback heuristics, per-language limitations, how to extend language support,
  how to debug resolution failures.

Required changes:
  Add a section "AST-Based Analysis" to `docs/guide/multi-language.md` covering:
  a. Per-language capabilities table (parser backend, supported resolution types,
     known limitations) — derive from `src/ast/languageCapabilities.ts`
  b. Resolution types — definition of each of the 11 types and when they apply
  c. Confidence levels — meaning of high/medium/low and how they are assigned
  d. fallbackHeuristics — what it does, when to enable/disable
  e. How to enable or disable a specific language in config.yaml
  f. How to add support for a new language (implement LanguageAnalyzer, register in
     parserRegistry, add to languageCapabilities)
  g. How to debug resolution failures (what to look for in output, how to inspect
     resolutionType and confidence in reports)
  Content must be structured, concise, and deterministic per the spec requirement.

---

## GAP-8 — Create AST Architecture Documentation (Spec §20)

Context:
  No dedicated AST architecture document exists.
  Spec §20 requires architecture docs update.

Required changes:
  Create `docs/architecture/ast-engine.md` with the following sections:
  1. Overview — The two-tier cascade model (diagram or clear description)
  2. LanguageAnalyzer Contract — interface definition and required vs optional methods
  3. SemanticModel — description of fields and their purpose
  4. ResolvedHttpInteraction — all fields with type and meaning
  5. Parser Backends — which backend is used per language and why
  6. Resolution Type Assignment — how each resolutionType is determined
  7. Confidence Assignment — how high/medium/low is determined per interaction
  8. Call Graph and Symbol Resolution — how wrapper/helper tracing works
  9. Cucumber Integration — how feature files + step definitions are traced to HTTP calls
  10. Adding a New Language — step-by-step guide
  Document must be structured, AI-friendly, and consistent with the actual implementation.

---

## Non-Negotiable Completion Criteria

Before marking this task complete, run and verify all of the following:

  make build             # must be clean — zero TypeScript errors
  make test              # full Jest suite — all tests pass
  make self-analysis-all # all 8 metrics pass at 100% threshold
  make summary           # completes without error

Additionally verify:
  - grep for 'fallbackHeuristics' in src/ shows it exists in types, defaultConfig, orchestrator
  - grep for 'fallbackHeuristics' in README.md shows an accurate example
  - docs/guide/multi-language.md contains an AST section
  - docs/architecture/ast-engine.md exists and is complete
  - e2e/browser tests cover confidence badge and sourceLanguage rendering

Work incrementally: complete one gap fully (code + tests + docs) before starting the next.
Do not stop until every gap above is resolved and all verification commands pass.
```

---

## 4. Priority Order for Fixes

Work the gaps in this sequence to minimize rework:

1. **GAP-1** first — restoring `fallbackHeuristics` affects config types, orchestrator, and tests that other gaps will build on
2. **GAP-6** immediately after GAP-1 — README must reflect the restored field
3. **GAP-2** — parameter coverage AST integration
4. **GAP-3** — error coverage AST integration
5. **GAP-4** — security coverage AST integration
6. **GAP-8** — create `docs/architecture/ast-engine.md` (no code dependencies)
7. **GAP-7** — update `docs/guide/multi-language.md` (no code dependencies)
8. **GAP-5** — dashboard/e2e tests (requires all code gaps closed first)
