# CLI Reference

All commands are invoked as:

```bash
node dist/index.js <command> [options]
# or with ts-node (no build step):
node -r ts-node/register src/index.ts <command> [options]
```

## Global options

These options are available on every command:

| Flag | Description | Default |
|------|-------------|---------|
| `--format <formats>` | Comma-separated output formats: `json`, `html`, `csv`, `junit` | `json,html` |
| `--config <path>` | Path to a `coverage.config.json` file | `./coverage.config.json` |
| `-h, --help` | Display help for the command | – |

---

## `endpoint-coverage`

Analyzes which API endpoints defined in an OpenAPI spec are exercised by tests.

### How it works

The analyzer parses the OpenAPI spec and extracts all `METHOD /path` pairs. It then scans test files for matching HTTP calls. The scanner uses language-aware extractors (see `--language` below) to detect API calls in TypeScript, JavaScript, Java, Kotlin, Python, Ruby, and Cucumber test suites.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--spec <path>` | Path to OpenAPI YAML/JSON spec | **required** |
| `--tests <glob>` | Glob pattern for test files | **required** |
| `--language <lang>` | Test language(s) to analyse. See [Supported languages](#supported-languages). Comma-separated or repeated. | `auto` |
| `--threshold-endpoint <n>` | Minimum coverage % to pass | `0` |
| `--format <formats>` | Output formats | `json,html` |

### Supported languages

| Value | Language / ecosystem | Auto-detected from |
|-------|---------------------|-------------------|
| `auto` | Infer from file extensions (default) | n/a |
| `typescript` | TypeScript (Jest, Mocha, Vitest, Supertest) | `.ts`, `.tsx` |
| `javascript` | JavaScript (Jest, Mocha, Vitest, Supertest) | `.js`, `.jsx` |
| `java` | Java (JUnit 4/5, TestNG, RestAssured, Spring MockMvc / WebTestClient) | `.java` |
| `kotlin` | Kotlin (Kotest, Ktor client, RestAssured) | `.kt`, `.kts` |
| `python` | Python (pytest, unittest, requests, httpx, Flask/Django test client) | `.py` |
| `ruby` | Ruby (RSpec, Minitest, HTTParty, Faraday, Rails integration tests) | `.rb` |
| `cucumber` | Gherkin `.feature` files + step definitions in any supported language | `.feature` |

Pass a comma-separated list or repeat the flag for multi-language projects:

```bash
--language java,kotlin
--language java --language kotlin
```

### Default test glob per language

When a single language is given and `--tests` is not specified, the analyzer uses a sensible default glob:

| Language | Default glob |
|----------|-------------|
| `java` | `**/*Test.java` |
| `kotlin` | `**/*Test.kt` |
| `python` | `**/test_*.py` |
| `ruby` | `**/*_spec.rb` |
| `cucumber` | `**/*.feature` |
| `typescript` | `**/*.test.ts` |
| `javascript` | `**/*.test.js` |

### Example

```bash
# TypeScript / JavaScript (default)
node dist/index.js endpoint-coverage \
  --spec sample/openapi.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html,csv,junit \
  --threshold-endpoint 80

# Java – RestAssured / JUnit 5
node dist/index.js endpoint-coverage \
  --spec sample/openapi.yaml \
  --tests "src/test/**/*.java" \
  --language java \
  --threshold-endpoint 80

# Kotlin – Kotest + Ktor client
node dist/index.js endpoint-coverage \
  --spec sample/openapi.yaml \
  --tests "src/test/**/*.kt" \
  --language kotlin

# Python – pytest + requests
node dist/index.js endpoint-coverage \
  --spec sample/openapi.yaml \
  --tests "tests/**/*.py" \
  --language python

# Ruby – RSpec request specs
node dist/index.js endpoint-coverage \
  --spec sample/openapi.yaml \
  --tests "spec/**/*.rb" \
  --language ruby

# Cucumber – feature files
node dist/index.js endpoint-coverage \
  --spec sample/openapi.yaml \
  --tests "features/**/*.feature" \
  --language cucumber

# Multi-language project
node dist/index.js endpoint-coverage \
  --spec sample/openapi.yaml \
  --tests "{src/test/**/*.java,spec/**/*.rb}" \
  --language java,ruby \
  --threshold-endpoint 80
```

### Output files

| File | Description |
|------|-------------|
| `reports/endpoint-coverage.json` | Machine-readable coverage result (includes `languages` array per endpoint) |
| `reports/endpoint-coverage.html` | Interactive HTML report (includes Languages column) |
| `reports/endpoint-coverage.csv` | CSV with one row per endpoint |
| `reports/coverage-summary-junit.xml` | JUnit XML with pass/fail result |

The JSON report includes a `languages` field for each endpoint listing which language(s) have tests that cover it:

```json
{
  "endpoints": [
    {
      "method": "GET",
      "path": "/users",
      "covered": true,
      "testFiles": ["sample/tests/java/UserApiTest.java"],
      "languages": ["java"]
    }
  ]
}
```

---

## `parameter-coverage`

Analyzes how thoroughly each endpoint parameter is tested across four categories.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--spec <path>` | Path to OpenAPI spec | **required** |
| `--tests <glob>` | Glob pattern for test files | **required** |
| `--threshold-parameter <n>` | Minimum coverage % to pass | `0` |
| `--format <formats>` | Output formats | `json,html` |

### Example

```bash
node dist/index.js parameter-coverage \
  --spec sample/openapi-parameters.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html,csv,junit \
  --threshold-parameter 70
```

### Parameter categories

| Category | Detected by |
|----------|-------------|
| `valid` | Test description contains the parameter name and endpoint |
| `boundary` | Description contains `boundary`, `min`, `max`, `edge`, `limit`, `empty` |
| `missing` | Description contains `missing`, `absent`, `without`, `omit`, `no ` + param name |
| `invalid` | Description contains `invalid`, `wrong type`, `malformed`, `bad`, `reject` |

---

## `business-coverage`

Analyzes which business rules defined in a YAML file are covered by annotated tests.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--rules <path>` | Path to business rules YAML | **required** |
| `--tests <glob>` | Glob pattern for test files | **required** |
| `--threshold-business <n>` | Minimum coverage % to pass | `0` |
| `--format <formats>` | Output formats | `json,html` |

### Example

```bash
node dist/index.js business-coverage \
  --rules sample/business-rules.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html,csv,junit \
  --threshold-business 60
```

### Test annotation

Include `@businessRule <rule-id>` or `@businessRule <rule-id>/<scenario-id>` in the test description.

---

## `integration-coverage`

Analyzes which end-to-end integration flows are fully exercised.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--flows <path>` | Path to integration flows YAML | **required** |
| `--tests <glob>` | Glob pattern for test files | **required** |
| `--threshold-integration <n>` | Minimum coverage % to pass | `0` |
| `--format <formats>` | Output formats | `json,html` |

### Example

```bash
node dist/index.js integration-coverage \
  --flows sample/integration-flows.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html,csv,junit \
  --threshold-integration 50
```

### Test annotation

Include `@flow <flow-id>` in the test description.

---

## `error-coverage`

Analyzes which error scenarios (4xx, 5xx, validation, timeout) are covered.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--spec <path>` | Path to OpenAPI spec | **required** |
| `--tests <glob>` | Glob pattern for test files | **required** |
| `--threshold-error <n>` | Minimum coverage % to pass | `0` |
| `--format <formats>` | Output formats | `json,html` |

### Example

```bash
node dist/index.js error-coverage \
  --spec sample/openapi-errors.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html,csv,junit \
  --threshold-error 50
```

---

## `security-coverage`

Analyzes which security scenarios (OWASP categories) are covered by **tests** (test-based heuristic matching).

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--spec <path>` | Path to OpenAPI spec | **required** |
| `--tests <glob>` | Glob pattern for test files | **required** |
| `--threshold-security <n>` | Minimum coverage % to pass | `0` |
| `--format <formats>` | Output formats | `json,html` |

### Example

```bash
node dist/index.js security-coverage \
  --spec sample/openapi-security.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html,csv,junit \
  --threshold-security 60
```

---

## `security-scan`

Runs integrated open-source security scanners (Semgrep, Trivy, ZAP), normalizes findings into a unified model, and enforces a security gate. Unlike `security-coverage`, this command uses real scanner tooling rather than test heuristics.

See the full [Security Scanning guide →](../guide/security-scanning.md) for detailed setup instructions.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--workspace <path>` | Root directory to scan | `.` (current dir) |
| `--semgrep` | Enable Semgrep (requires binary) | off |
| `--semgrep-config <cfg>` | Semgrep ruleset (e.g. `p/default`, `p/security-audit`) | `p/default` |
| `--semgrep-report <file>` | Import pre-generated Semgrep JSON instead of running binary | — |
| `--trivy` | Enable Trivy (requires binary) | off |
| `--trivy-scanners <list>` | Comma-separated: `vuln`, `secret`, `misconfig` | `vuln,secret` |
| `--trivy-report <file>` | Import pre-generated Trivy JSON instead of running binary | — |
| `--zap-report <file>` | Import pre-generated ZAP JSON report | — |
| `--fail-on-critical` | Fail the gate if any CRITICAL finding exists | off |
| `--fail-on-high` | Fail the gate if any HIGH finding exists | off |
| `--max-medium <n>` | Maximum allowed MEDIUM findings | — |
| `--max-secrets <n>` | Maximum allowed secrets (any severity) | — |
| `--max-misconfig-high <n>` | Maximum allowed HIGH/CRITICAL misconfigurations | — |
| `--max-critical-vulns <n>` | Maximum allowed CRITICAL dependency vulnerabilities | — |
| `--max-high-vulns <n>` | Maximum allowed HIGH dependency vulnerabilities | — |

### Example – import mode (recommended)

```bash
# Step 1: generate scanner reports separately
semgrep scan --json --config p/security-audit src/ > reports/semgrep.json
trivy fs --format json --scanners vuln,secret,misconfig . > reports/trivy.json

# Step 2: import + enforce gate
node dist/index.js security-scan \
  --semgrep-report reports/semgrep.json \
  --trivy-report   reports/trivy.json \
  --fail-on-critical \
  --fail-on-high \
  --max-secrets 0
```

### Example – embedded mode

```bash
node dist/index.js security-scan \
  --workspace . \
  --semgrep \
  --semgrep-config p/default \
  --trivy \
  --trivy-scanners vuln,secret,misconfig \
  --fail-on-critical \
  --max-secrets 0 \
  --max-medium 10
```

### Output files

| File | Description |
|------|-------------|
| `reports/security-scan-summary.json` | Aggregated counts, gate result |
| `reports/security-scan-summary.html` | Interactive HTML summary |
| `reports/security-sast.json` | SAST / injection findings |
| `reports/security-dependencies.json` | Dependency vulnerability findings |
| `reports/security-secrets.json` | Secret findings |
| `reports/security-misconfig.json` | Misconfiguration findings |
| `reports/security-dast.json` | DAST / ZAP findings |
| `reports/security-ai-summary.md` | AI-friendly Markdown with remediation order |

---

## `perf-resilience-coverage`

Analyzes performance (load-test data) and resilience (test annotations) coverage.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--spec <path>` | Path to OpenAPI spec | **required** |
| `--tests <glob>` | Glob pattern for test files | **required** |
| `--load-results <paths>` | Comma-separated list of JMeter CSV or k6 JSON files | – |
| `--threshold-response-ms <n>` | Max acceptable median response time (ms) | `500` |
| `--threshold-error-rate <n>` | Max acceptable error rate (0–1) | `0.05` |
| `--threshold-performance <n>` | Min performance coverage % | `0` |
| `--threshold-resilience <n>` | Min resilience coverage % | `0` |
| `--format <formats>` | Output formats | `json,html` |

### Example

```bash
node dist/index.js perf-resilience-coverage \
  --spec sample/openapi.yaml \
  --tests "sample/tests/**/*.ts" \
  --load-results "sample/load-results-jmeter.csv,sample/load-results-k6.json" \
  --threshold-response-ms 500 \
  --threshold-error-rate 0.05 \
  --format json,html,csv,junit \
  --threshold-performance 80 \
  --threshold-resilience 70
```

---

## `compatibility-check`

Detects breaking changes between two OpenAPI spec versions and verifies Pact consumer contracts.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--old-spec <path>` | Path to the previous API spec | **required** |
| `--new-spec <path>` | Path to the new API spec | **required** |
| `--contracts <glob>` | Glob for Pact JSON contract files | – |
| `--threshold-compat <n>` | Min compatibility % to pass | `0` |
| `--format <formats>` | Output formats | `json,html` |

### Example

```bash
node dist/index.js compatibility-check \
  --old-spec sample/v1.yaml \
  --new-spec sample/v2.yaml \
  --contracts "sample/contracts/**/*.json" \
  --format json,html,csv,junit \
  --threshold-compat 100
```

---

## `generate-md-report`

Generates a Markdown summary from one or more JSON report files.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--reports <glob>` | Glob for JSON report files | **required** |
| `--output <path>` | Output Markdown file path | `reports/summary.md` |

### Example

```bash
node dist/index.js generate-md-report \
  --reports "reports/*.json" \
  --output reports/summary.md
```

---

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | All thresholds passed |
| `1` | One or more thresholds failed |
| `2` | Fatal error (missing required argument, spec parse failure, etc.) |

---

## Environment variables

| Variable | Description |
|----------|-------------|
| `LOG_LEVEL` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`). Default: `info` |
| `METRICS_PORT` | Port for the Prometheus metrics endpoint. Default: `9464` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector endpoint for trace export |
