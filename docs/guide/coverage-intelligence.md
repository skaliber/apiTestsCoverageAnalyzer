# Coverage Intelligence

The **Coverage Intelligence** engine transforms raw coverage percentages into actionable testing intelligence. It answers:

> **What is missing? What matters most? What should be tested next?**

---

## Overview

After running any combination of coverage commands, run the intelligence engine to generate prioritised findings and recommendations:

```bash
api-coverage coverage-intelligence \
  --reports-dir reports \
  --out-dir     reports \
  --project-name my-api \
  --languages   typescript \
  --frameworks  jest
```

The engine reads `reports/coverage-summary.json` (if present) and produces six AI-friendly output files.

---

## Functional Findings

A **Functional Finding** is a normalised, categorised gap discovered by the engine:

```ts
type FunctionalFinding = {
  id: string;
  source: 'coverage-gap-analysis' | 'error-coverage' | 'security-scan' | ...;
  category: 'uncovered-endpoint' | 'missing-auth-test' | 'error-scenario-gap' | ...;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  endpoint?: { method?: string; path?: string };
  missingTestTypes?: string[];
  frameworkHints?: string[];
  languageHints?: string[];
};
```

Examples:
- `"HIGH auth-coverage: Missing auth/security test: DELETE /users/{id}"`
- `"MEDIUM error-coverage: Missing error scenario tests for POST /payments"`
- `"CRITICAL security-scan: Scanner finding: Auth bypass on /admin"`

---

## Missing Test Recommendations

Each finding generates a **Missing Test Recommendation** with:

| Field | Description |
|-------|-------------|
| `priority` | P0 / P1 / P2 / P3 based on risk score |
| `riskScore` | 0–100 deterministic score |
| `recommendedTestType` | e.g. `auth-test`, `negative-api-test`, `boundary-test` |
| `likelyLanguage` | detected language (TypeScript, Java, Python, Ruby, …) |
| `likelyFramework` | detected framework (jest, rest-assured, pytest, rspec, …) |
| `rationale` | human + framework-specific explanation |
| `linkedFindingIds` | IDs of all findings driving this recommendation |

---

## Risk Scoring Formula

```text
Risk Score =
  0.30 × SeverityWeight +
  0.20 × ExposureWeight +
  0.15 × CriticalityWeight +
  0.15 × MissingCoverageWeight +
  0.10 × SecuritySignalWeight +
  0.05 × FlowImpactWeight +
  0.05 × ChangeVolatilityWeight
```

All weights are in the range 0–100. The final score is clamped and rounded to an integer.

### Component Values

| Component | Examples |
|-----------|---------|
| **SeverityWeight** | LOW=25, MEDIUM=50, HIGH=75, CRITICAL=100 |
| **ExposureWeight** | internal=30, public-auth=80, public-unauth=90-100 |
| **CriticalityWeight** | payments/auth/compliance=90-100, profile=50, informational=20 |
| **MissingCoverageWeight** | zero tests=100, happy-path only=75, partial=30 |
| **SecuritySignalWeight** | no signal=0, scanner finding=100 |
| **FlowImpactWeight** | isolated=20, critical flow=100 |
| **ChangeVolatilityWeight** | stable=20, frequent change=80 (default=40) |

### Risk Bands and Priority

| Score | Risk Band | Priority |
|-------|-----------|---------|
| 85–100 | Critical | **P0** — immediate action |
| 70–84 | Critical | **P1** — high urgency |
| 50–69 | High | **P2** — address soon |
| 0–49 | Moderate/Low | **P3** — backlog |

**Override rules:** items linked to a critical security finding, money-movement endpoint, or auth/authz gap are never rated below **P1**, regardless of the formula score.

---

## Output Files

| File | Format | Description |
|------|--------|-------------|
| `reports/coverage-intelligence.json` | JSON | Complete report with all findings and recommendations |
| `reports/coverage-intelligence.md` | Markdown | AI-friendly summary — top 10 findings and recommendations |
| `reports/missing-tests-recommendations.json` | JSON | All recommendations with risk scores and rationale |
| `reports/missing-tests-recommendations.md` | Markdown | Recommendations formatted for human review |
| `reports/risk-prioritization.json` | JSON | Risk breakdown by category, endpoint, and priority |
| `reports/risk-prioritization.md` | Markdown | Narrative risk prioritisation by category and endpoint |

---

## Language and Framework Support

The engine produces **language-specific** recommendations for all supported stacks:

| Language | Example recommendation |
|----------|----------------------|
| **TypeScript / JavaScript** | `Jest + supertest: describe("unauthorized") { it("returns 401") }` |
| **Java** | `RestAssured authz scenario: .auth().oauth2(token) chain` |
| **Kotlin** | `Kotest / JUnit test with Ktor test client` |
| **Python** | `pytest fixture: add missing auth header, assert 401/403` |
| **Ruby** | `RSpec request spec: without_auth context block` |
| **Cucumber** | `Scenario: missing coverage – add Gherkin scenario for auth-test` |

---

## Prometheus Metrics

When the metrics server is enabled (`--metrics-port`), the intelligence engine exposes:

| Metric | Description |
|--------|-------------|
| `api_coverage_functional_findings_total` | Total findings by project/language/framework |
| `api_coverage_missing_test_recommendations_total` | Total recommendations |
| `api_coverage_missing_test_recommendations_by_priority` | Count by P0/P1/P2/P3 |
| `api_coverage_risk_score_max` | Maximum risk score |
| `api_coverage_risk_score_avg` | Average risk score |
| `api_coverage_critical_uncovered_items_total` | HIGH+CRITICAL severity uncovered items |
| `api_coverage_unprotected_security_findings_total` | Scanner findings with no test protection |

---

## Dashboard

The React dashboard includes a **🧠 Intelligence** page accessible from the sidebar. It shows:

- Summary cards (total findings, recommendations, P0 count, max risk score)
- Filterable list of Missing Test Recommendations (filter by priority, risk band, language, framework, endpoint path)
- Filterable table of Functional Findings (filter by severity, category, scanner, endpoint path)
- Top Risk Areas list
- AI-friendly collapsed summary panel
- Finding detail drawer — click any linked-finding badge to drill into the full finding context and linked recommendations

The page loads `reports/coverage-intelligence.json` automatically if served by the dashboard server.

---

## Library API

```ts
import {
  runIntelligenceEngine,
  computeRiskScore,
  scoreToRiskBand,
  scoreToPriority,
  runLinkageEngine,
  writeIntelligenceReports,
} from 'api-test-coverage-analyzer';

const report = runIntelligenceEngine({
  projectName: 'my-api',
  coverageResults: [...],          // from any analyze* command
  securityFindings: [...],         // optional: from runSecurityScan()
  languages: ['typescript'],
  frameworks: ['jest'],
  outDir: 'reports',               // optional: write markdown/JSON to disk
});

console.log(report.summary.totalRecommendations);
console.log(report.recommendations[0].priority);   // "P0"
console.log(report.recommendations[0].riskScore);  // 87
```

---

## MCP Integration

If MCP is enabled, the intelligence engine can optionally send findings to a configured MCP server for AI-enhanced prioritisation.  The engine always works deterministically without MCP — MCP only enriches the output when available.

See [MCP Integration](./mcp-integration.md) for configuration details.
