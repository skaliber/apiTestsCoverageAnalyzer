# Security Scanning

Security scanner configuration lives entirely in the `scans.security` block of `config.yaml`. There is no separate security config file.

## Configuration

```yaml
scans:
  security:
    enabled: true          # set false to skip all security scanners
    scanners:
      - semgrep            # SAST: code patterns, injection, secrets
      - trivy              # SCA: dependency vulns, IaC misconfigurations
      - zap                # DAST: runtime API scanning
```

## Supported scanners

| Scanner | Type | Purpose |
|---|---|---|
| `semgrep` | SAST | Code pattern detection, injection, secrets in code |
| `trivy` | SCA | Dependency vulnerabilities, secrets, IaC misconfigurations |
| `zap` | DAST | Runtime API scanning against a live target |

## Disabling security scanning

```yaml
scans:
  security:
    enabled: false
```

When `enabled: false`, no security scanner runs, no security report is produced, and no security section appears in the summary.

## Running a subset of scanners

```yaml
scans:
  security:
    enabled: true
    scanners:
      - semgrep   # only SAST; skip trivy and zap
```

## Quality gate for security findings

Use the `thresholds.security` field to set a minimum required security coverage percentage. Pair with `qualityGate.failBuildOnThresholdMiss: true` to fail the build on breaches:

```yaml
thresholds:
  security: 80

qualityGate:
  enabled: true
  failBuildOnThresholdMiss: true
```

## Full example

```yaml
version: 1

scans:
  security:
    enabled: true
    scanners:
      - semgrep
      - trivy
      - zap

thresholds:
  security: 80

qualityGate:
  enabled: true
  failBuildOnThresholdMiss: true
  mode: warn

reports:
  outputDir: reports
  formats:
    - json
    - html
```

## See also

- [Configuration Reference](configuration.md)
- [Thresholds](thresholds.md)
