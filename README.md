# apiTestsCoverageAnalyzer

A CLI tool that analyses API test coverage against OpenAPI specifications, business rules, and integration flows – and generates multi-format reports with configurable pass/fail thresholds for CI pipelines.

---

## Getting started

```sh
npm install
npm run build        # compile TypeScript → dist/
npm test             # run all Jest tests
```

---

## Commands

All commands share two common options in addition to their specific inputs:

| Option | Description | Default |
|--------|-------------|---------|
| `--format <formats>` | Comma-separated output formats: `json`, `html`, `csv`, `junit` | `json,html` |
| `--threshold-*` | Minimum coverage % – see below | `0` (disabled) |

### `endpoint-coverage`

Analyses which API endpoints defined in an OpenAPI spec are exercised by tests.

```sh
node -r ts-node/register src/index.ts endpoint-coverage \
  --spec sample/openapi.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html,csv,junit \
  --threshold-endpoint 80
```

### `parameter-coverage`

Analyses how thoroughly each parameter is tested across four categories: valid value, boundary value, missing value, and invalid value.

```sh
node -r ts-node/register src/index.ts parameter-coverage \
  --spec sample/openapi-parameters.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html,csv,junit \
  --threshold-parameter 70
```

### `business-coverage`

Analyses which business rules and their scenarios are covered by tests.

```sh
node -r ts-node/register src/index.ts business-coverage \
  --rules sample/business-rules.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html,csv,junit \
  --threshold-business 60
```

### `integration-coverage`

Analyses which end-to-end integration flows are fully exercised by tests.

```sh
node -r ts-node/register src/index.ts integration-coverage \
  --flows sample/integration-flows.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html,csv,junit \
  --threshold-integration 50
```

### `perf-resilience-coverage`

Analyses how well tests cover **performance under load** and **resilience to failure conditions** for each API endpoint. It integrates insights from popular load-testing tools (JMeter, k6) and resilience testing frameworks (Chaos Monkey patterns).

```sh
node -r ts-node/register src/index.ts perf-resilience-coverage \
  --spec sample/openapi.yaml \
  --tests "sample/tests/**/*.ts" \
  --load-results "sample/load-results-jmeter.csv,sample/load-results-k6.json" \
  --threshold-response-ms 500 \
  --threshold-error-rate 0.05 \
  --format json,html,csv,junit \
  --threshold-performance 80 \
  --threshold-resilience 70
```

#### Performance coverage

- Each endpoint in the spec becomes a *performance item* to be measured.
- `--load-results` accepts a comma-separated list of load-test result files:
  - **JMeter `.jtl` / `.csv`** – standard JMeter CSV format with columns `timeStamp,elapsed,label,responseCode,success,...`. Samples are grouped by the `label` column (set your sampler label to `METHOD /path`, e.g. `GET /users`).
  - **k6 JSON summary** – output of `k6 run --summary-export=results.json`. Top-level metrics populate an `"overall"` entry; per-scenario breakdowns (when the `scenarios` key is present) are indexed by scenario name.
- Coverage percentage = `(endpoints with load-test data) / (total endpoints)`.
- Each endpoint with data is evaluated against:
  - `--threshold-response-ms` (default 500 ms) – median response time threshold.
  - `--threshold-error-rate` (default 0.05) – error rate threshold (0–1).

**Generating compatible load-test results:**

```sh
# JMeter (command-line)
jmeter -n -t my-test-plan.jmx \
  -l sample/load-results-jmeter.csv \
  -Jjmeter.save.saveservice.default_delimiter=,

# k6
k6 run --summary-export=sample/load-results-k6.json k6-script.js
```

#### Resilience coverage

The analyzer generates six resilience scenarios **per endpoint** and checks whether at least one test addresses each:

| Category | What to test |
|----------|-------------|
| `timeout` | Slow/unresponsive upstream causes a proper timeout error |
| `retry` | Transient failures trigger retries with back-off |
| `circuit-breaker` | Repeated failures open the circuit, stopping cascading failures |
| `fallback` | Unavailable dependency returns a graceful degraded response |
| `rate-limiting` | Excessive requests return HTTP 429 with `Retry-After` |
| `bulkhead` | Resource isolation prevents one endpoint from starving others |

#### Writing resilience tests the analyzer can recognize

Use **category keywords** in your test descriptions:

| Category | Keywords (partial list) |
|----------|------------------------|
| `timeout` | `timeout`, `timed out`, `deadline exceeded`, `response time` |
| `retry` | `retry`, `retries`, `backoff`, `exponential backoff` |
| `circuit-breaker` | `circuit breaker`, `circuit open`, `tripped` |
| `fallback` | `fallback`, `graceful degradation`, `503`, `service unavailable` |
| `rate-limiting` | `rate limit`, `429`, `too many requests`, `throttle` |
| `bulkhead` | `bulkhead`, `isolation`, `concurrency limit`, `overload` |

For **precise, endpoint-specific** coverage use the `@resilience <scenarioId>` annotation:

```ts
test('@resilience timeout:GET /users - upstream timeout returns 504', () => { ... });
test('@resilience circuit-breaker:POST /orders - opens after 5 failures', () => { ... });
```

#### Understanding performance metrics

| Metric | Description | Recommended threshold |
|--------|-------------|----------------------|
| **Median (P50)** | Half of requests are faster than this | < 500 ms |
| **P95** | 95% of requests are faster than this | < 1 000 ms |
| **P99** | 99% of requests are faster than this | < 2 000 ms |
| **Error rate** | Fraction of failed requests (non-2xx) | < 5% (0.05) |
| **Throughput** | Requests per second sustained | depends on SLA |

Industry benchmarks: API calls responding in **< 200 ms** feel instant; **< 1 s** is acceptable; P95 < 500 ms is a common production SLA.

---

### `error-coverage`

Analyses how thoroughly tests cover the **negative/error scenarios** (4xx and 5xx responses) documented in an OpenAPI spec.

```sh
node -r ts-node/register src/index.ts error-coverage \
  --spec sample/openapi-errors.yaml \
  --tests "sample/tests/**/*.ts" \
  --format json,html,csv,junit \
  --threshold-error 70
```

Each documented non-2xx response becomes an *error scenario* that is classified into one or more categories:

| Category | Status codes typically involved |
|----------|--------------------------------|
| `missing-parameter` | 400 (with "missing"/"required" description) |
| `invalid-value` | 400 (with "invalid"/"format" description), 422 |
| `unauthorized` | 401 |
| `forbidden` | 403 |
| `not-found` | 404 |
| `conflict` | 409 |
| `server-error` | 500, 502, 503, 504 |

#### How the heuristic works

The analyzer scans each `test()` / `it()` block for evidence that it exercises an error scenario. A test is considered to **cover** a scenario when:

1. **It calls the same endpoint** – the test description or code contains the HTTP method and path base  
   (e.g. `POST /users`, `GET /users/`).

2. **AND one of the following is true:**

   | Evidence type | Examples |
   |---------------|----------|
   | Direct status-code assertion | `expect(res.status).toBe(400)` · `status === 401` |
   | Category keyword in description | `"missing name"` → `missing-parameter` · `"not found"` → `not-found` |
   | Error-body assertion with keyword | `expect(res.body.message).toContain('required')` |
   | Code patterns | empty `Authorization` header → `unauthorized` · large fake ID → `not-found` · `null` value → `invalid-value` |

#### Writing tests that the analyzer can recognize

Follow these conventions so the analyzer reliably maps your tests to error scenarios:

- **Start the test description with `METHOD /path`** when possible:  
  `test('POST /users - missing name returns 400', ...)` ✅  
  `test('should return 400', ...)` ❌ (no endpoint context)

- **Include a category keyword** in the description or use a status-code assertion:  
  `"missing"`, `"invalid"`, `"unauthorized"`, `"forbidden"`, `"not found"`, `"duplicate"`, `"server error"`

- **Assert the status code directly** when possible:  
  `expect(response.status).toBe(404)` is always recognized.

- **Fake resource IDs** with 6+ digits (e.g. `999999`) are recognized as not-found probes.

- **Empty or bare `Authorization` / `Bearer `** headers are recognized as unauthorized probes.

---

## Output formats

Reports are written to the `reports/` directory. See [`reports/README.md`](reports/README.md) for a full description of each file.

| Flag value | Files generated |
|------------|-----------------|
| `json` | `coverage-summary.json` |
| `html` | `coverage-summary.html` |
| `csv` | `coverage-summary.csv` |
| `junit` | `coverage-summary-junit.xml` |

Each command also writes its own detailed report (`endpoint-coverage.json`, `endpoint-coverage.html`, etc.).

---

## Coverage thresholds

Pass one or more `--threshold-*` options to enforce minimum coverage levels:

```sh
node -r ts-node/register src/index.ts endpoint-coverage \
  --threshold-endpoint 80
```

- If coverage is **below** the threshold the CLI prints `THRESHOLD FAILURE: …` to stderr and exits with **code 1**.
- If coverage meets or exceeds the threshold the CLI exits with **code 0**.

CI systems use this exit code to pass or fail the build step automatically.

---

## CI integration

### GitHub Actions

See [`ci/examples/github-actions.yaml`](ci/examples/github-actions.yaml) for a complete workflow that:

- Sets up Node.js with npm caching.
- Runs all four coverage commands with threshold options.
- Uploads the `reports/` directory as a build artifact.
- Publishes the JUnit XML as a check result.

### Jenkins

See [`ci/examples/jenkins-pipeline.groovy`](ci/examples/jenkins-pipeline.groovy) for a declarative pipeline that:

- Runs all four coverage commands in parallel stages.
- Publishes the HTML report with the HTML Publisher plugin.
- Publishes the JUnit XML with the built-in JUnit plugin.
- Archives all reports as build artifacts.

### GitLab CI

Add a job similar to the following in your `.gitlab-ci.yml`:

```yaml
api-coverage:
  image: node:20
  cache:
    key: $CI_COMMIT_REF_SLUG
    paths:
      - node_modules/
  script:
    - npm ci
    - node -r ts-node/register src/index.ts endpoint-coverage --format junit --threshold-endpoint 80
    - node -r ts-node/register src/index.ts business-coverage  --format junit --threshold-business 60
  artifacts:
    when: always
    paths:
      - reports/
    reports:
      junit: reports/coverage-summary-junit.xml
```

### Azure Pipelines

```yaml
- task: NodeTool@0
  inputs:
    versionSpec: '20.x'

- script: npm ci
  displayName: Install dependencies

- script: |
    node -r ts-node/register src/index.ts endpoint-coverage \
      --format json,html,csv,junit --threshold-endpoint 80
  displayName: API endpoint coverage

- task: PublishTestResults@2
  condition: always()
  inputs:
    testResultsFormat: JUnit
    testResultsFiles: 'reports/coverage-summary-junit.xml'
    testRunTitle: 'API Coverage Thresholds'

- task: PublishPipelineArtifact@1
  condition: always()
  inputs:
    targetPath: reports
    artifact: coverage-reports
```

---

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | All configured thresholds met (or no thresholds configured) |
| `1` | One or more coverage types are below their configured threshold |

CI systems interpret a non-zero exit code as a build failure, so setting thresholds is all that is needed to block merges when coverage drops.