# Dashboard

The coverage dashboard renders scan results in a browser UI. AI summary panels are controlled by the `dashboard.aiSummary` block in `config.yaml`.

## Starting the dashboard

```bash
analyze --dashboard
analyze --dashboard --port 4000 --open
```

Or after running analysis, serve the static reports:

```bash
node dist/src/index.js serve --dir reports/
```

## AI summary configuration

```yaml
dashboard:
  aiSummary:
    enabled: true              # default: true; set false to hide AI panels
    collapsedByDefault: true   # default: true; set false to expand panels on load
```

### Hiding AI summaries

```yaml
dashboard:
  aiSummary:
    enabled: false
```

When `enabled: false`, AI summary panels are not rendered and the corresponding navigation items are absent.

### Expanding panels by default

```yaml
dashboard:
  aiSummary:
    collapsedByDefault: false
```

## Disabled scan sections

When a scan type is disabled via `scans.coverage.types`, its dashboard section is omitted entirely — no navigation item, no empty page.

## See also

- [Configuration Reference](configuration.md)
- [AI Summary](ai-summary.md)
- [MCP Integration](mcp.md)
