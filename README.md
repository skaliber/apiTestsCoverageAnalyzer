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

```bash
# Clone the repository
git clone https://github.com/skaliber/apiTestsCoverageAnalyzer.git
cd apiTestsCoverageAnalyzer

# Install dependencies
npm install

# Compile TypeScript
npm run build

# Verify
node dist/index.js --help
```

Alternatively, use `ts-node` to skip the build step:

```bash
node -r ts-node/register src/index.ts --help
```

## Quickstart

Run all coverage types against the included sample project:

```bash
# Endpoint coverage
node dist/index.js endpoint-coverage \
  --spec sample/openapi.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html \
  --threshold-endpoint 80

# Business rule coverage
node dist/index.js business-coverage \
  --rules sample/business-rules.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html

# Integration flow coverage
node dist/index.js integration-coverage \
  --flows sample/integration-flows.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html

# Security coverage
node dist/index.js security-coverage \
  --spec sample/openapi-security.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html

# Compatibility check (breaking changes between v1 and v2)
node dist/index.js compatibility-check \
  --old-spec sample/v1.yaml \
  --new-spec sample/v2.yaml \
  --contracts "sample/contracts/**/*.json" \
  --format json,html
```

Reports are written to the `reports/` directory.

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

Full documentation is available at:

**[https://skaliber.github.io/apiTestsCoverageAnalyzer/](https://skaliber.github.io/apiTestsCoverageAnalyzer/)**

Serve locally:

```bash
npm run docs:dev    # http://localhost:5174
```

Documentation sections:

| Section | Description |
|---------|-------------|
| [Getting Started](https://skaliber.github.io/apiTestsCoverageAnalyzer/guide/getting-started) | First-run walkthrough |
| [Installation](https://skaliber.github.io/apiTestsCoverageAnalyzer/guide/installation) | Detailed setup steps |
| [CLI Reference](https://skaliber.github.io/apiTestsCoverageAnalyzer/reference/cli) | All commands and options |
| [Architecture](https://skaliber.github.io/apiTestsCoverageAnalyzer/reference/architecture) | Module design and data flow |
| [CI/CD Integration](https://skaliber.github.io/apiTestsCoverageAnalyzer/guide/ci-cd) | GitHub Actions & Jenkins |
| [Interpreting Reports](https://skaliber.github.io/apiTestsCoverageAnalyzer/guide/interpreting-reports) | Reading each report type |
| [Writing Effective Tests](https://skaliber.github.io/apiTestsCoverageAnalyzer/guide/writing-tests) | Test best practices |
| [Extending via Plugins](https://skaliber.github.io/apiTestsCoverageAnalyzer/guide/plugins) | Custom coverage types |
| [Configuration Schema](https://skaliber.github.io/apiTestsCoverageAnalyzer/reference/configuration) | `coverage.config.json` reference |
| [Troubleshooting](https://skaliber.github.io/apiTestsCoverageAnalyzer/guide/troubleshooting) | Common issues & FAQ |
| [Glossary](https://skaliber.github.io/apiTestsCoverageAnalyzer/guide/glossary) | Key terms |
| [Contributing](https://skaliber.github.io/apiTestsCoverageAnalyzer/reference/contributing) | How to contribute |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [full contributing guide](https://skaliber.github.io/apiTestsCoverageAnalyzer/reference/contributing).

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## License

MIT © [skaliber](https://github.com/skaliber)
