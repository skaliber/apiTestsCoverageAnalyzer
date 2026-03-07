/**
 * Coverage Intelligence – shared types.
 *
 * Defines FunctionalFinding, MissingTestRecommendation, and all supporting
 * enumerations used by the linkage engine, risk scorer, and markdown reporter.
 */

// ─── Functional Finding ───────────────────────────────────────────────────────

export type FindingSource =
  | 'coverage-gap-analysis'
  | 'error-coverage'
  | 'security-coverage'
  | 'security-scan'
  | 'integration-flow'
  | 'parameter-coverage'
  | 'business-coverage'
  | 'compatibility'
  | 'performance-resilience'
  | 'mcp-analysis'
  | 'manual-rule';

export type FindingCategory =
  | 'uncovered-endpoint'
  | 'missing-negative-test'
  | 'missing-auth-test'
  | 'missing-boundary-test'
  | 'missing-business-rule-test'
  | 'missing-flow-step-test'
  | 'security-finding-unprotected'
  | 'high-risk-parameter-gap'
  | 'compatibility-risk'
  | 'performance-risk'
  | 'error-scenario-gap';

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface EndpointRef {
  method?: string;
  path?: string;
}

export interface FunctionalFinding {
  id: string;
  source: FindingSource;
  category: FindingCategory;
  severity: Severity;
  title: string;
  description: string;
  endpoint?: EndpointRef;
  filePaths?: string[];
  relatedTests?: string[];
  relatedRules?: string[];
  relatedScanners?: string[];
  relatedFindings?: string[];
  missingTestTypes?: string[];
  frameworkHints?: string[];
  languageHints?: string[];
  tags?: string[];
}

// ─── Missing Test Recommendation ─────────────────────────────────────────────

export type RecommendationPriority = 'P0' | 'P1' | 'P2' | 'P3';

export type RecommendedTestType =
  | 'positive-api-test'
  | 'negative-api-test'
  | 'auth-test'
  | 'authz-test'
  | 'boundary-test'
  | 'business-rule-test'
  | 'integration-flow-test'
  | 'security-test'
  | 'performance-test'
  | 'resilience-test'
  | 'compatibility-test';

export interface MissingTestRecommendation {
  id: string;
  priority: RecommendationPriority;
  title: string;
  rationale: string;
  recommendedTestType: RecommendedTestType;
  endpoint?: EndpointRef;
  likelyFileTargets?: string[];
  likelyFramework?: string;
  likelyLanguage?: string;
  linkedFindingIds: string[];
  riskScore: number;
  confidence: 'low' | 'medium' | 'high';
}

// ─── Risk Band ────────────────────────────────────────────────────────────────

export type RiskBand = 'Low' | 'Moderate' | 'High' | 'Critical';

// ─── Risk Score Components ────────────────────────────────────────────────────

export interface RiskScoreComponents {
  /** 0-100: derived from severity */
  severityWeight: number;
  /** 0-100: how exposed is this area */
  exposureWeight: number;
  /** 0-100: business/domain criticality */
  criticalityWeight: number;
  /** 0-100: how uncovered is the area */
  missingCoverageWeight: number;
  /** 0-100: security signal from scanners */
  securitySignalWeight: number;
  /** 0-100: impact on broader integration flow */
  flowImpactWeight: number;
  /** 0-100: change volatility / instability */
  changeVolatilityWeight: number;
}

// ─── Intelligence Engine Input ────────────────────────────────────────────────

export interface IntelligenceInput {
  /** Coverage results from all analyzers */
  coverageResults: Array<{
    type: string;
    totalItems: number;
    coveredItems: number;
    coveragePercent: number;
    details: unknown;
  }>;
  /** Security scan findings (optional) */
  securityFindings?: Array<{
    id?: string;
    severity: string;
    title: string;
    description?: string;
    category?: string;
    scanner?: string;
    filePath?: string;
    endpoint?: EndpointRef;
  }>;
  /** Detected languages in the project */
  languages?: string[];
  /** Detected test frameworks */
  frameworks?: string[];
  /** Whether MCP is enabled */
  mcpEnabled?: boolean;
  /** Output directory for reports */
  outDir?: string;
  /** Project/service name */
  projectName?: string;
  /** Coverage thresholds */
  thresholds?: Record<string, number | undefined>;
}

// ─── Intelligence Engine Output ───────────────────────────────────────────────

export interface IntelligenceReport {
  /** Generation timestamp */
  generatedAt: string;
  /** Project/service name */
  projectName: string;
  /** All functional findings discovered */
  findings: FunctionalFinding[];
  /** All missing test recommendations */
  recommendations: MissingTestRecommendation[];
  /** Summary statistics */
  summary: IntelligenceSummary;
}

export interface IntelligenceSummary {
  totalFindings: number;
  findingsBySeverity: Record<Severity, number>;
  totalRecommendations: number;
  recommendationsByPriority: Record<RecommendationPriority, number>;
  maxRiskScore: number;
  avgRiskScore: number;
  criticalUncoveredItems: number;
  unprotectedSecurityFindings: number;
  topRiskAreas: string[];
}
