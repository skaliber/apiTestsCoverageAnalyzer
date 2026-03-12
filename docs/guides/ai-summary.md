# AI Summary

AI and intelligent analysis is configured in the `scans.intelligence` block of `config.yaml`. Dashboard AI rendering is controlled by the `dashboard.aiSummary` block.

## Intelligence configuration

```yaml
scans:
  intelligence:
    enabled: true       # default: true; set false to skip all AI analysis
    types:
      - ai-summary              # LLM-friendly summary of scan results
      - risk-prioritization     # Rank uncovered items by risk severity
      - recommendations         # Actionable test improvement recommendations
      - scanner-interpretation  # Contextualise security scanner findings
```

## Intelligence types

| Type | Description |
|---|---|
| `ai-summary` | Generates a structured summary of all scan results |
| `risk-prioritization` | Ranks gaps by risk score (P0–P3) |
| `recommendations` | Produces actionable, prioritised test recommendations |
| `scanner-interpretation` | Adds AI context to security scanner findings |

## Default behaviour

When `analysis.defaultMode: full` (the default), all intelligence types are enabled automatically. When `analysis.defaultMode: custom`, only the types listed under `scans.intelligence.types` run.

## Disabling intelligence

```yaml
scans:
  intelligence:
    enabled: false
```

No AI analysis runs. No AI summary sections appear in reports or the dashboard.

## Running a subset

```yaml
scans:
  intelligence:
    enabled: true
    types:
      - risk-prioritization
      - recommendations
```

## Dashboard rendering

Control whether the AI summary panel is visible and whether it is collapsed on load:

```yaml
dashboard:
  aiSummary:
    enabled: true
    collapsedByDefault: true
```

## MCP and fallback

When `mcp.enabled: true`, intelligence output is enriched by an external MCP server. When MCP is disabled or unreachable, the built-in fallback interpreter runs deterministically.

See [MCP Integration](mcp.md) for MCP server configuration.

## See also

- [Configuration Reference](configuration.md)
- [Dashboard](dashboard.md)
- [MCP Integration](mcp.md)
