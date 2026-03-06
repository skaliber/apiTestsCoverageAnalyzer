# Configuration Schema

The analyzer reads `coverage.config.json` (or a file specified via `--config`) to set defaults for all coverage commands.

## Full schema

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
    "paths":   ["/internal/*", "/health"],
    "methods": ["OPTIONS", "HEAD"]
  },
  "testPatterns": [
    "tests/**/*.ts",
    "tests/**/*.js"
  ],
  "plugins": [
    "./plugins/graphql-coverage.js",
    "api-coverage-analyzer-plugin-grpc"
  ]
}
```

## Field reference

### `thresholds`

Minimum coverage percentages. If a coverage type's `coveragePercent` falls below its threshold the CLI exits with code 1.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `endpoint` | number | `0` | Endpoint coverage threshold |
| `parameter` | number | `0` | Parameter coverage threshold |
| `business` | number | `0` | Business rule coverage threshold |
| `integration` | number | `0` | Integration flow coverage threshold |
| `security` | number | `0` | Security coverage threshold |
| `error` | number | `0` | Error handling coverage threshold |
| `performance` | number | `0` | Performance coverage threshold |
| `resilience` | number | `0` | Resilience coverage threshold |

All thresholds default to `0` (disabled) when not specified.

### `exclude`

Paths and HTTP methods to ignore during analysis.

| Field | Type | Description |
|-------|------|-------------|
| `paths` | `string[]` | Glob patterns matching OpenAPI paths to exclude (e.g. `/internal/*`) |
| `methods` | `string[]` | HTTP methods to ignore (e.g. `["OPTIONS", "HEAD"]`) |

### `testPatterns`

Glob patterns used to locate test files. Passed to `fast-glob`. Relative to the current working directory.

Default: depends on the CLI `--tests` flag value.

### `plugins`

Array of plugin paths or npm package names to load. Each entry is passed to `require()`.

- Relative paths (`./plugins/...`) are resolved from the current working directory.
- Bare names (`api-coverage-analyzer-plugin-grpc`) are resolved as npm packages.

## CLI flag precedence

CLI flags always take precedence over config file values:

```
CLI flag > coverage.config.json > built-in default
```

For example, `--threshold-endpoint 90` overrides `thresholds.endpoint: 80` in the config file.

## Minimal example

```json
{
  "thresholds": {
    "endpoint": 80
  }
}
```

## Sample project configuration

See [`coverage.config.json`](https://github.com/skaliber/apiTestsCoverageAnalyzer/blob/main/coverage.config.json) for the configuration used by the sample project.
