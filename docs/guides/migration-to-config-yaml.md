# Migration: `coverage.config.json` → `config.yaml`

## What changed and why

Prior to this release the analyzer was configured through a `coverage.config.json` or
`coverage.self-analysis.json` file using JSON format. A single central `config.yaml` (YAML format)
now controls all scanning behaviour, MCP integration, thresholds, reporting, and publishing.

The goals of the change:

- One file, one format: no more scattered JSON configs
- Human-friendly YAML with inline comments
- Typed schema with field-level validation errors
- `analyze` (no flags) works out of the box

`coverage.config.json` is **deprecated**. When it exists but `config.yaml` does not, the analyzer
emits:

```
[DEPRECATED] coverage.config.json is no longer supported.
Please migrate your configuration to config.yaml.
See docs/guides/migration-to-config-yaml.md for instructions.
```

---

## Field-by-field mapping

### Thresholds

**Before (`coverage.config.json`):**
```json
{
  "thresholds": {
    "endpoint": 80,
    "parameter": 70,
    "global": 60
  }
}
```

**After (`config.yaml`):**
```yaml
thresholds:
  endpoint: 80
  parameter: 70
  global: 60
```

All threshold keys are identical. The `resilience` key is now `compatibility` in the new schema.

### Quality gate

**Before:**
```json
{
  "qualityGate": {
    "mode": "warn",
    "failBuildOnThresholdMiss": true
  }
}
```

**After:**
```yaml
qualityGate:
  mode: warn
  failBuildOnThresholdMiss: true
  enabled: true
```

### Scan types (coverage)

**Before:** No explicit scan-type control; toggled via CLI flags.

**After:**
```yaml
scans:
  coverage:
    enabled: true
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

### Test patterns / exclude patterns

`testPatterns`, `exclude`, and `plugins` from `coverage.config.json` are not part of the new
`AnalyzerConfig` schema. Pass test file globs via the `--tests` CLI flag instead.

### MCP configuration

**Before:** MCP config was embedded in module-level code or a separate config object.

**After:**
```yaml
mcp:
  enabled: true
  servers:
    myServer:
      enabled: true
      transport: stdio
      command: node
      args:
        - ./mcp-servers/my-server.js
```

---

## Migration steps

1. Create a `config.yaml` at your project root. Use `config.yaml.example` as a starting point.

2. Copy your threshold values from `coverage.config.json` to the `thresholds` block.

3. Copy quality gate settings to the `qualityGate` block.

4. Delete or archive `coverage.config.json`. The analyzer will no longer read it.

5. Run the analyzer to verify:
   ```bash
   analyze
   ```

6. If you used `coverage.self-analysis.json` for self-analysis, those settings are now in the
   same `config.yaml` — no separate file needed.

---

## Backward compatibility

- `coverage.config.json` triggers a deprecation warning but does not prevent the analyzer from
  running. The analyzer falls back to the default profile.
- CLI threshold flags (`--threshold-endpoint`, `--threshold-global`, etc.) still work but emit
  a deprecation warning. Migrate values to the `thresholds` block in `config.yaml`.
- The `--config` flag works for both old JSON paths and new YAML paths (auto-detected by extension).
