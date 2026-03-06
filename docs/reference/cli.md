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

Analyses which API endpoints defined in an OpenAPI spec are exercised by tests.

### How it works

The analyzer parses the OpenAPI spec and extracts all `METHOD /path` pairs. It then scans test file descriptions for matching strings (e.g. a test named `GET /users returns list` covers `GET /users`).

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--spec <path>` | Path to OpenAPI YAML/JSON spec | **required** |
| `--tests <glob>` | Glob pattern for test files | **required** |
| `--threshold-endpoint <n>` | Minimum coverage % to pass | `0` |
| `--format <formats>` | Output formats | `json,html` |

### Example

```bash
node dist/index.js endpoint-coverage \
  --spec sample/openapi.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html,csv,junit \
  --threshold-endpoint 80
```

### Output files

| File | Description |
|------|-------------|
| `reports/endpoint-coverage.json` | Machine-readable coverage result |
| `reports/endpoint-coverage.html` | Interactive HTML report |
| `reports/endpoint-coverage.csv` | CSV with one row per endpoint |
| `reports/coverage-summary-junit.xml` | JUnit XML with pass/fail result |

---

## `parameter-coverage`

Analyses how thoroughly each endpoint parameter is tested across four categories.

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

Analyses which business rules defined in a YAML file are covered by annotated tests.

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

Analyses which end-to-end integration flows are fully exercised.

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

Analyses which error scenarios (4xx, 5xx, validation, timeout) are covered.

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

Analyses which security scenarios (OWASP categories) are covered.

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

## `perf-resilience-coverage`

Analyses performance (load-test data) and resilience (test annotations) coverage.

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
