/**
 * MCP integration – shared types and schemas.
 *
 * Defines all shared interfaces consumed by the MCP client, prompt builders,
 * response normalizer, template mapper, event adapter, and fallback interpreter.
 */

// ─── Transport ────────────────────────────────────────────────────────────────

/** Supported MCP transport modes */
export type McpTransport = 'stdio' | 'http';

// ─── Per-server configuration ─────────────────────────────────────────────────

/** Configuration for a single MCP server */
export interface McpServerConfig {
  /** Whether this server is active */
  enabled?: boolean;
  /** Transport to use for this server */
  transport?: McpTransport;
  /** Command to spawn when transport is "stdio" */
  command?: string;
  /** Arguments for the stdio command */
  args?: string[];
  /** HTTP URL when transport is "http" */
  url?: string;
  /** Request timeout override (ms) */
  timeoutMs?: number;
}

// ─── Top-level MCP configuration ─────────────────────────────────────────────

/** Named servers that can be enabled per analysis category */
export interface McpServersConfig {
  coverageSummary?: McpServerConfig;
  securityScan?: McpServerConfig;
  performanceAnalysis?: McpServerConfig;
  compatibilityAnalysis?: McpServerConfig;
  [key: string]: McpServerConfig | undefined;
}

/** Retry policy for MCP requests */
export interface McpRetryPolicy {
  /** Number of retry attempts (default: 2) */
  maxRetries?: number;
  /** Base delay between retries in ms (default: 500) */
  retryDelayMs?: number;
}

/** Top-level MCP integration configuration block */
export interface McpConfig {
  /** Globally enable or disable all MCP integrations */
  enabled?: boolean;
  /** Default transport when a server does not specify one */
  defaultTransport?: McpTransport;
  /** Default request timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Per-server configuration */
  servers?: McpServersConfig;
  /** Retry policy applied to all requests */
  retryPolicy?: McpRetryPolicy;
  /** Maximum prompt payload size in bytes (default: 1 MB) */
  maxPayloadBytes?: number;
  /** Allowlist of server URL prefixes (empty = allow all) */
  serverAllowlist?: string[];
  /** Allowlist of transport types (empty = allow all) */
  transportAllowlist?: McpTransport[];
}

// ─── Analysis events ──────────────────────────────────────────────────────────

/** Valid scan event types */
export type AnalysisEventType =
  | 'scan_started'
  | 'file_analyzed'
  | 'endpoint_detected'
  | 'coverage_gap_detected'
  | 'security_finding_detected'
  | 'performance_issue_detected'
  | 'scan_completed';

/** A single scan event emitted during analysis */
export interface AnalysisEvent {
  type: AnalysisEventType;
  timestamp: number;
  payload: Record<string, unknown>;
}

// ─── MCP request / response ───────────────────────────────────────────────────

/** Prompt request sent to an MCP server */
export interface McpPromptRequest {
  /** Analysis category identifier */
  category: string;
  /** Human-readable prompt text */
  prompt: string;
  /** Structured context data */
  context: Record<string, unknown>;
  /** Accumulated events from the real-time feed */
  events?: AnalysisEvent[];
}

/** Raw response received from an MCP server */
export interface McpRawResponse {
  /** Whether the server returned a usable result */
  ok: boolean;
  /** Raw text response from the server */
  content?: string;
  /** Error message when ok=false */
  error?: string;
  /** Round-trip latency in ms */
  latencyMs?: number;
}

// ─── Normalized AI analysis ───────────────────────────────────────────────────

/** Confidence level for AI-generated analysis */
export type AiConfidence = 'low' | 'medium' | 'high';

/**
 * Normalized AI analysis result.
 * The analyzer NEVER renders raw MCP responses — all outputs are mapped to
 * this schema first.
 */
export interface NormalizedAiAnalysis {
  /** One-paragraph executive summary */
  summary: string;
  /** Bullet-point key findings */
  keyFindings: string[];
  /** Top risk items ordered by severity */
  topRisks: string[];
  /** Concrete recommended actions */
  recommendedActions: string[];
  /** Coverage gaps identified (optional, coverage analysis only) */
  missingCoverageAreas?: string[];
  /** Likely root-cause hypotheses (optional) */
  likelyRootCauses?: string[];
  /** Model's confidence in the analysis */
  confidence?: AiConfidence;
  /** Whether this result came from the fallback interpreter */
  isFallback?: boolean;
  /** Category that was analyzed */
  category?: string;
}

// ─── Template input ───────────────────────────────────────────────────────────

/** Context passed to template mappers */
export interface TemplateContext {
  analysis: NormalizedAiAnalysis;
  /** Category identifier (e.g. "endpoint", "security-scan") */
  category: string;
  /** Human-readable category title */
  categoryTitle?: string;
  /** Whether MCP was enabled for this analysis */
  mcpEnabled?: boolean;
  /** Server name / URL used (for metadata) */
  serverRef?: string;
}
