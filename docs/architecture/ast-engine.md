# AST Analysis Engine — Architecture Reference

This document describes the multi-language AST analysis engine introduced in Spec 21.
It covers the module layout, the three-tier fallback cascade, the semantic model, resolution
types, per-language capabilities, and a guide for adding new language support.

---

## 1. Three-tier fallback cascade

Every file is processed through three tiers, in order:

| Tier | Condition | Output |
|------|-----------|--------|
| **1 — AST** | AST parse succeeds and returns ≥1 HTTP interactions | Returned verbatim; `confidence: high` or `medium` |
| **2 — Heuristic** | AST parse succeeds but returns 0 interactions AND `fallbackHeuristics: true` | Regex fallback output; all tagged `resolutionType: heuristic`, `confidence: low` |
| **3 — Regex** | AST disabled or parse error | Existing `deepResolveFile()` pipeline; unchanged confidence |

The entry point is `src/ast/astAnalysisOrchestrator.ts → analyzeFile()`.

### `fallbackHeuristics`

`fallbackHeuristics` (default `true`) controls Tier 2 behaviour:

- **`true`** — when AST finds 0 HTTP interactions, runs the regex pipeline and tags all results with `resolutionType: 'heuristic'` and `confidence: 'low'`. This prevents false negatives when the test uses patterns the AST analyzer does not yet recognise.
- **`false`** — zero AST results are returned verbatim, never falling back to regex. Use this when you want strict AST authority and prefer explicit false negatives over noisy low-confidence detections.

Configure per project in `config.yaml`:

```yaml
analysis:
  ast:
    enabled: true
    fallbackHeuristics: true   # default
```

---

## 2. Module layout

```
src/ast/
├── astTypes.ts                  # Canonical types for the AST layer
├── languageAnalyzer.ts          # LanguageAnalyzer interface contract
├── languageCapabilities.ts      # Registry of language capabilities
├── parserRegistry.ts            # Factory: register/retrieve language analyzers
├── parseFile.ts                 # Per-file analysis (parse → semantic model → interactions)
└── astAnalysisOrchestrator.ts   # Three-tier cascade entry point

src/languages/
├── javascript/index.ts          # TypeScript-estree powered JS analyzer
├── typescript/index.ts          # TypeScript-estree powered TS analyzer
├── java/index.ts                # Tree-sitter powered Java analyzer
├── kotlin/index.ts              # Tree-sitter powered Kotlin analyzer
├── python/index.ts              # Tree-sitter powered Python analyzer
└── ruby/index.ts                # Tree-sitter powered Ruby analyzer
```

---

## 3. The `LanguageAnalyzer` interface

All language analyzers must implement `src/ast/languageAnalyzer.ts`:

```typescript
interface LanguageAnalyzer {
  readonly language: SupportedLanguage;

  /** Parse source to raw AST. Must never throw. Returns ParsedSourceFile with parseError on failure. */
  parse(filePath: string, content: string): ParsedSourceFile;

  /** Walk AST → produce semantic model (symbols, call graph, HTTP calls, assertions). */
  buildSemanticModel(parsed: ParsedSourceFile, context: AnalysisContext): SemanticModel;

  /** Resolve HTTP interactions with constant propagation and wrapper tracing. */
  extractHttpInteractions(model: SemanticModel, context: AnalysisContext): ResolvedHttpInteraction[];

  /** Extract assertion nodes for status-code / body-field linking. */
  extractAssertions(model: SemanticModel): SemanticAssertion[];

  // Optional:
  extractBusinessRuleRefs?(model: SemanticModel): BusinessRuleRef[];
  extractFlowRefs?(model: SemanticModel): FlowRef[];
}
```

The orchestrator calls these in order: `parse` → `buildSemanticModel` → `extractHttpInteractions` →
`extractAssertions`.

---

## 4. Semantic model

`buildSemanticModel()` produces a `SemanticModel` per file:

| Field | Type | Description |
|-------|------|-------------|
| `localVariables` | `Map<string, SemanticSymbol>` | `let`/`var` declarations |
| `constants` | `Map<string, SemanticSymbol>` | `const` declarations; used for constant propagation |
| `enums` | `Map<string, Map<string, string>>` | Enum definitions; `enumName → (member → value)` |
| `functions` | `Map<string, SemanticFunction>` | Functions with body HTTP calls and call graph edges |
| `httpInteractions` | `SemanticHttpCall[]` | HTTP calls found at file body level (outside functions) |
| `assertions` | `SemanticAssertion[]` | Assertion nodes for linking to HTTP interactions |
| `businessRuleRefs` | `BusinessRuleRef[]` | Metadata from annotations / decorators |
| `flowRefs` | `FlowRef[]` | Integration flow tags |

### `SemanticFunction`

```typescript
interface SemanticFunction {
  name: string;
  parameters: string[];
  bodyHttpCalls: SemanticHttpCall[];   // HTTP calls in function body
  calledFunctions: string[];           // call graph edges
  returnValue?: string;
  annotations?: string[];              // @Test, @When, etc.
  cucumberPattern?: string;            // Gherkin step pattern
}
```

### `SemanticHttpCall`

```typescript
interface SemanticHttpCall {
  method: string;           // GET, POST, …
  rawPathArg: string;       // path as written in source
  resolvedPath?: string;    // after constant propagation
  normalizedPath?: string;  // OpenAPI template form, e.g. /users/{id}
  resolutionType: ResolutionType;
  confidence: ConfidenceLevel;
  responseVariable?: string;
  line?: number;
}
```

---

## 5. Resolution types and confidence

Each `ResolvedHttpInteraction` carries a `resolutionType` and `confidence`:

| `resolutionType` | Confidence | Description |
|-----------------|-----------|-------------|
| `direct` | high | String literal URL |
| `constant` | high/medium | Named constant resolved to URL |
| `enum` | high/medium | Enum member resolved to URL |
| `string-template` | medium | Template literal / f-string |
| `wrapper-method` | medium | HTTP call traced through helper method |
| `request-builder` | medium | Builder object (RequestEntity, WebClient, etc.) |
| `client-mapping` | high | Explicit client ↔ HTTP mapping |
| `interpolated-path` | medium | URL with run-time path segments |
| `cucumber-step` | medium | HTTP call inside Gherkin step definition |
| `heuristic` | low | Regex fallback (Tier 2 output only) |

---

## 6. Per-language capabilities

| Language | Parser | Symbol Res. | Call Graph | Enum Res. | Template | Assertion Link | Builder | Cucumber |
|----------|--------|------------|-----------|-----------|----------|----------------|---------|---------|
| TypeScript | typescript-estree | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| JavaScript | typescript-estree | ✓ | ✓ | — | ✓ | ✓ | ✓ | — |
| Java | tree-sitter | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| Kotlin | tree-sitter | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Python | tree-sitter | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| Ruby | tree-sitter | ✓ | ✓ | — | ✓ | ✓ | — | ✓ |
| Cucumber | regex-fallback | — | — | — | — | — | — | ✓ |

---

## 7. Analysis context

Every analysis call passes an `AnalysisContext`:

```typescript
interface AnalysisContext {
  astConfig: AstAnalysisConfig;   // from config.yaml analysis.ast
  deepConfig: DeepAnalysisConfig; // from config.yaml scans.coverage.deepAnalysis
  projectRoot?: string;
}
```

Use `buildAnalysisContext(astConfig?, deepConfig?)` (from `astAnalysisOrchestrator`) to
create a context with sensible defaults.

Key `AstAnalysisConfig` fields:

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | Master switch; `false` skips AST entirely |
| `fallbackHeuristics` | `true` | Run regex when AST yields 0 results |
| `maxCallDepth` | `4` | Maximum call-chain depth for wrapper tracing |
| `assertionAware` | `true` | Link HTTP calls to downstream assertions |
| `languages.<lang>.enabled` | `true` | Disable a specific language |

---

## 8. Integration with coverage engines

The AST engine feeds three coverage engines through an **OR-merge** strategy — AST
supplements but never removes text-scan coverage:

### Parameter coverage (`src/parameterCoverage.ts`)

`analyzeParameterCoverage(params, glob, astOptions?)` — when `astOptions` is provided:

1. Runs AST on all test files and builds a `path → interactions[]` map.
2. For each parameter, finds interactions at the parameter's endpoint path.
3. Reads `interaction.parameterScenarios` (populated by language analyzers that detect
   test-intent from builder patterns, assertion chains, etc.) and maps scenario strings to
   coverage categories: `valid`, `boundary`, `missing`, `invalid`.
4. Merges flags with text-scan results; stores best-match metadata in `coverage.astMetadata`.

### Error coverage (`src/errorCoverage.ts`)

`analyzeErrorCoverage(scenarios, glob, astOptions?)` — when `astOptions` is provided:

1. For each error scenario (endpoint + status code + categories), checks AST interactions.
2. Interactions with `assertionType: 'status-code'` or `'fluent-chain'` signal that the test
   asserts HTTP status — strong evidence the scenario is covered.
3. `parameterScenarios` entries are mapped to error categories (missing → `missing-parameter`,
   invalid → `invalid-value`, etc.).
4. Coverage result includes `astMetadata` with source language, resolution type, and confidence.

### Security coverage (`src/securityCoverage.ts`)

`analyzeSecurityCoverage(controls, glob, scanReport?, astOptions?)` — when `astOptions` is provided:

1. Builds an endpoint → interactions map.
2. Maps interaction signals to security categories: `authentication`, `authorization`,
   `input-validation`, `cryptography`, `session-management`.
3. For endpoint-specific controls (authorization, input-validation), requires the interaction's
   path to match the control's endpoint before claiming coverage.
4. OR-merges with text-scan and scan-report results.

---

## 9. Adding a new language

1. **Create** `src/languages/<lang>/index.ts` implementing `LanguageAnalyzer`.

2. **Implement** the four required methods:
   - `parse()` — wrap your parser; never throw, set `parseError` on failure.
   - `buildSemanticModel()` — walk the AST and populate the `SemanticModel`.
   - `extractHttpInteractions()` — resolve calls visiting the call graph up to
     `context.astConfig.maxCallDepth`.
   - `extractAssertions()` — detect `expect(...).toBe(...)` / `assert` / fluent chains.

3. **Register** at the bottom of your file:

   ```typescript
   import { registerAnalyzer } from '../../ast/parserRegistry';
   registerAnalyzer('ruby', () => new MyRubyAnalyzer());
   ```

4. **Add a `require()` call** in `astAnalysisOrchestrator.ts → registerAllAnalyzers()`:

   ```typescript
   try { require('../languages/<lang>/index'); } catch { /* not available */ }
   ```

5. **Add unit tests** under `tests/languages/<lang>/`.

6. **Update** `src/ast/languageCapabilities.ts` with the new language's capability matrix.

7. **Update** `docs/guide/multi-language.md` and this document to document the new language.

---

## 10. `parameterScenarios` — populating from language analyzers

Language analyzers can set `parameterScenarios` on a `ResolvedHttpInteraction` to signal
which parameter test scenarios the test exercises. This supplements text-scan detection in
`parameterCoverage.ts` and `errorCoverage.ts`.

Recognised scenario strings (case-insensitive):

| String | Coverage category |
|--------|------------------|
| `valid`, `happy-path`, `success`, `positive` | `validValue` |
| `boundary`, `min`, `max`, `edge`, `zero`, `empty`, `oversized` | `boundaryValue` |
| `missing`, `missing-required`, `absent`, `omitted` | `missing` |
| `invalid`, `bad-value`, `wrong-type`, `malformed`, `null`, `invalid-enum` | `invalidValue` |

Populate them by detecting builder or assertion patterns, e.g.:

```typescript
// Java analyzer detecting a null body parameter:
if (requestBody.some(f => f.value === 'null')) {
  httpInteraction.parameterScenarios = ['null', 'invalid'];
}
```
