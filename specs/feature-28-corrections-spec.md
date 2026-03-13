# Feature 28 — Zero-Config Analyze Corrections

## All Dashboard Tabs Must Show Meaningful Data for Real-World Services

**Version:** 1.0
**Status:** Authoritative
**Target repo:** gothinkster/node-express-realworld-example-app (no OpenAPI spec, no test files)

> **Root problem:** Running `analyze` against a real-world Express/Node service with no OpenAPI spec and no test files left every dashboard tab empty — Endpoints, Parameters, Business Rules, Integration Flows, Security, and Error Handling all showed "No results found" or "No data available". The analyzer inferred routes and business rules but did not produce parameter data, and the dashboard pages used bare text fallbacks instead of actionable empty states.

---

## Table of Contents

1. [Corrections Required](#1-corrections-required)
2. [Parameter Inference from Routes](#2-parameter-inference-from-routes)
3. [Integration Flows Empty State](#3-integration-flows-empty-state)
4. [Dashboard Empty State Consistency](#4-dashboard-empty-state-consistency)
5. [Analyze Command — Critical Hang Fix](#5-analyze-command--critical-hang-fix)
6. [Acceptance Criteria](#6-acceptance-criteria)

---

## 1. Corrections Required

| Tab | Before | After |
|---|---|---|
| Endpoints | 0/0 covered (empty) — analyze hung waiting for glob | Items from inferred routes, shown in table |
| Parameters | "No Parameter data found" — analyze never produced parameter data in inferred mode | Items from inferred path params (`:id`, `:slug`) and body params (from inferred rules) |
| Business Rules | 0/0 covered (empty) — slow glob scan froze analyze | Items from inferred business rules |
| Integration Flows | Empty with bare text "No integration flows data available." | EmptyStatePanel with actionable context when no test files found |
| Security | "No data available for Security. Load a report that includes this section." | EmptyStatePanel with stack-specific suggestions |
| Error Handling | Should work; verify items appear | Items from inferred error conditions |

---

## 2. Parameter Inference from Routes

### 2.1 Problem

When there is no OpenAPI spec, the `analyze` command skips parameter coverage entirely. Routes like `/:article/comments/:comment` contain explicit path parameters. Request bodies referenced in inferred business rules (`req.body.email`, `req.body.title`) contain implicit body parameters.

### 2.2 Implementation

In the `else` branch of section 4 (no API spec), after producing endpoint coverage from inferred routes, produce a **parameter result** by:

**Step 1 — Extract path parameters from routes:**
```
For each inferred route:
  - Scan path segments that start with ':' (e.g. ':id', ':article', ':comment')
  - Create a parameter item: { id: "PATH :slug @ GET /:article", covered: bool }
  - Match coverage: the same testEntries matching that already covered the parent endpoint
    counts as covering the path parameter too
```

**Step 2 — Extract body parameters from inferred business rules:**
```
For each inferred business rule with condition matching req.body.<field>:
  - Extract the field name (e.g. "email" from "req.body.email === null")
  - Create a parameter item: { id: "BODY email @ POST /users", covered: bool }
  - Match coverage: any test description that mentions the field name counts as covered
```

**Step 3 — Write to coverage-summary.json:**
```
If total path+body params > 0:
  allCoverageResults.push({ type: 'parameter', totalItems, coveredItems, coveragePercent, details: { items } })
```

### 2.3 Dashboard normalization

`CoverageContext.normalizeSection` for `parameter` must handle items with shape `{ id, covered, matchedTests }` — already handled by the default case.

---

## 3. Integration Flows Empty State

### 3.1 Problem

`IntegrationFlowsPage` shows a bare text div "No integration flows data available." when no `integration` section exists in the report. All other pages (Security, Error Handling, Parameters) use `EmptyStatePanel` for rich, actionable empty states.

### 3.2 Fix

Replace the bare-text fallback in `IntegrationFlowsPage` with `EmptyStatePanel`, consistent with all other pages:

```tsx
if (!section) {
  return (
    <div className="p-6">
      <h1 ...>Integration Flows</h1>
      {showAiSummaries && report && <AiSummaryPanel ... />}
      <EmptyStatePanel sectionName="Integration Flows"
        scannedInfo={{ suggestedNextSteps: [
          'Add tests that call 2+ API endpoints in sequence (e.g. create article then add comment)',
          'Use supertest/axios chains in your test files',
          'Run analyze again after adding test files',
        ]}}
      />
      <IntelligenceSection ... />
    </div>
  );
}
```

---

## 4. Dashboard Empty State Consistency

All 8 coverage type pages must use `EmptyStatePanel` (not bare text) when their section is missing from the report. Pages with outstanding issues:

| Page | Current empty state | Required |
|---|---|---|
| `IntegrationFlowsPage` | bare text `<div>` | `EmptyStatePanel` |
| `EndpointsPage` (via DetailPage) | "No data available for X. Load a report…" | Acceptable — DetailPage already uses this; add note |

`SecurityPage`, `ErrorHandlingPage`, `ParametersPage` already use `EmptyStatePanel`. No change needed there.

---

## 5. Analyze Command — Critical Hang Fix

### 5.1 Problem

When a project has no test files, `testsGlob` fell back to `rootDir/**/*`. The `analyzeBusinessCoverage` function uses `fast-glob` to expand this, scanning the entire project tree including `node_modules`, hanging indefinitely on large repositories.

### 5.2 Fix (already implemented in commit 1d95184)

- Changed `testsGlob` fallback from `**/*` → `**/*.{test,spec}.{js,ts,jsx,tsx,mjs,cjs,py,rb}`
- For the inferred business rules path, replaced `analyzeBusinessCoverage(syntheticRules, testsGlob)` with direct in-memory matching against `testEntries` (already computed from discovered test files)
- Hoisted `testEntries` computation to top of section 4 so it is shared across endpoint, error, and business coverage

---

## 6. Acceptance Criteria

Running `analyze --root <node-express-realworld-example-app>` must:

1. **Complete in under 30 seconds** regardless of whether test files exist
2. **Endpoints tab**: Shows inferred routes table (non-empty when Express routes are found)
3. **Parameters tab**: Shows inferred path parameters from route patterns (`:article`, `:comment`, `:username`) — at minimum non-empty when routes with path params exist
4. **Business Rules tab**: Shows inferred business rules table (non-empty when `throw`/`res.status(4xx)` patterns found)
5. **Error Handling tab**: Shows inferred error scenarios (non-empty when validation/throw patterns found)
6. **Integration Flows tab**: Shows `EmptyStatePanel` with actionable next steps (not bare text)
7. **Security tab**: Shows `EmptyStatePanel` with stack-specific suggestions for the detected language/framework
8. **All tabs**: Use `EmptyStatePanel` when no data — never show bare "No data available" text
9. **`make test` passes** — 0 failing tests
10. **`make build` clean** — 0 TypeScript errors
