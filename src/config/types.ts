/**
 * Central config — TypeScript type definitions.
 *
 * `AnalyzerConfig` is the single normalized config object consumed by every
 * scanning module, CLI command, MCP client, report generator, and quality gate.
 * All external consumers must import from this module, never from raw YAML.
 */

import type { McpConfig } from '../mcp/types';

// Re-export McpConfig so callers only need to import from this module.
export type { McpConfig } from '../mcp/types';

// ─── Sub-config types ─────────────────────────────────────────────────────────

export interface ProjectConfig {
  /** Display name used in summaries and reports */
  name?: string;
}

export interface AstLanguageConfig {
  /** When false, skip AST analysis for this language and use regex fallback */
  enabled?: boolean;
}

export interface AstAnalysisConfig {
  /** Master switch. When false, skip AST entirely and use regex fallback. Default: true. */
  enabled?: boolean;
  /**
   * When true (default), if AST parsing succeeds but returns 0 HTTP interactions the
   * engine runs the regex fallback and tags its results with resolutionType:'heuristic'
   * and confidence:'low'. When false, 0 AST results are returned verbatim.
   */
  fallbackHeuristics?: boolean;
  /** Maximum call-chain depth for wrapper/helper tracing. Default: 4. */
  maxCallDepth?: number;
  /** Include assertion type metadata in output. Default: true. */
  assertionAware?: boolean;
  /** Per-language enable/disable toggles */
  languages?: {
    java?: AstLanguageConfig;
    kotlin?: AstLanguageConfig;
    python?: AstLanguageConfig;
    ruby?: AstLanguageConfig;
    javascript?: AstLanguageConfig;
    typescript?: AstLanguageConfig;
    cucumber?: AstLanguageConfig;
  };
}

export interface AnalysisConfig {
  /** 'full' runs all scans; 'custom' runs only explicitly-enabled scans */
  defaultMode?: 'full' | 'custom';
  /** If true, missing config.yaml halts execution with non-zero exit */
  failOnConfigMissing?: boolean;
  /** If true, emits a warning when config.yaml is absent */
  warnOnConfigMissing?: boolean;
  /** AST-based analysis configuration */
  ast?: AstAnalysisConfig;
}

export type CoverageType =
  | 'endpoint'
  | 'parameter'
  | 'business'
  | 'integration'
  | 'error'
  | 'security'
  | 'performance'
  | 'compatibility';

export type SecurityScannerType = 'semgrep' | 'trivy' | 'zap';

export type IntelligenceType =
  | 'ai-summary'
  | 'risk-prioritization'
  | 'recommendations'
  | 'scanner-interpretation';

export type ReportFormat = 'json' | 'html' | 'csv' | 'junit' | 'markdown';

/**
 * Configuration for the deep endpoint analysis feature.
 * Nested under scans.coverage.deepAnalysis in config.yaml.
 */
export interface DeepAnalysisCoverageConfig {
  /** Master switch. When false the engine falls back to direct regex only. */
  enabled?: boolean;
  /** Maximum call-chain depth to follow when tracing wrapper methods. Default: 4. */
  maxCallDepth?: number;
  /** Resolve named constant/variable references to their literal values. */
  resolveConstants?: boolean;
  /** Resolve enum member references to their literal path values. */
  resolveEnums?: boolean;
  /** Resolve template literals and string concatenation. */
  resolveStringTemplates?: boolean;
  /** Trace helper/wrapper methods to find HTTP calls. */
  resolveWrappers?: boolean;
  /** Detect request-builder / request-object patterns. */
  resolveRequestBuilders?: boolean;
  /** Apply explicit or inferred client-to-HTTP-method mapping. */
  resolveClientMappings?: boolean;
  /** Associate HTTP calls with downstream response assertions. */
  assertionAware?: boolean;
  /**
   * Explicit client-method → HTTP mappings.
   * Example: { classOrObject: 'userClient', method: 'getById', httpMethod: 'GET', pathTemplate: '/users/{id}' }
   */
  clientMappings?: Array<{
    classOrObject: string;
    method: string;
    httpMethod: string;
    pathTemplate: string;
  }>;
}

export interface CoverageScansConfig {
  enabled?: boolean;
  types?: CoverageType[];
  /** Deep endpoint analysis configuration. */
  deepAnalysis?: DeepAnalysisCoverageConfig;
}

export interface SecurityScansConfig {
  enabled?: boolean;
  scanners?: SecurityScannerType[];
}

export interface IntelligenceScansConfig {
  enabled?: boolean;
  types?: IntelligenceType[];
}

export interface ScansConfig {
  coverage?: CoverageScansConfig;
  security?: SecurityScansConfig;
  intelligence?: IntelligenceScansConfig;
}

export interface ThresholdsConfig {
  global?: number;
  endpoint?: number;
  parameter?: number;
  business?: number;
  integration?: number;
  error?: number;
  security?: number;
  performance?: number;
  resilience?: number;
  compatibility?: number;
  [key: string]: number | undefined;
}

export type QualityGateMode = 'strict' | 'warn';

export interface QualityGateConfig {
  enabled?: boolean;
  failBuildOnThresholdMiss?: boolean;
  mode?: QualityGateMode;
}

export interface ReportsConfig {
  outputDir?: string;
  formats?: ReportFormat[];
}

export interface GitHubPagesPublishingConfig {
  enabled?: boolean;
}

export interface PublishingConfig {
  enabled?: boolean;
  githubPages?: GitHubPagesPublishingConfig;
}

export interface AiSummaryConfig {
  enabled?: boolean;
  collapsedByDefault?: boolean;
}

export interface DashboardConfig {
  aiSummary?: AiSummaryConfig;
}

// ─── Top-level config ─────────────────────────────────────────────────────────

export interface AnalyzerConfig {
  /** Config schema version; must be 1 for this release */
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
