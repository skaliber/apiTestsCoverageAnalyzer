# Threshold Configuration

## Overview

Coverage thresholds control when the analyzer exits non-zero and fails the build. Threshold
enforcement logic lives **inside the analyzer library** — no CI shell scripts parse output
to determine pass/fail.

## Default thresholds

When **no threshold is configured** for a metric, the default is **100%**. This is the strictest
possible setting and is the default for self-analysis.

```yaml
thresholds:
  endpoint: 100
  parameter: 100
  business: 100
  integration: 100
  error: 100
  security: 100
  performance: 100
  compatibility: 100
```

## Configuration

Set thresholds in `config.yaml`:

```yaml
thresholds:
  endpoint: 80
  parameter: 70
  business: 60
  integration: 50
  security: 60
  error: 50
  performance: 75
  compatibility: 50
```

### Global threshold

Apply a single threshold to all metrics:

```yaml
thresholds:
  global: 80
```

Per-metric thresholds override the global threshold.

### Legacy JSON config (deprecated)

`coverage.config.json` is no longer supported. Migrate thresholds to the `thresholds` block in
`config.yaml`. See `docs/guides/migration-to-config-yaml.md` for field-by-field mapping.

## CLI flag overrides

Override thresholds on the command line (takes precedence over config file):

```bash
api-coverage endpoint-coverage \
  --spec openapi.yaml \
  --tests "tests/**/*.ts" \
  --threshold-endpoint 90
```

## Environment variable overrides

Override thresholds via environment variables (useful in CI):

```bash
THRESHOLD_ENDPOINT=90 make self-analysis-endpoint
THRESHOLD_BUSINESS=80 make self-analysis-business
```

Supported environment variables:

| Variable | Metric |
|---|---|
| `THRESHOLD_ENDPOINT` | endpoint |
| `THRESHOLD_PARAMETER` | parameter |
| `THRESHOLD_BUSINESS` | business |
| `THRESHOLD_INTEGRATION` | integration |
| `THRESHOLD_ERROR` | error |
| `THRESHOLD_SECURITY` | security |
| `THRESHOLD_PERFORMANCE` | performance |
| `THRESHOLD_RESILIENCE` | resilience |

## Scanning-based metrics (non-percentage)

For metrics expressed as counts rather than percentages, the equivalent strict gates are:

| Metric | Gate |
|---|---|
| Critical vulnerabilities | Zero allowed (`--fail-on-critical true`) |
| High vulnerabilities | Zero allowed (`--max-high-vulnerabilities 0`) |
| Secrets detected | Zero allowed (`--max-secrets 0`) |
| High-severity misconfigurations | Zero allowed (`--max-high-misconfigurations 0`) |

Configure in `config.yaml`:

```yaml
scans:
  security:
    enabled: true
    scanners:
      - semgrep
      - trivy
      - zap
```

Security gate options (CLI flags): `--fail-on-critical`, `--max-high-vulnerabilities`, `--max-secrets`.

## Gate enforcement rules

- The analyzer **always writes all reports**, even when a threshold is breached.
- The process exits **non-zero** when any threshold is breached.
- CI pipelines must not parse analyzer output — they rely solely on the exit code.
- The 100% default applies when no threshold is configured for a metric.

## Quality gate modes

| Mode | Behaviour |
|---|---|
| `strict` (default) | Exit non-zero on any threshold breach |
| `warn` | Report violations but exit 0 (useful for gradual adoption) |

Set mode in `config.yaml`:

```yaml
qualityGate:
  mode: warn
```

Or via CLI:

```bash
api-coverage endpoint-coverage --quality-gate true --quality-gate-mode warn
```

## Troubleshooting

### Build fails unexpectedly at 100%

The 100% default applies when no threshold is set. To allow lower coverage during development,
either set explicit thresholds in `config.yaml` or use `--quality-gate false`:

```bash
api-coverage endpoint-coverage --spec openapi.yaml --tests "tests/**" --quality-gate false
```

### Threshold not taking effect

Check the precedence order: CLI flag > environment variable > config file > default (100%).
