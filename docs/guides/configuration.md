# Configuration Reference

## Overview

All analyzer behaviour is controlled by a single `config.yaml` file at the project root.

```bash
analyze                        # uses config.yaml at CWD root
analyze --config ./path.yaml   # uses a custom config file
```

When `config.yaml` is absent the analyzer runs with the full default profile and emits:

```
[WARNING] No config.yaml found at project root.
Running full default analysis profile.
To customize scanning, thresholds, MCP integration, and reporting,
create a config.yaml file. See docs/guides/configuration.md for reference.
```

There is no other config file. `coverage.config.json` is deprecated — see
`docs/guides/migration-to-config-yaml.md`.

---

## Schema version

```yaml
version: 1   # required; must be 1
```

---

## project

```yaml
project:
  name: my-api   # optional; display name used in reports and summaries
```

---

## analysis

```yaml
analysis:
  defaultMode: full          # full | custom; default: full
  failOnConfigMissing: false # default: false; true halts execution when config.yaml absent
  warnOnConfigMissing: true  # default: true; emits warning when config.yaml absent
```

| Field | Default | Description |
|---|---|---|
| `defaultMode` | `full` | `full` runs all scans; `custom` runs only explicitly-enabled scans |
| `failOnConfigMissing` | `false` | Exit non-zero when `config.yaml` is absent |
| `warnOnConfigMissing` | `true` | Emit warning when `config.yaml` is absent |

---

## analysis.ast

AST-based multi-language analysis engine. Enabled by default for all supported languages.

```yaml
analysis:
  ast:
    enabled: true              # master switch; false → regex-only fallback for all languages
    fallbackHeuristics: true   # run regex when AST returns 0 results (Tier 2 fallback)
    maxCallDepth: 4            # max call-chain depth when tracing wrapper/helper functions
    assertionAware: true       # link HTTP calls to downstream response assertions
    languages:
      javascript: { enabled: true }
      typescript: { enabled: true }
      java:       { enabled: true }
      kotlin:     { enabled: true }
      python:     { enabled: true }
      ruby:       { enabled: true }
      cucumber:   { enabled: true }
```

| Field | Default | Description |
|---|---|---|
| `enabled` | `true` | Master AST switch. `false` uses the existing regex pipeline |
| `fallbackHeuristics` | `true` | Run regex when AST parse succeeds but returns 0 HTTP calls |
| `maxCallDepth` | `4` | Depth limit for tracing wrapper methods / helper functions |
| `assertionAware` | `true` | Associate HTTP calls with downstream `expect`/`assert` calls |
| `languages.<lang>.enabled` | `true` | Disable a specific language; others continue using AST |

**Three-tier fallback cascade:**

1. **Tier 1** — AST parse succeeds → `confidence: high` or `medium`
2. **Tier 2** — AST succeeds but 0 results + `fallbackHeuristics: true` → regex, `confidence: low`
3. **Tier 3** — AST disabled or parse error → existing `deepResolveFile()` pipeline

**Tree-sitter native bindings** (`tree-sitter-java`, `-python`, `-ruby`, `-kotlin`) are loaded
lazily inside `try/catch`. If native compilation failed in your environment the analyzer falls
back to regex transparently — no configuration change required.

---

## scans.coverage

```yaml
scans:
  coverage:
    enabled: true   # default: true
    types:
      - endpoint
      - parameter
      - business
      - integration
      - error
      - security
      - performance
      - compatibility
```

Valid `types` values: `endpoint`, `parameter`, `business`, `integration`, `error`, `security`,
`performance`, `compatibility`.

---

## scans.security

```yaml
scans:
  security:
    enabled: true   # default: true
    scanners:
      - semgrep
      - trivy
      - zap
```

Valid `scanners` values: `semgrep`, `trivy`, `zap`.

---

## scans.intelligence

```yaml
scans:
  intelligence:
    enabled: true   # default: true
    types:
      - ai-summary
      - risk-prioritization
      - recommendations
      - scanner-interpretation
```

| Type | Description |
|---|---|
| `ai-summary` | LLM-friendly summary of scan results |
| `risk-prioritization` | Rank uncovered items by risk severity |
| `recommendations` | Actionable test improvement recommendations |
| `scanner-interpretation` | AI-contextualised security scanner findings |

---

## mcp

```yaml
mcp:
  enabled: false           # default: false (disabled to avoid unexpected network calls)
  defaultTransport: stdio  # stdio | http | sse; default: stdio
  timeoutMs: 30000         # default: 30000
  servers:
    coverageSummary:
      enabled: true
      transport: stdio
      command: node
      args:
        - ./mcp-servers/coverage-summary.js
    securityScan:
      enabled: true
      transport: http
      url: http://localhost:3100/mcp
```

MCP server fields:

| Field | Required | Description |
|---|---|---|
| `enabled` | No | Enable/disable this server |
| `transport` | Yes | `stdio`, `http`, or `sse` |
| `command` | Required for `stdio` | Command to spawn (e.g. `node`) |
| `args` | No | Arguments for `stdio` command |
| `url` | Required for `http`/`sse` | Server endpoint URL |
| `headers` | No | HTTP headers (e.g. `Authorization`) |

When `mcp.enabled: false` (default), the MCP client is not initialized. AI interpretation uses
local fallback. MCP server unavailability is non-fatal; the scan continues with local fallback.

---

## thresholds

```yaml
thresholds:
  global: 80          # applies where no specific threshold is set
  endpoint: 100
  parameter: 100
  business: 100
  integration: 100
  error: 100
  security: 100
  performance: 100
  compatibility: 100
```

All threshold values must be numbers between `0` and `100` inclusive. `global` applies to any
metric without an explicit threshold.

---

## qualityGate

```yaml
qualityGate:
  enabled: true                  # default: true
  failBuildOnThresholdMiss: true # default: false
  mode: warn                     # strict | warn; default: warn
```

| Mode | Behaviour |
|---|---|
| `strict` | Exit non-zero on any threshold breach; unknown top-level config keys cause error |
| `warn` | Report violations but exit 0; unknown top-level config keys produce a warning |

---

## reports

```yaml
reports:
  outputDir: reports   # default: reports
  formats:
    - json
    - html
    - csv
    - junit
    - markdown
```

Valid `formats` values: `json`, `html`, `csv`, `junit`, `markdown`.

---

## publishing

```yaml
publishing:
  enabled: false          # default: false
  githubPages:
    enabled: false        # default: false
```

---

## dashboard

```yaml
dashboard:
  aiSummary:
    enabled: true              # default: true
    collapsedByDefault: true   # default: true
```

---

## Unknown top-level keys

Unknown keys produce a warning in `warn` mode and a validation error in `strict` mode. See
`qualityGate.mode` above.

---

## CLI flags

| Flag | Description |
|---|---|
| `--config <path>` | Load an arbitrary YAML config file instead of `config.yaml` |
| `--threshold-endpoint <n>` | Override `thresholds.endpoint` (**deprecated** — use `config.yaml`) |
| `--threshold-global <n>` | Override `thresholds.global` (**deprecated** — use `config.yaml`) |

Deprecated CLI threshold flags still work but emit a deprecation warning. Migrate them to the
`thresholds` block in `config.yaml`.
