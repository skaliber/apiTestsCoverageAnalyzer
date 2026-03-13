export interface SummaryItem {
  type: string;
  totalItems: number;
  coveredItems: number;
  coveragePercent: number;
}

/** One step within an integration flow, with its coverage status. */
export interface FlowStepDetail {
  stepNumber: number;
  name: string;
  method?: string;
  path?: string;
  covered: boolean;
}

export interface DetailItem {
  id: string;
  covered: boolean;
  tests?: string[];
  steps?: number;
  coveredSteps?: number;
  threshold?: string;
  /** Human-readable name for integration flows (e.g. "Shipment Creation to Delivery") */
  flowName?: string;
  /** Detailed step-level data for integration flows */
  rawSteps?: FlowStepDetail[];
}

export interface DetailSection {
  items: DetailItem[];
  /** Preserved extra properties from the raw report (e.g. inferred_details) */
  [key: string]: unknown;
}

export interface DiscoveryInfo {
  projectRoot?: string;
  languages?: string[];
  frameworks?: string[];
  serviceFilesCount?: number;
  testFilesCount?: number;
  specFilesCount?: number;
  analysisMode?: string;
}

export interface CoverageReport {
  generatedAt: string;
  summary: SummaryItem[];
  details: Record<string, DetailSection>;
  discoveryInfo?: DiscoveryInfo;
}

export interface Thresholds {
  endpoint: number;
  parameter: number;
  business: number;
  integration: number;
  security: number;
  error: number;
  performance: number;
  resilience: number;
  [key: string]: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  endpoint: 80,
  parameter: 70,
  business: 60,
  integration: 50,
  security: 60,
  error: 50,
  performance: 75,
  resilience: 50,
};

/** Extra detail attached to inferred business rules from the `analyze` command. */
export interface InferredRuleDetail {
  source_location?: string;
  condition?: string;
  code_snippet?: string;
  type?: string;
  specificKeywords?: string[];
}

// ─── Phase 1: Rich evidence & diagnostics types ──────────────────────────────

/** Confidence level for coverage match detection. */
export type ConfidenceLevel = 'low' | 'medium' | 'high';

/** How a coverage match was detected. */
export type DetectionMode = 'direct' | 'inferred' | 'heuristic';

/** Extended status beyond boolean covered/uncovered. */
export type CoverageStatus = 'covered' | 'uncovered' | 'partial' | 'inferred' | 'unknown';

/** Evidence depth rating. */
export type EvidenceDepth = 'shallow' | 'moderate' | 'deep';

/** Rich evidence metadata attached to any coverage item. */
export interface EvidenceMetadata {
  confidence?: ConfidenceLevel;
  detectionMode?: DetectionMode;
  status?: CoverageStatus;
  sourceLocations?: Array<{ file: string; line?: number; snippet?: string }>;
  testLocations?: Array<{ file: string; line?: number; snippet?: string }>;
  scannerNotes?: string[];
  matchedFrameworks?: string[];
  matchedLibraries?: string[];
  riskScore?: number;
  supportingEvidence?: string[];
  contradictingEvidence?: string[];
}

/** Extended DetailItem with rich evidence fields. */
export interface RichDetailItem extends DetailItem {
  evidence?: EvidenceMetadata;
  category?: string;
  description?: string;
  relatedEndpoint?: string;
  statusCode?: number;
  suggestedTest?: string;
  codeSnippet?: string;
  pseudocode?: string;
}

/** Overview section derived interpretation. */
export interface SectionInterpretation {
  thresholdStatus: 'pass' | 'fail' | 'warning';
  confidenceRating: ConfidenceLevel;
  evidenceDepth: EvidenceDepth;
  fragilityRisk: 'low' | 'medium' | 'high';
  blindSpots: string[];
  topContributingFiles?: string[];
  unsupportedFrameworkNotes?: string[];
}

/** Scan diagnostics information. */
export interface ScanDiagnostics {
  scannedPaths?: string[];
  ignoredPaths?: string[];
  excludedFiles?: string[];
  parseFailures?: string[];
  unsupportedPatterns?: string[];
  fallbackHeuristicsTriggered?: string[];
  manifestsFound?: string[];
  packagesDetected?: string[];
  sourceFileCount?: number;
  testFileCount?: number;
}

/** Local validation command with its source/confidence. */
export interface LocalValidationCommand {
  command: string;
  source: 'detected' | 'inferred' | 'suggested';
  label?: string;
}
