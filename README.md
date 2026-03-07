# API Test Coverage Analyzer

[![Build](https://github.com/skaliber/apiTestsCoverageAnalyzer/actions/workflows/api-coverage.yaml/badge.svg)](https://github.com/skaliber/apiTestsCoverageAnalyzer/actions)
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
git clone https://github.com/skaliber/apiTestsCoverageAnalyzer.git
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
    uses: skaliber/apiTestsCoverageAnalyzer/action@v1
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

The action fails (non-zero exit code) when any coverage threshold is not met.

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

All commands accept `--format json,html,csv,junit` and `--threshold-*` flags.

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
  "exclude": {
    "paths":   ["/internal/*"],
    "methods": ["OPTIONS"]
  },
  "testPatterns": ["tests/**/*.ts"],
  "plugins":    ["./plugins/graphql-coverage.js"]
}
```

CLI flags override config file values.

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
npm run docs:dev    # http://localhost:5174
```

Documentation sections:

| Section | Description |
|---------|-------------|
| [Getting Started](docs/guide/getting-started.md) | First-run walkthrough |
| [Installation](docs/guide/installation.md) | Detailed setup steps |
| [CLI Reference](docs/reference/cli.md) | All commands and options |
| [Multi-Language Support](docs/guide/multi-language.md) | Java, Kotlin, Python, Ruby, Cucumber test suites |
| [Architecture](docs/reference/architecture.md) | Module design and data flow |
| [CI/CD Integration](docs/guide/ci-cd.md) | GitHub Actions & Jenkins |
| [Interpreting Reports](docs/guide/interpreting-reports.md) | Reading each report type |
| [Writing Effective Tests](docs/guide/writing-tests.md) | Test best practices |
| [Extending via Plugins](docs/guide/plugins.md) | Custom coverage types |
| [Configuration Schema](docs/reference/configuration.md) | `coverage.config.json` reference |
| [Troubleshooting](docs/guide/troubleshooting.md) | Common issues & FAQ |
| [Glossary](docs/guide/glossary.md) | Key terms |
| [Contributing](docs/reference/contributing.md) | How to contribute |

## Coverage Analysis (Self-Analysis)

The analyzer can run against its own sample spec and test suite to produce coverage reports. This
is the recommended way to validate that the analyzer itself remains well-tested on every build.

### Running locally

```bash
# Build the library first, then run the coverage script
npm run build
npm run coverage
```

Reports are written to the `reports/` directory:

| File | Contents |
|------|----------|
| `reports/coverage-summary.json` | Combined summary across all coverage types |
| `reports/endpoint-coverage*.json/html` | Endpoint coverage details |
| `reports/parameter-coverage*.json/html` | Parameter coverage details |
| `reports/business-coverage*.json/html` | Business rule coverage details |
| `reports/integration-coverage*.json/html` | Integration flow coverage details |
| `reports/error-coverage*.json/html` | Error handling coverage details |
| `reports/security-coverage*.json/html` | Security coverage details |
| `reports/perf-resilience-coverage*.json/html` | Performance & resilience coverage details |

### CI integration

The `build` job in `.github/workflows/test-action.yml` automatically runs `npm run coverage` after
unit tests and uploads the resulting `reports/` directory as the `coverage-reports` artifact.

### Adjusting thresholds

Pass `--threshold-*` flags via the CLI or set thresholds in `coverage.config.json`:

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
  }
}
```

The `npm run coverage` script respects threshold values supplied via environment variables
(e.g. `THRESHOLD_ENDPOINT=80 npm run coverage`); the CI job will fail when any threshold is not met.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [full contributing guide](docs/reference/contributing.md).

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## License

MIT © [skaliber](https://github.com/skaliber)
