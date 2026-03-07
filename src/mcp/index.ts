/**
 * MCP integration – public API.
 *
 * This is the single entry point for all MCP features.  Consumers import from
 * here rather than from individual sub-modules.
 *
 * Usage example:
 *
 *   import { McpIntegration } from './mcp';
 *
 *   const mcp = new McpIntegration(config.mcp ?? {});
 *   const analysis = await mcp.analyzeCoverage({ results, thresholds, gatePassed });
 *   const md = mcp.renderMarkdown(analysis, 'coverage');
 */

import type { McpConfig, NormalizedAiAnalysis, AnalysisEvent } from './types';
import { isMcpEnabledFor } from './config';
import { McpClient } from './client';
import {
  buildCoverageSummaryPrompt,
  buildSecurityScanPrompt,
  buildPerformancePrompt,
  buildCompatibilityPrompt,
  buildCiSummaryPrompt,
  type CoverageSummaryPromptInput,
  type SecurityScanPromptInput,
  type PerformancePromptInput,
  type CompatibilityPromptInput,
  type CiSummaryPromptInput,
} from './prompts';
import { normalizeMcpResponse } from './normalizer';
import {
  renderAiAnalysisMarkdown,
  renderAiAnalysisHtml,
  buildAiPanelData,
  type AiPanelData,
} from './templates';
import {
  generateFallbackCoverageAnalysis,
  generateFallbackSecurityAnalysis,
  generateFallbackAnalysis,
} from './fallback';
import { AnalysisEventStream } from './events';

// ─── Re-exports ───────────────────────────────────────────────────────────────

export type {
  McpConfig,
  McpServerConfig,
  McpServersConfig,
  McpRetryPolicy,
  McpTransport,
  AnalysisEvent,
  AnalysisEventType,
  McpPromptRequest,
  McpRawResponse,
  NormalizedAiAnalysis,
  AiConfidence,
  TemplateContext,
} from './types';

export type {
  CoverageSummaryPromptInput,
  SecurityScanPromptInput,
  PerformancePromptInput,
  CompatibilityPromptInput,
  CiSummaryPromptInput,
} from './prompts';

export type { AiPanelData } from './templates';

export {
  buildCoverageSummaryPrompt,
  buildSecurityScanPrompt,
  buildPerformancePrompt,
  buildCompatibilityPrompt,
  buildCiSummaryPrompt,
} from './prompts';

export { normalizeMcpResponse } from './normalizer';

export {
  renderAiAnalysisMarkdown,
  renderAiAnalysisHtml,
  buildAiPanelData,
} from './templates';

export {
  generateFallbackCoverageAnalysis,
  generateFallbackSecurityAnalysis,
  generateFallbackAnalysis,
} from './fallback';

export { AnalysisEventStream, createNoOpStream } from './events';

export {
  isMcpEnabledFor,
  resolveServerConfig,
  validateTransport,
  validateServerUrl,
  validatePayloadSize,
  redactSecrets,
  REDACTED_KEYS,
  MCP_DEFAULT_TIMEOUT_MS,
  MCP_DEFAULT_MAX_PAYLOAD_BYTES,
  MCP_DEFAULT_TRANSPORT,
  MCP_ALLOWED_TRANSPORTS,
} from './config';

export { McpClient } from './client';

// ─── McpIntegration facade ────────────────────────────────────────────────────

/**
 * High-level facade that wires together the MCP client, prompts, normalizer,
 * templates, and fallback interpreter.
 *
 * Instantiate with the `mcp` block from `coverage.config.json`.
 */
export class McpIntegration {
  private readonly client: McpClient;
  private readonly eventStream: AnalysisEventStream;

  constructor(private readonly config: McpConfig) {
    this.client = new McpClient(config);
    this.eventStream = new AnalysisEventStream();
  }

  // ─── Event stream ───────────────────────────────────────────────────────────

  /** Access the real-time event stream */
  get events(): AnalysisEventStream {
    return this.eventStream;
  }

  // ─── Analysis methods ───────────────────────────────────────────────────────

  /** Analyze coverage results via MCP (or fallback if unavailable) */
  async analyzeCoverage(input: CoverageSummaryPromptInput): Promise<NormalizedAiAnalysis> {
    if (!isMcpEnabledFor(this.config, 'coverageSummary')) {
      const result = generateFallbackCoverageAnalysis({
        results: input.results,
        thresholds: input.thresholds,
        gatePassed: input.gatePassed,
        failedCategories: input.failedCategories,
      });
      return result;
    }

    const request = buildCoverageSummaryPrompt(input);
    request.events = [...this.eventStream.getEvents()];

    const raw = await this.client.send('coverageSummary', request);
    const normalized = normalizeMcpResponse(raw, 'coverage');
    if (!raw.ok) normalized.isFallback = true;
    return normalized;
  }

  /** Analyze security scan results via MCP (or fallback if unavailable) */
  async analyzeSecurity(input: SecurityScanPromptInput): Promise<NormalizedAiAnalysis> {
    if (!isMcpEnabledFor(this.config, 'securityScan')) {
      return generateFallbackSecurityAnalysis({ scanSummary: input.scanSummary });
    }

    const request = buildSecurityScanPrompt(input);
    request.events = [...this.eventStream.getEvents()];

    const raw = await this.client.send('securityScan', request);
    const normalized = normalizeMcpResponse(raw, 'security');
    if (!raw.ok) normalized.isFallback = true;
    return normalized;
  }

  /** Analyze performance / resilience coverage via MCP (or fallback) */
  async analyzePerformance(input: PerformancePromptInput): Promise<NormalizedAiAnalysis> {
    if (!isMcpEnabledFor(this.config, 'performanceAnalysis')) {
      return generateFallbackAnalysis(
        'performance',
        input.coveragePercent,
        undefined,
      );
    }

    const request = buildPerformancePrompt(input);
    const raw = await this.client.send('performanceAnalysis', request);
    const normalized = normalizeMcpResponse(raw, 'performance');
    if (!raw.ok) normalized.isFallback = true;
    return normalized;
  }

  /** Analyze compatibility / contract coverage via MCP (or fallback) */
  async analyzeCompatibility(input: CompatibilityPromptInput): Promise<NormalizedAiAnalysis> {
    if (!isMcpEnabledFor(this.config, 'compatibilityAnalysis')) {
      return generateFallbackAnalysis(
        'compatibility',
        input.compatibilityPercent,
        undefined,
      );
    }

    const request = buildCompatibilityPrompt(input);
    const raw = await this.client.send('compatibilityAnalysis', request);
    const normalized = normalizeMcpResponse(raw, 'compatibility');
    if (!raw.ok) normalized.isFallback = true;
    return normalized;
  }

  /** Generate a CI/PR summary via MCP (or fallback) */
  async analyzeCiSummary(input: CiSummaryPromptInput): Promise<NormalizedAiAnalysis> {
    if (!isMcpEnabledFor(this.config, 'coverageSummary')) {
      const gatePassed = input.overallPassed;
      return generateFallbackCoverageAnalysis({
        results: input.coverageResults,
        gatePassed,
        failedCategories: input.failedGates,
      });
    }

    const request = buildCiSummaryPrompt(input);
    const raw = await this.client.send('coverageSummary', request);
    const normalized = normalizeMcpResponse(raw, 'ci-summary');
    if (!raw.ok) normalized.isFallback = true;
    return normalized;
  }

  // ─── Rendering helpers ──────────────────────────────────────────────────────

  /** Render a NormalizedAiAnalysis as Markdown */
  renderMarkdown(
    analysis: NormalizedAiAnalysis,
    category: string,
    categoryTitle?: string,
  ): string {
    return renderAiAnalysisMarkdown({
      analysis,
      category,
      categoryTitle,
      mcpEnabled: this.config.enabled,
    });
  }

  /** Render a NormalizedAiAnalysis as HTML */
  renderHtml(
    analysis: NormalizedAiAnalysis,
    category: string,
    categoryTitle?: string,
  ): string {
    return renderAiAnalysisHtml({
      analysis,
      category,
      categoryTitle,
      mcpEnabled: this.config.enabled,
    });
  }

  /** Build dashboard panel data from a NormalizedAiAnalysis */
  buildPanelData(analysis: NormalizedAiAnalysis): AiPanelData {
    return buildAiPanelData(analysis);
  }

  // ─── Accessors ──────────────────────────────────────────────────────────────

  /** Whether MCP is globally enabled */
  isEnabled(): boolean {
    return this.config.enabled === true;
  }

  /** Whether MCP is enabled for a specific server/category */
  isEnabledFor(serverName: string): boolean {
    return isMcpEnabledFor(this.config, serverName);
  }

  /** Collect all buffered events */
  getEvents(): ReadonlyArray<AnalysisEvent> {
    return this.eventStream.getEvents();
  }
}
