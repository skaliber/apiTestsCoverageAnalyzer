# MCP Integration

MCP (Model Context Protocol) integration is configured exclusively in the `mcp` block of `config.yaml`. There is no separate MCP config file.

MCP is **disabled by default**. When disabled, the built-in fallback interpreter generates deterministic AI-style summaries without requiring any external server.

## Configuration

```yaml
mcp:
  enabled: true
  defaultTransport: stdio   # stdio | http | sse
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
```

## Transport types

| Transport | Required fields | Use case |
|---|---|---|
| `stdio` | `command`, optionally `args` | Local MCP server process |
| `http` | `url` | Remote MCP server over HTTP |
| `sse` | `url` | Remote MCP server over Server-Sent Events |

## Validation errors

If `transport: stdio` is set without `command`:

```
Config error: mcp.servers.<id>.command is required when transport is "stdio".
  Example: command: node, args: ["./mcp-servers/coverage-summary.js"]
```

If `transport: http` or `transport: sse` is set without `url`:

```
Config error: mcp.servers.<id>.url is required when transport is "http" or "sse".
  Example: url: http://localhost:3100/mcp
```

## Behaviour when MCP is unavailable

| Scenario | Behaviour |
|---|---|
| `mcp.enabled: false` | MCP client not initialized; built-in fallback AI runs |
| `mcp.enabled: true`, no servers defined | Warning emitted; fallback AI runs |
| MCP server unreachable at runtime | Non-fatal warning; fallback AI runs; scan continues |

The analyzer never fails due to MCP unavailability.

## Disabling MCP

```yaml
mcp:
  enabled: false
```

## See also

- [Configuration Reference](configuration.md)
- [AI Summary](ai-summary.md)
