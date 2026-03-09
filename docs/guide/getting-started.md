# Getting Started

This guide walks you through running your first coverage analysis in under five minutes using the sample project included in the repository.

## 1. Install the tool

If you haven't already, follow the [Installation guide](./installation.md). The quickest path:

```bash
git clone https://github.com/q-intel/apiTestsCoverageAnalyzer.git
cd apiTestsCoverageAnalyzer
npm install
npm run build
```

## 2. Explore the sample project

The `sample/` directory contains everything you need to experiment:

```
sample/
├── openapi.yaml                  # OpenAPI 3.0 spec (users, orders, products)
├── openapi-parameters.yaml       # spec focusing on parameter schemas
├── openapi-errors.yaml           # spec with error-response definitions
├── openapi-security.yaml         # spec with security schemes
├── business-rules.yaml           # named business rules + scenarios
├── integration-flows.yaml        # multi-step integration flows
├── load-results-jmeter.csv       # sample JMeter load-test output
├── load-results-k6.json          # sample k6 summary export
├── v1.yaml / v2.yaml             # two API versions for compatibility testing
├── contracts/                    # Pact consumer contracts
│   ├── user-service-client.json
│   └── product-service-client.json
└── tests/                        # sample test suites
    ├── sample.test.ts            # endpoint-level tests (TypeScript)
    ├── parameter.test.ts         # parameter scenario tests
    ├── business.test.ts          # business-rule annotated tests
    ├── integration.test.ts       # integration flow annotated tests
    ├── error.test.ts             # error scenario tests
    ├── security.test.ts          # security scenario tests
    ├── perf-resilience.test.ts   # performance and resilience tests
    ├── java/
    │   └── UserApiTest.java      # JUnit 5 + RestAssured
    ├── kotlin/
    │   └── UserApiSpec.kt        # Kotest + Ktor client
    ├── python/
    │   └── test_users.py         # pytest + requests
    ├── ruby/
    │   └── users_spec.rb         # RSpec request specs
    └── cucumber/
        ├── features/
        │   └── users.feature     # Gherkin scenarios
        └── step_definitions/
            └── users_steps.rb    # Ruby step definitions
```

## 3. Run endpoint coverage

```bash
# TypeScript tests (default)
node dist/index.js endpoint-coverage \
  --spec sample/openapi.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html \
  --threshold-endpoint 80

# Java tests
node dist/index.js endpoint-coverage \
  --spec sample/openapi.yaml \
  --tests "sample/tests/java/**/*.java" \
  --language java \
  --format json,html

# Python tests
node dist/index.js endpoint-coverage \
  --spec sample/openapi.yaml \
  --tests "sample/tests/python/**/*.py" \
  --language python \
  --format json,html
```

Reports are written to the `reports/` directory:

- `reports/endpoint-coverage.json` – machine-readable results (includes `languages` per endpoint)
- `reports/endpoint-coverage.html` – interactive HTML report with Languages column

See [Multi-Language Support →](./multi-language.md) for all supported languages and frameworks.

## 4. Run all coverage types

Run each coverage command in sequence (or all together in CI – see [CI/CD Integration](./ci-cd.md)):

```bash
# Parameter coverage
node dist/index.js parameter-coverage \
  --spec sample/openapi-parameters.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html

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

# Error handling coverage
node dist/index.js error-coverage \
  --spec sample/openapi-errors.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html

# Security coverage
node dist/index.js security-coverage \
  --spec sample/openapi-security.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html

# Performance & resilience coverage
node dist/index.js perf-resilience-coverage \
  --spec sample/openapi.yaml \
  --tests "sample/tests/**/*.ts" \
  --load-results "sample/load-results-jmeter.csv,sample/load-results-k6.json" \
  --format json,html

# Compatibility check
node dist/index.js compatibility-check \
  --old-spec sample/v1.yaml \
  --new-spec sample/v2.yaml \
  --contracts "sample/contracts/**/*.json" \
  --format json,html

# Generate a combined Markdown summary
node dist/index.js generate-md-report \
  --reports "reports/*.json" \
  --output reports/summary.md
```

## 5. View the UI dashboard

The UI dashboard is a separate Vite + React application that reads the generated JSON reports.

```bash
cd dashboard
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. Click **Load Report** and select one of the JSON files from `reports/`.

You will see:

- **Overview** – overall coverage percentages and pass/fail thresholds
- **Endpoints** – per-endpoint coverage with HTTP method badges
- **Parameters** – category breakdown (valid/boundary/missing/invalid)
- **Business Rules** – rule-by-rule coverage with scenario drill-down
- **Integration Flows** – flow step coverage
- **Security** – OWASP category coverage heatmap
- **Errors** – error-scenario coverage by HTTP status range
- **Performance/Resilience** – response-time and error-rate heatmap
- **Trends** – historical coverage over time (requires multiple report files)

## 6. Use a configuration file

Instead of passing all flags on the command line, create a `config.yaml` at your project root:

```yaml
version: 1

thresholds:
  endpoint: 80
  parameter: 70
  business: 60
  integration: 50

qualityGate:
  mode: warn
```

The analyzer automatically reads `config.yaml` from the project root. Pass `--config path/to/config.yaml`
to use a different file. See [Configuration Reference](../guides/configuration.md) for all options.

## Next steps

- [CLI Reference →](../reference/cli.md) – all commands and options
- [Multi-Language Support →](./multi-language.md) – Java, Kotlin, Python, Ruby, Cucumber
- [CI/CD Integration →](./ci-cd.md) – automate coverage checks in GitHub Actions / Jenkins
- [Interpreting Reports →](./interpreting-reports.md) – how to read each report type
- [Writing Effective Tests →](./writing-tests.md) – best practices for good coverage
