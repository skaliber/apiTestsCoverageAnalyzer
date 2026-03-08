# MCP Integration

The **Model Context Protocol (MCP)** integration allows the API Test Coverage Analyzer to stream scan results to AI servers and receive intelligent, context-aware analysis in real time.

## Architecture Overview

```
Coverage Scan
     │
     ▼
AnalysisEventStream ──► MCP Server (stdio / HTTP)
     │                        │
     │                  AI Analysis
     │                        │
     ▼                        ▼
FallbackInterpreter    NormalizedAiAnalysis
     │                        │
     └──────────┬─────────────┘
                ▼
         TemplateMapper
                │
     ┌──────────┼──────────┐
     ▼          ▼          ▼
 Markdown    HTML     Dashboard Panel
  Report    Report    (AiSummaryPanel)
```

MCP integration is **optional and disabled by default**. When disabled, the built-in fallback interpreter generates deterministic AI-style summaries without requiring any external server.

## Configuration

Add an `mcp` block to your `config.yaml`:

```json
{
  "mcp": {
    "enabled": true,
    "defaultTransport": "stdio",
    "timeoutMs": 30000,
    "retryPolicy": {
      "maxRetries": 2,
      "retryDelayMs": 500
    },
    "servers": {
      "coverageSummary": {
        "enabled": true,
        "transport": "stdio",
        "command": "node",
        "args": ["./mcp-servers/coverage.js"]
      },
      "securityScan": {
        "enabled": true,
        "transport": "http",
        "url": "http://localhost:3000/mcp"
      },
      "performanceAnalysis": {
        "enabled": false
      },
      "compatibilityAnalysis": {
        "enabled": false
      },
      "intelligenceAnalysis": {
        "enabled": true,
        "transport": "http",
        "url": "http://localhost:3000/mcp"
      }
    }
  }
}
```

### Global Options

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `false` | Globally enable or disable all MCP integrations |
| `defaultTransport` | `"stdio"` \| `"http"` | `"stdio"` | Default transport when a server does not specify one |
| `timeoutMs` | number | `30000` | Default request timeout in milliseconds |
| `maxPayloadBytes` | number | `1048576` | Maximum prompt payload size (1 MB) |
| `retryPolicy.maxRetries` | number | `2` | Number of retry attempts |
| `retryPolicy.retryDelayMs` | number | `500` | Delay between retries in milliseconds |
| `serverAllowlist` | string[] | `[]` (all allowed) | Allowlist of server URL prefixes |
| `transportAllowlist` | string[] | `[]` (all allowed) | Allowlist of transport types |

### Per-Server Options

| Option | Type | Description |
|---|---|---|
| `enabled` | boolean | Whether this server is active |
| `transport` | `"stdio"` \| `"http"` | Transport for this server |
| `command` | string | Command to spawn (stdio only) |
| `args` | string[] | Arguments for the stdio command |
| `url` | string | HTTP URL (http only) |
| `timeoutMs` | number | Per-server timeout override |

## Transports

### stdio

Used for local development or embedded MCP servers. The analyzer spawns a child process, writes the prompt to stdin, and reads the response from stdout.

```json
{
  "coverageSummary": {
    "transport": "stdio",
    "command": "node",
    "args": ["./mcp-servers/coverage.js"]
  }
}
```

### HTTP / Streamable HTTP

Used for deployed MCP services. The analyzer sends a POST request with the prompt JSON.

```json
{
  "securityScan": {
    "transport": "http",
    "url": "http://localhost:3000/mcp"
  }
}
```

## Enabling / Disabling Per Category

Each server corresponds to an analysis category:

| Server key | Category |
|---|---|
| `coverageSummary` | Coverage analysis + CI/PR summaries |
| `securityScan` | Security scanning |
| `performanceAnalysis` | Performance & resilience |
| `compatibilityAnalysis` | Compatibility & contracts |
| `intelligenceAnalysis` | Coverage Intelligence findings & recommendations |

Set `enabled: false` on any server to use the fallback interpreter for that category only.

## Fallback Mode

When MCP is **unavailable** (disabled, timed out, or server error), the analyzer automatically uses the **built-in fallback interpreter** to generate deterministic analysis. Pipelines never fail due to MCP unavailability.

The fallback interpreter produces:

- Executive summary
- Key findings
- Coverage gaps
- Top risks
- Recommended actions

Results marked `isFallback: true` so dashboards can indicate the source.

## Normalized Response Schema

All MCP responses are normalized to this schema before rendering. The analyzer **never renders raw MCP output**.

```ts
interface NormalizedAiAnalysis {
  summary: string;
  keyFindings: string[];
  topRisks: string[];
  recommendedActions: string[];
  missingCoverageAreas?: string[];
  likelyRootCauses?: string[];
  confidence?: 'low' | 'medium' | 'high';
  isFallback?: boolean;
  category?: string;
}
```

## Real-Time Event Streaming

During a scan, events are emitted and buffered on the `AnalysisEventStream`. When MCP is enabled, these events are attached to the final prompt so the AI server has full scan context.

### Event Types

| Event | Description |
|---|---|
| `scan_started` | Scan has begun |
| `file_analyzed` | A test file was analyzed |
| `endpoint_detected` | An API endpoint was found |
| `coverage_gap_detected` | An uncovered endpoint/scenario was detected |
| `security_finding_detected` | A security finding was detected |
| `performance_issue_detected` | A performance issue was found |
| `scan_completed` | Scan completed |

## Security

The MCP integration is **secure by default**:

- **Server allowlist**: Restrict which HTTP servers can receive prompts
- **Transport allowlist**: Restrict which transports are permitted
- **Payload size limit**: Prompts are capped at 1 MB by default
- **Timeout enforcement**: Hard timeout per request
- **Secret redaction**: Sensitive keys (`token`, `password`, `apikey`, `connectionString`, etc.) are automatically redacted from all outgoing payloads

### Redacted Keys

The following key patterns are redacted from all MCP prompts:

- `token`, `password`, `secret`, `apikey`, `api_key`
- `connectionstring`, `connection_string`
- `authorization`, `bearer`
- `private_key`, `privatekey`
- `access_key`, `accesskey`

## Mock MCP Server

A built-in mock server is available for testing:

```ts
import { startMockMcpServer } from './src/mcp/testing/mock-server';

const server = await startMockMcpServer({ port: 3099 });
// server.url = 'http://127.0.0.1:3099/mcp'

// Change behaviour at runtime
server.setBehaviour('error');    // simulate errors
server.setBehaviour('malformed'); // simulate malformed responses
server.setBehaviour('normal');   // reset to normal

await server.close();
```

For stdio testing, use the included script:

```bash
echo '{"category":"coverage","prompt":"...","context":{}}' | node src/mcp/testing/mock-server/stdio-server.js
```

Set `MCP_MOCK_BEHAVIOUR=error|malformed|timeout` to simulate different scenarios.

## Contract Schemas

JSON schemas for contract testing are located in:

- `src/mcp/contracts/analysis-request.schema.json`
- `src/mcp/contracts/analysis-response.schema.json`

These schemas validate that:

1. Outgoing prompt requests contain `category`, `prompt`, and `context` fields
2. Normalized responses always include `summary`, `keyFindings`, `topRisks`, and `recommendedActions`

## Dashboard Integration

The `AiSummaryPanel` component in the dashboard supports both:

- **Legacy markdown mode**: Pass a `markdown` prop
- **MCP structured mode**: Pass a `mcpData` prop with `McpAiPanelData`

The panel is **collapsed by default** and expandable on click.

### MCP Panel Data Shape

```ts
interface McpAiPanelData {
  summary: string;
  keyFindings: string[];
  topRisks: string[];
  recommendedActions: string[];
  missingCoverageAreas?: string[];
  likelyRootCauses?: string[];
  confidence?: 'low' | 'medium' | 'high';
  isFallback?: boolean;
  category?: string;
}
```

## Programmatic API

```ts
import { McpIntegration } from './src/mcp';

const mcp = new McpIntegration(config.mcp ?? {});

// Analyze coverage results
const analysis = await mcp.analyzeCoverage({
  results,
  thresholds,
  gatePassed,
  failedCategories,
  projectName,
  branch,
  commitSha,
});

// Analyze security scan
const secAnalysis = await mcp.analyzeSecurity({ scanSummary });

// Analyze performance
const perfAnalysis = await mcp.analyzePerformance({
  coveragePercent,
  totalScenarios,
  coveredScenarios,
});

// Analyze compatibility
const compatAnalysis = await mcp.analyzeCompatibility({
  compatibilityPercent,
  breakingChanges,
  totalEndpoints,
});

// Generate CI/PR summary
const ciAnalysis = await mcp.analyzeCiSummary({
  overallPassed,
  coverageResults,
  failedGates,
  projectName,
  branch,
  commitSha,
  buildId,
});

// Analyze Coverage Intelligence output
const intelAnalysis = await mcp.analyzeIntelligence({
  totalFindings,
  totalRecommendations,
  maxRiskScore,
  avgRiskScore,
  criticalUncoveredItems,
  unprotectedSecurityFindings,
  recommendationsByPriority,   // e.g. { P0: 2, P1: 3, P2: 1, P3: 0 }
  topFindings,                 // top FunctionalFinding objects
  topRecommendations,          // top MissingTestRecommendation objects
  languages,                   // e.g. ['typescript']
  frameworks,                  // e.g. ['jest']
  projectName,
  branch,
});

// Render to markdown/HTML
const md = mcp.renderMarkdown(analysis, 'coverage', 'Endpoint Coverage');
const html = mcp.renderHtml(analysis, 'coverage', 'Endpoint Coverage');

// Get dashboard panel data
const panelData = mcp.buildPanelData(analysis);

// Check enablement
mcp.isEnabled();                   // global
mcp.isEnabledFor('securityScan'); // per-server
```
