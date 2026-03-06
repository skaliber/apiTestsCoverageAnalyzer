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