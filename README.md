# API Test Coverage Analyzer

[![Build](https://github.com/q-intel/apiTestsCoverageAnalyzer/actions/workflows/api-coverage.yaml/badge.svg)](https://github.com/q-intel/apiTestsCoverageAnalyzer/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

A CLI tool that measures how thoroughly your test suite exercises your API surface area. Rather than simply counting passing tests, it asks:

- Are all **endpoints** reachable via at least one test?
- Are **parameters** tested with valid, boundary, missing, and invalid values?
- Are **business rules** (discount logic, rate limiting, etc.) explicitly validated?
- Do **integration flows** (multi-step user journeys) run end-to-end?
- Are **security scenarios** (auth bypass, injection, IDOR) covered?
- Are **error paths** (4xx/5xx) handled correctly?
- Is there **performance and resilience** evidence (JMeter/k6 data)?
- Does the API **remain compatible** between versions?

The answers appear in rich **HTML**, **JSON**, **CSV**, and **JUnit** reports that can be enforced as pass/fail gates in any CI pipeline.

### Coverage Intelligence

Beyond raw percentages, the **Coverage Intelligence** engine answers:

> **What is missing? What matters most? What should be tested next?**

It identifies **functional findings**, links them to **missing test recommendations**, assigns **risk scores** (0–100), and prioritises work as **P0/P1/P2/P3**.  Outputs are AI-friendly markdown — ready for LLM consumption or CI gating.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quickstart](#quickstart)
- [Using as a Library](#using-as-a-library)
- [GitHub Action](#github-action)
- [Commands overview](#commands-overview)
- [Configuration](#configuration)
- [UI Dashboard](#ui-dashboard)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Prerequisites

- **Node.js** ≥ 18 LTS
- **npm** ≥ 9

```bash
node --version   # v20.x
npm --version    # 10.x
```

## Installation

### Option 1 – Install globally from npm (recommended)

```bash
npm install -g api-test-coverage-analyzer
api-coverage --help
```

### Option 2 – Run without installing (npx)

```bash
npx api-test-coverage-analyzer endpoint-coverage \
  --spec openapi.yaml \
  --tests 'tests/**/*.ts'
```

### Option 3 – Clone the repository (development)

```bash
git clone https://github.com/q-intel/apiTestsCoverageAnalyzer.git
cd apiTestsCoverageAnalyzer

# Install dependencies
npm install

# Compile TypeScript
npm run build

# Verify
node dist/src/index.js --help
```

Alternatively, use `ts-node` to skip the build step:

```bash
node -r ts-node/register src/index.ts --help
```

## Quickstart

Run all coverage types against the included sample project:

```bash
# Endpoint coverage (using globally installed CLI)
api-coverage endpoint-coverage \
  --spec sample/openapi.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html \
  --threshold-endpoint 80

# Business rule coverage
api-coverage business-coverage \
  --rules sample/business-rules.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html

# Integration flow coverage
api-coverage integration-coverage \
  --flows sample/integration-flows.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html

# Security coverage
api-coverage security-coverage \
  --spec sample/openapi-security.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html

# Compatibility check (breaking changes between v1 and v2)
api-coverage compatibility-check \
  --old-spec sample/v1.yaml \
  --new-spec sample/v2.yaml \
  --contracts "sample/contracts/**/*.json" \
  --format json,html
```

Reports are written to the `reports/` directory.

## Using as a Library

Install as a project dependency:

```bash
npm install api-test-coverage-analyzer
```

Then import the analysis functions in your own scripts:

```js
const {
  analyzeEndpoints,
  analyzeParameters,
  analyzeBusinessRules,
  analyzeIntegrationFlows,
  analyzeErrorHandling,
  analyzeSecurityControls,
  analyzePerfResilience,
  analyzeCompatibility,
  checkThresholds,
} = require('api-test-coverage-analyzer');

async function runCoverage() {
  // Endpoint coverage
  const endpointResult = await analyzeEndpoints({
    spec: 'openapi.yaml',
    tests: 'tests/**/*.ts',
    format: 'json,html',
    thresholdEndpoint: 80,
  });
  console.log(`Endpoint coverage: ${endpointResult.coveragePercent}%`);

  // Business rule coverage
  const businessResult = await analyzeBusinessRules({
    rules: 'business-rules.yaml',
    tests: 'tests/**/*.ts',
  });
  console.log(`Business coverage: ${businessResult.coveragePercent}%`);

  // Check thresholds
  const failures = checkThresholds(
    [endpointResult, businessResult],
    { endpoint: 80, business: 60 }
  );
  if (failures.length > 0) {
    console.error('Threshold failures:', failures);
    process.exitCode = 1;
  }
}

runCoverage();
```

TypeScript users get full type definitions out of the box.

## GitHub Action

Add API coverage analysis to your CI/CD pipeline with zero setup:

```yaml
steps:
  - name: Checkout
    uses: actions/checkout@v4

  - name: Run API coverage analysis
    id: coverage
    uses: q-intel/apiTestsCoverageAnalyzer/action@v1
    with:
      spec: 'sample/openapi.yaml'
      tests: 'tests/**/*.ts'
      format: 'json,html'
      coverage-types: 'endpoint,error,security'
      threshold-endpoint: '80'

  - name: Print endpoint coverage
    run: echo "Endpoint coverage ${{ steps.coverage.outputs.endpoint-coverage }}%"

  - name: Upload reports
    uses: actions/upload-artifact@v4
    with:
      name: coverage-reports
      path: reports/
```

### Action inputs

| Input | Description | Default |
|-------|-------------|---------|
| `spec` | Path to OpenAPI/Swagger spec file | `sample/openapi.yaml` |
| `tests` | Glob pattern for test files | `tests/**/*.ts` |
| `format` | Comma-separated report formats (`json,html,csv,junit`) | `json,html` |
| `coverage-types` | Coverage types to run (`endpoint,parameter,business,integration,error,security`) | `endpoint` |
| `rules` | Path to business rules YAML (required for `business` type) | — |
| `flows` | Path to integration flows YAML (required for `integration` type) | — |
| `language` | Test language(s) (`auto,typescript,javascript,java,python,ruby,cucumber`) | `auto` |
| `threshold-endpoint` | Minimum required endpoint coverage % | `0` |
| `threshold-parameter` | Minimum required parameter coverage % | `0` |
| `threshold-business` | Minimum required business rule coverage % | `0` |
| `threshold-integration` | Minimum required integration flow coverage % | `0` |
| `threshold-error` | Minimum required error handling coverage % | `0` |
| `threshold-security` | Minimum required security coverage % | `0` |
| `reports-dir` | Directory to write reports into | `reports` |

### Action outputs

| Output | Description |
|--------|-------------|
| `endpoint-coverage` | Endpoint coverage percentage |
| `parameter-coverage` | Parameter coverage percentage |
| `business-coverage` | Business rule coverage percentage |
| `integration-coverage` | Integration flow coverage percentage |
| `error-coverage` | Error handling coverage percentage |
| `security-coverage` | Security coverage percentage |
| `reports-dir` | Absolute path to the generated reports directory |
| `overallStatus` | `"passed"` or `"failed"` |
| `overallCoverage` | Average coverage % across all analyzed categories |
| `failedGates` | Comma-separated list of failed category names (empty when all pass) |
| `summaryPath` | Path to the generated `build-summary.md` |

The action fails (non-zero exit code) when any coverage threshold is not met.
Summary files are always generated – even when the gate fails.

## Commands overview

| Command | What it measures | Key flag |
|---------|-----------------|---------|
| `endpoint-coverage` | % of spec endpoints hit by tests | `--spec`, `--tests` |
| `parameter-coverage` | valid/boundary/missing/invalid param testing | `--spec`, `--tests` |
| `business-coverage` | % of business rules covered (`@businessRule`) | `--rules`, `--tests` |
| `integration-coverage` | % of integration flows covered (`@flow`) | `--flows`, `--tests` |
| `error-coverage` | 4xx/5xx/validation/timeout scenarios | `--spec`, `--tests` |
| `security-coverage` | OWASP Top-10 security scenarios | `--spec`, `--tests` |
| `perf-resilience-coverage` | Load-test SLA + resilience patterns | `--spec`, `--load-results` |
| `compatibility-check` | Breaking changes + Pact contract violations | `--old-spec`, `--new-spec` |
| `generate-md-report` | Markdown summary from JSON reports | `--reports`, `--output` |
| `coverage-intelligence` | Identify findings, missing tests, risk scores, P0–P3 priorities | `--reports-dir`, `--out-dir` |

All commands accept `--format json,html,csv,junit` and `--threshold-*` flags.

### Coverage Intelligence (`coverage-intelligence`)

The intelligence command ingests all coverage reports and produces prioritised, AI-friendly outputs:

```bash
# Generate intelligence reports after running other coverage commands
api-coverage coverage-intelligence \
  --reports-dir reports \
  --out-dir     reports \
  --project-name my-api \
  --languages   typescript \
  --frameworks  jest
```

**Generated files:**

| File | Description |
|------|-------------|
| `reports/coverage-intelligence.json` | Full intelligence report (findings + recommendations) |
| `reports/coverage-intelligence.md` | AI-friendly summary with top 10 findings and recommendations |
| `reports/missing-tests-recommendations.json` | Prioritised missing test recommendations |
| `reports/missing-tests-recommendations.md` | Markdown recommendations per recommendation |
| `reports/risk-prioritization.json` | Risk breakdown by score, category, and endpoint |
| `reports/risk-prioritization.md` | Risk prioritisation narrative |

**Functional Findings** map gaps in coverage to specific root causes (e.g. "no auth test on DELETE /users/{id}").  
**Missing Test Recommendations** are prioritised P0–P3 by a risk formula:

```
Risk Score =
  0.30 × SeverityWeight +
  0.20 × ExposureWeight +
  0.15 × CriticalityWeight +
  0.15 × MissingCoverageWeight +
  0.10 × SecuritySignalWeight +
  0.05 × FlowImpactWeight +
  0.05 × ChangeVolatilityWeight
```

| Score | Risk Band | Priority |
|-------|-----------|---------|
| 85–100 | Critical | P0 — immediate action |
| 70–84 | Critical | P1 — high urgency |
| 50–69 | High | P2 — address soon |
| 0–49 | Moderate/Low | P3 — backlog |

Security findings, money-movement endpoints, and auth/authz gaps are never rated below P1 regardless of formula score.

## Configuration

Create a `coverage.config.json` in your project root:

```json
{
  "thresholds": {
    "endpoint":    80,
    "parameter":   70,
    "business":    60,
    "integration": 50,
    "security":    60,
    "error":       50,
    "performance": 75,
    "resilience":  50
  },
  "summary": {
    "enabled": true,
    "generatePrSummary": true,
    "generateBuildSummary": true,
    "generateAiSummary": true,
    "includeOnlyEvaluatedSections": false,
    "publishPrComment": true,
    "publishGithubStepSummary": true,
    "publishJenkinsSummary": true
  },
  "exclude": {
    "paths":   ["/internal/*"],
    "methods": ["OPTIONS"]
  },
  "testPatterns": ["tests/**/*.ts"],
  "plugins":    ["./plugins/graphql-coverage.js"]
}
```

CLI flags override config file values.

## Built-in Summary Engine

The library owns summary generation. No custom scripting is needed.

### Generated files

When reports are generated (via CLI or GitHub Action), the following summary files
are automatically written to the configured `--reports-dir`:

| File | Description |
|------|-------------|
| `reports/build-summary.md` | Full CI/build summary (Markdown) |
| `reports/pr-summary.md` | Concise PR comment summary (Markdown) |
| `reports/summary.json` | Machine-readable summary data |
| `reports/ai-summary.md` | AI-optimized Markdown for agents |
| `reports/ai-summary.json` | AI-optimized JSON for agents |

### Gate-aware inclusion

Sections are included only when the analyzer ran or a threshold was configured.
Analyzers that did not run are silently omitted – no empty sections appear.

Set `includeOnlyEvaluatedSections: true` in `coverage.config.json` to omit even
analyzers that ran but have no threshold configured.

### Public API

```ts
import { generateBuildSummary, generatePrSummary } from 'api-test-coverage-analyzer';

const { markdown, sections, json } = await generateBuildSummary({
  results,          // CoverageResult[] from any analyze* call
  qualityGate,      // QualityGateResult (optional)
  thresholds,       // Record<string, number> (optional)
  projectName: 'my-api',
  branch: 'main',
}, 'reports');      // optional output directory
```

```ts
type SummaryResult = {
  markdown: string;
  sections: Array<{
    id: string;       // e.g. "endpoint", "security-scan"
    title: string;    // human-readable heading
    included: boolean;
    gateEvaluated: boolean;
    passed?: boolean;
    markdown: string;
  }>;
  json: unknown;      // machine-readable summary object
};
```

### GitHub Action outputs

| Output | Description |
|--------|-------------|
| `overallStatus` | `"passed"` or `"failed"` |
| `overallCoverage` | Average coverage % across all analyzed categories |
| `failedGates` | Comma-separated list of failed category names |
| `summaryPath` | Path to `build-summary.md` |

## UI Dashboard

A Vite + React dashboard is included for visualising reports:

```bash
cd dashboard
npm install
npm run dev    # http://localhost:5173
```

Load any JSON report from `reports/` and explore:

- Overview, Endpoints, Parameters, Business Rules, Integration Flows
- Security, Errors, Performance/Resilience, Trends

## Documentation

Full documentation is available in the [`docs/`](docs/) directory and can be served locally:

```bash
npm run docs:dev      # start dev server at http://localhost:5174
npm run docs:build    # build static site → docs/.vitepress/dist/
npm run docs:check    # validate sidebar, links, and assets, then build
npm run docs:preview  # serve the built site (production preview)
npm run docs:test     # run Cypress navigation/link tests
```

Documentation sections:

| Section | Description |
|---------|-------------|
| [Getting Started](docs/guide/getting-started.md) | First-run walkthrough |
| [Installation](docs/guide/installation.md) | Detailed setup steps |
| [CLI Reference](docs/reference/cli.md) | All commands and options |
| [Multi-Language Support](docs/guide/multi-language.md) | Java, Kotlin, Python, Ruby, Cucumber test suites |
| [Coverage Intelligence](docs/guide/coverage-intelligence.md) | Findings, risk scoring, missing test recommendations |
| [Architecture](docs/reference/architecture.md) | Module design and data flow |
| [CI/CD Integration](docs/guide/ci-cd.md) | GitHub Actions & Jenkins |
| [Interpreting Reports](docs/guide/interpreting-reports.md) | Reading each report type |
| [Writing Effective Tests](docs/guide/writing-tests.md) | Test best practices |
| [Extending via Plugins](docs/guide/plugins.md) | Custom coverage types |
| [Configuration Schema](docs/reference/configuration.md) | `coverage.config.json` reference |
| [Troubleshooting](docs/guide/troubleshooting.md) | Common issues & FAQ |
| [Glossary](docs/guide/glossary.md) | Key terms |
| [Contributing](docs/reference/contributing.md) | How to contribute |

## TypeScript Example Project

A complete end-to-end example is available under [`examples/typescript/`](examples/typescript/).

This is a realistic **Wallets / Payments API** that demonstrates the analyzer in a real project context.

### Domain

| Concept | Description |
|---------|-------------|
| Wallets | Create, fund, debit, transfer, freeze/unfreeze, close |
| Payments | Create, process, refund, track status |
| Transactions | Ledger-style history |
| Risk / Limits | Daily limits, currency checks, idempotency |
| External deps | Payment processor + Fraud engine (nock-mocked) |

### Test layers

| Layer | Location | What it tests |
|-------|----------|---------------|
| Unit | `tests/unit/` | Service logic, risk rules, validation |
| Integration | `tests/integration/` | Routes, auth, supertest end-to-end |
| Blackbox | `tests/blackbox/` | Positive/negative/boundary/idempotency via HTTP |
| WireMock/nock | `tests/wiremock/` | External dependency healthy / failed / timeout |

### Running the example

```bash
cd examples/typescript
npm install
npm test            # all 63 tests
npm run analyze     # run the analyzer + generate reports
npm run screenshots # capture Playwright screenshots
```

### CI/CD demonstrations

| CI System | Location | What it does |
|-----------|----------|-------------|
| GitHub Actions | `.github/workflows/ci.yml` | Install, test, analyze, screenshots, upload artifacts |
| Jenkins | `ci/jenkins/Jenkinsfile` | Install, test, analyze, archive reports, surface gate failures |

### Observability

```bash
cd examples/typescript/observability
docker-compose up   # starts Prometheus + Grafana
# Grafana at http://localhost:3000 — dashboards pre-configured
```

### Intentional coverage gaps

The example intentionally omits some test scenarios so the intelligence engine generates meaningful findings:

- Frozen wallet debit scenario (not tested)
- Daily $10,000 limit enforcement (not tested)
- Currency mismatch in transfer (not tested)
- Refund after 30-day window (not tested)
- Payment processor failure fallback (not tested)

## Self-Analysis

The analyzer is a **self-analyzing system**: on every build it runs all implemented metric types
against its own codebase, enforces 100% thresholds, and fails automatically if any metric falls
below threshold.

### Quick start

```bash
make install               # Install dependencies
make build                 # Compile TypeScript
make self-analysis-all     # Run all 8 metric types + intelligence engine
```

Or run the full CI pipeline:

```bash
make ci    # install → build → test → self-analysis-all → summary
```

### Self-analysis input artifacts

| Artifact | Path | Purpose |
|---|---|---|
| OpenAPI spec | `openapi.self-analysis.yaml` | Analyzer CLI/library API surface |
| Business rules | `business-rules.self-analysis.yaml` | One rule per documented capability (19 rules) |
| Integration flows | `integration-flows.self-analysis.yaml` | Key usage sequences (5 flows) |
| Perf data | `load-results.self-analysis.json` | Reference data for performance metric |
| Config | `coverage.self-analysis.json` | 100% thresholds across all metrics |

### Reports

All reports are written to `reports/` after each run:

| File | Contents |
|---|---|
| `reports/endpoint-report.json/html` | Endpoint coverage |
| `reports/parameter-report.json/html` | Parameter coverage |
| `reports/business-report.json/html` | Business rule coverage |
| `reports/integration-report.json/html` | Integration flow coverage |
| `reports/error-report.json/html` | Error scenario coverage |
| `reports/security-report.json/html` | Security control coverage |
| `reports/perf-resilience-report.json/html` | Performance/resilience coverage |
| `reports/coverage-intelligence.json` | Intelligence findings + risk scores |
| `reports/pr-summary.md` | PR comment summary |
| `reports/build-summary.md` | Build log summary |

### Thresholds

All self-analysis thresholds default to **100%**. Override via environment variables for development:

```bash
THRESHOLD_ENDPOINT=80 make self-analysis-endpoint
```

See [docs/guides/thresholds.md](docs/guides/thresholds.md) for full threshold documentation.

### CI integration

The `.github/workflows/self-analysis.yml` workflow runs on every push and pull request.
All steps call Makefile targets. Pass/fail is governed by the analyzer's process exit code only.

See [docs/guides/self-analysis.md](docs/guides/self-analysis.md) for the full self-analysis guide.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [full contributing guide](docs/reference/contributing.md).

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## License

MIT © [q-intel](https://github.com/q-intel)
