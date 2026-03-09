# Business Rules

## Overview

Business rules are YAML definitions that enumerate the capabilities, policies, or requirements
that the analyzer verifies your tests cover. Each rule has a stable ID, description, and a list
of keywords used to match test names.

Business rules are used with the `business-coverage` command and the `analyzeBusinessRules()`
library function.

## Usage

```bash
api-coverage business-coverage \
  --rules business-rules.yaml \
  --tests "tests/**/*.ts" \
  --threshold-business 100
```

Or with the Makefile:

```bash
make self-analysis-business
```

## Rule schema

```yaml
rules:
  - id: RULE-001                       # Stable unique ID (required)
    title: "Human-readable title"      # Short title (required)
    description: "What this rule requires"  # Full description (required)
    category: endpoint-coverage        # One of the defined categories (required)
    endpoints:                         # Optional: relevant API paths
      - "POST /analyze/endpoints"
    keywords:                          # Keywords matched against test names (required)
      - "analyzeEndpoints"
      - "endpoint coverage"
    scenarios:                         # Optional: per-scenario tracking
      - id: RULE-001-success
        description: "Success path"
        keywords: ["covered", "100%"]
      - id: RULE-001-failure
        description: "Failure path"
        keywords: ["uncovered", "missing"]
```

### Required fields

| Field | Type | Description |
|---|---|---|
| `id` | string | Stable unique identifier, format `RULE-NNN` |
| `title` | string | Short human-readable name |
| `description` | string | Full description of what the rule requires |
| `category` | string | One of the defined categories (see below) |
| `keywords` | string[] | Test name fragments used for matching |

### Optional fields

| Field | Type | Description |
|---|---|---|
| `endpoints` | string[] | Relevant API paths (documentation only) |
| `scenarios` | array | Sub-rules for finer-grained tracking |

## Rule categories

| Category | Description |
|---|---|
| `endpoint-coverage` | Endpoint scanning and coverage rules |
| `parameter-coverage` | Parameter testing rules |
| `business-coverage` | Business logic coverage rules |
| `integration-coverage` | Integration flow coverage rules |
| `error-coverage` | Error scenario coverage rules |
| `security-coverage` | Security test coverage rules |
| `security-scanning` | SAST/secret/misconfiguration scanning rules |
| `performance-coverage` | Performance and resilience rules |
| `compatibility-coverage` | Contract and schema compatibility rules |
| `summary-generation` | PR/build summary output rules |
| `threshold-enforcement` | Quality gate and threshold rules |
| `self-analysis` | Analyzer self-analysis rules |
| `reporting` | Report file generation rules |
| `docs-validation` | Documentation completeness rules |
| `dashboard-ai-summaries` | AI/LLM-friendly summary rules |
| `ci-integration` | GitHub Actions and Jenkins rules |
| `github-pages` | GitHub Pages publishing rules |
| `mcp-integration` | MCP server integration rules |
| `plugin-behaviour` | Plugin loading and extension rules |

## Keyword matching

The analyzer scans all test file names and test descriptions for each rule's keywords. A test
matches a rule if **any keyword** appears in the test name or description
(case-insensitive substring match).

A rule is **covered** if at least one test matches it. For rules with scenarios, a scenario is
covered independently.

## Self-analysis rules

The file `business-rules.self-analysis.yaml` at the repository root contains 19 rules covering
every documented analyzer capability. This file is the input to `make self-analysis-business`.

To add a new capability rule:

1. Open `business-rules.self-analysis.yaml`
2. Add a new rule with a sequential `RULE-NNN` ID
3. Set the appropriate `category`
4. Add at least 3 keywords that match existing or planned tests
5. Run `make self-analysis-business` to verify coverage

## Completeness requirement

Every implemented analyzer capability must have a corresponding rule. If a feature exists in
the codebase without a matching rule, the business coverage metric will not detect whether that
feature is tested.

Run business rule tests to verify completeness:

```bash
npx jest businessRules.self-analysis --no-coverage
```

## Troubleshooting

### Rule shows as uncovered despite existing tests

Check that the rule's keywords appear in the test file names or `describe`/`it` strings.
Keywords are substring-matched (not regex). Add more specific keywords if needed.

### "Rule file not found" error

Ensure the `--rules` path is relative to the current working directory, or use an absolute path.

### Adding rules for new features

Preferred workflow:
1. Write the feature test with descriptive names containing the planned keywords
2. Add the rule to `business-rules.self-analysis.yaml`
3. Run `make self-analysis-business` — it should pass immediately
