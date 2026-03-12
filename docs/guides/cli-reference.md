# CLI Reference

All analyzer behaviour is controlled by `config.yaml`. The CLI needs no flags to run.

## Primary command

```bash
# Run full analysis using config.yaml at the project root
analyze

# Run using a custom config file
analyze --config ./configs/staging.yaml

# Run from a different project root
analyze --root /path/to/project
```

## Global flags

| Flag | Description | Default |
|---|---|---|
| `--config <path>` | Path to a `config.yaml` file | `./config.yaml` |
| `--log-level <level>` | Log verbosity: `trace\|debug\|info\|warn\|error\|silent` | `info` |
| `--metrics-port <port>` | Start a Prometheus `/metrics` server after analysis | — |
| `--service-name <name>` | Label added to all Prometheus metrics | `api-coverage-analyzer` |
| `--trace` | Enable OpenTelemetry tracing | — |
| `--trace-endpoint <url>` | OTLP HTTP endpoint for trace export | — |

## Config file discovery

1. If `--config <path>` is provided, that file is loaded. If it does not exist, the analyzer exits with an error.
2. Otherwise, the analyzer looks for `config.yaml` at the current working directory root.
3. If no config file is found, the analyzer runs the full default profile and emits:

```
[WARNING] No config.yaml found at project root.
Running full default analysis profile.
To customize scanning, thresholds, MCP integration, and reporting,
create a config.yaml file. See docs/guides/configuration.md for reference.
```

## Deprecated flags

The following flags are accepted for backward compatibility but emit deprecation warnings. Use the equivalent `config.yaml` fields instead.

| Deprecated flag | config.yaml equivalent |
|---|---|
| `--threshold-endpoint <n>` | `thresholds.endpoint` |
| `--threshold-parameter <n>` | `thresholds.parameter` |
| `--threshold-business <n>` | `thresholds.business` |
| `--threshold-integration <n>` | `thresholds.integration` |
| `--threshold-error <n>` | `thresholds.error` |
| `--threshold-security <n>` | `thresholds.security` |
| `--threshold-performance <n>` | `thresholds.performance` |
| `--threshold-compatibility <n>` | `thresholds.compatibility` |

## Validation errors

When `config.yaml` contains invalid values, the analyzer exits non-zero with a field-level error:

```
Config error: thresholds.endpoint
  Received: 150
  Expected: a number between 0 and 100 (inclusive)
  Example:  thresholds:
    endpoint: 80
```

## See also

- [Configuration Reference](configuration.md) — complete `config.yaml` field reference
- [Migration Guide](migration-to-config-yaml.md) — migrating from `coverage.config.json`
