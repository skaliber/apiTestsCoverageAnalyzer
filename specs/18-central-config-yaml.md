# 18 - Central `config.yaml`: Single Source of Truth for All Scanning, MCP, and Intelligent Analysis

Refactor the API Test Coverage Analyzer so that **one single central configuration file** — `config.yaml` — becomes the exclusive source of truth for all scan behaviour, security scanning, MCP integration, intelligent analysis, thresholds, reporting, and publishing.

The intended user experience is a single command:

```bash
analyze
```

No flags, no scattered configs, no undocumented defaults.

Do **not stop** until:

- the central config refactor is fully implemented
- all old scattered config paths are removed or deprecated safely
- all code paths consume the central config loader
- all tests pass
- docs are updated everywhere
- examples are updated
- the analyzer works correctly with no config and with a custom config
- warnings and fallback behaviour are implemented and tested

---

## 1. High-Level Goal

Reshape the configuration model of the Test Coverage Analyzer so that the system is **simple, centralized, and consistent**.

The central `config.yaml` must control:

- all coverage scanning types
- all security scanning types
- all intelligent / AI-assisted scanning
- all MCP integrations
- all thresholds and quality gates
- all publishing and reporting behaviour
- all dashboard and report AI summary behaviour

### Desired user experience

| Scenario | Behaviour |
|---|---|
| `analyze` (no config present) | Runs all scans with default full profile; emits warning recommending config creation |
| `analyze` (config.yaml present at root) | Loads config.yaml; runs scans as configured |
| `analyze --config ./custom.yaml` | Loads specified file; runs scans as configured |
| Config file exists but is invalid | Fails clearly with field-level error and correction guidance |

There must be **no other config files** controlling scanner behaviour anywhere in the project.

---

## 2. Central Config File Format

Use **YAML** as the config format. The file name defaults to `config.yaml` at the project root.

The format must be human-friendly, structured, and extensible.

### 2.1 Canonical example

```yaml
version: 1

project:
  name: apiTestsCoverageAnalyzer

analysis:
  defaultMode: full        # full | custom
  failOnConfigMissing: false
  warnOnConfigMissing: true

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

  security:
    enabled: true
    scanners:
      - semgrep
      - trivy
      - zap

  intelligence:
    enabled: true
    types:
      - ai-summary
      - risk-prioritization
      - recommendations
      - scanner-interpretation

mcp:
  enabled: true
  defaultTransport: stdio
  timeoutMs: 30000
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

thresholds:
  global: 100
  endpoint: 100
  parameter: 100
  business: 100
  integration: 100
  error: 100
  security: 100
  performance: 100
  compatibility: 100

qualityGate:
  enabled: true
  failBuildOnThresholdMiss: true
  mode: strict            # strict | warn

reports:
  outputDir: reports
  formats:
    - json
    - html
    - csv
    - junit
    - markdown

publishing:
  enabled: true
  githubPages:
    enabled: true

dashboard:
  aiSummary:
    enabled: true
    collapsedByDefault: true
```

### 2.2 Schema requirements

| Section | Required | Description |
|---|---|---|
| `version` | Yes | Config schema version; must be `1` for this release |
| `project.name` | No | Display name used in summaries and reports |
| `analysis.defaultMode` | No | `full` runs all scans; `custom` runs only what is explicitly enabled |
| `analysis.failOnConfigMissing` | No | Defaults to `false`; if `true`, missing config halts execution |
| `analysis.warnOnConfigMissing` | No | Defaults to `true`; emits warning when config.yaml is absent |
| `scans.coverage` | No | Coverage scan configuration |
| `scans.security` | No | Security scanner configuration |
| `scans.intelligence` | No | AI and intelligent analysis configuration |
| `mcp` | No | MCP server connection config |
| `thresholds` | No | Numeric thresholds per metric; `global` applies where specific value is absent |
| `qualityGate` | No | Gate pass/fail mode |
| `reports` | No | Output directory and format list |
| `publishing` | No | Publishing destinations |
| `dashboard` | No | Dashboard rendering options |

### 2.3 Valid scan type values

```
coverage types:  endpoint | parameter | business | integration | error | security | performance | compatibility
security scanners:  semgrep | trivy | zap
intelligence types:  ai-summary | risk-prioritization | recommendations | scanner-interpretation
report formats:  json | html | csv | junit | markdown
```

### 2.4 Schema evolution

- The `version` field is reserved for future breaking-change management
- Unknown top-level keys must produce a warning in non-strict mode and an error in strict mode
- The schema must be defined in code as a typed interface and/or JSON Schema so it can be validated programmatically

---

## 3. Default Behaviour When Config Is Missing

### 3.1 Execution behaviour

When no `config.yaml` is found at the default path and no `--config` flag is provided:

- The analyzer must **execute successfully** using a built-in default profile
- All coverage scan types must run
- All security scanners that are locally available must run
- All intelligence types must run where possible
- MCP integrations must be **disabled by default** unless safe local defaults exist (to avoid unexpected network calls)
- A **warning must be emitted**

### 3.2 Warning message

The warning must be:

- printed to stdout/stderr before scan output begins
- included in the CI build summary where applicable
- written to logs

Required warning text (exact wording is a minimum; implementations may add formatting):

```
[WARNING] No config.yaml found at project root.
Running full default analysis profile.
To customize scanning, thresholds, MCP integration, and reporting,
create a config.yaml file. See docs/guides/configuration.md for reference.
```

### 3.3 Fail-on-missing mode

If `analysis.failOnConfigMissing: true` is set (currently only possible via a previously loaded config, or via a future CLI flag), the analyzer must:

- emit the same warning text
- then exit non-zero immediately

This mode is **off by default**.

---

## 4. CLI Behaviour

### 4.1 Supported invocations

```bash
# Run with default config (config.yaml at root)
analyze

# Run with custom config file
analyze --config ./path/to/custom-config.yaml

# Existing flags must still work but route through the central config
analyze --spec ./openapi.yaml --tests ./tests
```

### 4.2 CLI requirements

| Requirement | Description |
|---|---|
| No mandatory flags | `analyze` with no arguments must work |
| Config file discovery | Looks for `config.yaml` at the current working directory root by default |
| Config override | `--config <path>` loads an arbitrary YAML file |
| Clear validation errors | Schema violations print the invalid field name, received value, and an example of a valid value |
| Backward compatibility | Existing flags must still be accepted; they route through the central config normalizer |

### 4.3 Deprecated flag handling

If the project currently has flags or arguments that duplicate config behaviour (e.g. a `--threshold` flag that is now controlled via `config.yaml`):

- Continue accepting them for this release
- Log a deprecation warning when they are used
- Document the migration path in the CLI reference

---

## 5. Config Loader Module

### 5.1 Module structure

Create a dedicated configuration module:

```
src/config/
  loadConfig.ts       # Entry point: locate, load, validate, merge, return normalized config
  defaultConfig.ts    # Built-in default values for every config key
  validateConfig.ts   # Schema validation logic
  mergeConfig.ts      # Deep-merge user config over default config
  schema.ts           # TypeScript interfaces and/or JSON Schema for the config shape
  types.ts            # Exported TypeScript types consumed across the codebase
```

### 5.2 Loader responsibilities

`loadConfig.ts` must perform the following steps in order:

1. Resolve the config file path (default: `./config.yaml`; override: `--config` value)
2. Check if the file exists
   - If missing: emit warning, return default config object
   - If present: continue
3. Parse the YAML file into a plain object
4. Validate the parsed object against the schema (`validateConfig`)
   - If invalid: exit non-zero with field-level error message
5. Merge the validated object over the default config (`mergeConfig`)
6. Return the normalized `AnalyzerConfig` object

### 5.3 Exported interface

The loader must export a single normalized config object type, for example:

```typescript
export interface AnalyzerConfig {
  version: number;
  project: ProjectConfig;
  analysis: AnalysisConfig;
  scans: ScansConfig;
  mcp: McpConfig;
  thresholds: ThresholdsConfig;
  qualityGate: QualityGateConfig;
  reports: ReportsConfig;
  publishing: PublishingConfig;
  dashboard: DashboardConfig;
}
```

All scanning modules must import and consume this type — never raw YAML or local config files.

---

## 6. Refactor All Scanning Modules to Use Central Config

### 6.1 Modules to refactor

Every module listed below must be updated to receive and consume the `AnalyzerConfig` object rather than reading its own config:

| Module | Config keys consumed |
|---|---|
| Endpoint coverage scanner | `scans.coverage.types`, `thresholds.endpoint` |
| Parameter coverage scanner | `scans.coverage.types`, `thresholds.parameter` |
| Business rules coverage scanner | `scans.coverage.types`, `thresholds.business` |
| Integration flow coverage scanner | `scans.coverage.types`, `thresholds.integration` |
| Error coverage scanner | `scans.coverage.types`, `thresholds.error` |
| Security coverage scanner | `scans.coverage.types`, `thresholds.security` |
| Security scanners (Semgrep, Trivy, ZAP) | `scans.security.enabled`, `scans.security.scanners` |
| Performance / resilience scanner | `scans.coverage.types`, `thresholds.performance` |
| Compatibility / contract scanner | `scans.coverage.types`, `thresholds.compatibility` |
| Intelligent / AI analysis | `scans.intelligence.enabled`, `scans.intelligence.types` |
| MCP client | `mcp.*` |
| Report generator | `reports.*` |
| Summary engine | `reports.*`, `dashboard.*` |
| Publishing module | `publishing.*` |
| Dashboard AI summary renderer | `dashboard.aiSummary.*` |
| Quality gate evaluator | `qualityGate.*`, `thresholds.*` |

### 6.2 Refactor rules

- No module may read from a file system config directly after this refactor
- No module may have hardcoded threshold values
- No module may have hardcoded scanner enable/disable logic
- All toggling of features must respect the `scans.<type>.enabled` flag
- Disabled scans must produce no output, no report file, and no summary section

---

## 7. Centralize MCP Configuration

### 7.1 MCP config must exist only in `config.yaml`

Remove all MCP configuration from any other location. The `mcp` block in `config.yaml` is the sole MCP configuration source.

### 7.2 MCP config behaviour

| Scenario | Behaviour |
|---|---|
| `mcp.enabled: false` | MCP client is not initialized; all AI interpretation uses local fallback |
| `mcp.enabled: true` with valid server config | MCP client connects as configured |
| `mcp.enabled: true` with no servers defined | Warning emitted; fallback AI mode used |
| MCP server unreachable at runtime | Non-fatal warning; fallback AI mode used; scan continues |

### 7.3 Config keys

```yaml
mcp:
  enabled: true | false
  defaultTransport: stdio | http | sse
  timeoutMs: <number>          # Default: 30000
  servers:
    <serverId>:
      enabled: true | false
      transport: stdio | http | sse
      command: <string>         # Required for stdio transport
      args: [<string>]          # Optional args for stdio
      url: <string>             # Required for http/sse transport
      headers:                  # Optional: auth headers for http/sse
        Authorization: Bearer <token>
```

### 7.4 MCP validation errors

If `transport: stdio` is configured but `command` is missing, emit:

```
Config error: mcp.servers.<id>.command is required when transport is "stdio".
Example: command: node, args: ["./mcp-servers/coverage-summary.js"]
```

If `transport: http` is configured but `url` is missing, emit:

```
Config error: mcp.servers.<id>.url is required when transport is "http" or "sse".
Example: url: http://localhost:3100/mcp
```

---

## 8. Centralize Intelligent / AI Scanning Configuration

### 8.1 Intelligence config location

All AI and intelligent analysis behaviour must be configured exclusively through the `scans.intelligence` block of `config.yaml`.

### 8.2 Intelligence types

| Type | Description |
|---|---|
| `ai-summary` | Generate LLM-friendly summary of scan results |
| `risk-prioritization` | Rank uncovered items by risk severity |
| `recommendations` | Generate actionable test improvement recommendations |
| `scanner-interpretation` | Use AI to contextualise security scanner findings |

### 8.3 Default behaviour when intelligence config is absent

- Default to **all intelligence types enabled** unless `analysis.defaultMode: custom` is set
- If `scans.intelligence.enabled: false`, skip all AI analysis silently (no warning)
- Document the default clearly in `docs/guides/configuration.md`

### 8.4 Dashboard AI summary

The `dashboard.aiSummary` config block controls whether AI-enriched sections render in the dashboard and whether they are collapsed by default.

```yaml
dashboard:
  aiSummary:
    enabled: true | false
    collapsedByDefault: true | false
```

---

## 9. Config Validation and Schema Tests

### 9.1 Validation requirements

The validator (`validateConfig.ts`) must check:

- `version` is present and equals a supported version number
- `scans.coverage.types` contains only valid type values
- `scans.security.scanners` contains only valid scanner names
- `scans.intelligence.types` contains only valid intelligence types
- `thresholds.*` values are numbers between 0 and 100 (inclusive)
- `mcp.servers.*` entries satisfy transport-specific required fields
- `reports.formats` contains only valid format strings
- `qualityGate.mode` is one of `strict` or `warn`

### 9.2 Validation error format

Each validation error must include:

```
Config error: <field path>
  Received: <received value>
  Expected: <description or example>
  Example:  <corrected snippet>
```

### 9.3 Strict mode vs. warn mode

| Mode | Behaviour |
|---|---|
| Default | Unknown top-level keys produce a deprecation warning |
| `qualityGate.mode: strict` | Unknown top-level keys cause validation failure |

### 9.4 Required unit tests for config loading

| Test case | Expected outcome |
|---|---|
| Valid complete config | Loads and returns normalized config object |
| Valid minimal config (only `version: 1`) | Loads, merges defaults, returns normalized config |
| Missing config file | Returns default config; emits warning |
| Config with unknown top-level key | Warning in default mode; failure in strict mode |
| Config with invalid threshold value (e.g. `endpoint: 150`) | Fails with field-level error |
| Config with invalid scan type (e.g. `types: [invalid]`) | Fails with field-level error |
| Config with MCP stdio server missing `command` | Fails with field-level error |
| Config with MCP http server missing `url` | Fails with field-level error |
| Custom config path passed via `--config` | Loads from specified path |
| Custom config path that does not exist | Fails with clear file-not-found error |

---

## 10. Testing Requirements

### 10.1 Unit tests

Add or update unit tests covering:

- `loadConfig` — all scenarios in Section 9.4
- `defaultConfig` — default object is valid and complete
- `validateConfig` — all valid and invalid inputs
- `mergeConfig` — partial user config correctly merged over defaults
- Each scan module — receives and respects the normalized config object
- Quality gate evaluator — threshold enforcement reads from config, not hardcoded values
- MCP client — connection behaviour based on `mcp` config block
- Intelligence runner — type selection based on `scans.intelligence.types`
- Summary engine — omits sections for disabled scans, includes sections for enabled scans

### 10.2 Integration tests

Add or update integration tests covering:

| Scenario | Assertions |
|---|---|
| `analyze` with no config present | Warning emitted; all scans run; all reports produced |
| `analyze` with root `config.yaml` | Config loaded; scans run as configured |
| `analyze --config ./custom.yaml` | Custom file loaded; scans run as configured |
| Config with `scans.coverage.types: [endpoint]` | Only endpoint scan runs; all others are skipped |
| Config with `scans.security.enabled: false` | No security scanner runs; no security report produced |
| Config with `scans.intelligence.enabled: false` | No AI analysis runs; no AI summary produced |
| Config with `mcp.enabled: false` | MCP client not initialized; fallback AI runs |
| Config with threshold below actual coverage | Build exits non-zero |
| Config with threshold met or exceeded | Build exits zero |

### 10.3 End-to-end / Cypress tests

Add or update browser tests covering:

| Scenario | Assertions |
|---|---|
| Dashboard loads with self-analysis results | All configured sections visible |
| AI summary panel respects `dashboard.aiSummary.enabled` | Panel hidden when disabled |
| AI summary panel respects `dashboard.aiSummary.collapsedByDefault` | Panel collapsed or expanded on load |
| Disabled scan sections are absent from navigation | No broken links or empty pages |
| Report pages load correctly for each enabled scan type | Content visible, no errors |
| PR/build summary reflects only enabled scans | Disabled metrics absent from summary |

### 10.4 Config smoke test

Create a smoke test that:

- Starts from a clean state (no `config.yaml` at project root)
- Runs `analyze`
- Verifies the warning message is emitted
- Verifies all expected report files are produced under `reports/`
- Then runs again with a minimal valid `config.yaml`
- Verifies the warning is not emitted
- Verifies reports reflect the configured scan selection

---

## 11. Backward Compatibility and Migration

### 11.1 Legacy config files

If the project currently has any of the following:

| Legacy file / mechanism | Migration action |
|---|---|
| `coverage.config.json` | Absorb all fields into `config.yaml`; emit deprecation warning when legacy file is present but `config.yaml` is absent |
| `coverage.config.example.json` | Replace with `config.yaml.example`; update all references |
| Inline hardcoded scanner toggles | Move to `config.yaml` defaults in `defaultConfig.ts` |
| CLI flags that duplicate config fields | Keep accepting; log deprecation warning; route through config normalizer |
| MCP config embedded in other modules | Move to `mcp` block; remove from original location |

### 11.2 Deprecation warning format

```
[DEPRECATED] coverage.config.json is no longer supported.
Please migrate your configuration to config.yaml.
See docs/guides/migration-to-config-yaml.md for instructions.
```

### 11.3 Migration guide

Create `docs/guides/migration-to-config-yaml.md` that documents:

- What changed and why
- Field-by-field mapping from legacy config to `config.yaml`
- How to generate a `config.yaml` from an existing legacy config
- Timeline for legacy config removal (if applicable)

---

## 12. Documentation Updates

### 12.1 Files to update or create

| File | Change |
|---|---|
| `README.md` | Add central config overview; update quick-start to show `analyze` then optionally `config.yaml` |
| `docs/guides/configuration.md` | Full `config.yaml` reference (create if absent) |
| `docs/guides/migration-to-config-yaml.md` | Legacy config migration guide (create) |
| `docs/guides/cli-reference.md` | Update to show `--config` flag and no-config behaviour |
| `docs/guides/ci-integration.md` | Update pipeline examples to include `config.yaml` setup step |
| `docs/guides/security-scanning.md` | Remove standalone scanner config; point to `scans.security` block |
| `docs/guides/mcp.md` | Remove standalone MCP config; point to `mcp` block |
| `docs/guides/dashboard.md` | Update to reference `dashboard.aiSummary` block |
| `docs/guides/ai-summary.md` | Update to reference `scans.intelligence` and `dashboard.aiSummary` blocks |
| `docs/guides/thresholds.md` | Update to reference `thresholds` block |
| Developer / contributor docs | Document config loader architecture and how to add new config fields |

### 12.2 Documentation must clearly state

- There is exactly one central config file: `config.yaml`
- If it is missing, the analyzer runs all scans by default and emits a warning
- Users can override the path with `--config`
- No other scan configs are needed
- All scanning, MCP, thresholds, and reporting are managed via `config.yaml`

### 12.3 Documentation quality requirements

All documentation must be:

- **Concise** — no filler
- **Structured** — consistent heading hierarchy
- **AI-friendly** — deterministic section naming parseable by LLMs
- **Accurate** — reflects implemented behaviour, not aspirational
- **Complete** — no undocumented config field

---

## 13. Example and Sample Updates

### 13.1 Files to update

| File / location | Update |
|---|---|
| `config.yaml` (project root) | Create or replace with canonical example from Section 2.1 |
| `config.yaml.example` | Create full annotated example with comments explaining every field |
| `sample/` directory | Update any sample configs to use `config.yaml` format |
| GitHub Action workflow examples | Add `config.yaml` setup step; remove legacy config steps |
| Jenkins example pipeline | Add `config.yaml` setup step; remove legacy config steps |
| Self-analysis config | Update to reference `config.yaml` as the self-analysis config |
| MCP examples | Update to use `mcp` block inside `config.yaml` |
| Security scanning examples | Update to use `scans.security` block |

### 13.2 Annotated example content

`config.yaml.example` must include inline YAML comments explaining:

- what each field controls
- what valid values are
- what the default is when the field is absent
- whether the field is required or optional

---

## 14. Implementation Quality Standards

| Standard | Requirement |
|---|---|
| Single config loader | All config loading goes through `src/config/loadConfig.ts`; no module loads YAML directly |
| No scattered defaults | All default values live in `defaultConfig.ts`; no inline fallbacks in scan modules |
| Typed config object | `AnalyzerConfig` TypeScript interface used everywhere; no `any` or raw objects |
| No hardcoded thresholds | Threshold values always come from the normalized config object |
| No hardcoded enable/disable | Feature toggling always reads from `scans.<type>.enabled` |
| Deterministic warning output | Warning message is defined as a constant, not repeated inline strings |
| Stable config path | Default config path is a single constant; not duplicated across files |
| Validation before use | Config is always validated before being passed to any scan module |

---

## 15. Acceptance Criteria

This specification is complete only when **all** of the following are true:

### Config model
- [ ] There is exactly one central scan config model
- [ ] The default config file is `config.yaml` at project root
- [ ] The config format is YAML with a documented schema
- [ ] A canonical example `config.yaml` exists at the project root
- [ ] An annotated `config.yaml.example` exists

### Missing config behaviour
- [ ] Missing `config.yaml` does not crash the analyzer
- [ ] Missing `config.yaml` triggers the required warning message on stdout
- [ ] Missing `config.yaml` runs the full default scan profile
- [ ] Warning is visible in CI build summary where applicable

### CLI
- [ ] `analyze` works with no arguments
- [ ] `analyze --config ./path.yaml` loads the specified file
- [ ] Invalid config path fails with a clear file-not-found error
- [ ] Invalid config content fails with field-level error and correction guidance

### Config loader
- [ ] `src/config/loadConfig.ts` exists and is the single entry point for config loading
- [ ] `src/config/defaultConfig.ts` defines all default values
- [ ] `src/config/validateConfig.ts` enforces the schema
- [ ] `src/config/mergeConfig.ts` deep-merges user config over defaults
- [ ] `src/config/types.ts` or `schema.ts` exports the `AnalyzerConfig` TypeScript type

### Scan modules
- [ ] All scan modules consume the normalized `AnalyzerConfig` object
- [ ] No scan module reads from a local or legacy config file
- [ ] Disabled scans produce no reports and no summary sections
- [ ] All threshold values come from the config object

### MCP
- [ ] MCP configuration exists only in `config.yaml`
- [ ] MCP is disabled by default when config is missing
- [ ] MCP unavailability does not crash the analyzer

### Intelligence / AI
- [ ] AI analysis configuration exists only in `config.yaml`
- [ ] All intelligence types default to enabled in full mode
- [ ] Dashboard AI summary respects `dashboard.aiSummary.enabled`

### Backward compatibility
- [ ] Legacy configs (if present) trigger a deprecation warning
- [ ] Legacy CLI flags still work with a deprecation warning
- [ ] Migration guide exists at `docs/guides/migration-to-config-yaml.md`

### Tests
- [ ] All unit tests in Section 9.4 are implemented and pass
- [ ] All integration test scenarios in Section 10.2 are implemented and pass
- [ ] All Cypress test scenarios in Section 10.3 are implemented and pass
- [ ] Config smoke test exists and passes
- [ ] No tests are skipped or disabled to claim passing

### Documentation
- [ ] `README.md` is updated with central config information
- [ ] `docs/guides/configuration.md` is a complete `config.yaml` reference
- [ ] All scan-type guides point to the relevant `config.yaml` block
- [ ] CLI reference reflects `--config` flag and no-config behaviour
- [ ] No documentation references a legacy config format without noting it is deprecated

### Examples
- [ ] `config.yaml` at project root is the canonical example
- [ ] `config.yaml.example` is fully annotated
- [ ] All CI pipeline examples include `config.yaml` setup
- [ ] No pipeline examples reference legacy config files

---

## 16. Execution Rules for the Implementing Agent

Work iteratively across all sections. Do not stop early.

For each area:

1. Inspect existing config usage across the codebase
2. Identify all files that must be refactored or removed
3. Implement the central config loader module first
4. Refactor each scan module to consume the normalized config
5. Add or update tests after each module is refactored
6. Run tests and fix all failures before moving to the next module
7. Update docs to reflect each change

At the end of implementation:

1. All acceptance criteria in Section 15 must be satisfied
2. Full test suite must pass with no skips
3. `analyze` with no config must work and emit the warning
4. `analyze` with `config.yaml` must work silently
5. `analyze --config ./custom.yaml` must work
6. All documentation must accurately describe the implemented behaviour

Do not declare completion until every acceptance criterion in Section 15 is satisfied.
