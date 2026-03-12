/**
 * Feature 28 — Test Generation & Quality Intelligence Engine
 * Type definitions for the test generation pipeline.
 */

export type GapType =
  | 'endpoint'
  | 'parameter'
  | 'error'
  | 'business'
  | 'integration'
  | 'security'
  | 'auth';

export type GapPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

export type TestType = 'unit' | 'integration' | 'cypress' | 'security';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export type AuthType = 'jwt' | 'basic' | 'oauth2' | 'apikey';

export type ParameterLocation = 'query' | 'path' | 'header' | 'body';

export type MissingCase =
  | 'boundary-min'
  | 'boundary-max'
  | 'invalid-type'
  | 'missing-required'
  | 'sql-injection'
  | 'xss';

export type SecurityControlType =
  | 'sql-injection'
  | 'xss'
  | 'auth-bypass'
  | 'rate-limit'
  | 'mass-assignment';

export type FileNamingConvention = 'kebab' | 'camelCase' | 'snake_case';

export interface DetectedGap {
  id: string;           // stable gapId: {type}:{method}:{path}:{condition}
  type: GapType;
  priority: GapPriority;
  riskScore: number;    // 0–100
  endpoint: {
    method: HttpMethod;
    path: string;
    operationId?: string;
    summary?: string;
    tags?: string[];
    auth: {
      required: boolean;
      optional: boolean;
      type?: AuthType;
      headerName?: string;
      scheme?: string;
    };
  };
  parameters?: ParameterInfo[];
  responses?: ResponseInfo[];
  businessRule?: BusinessRuleInfo;
  securityControl?: SecurityControlInfo;
  flow?: FlowInfo;
}

export interface ParameterInfo {
  name: string;
  in: ParameterLocation;
  required: boolean;
  schema: {
    type: string;
    format?: string;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    enum?: unknown[];
    pattern?: string;
  };
  missingCases: MissingCase[];
}

export interface ResponseInfo {
  statusCode: number;
  description?: string;
  schema?: unknown;
}

export interface BusinessRuleInfo {
  id: string;
  description: string;
  condition: string;
  acceptanceCriteria: string[];
}

export interface SecurityControlInfo {
  type: SecurityControlType;
  description: string;
  attackVector: string;
  expectedStatusCode: number;
}

export interface FlowInfo {
  id: string;
  name: string;
  steps: Array<{ method: string; path: string; description: string }>;
  missingStepIndex: number;
}

export interface GenerationContext {
  gap: {
    id: string;
    type: GapType;
    priority: GapPriority;
    riskScore: number;
  };
  endpoint: {
    method: string;
    path: string;
    pathNormalized: string;
    operationId?: string;
    summary?: string;
    tags?: string[];
    auth: {
      required: boolean;
      optional: boolean;
      type?: AuthType;
      headerName?: string;
      scheme?: string;
    };
  };
  parameters: ParameterInfo[];
  responses: ResponseInfo[];
  fixtures: {
    validPayload: Record<string, unknown>;
    invalidPayload: Record<string, unknown>;
    authToken: string;
    pathParams: Record<string, string>;
  };
  project: {
    name: string;
    language: string;
    framework: string;
    testFramework: string;
    baseUrl: string;
    importPrefix: string;
  };
  businessRule?: BusinessRuleInfo;
  securityControl?: SecurityControlInfo;
  flow?: FlowInfo;
}

export interface GeneratedFile {
  gapId: string;
  filePath: string;        // absolute output path
  relativePath: string;   // relative to outputDir
  content: string;
  testType: TestType;
  language: string;
  framework: string;
}

export interface GenerationResult {
  files: GeneratedFile[];
  dryRun: boolean;
  totalGaps: number;
  generatedCount: number;
  skippedCount: number;
  errors: Array<{ gapId: string; message: string }>;
}

export interface GenerationOptions {
  reportsDir: string;
  outDir: string;
  language?: string;
  framework?: string;
  priority?: GapPriority;
  dryRun?: boolean;
  overwrite?: boolean;
  gapId?: string;
  types?: GapType[];
  noSecurity?: boolean;
  noCypress?: boolean;
}

// ─── Quality Scorer Types ─────────────────────────────────────────────────────

export interface QualityDimensions {
  assertionDepth: number;      // 0–20
  negativePathCoverage: number; // 0–20
  authCoverage: number;         // 0–20
  boundaryCoverage: number;     // 0–20
  testIndependence: number;     // 0–20
}

export interface FileQualityScore {
  file: string;
  score: number;               // 0–100 (sum of dimensions)
  dimensions: QualityDimensions;
  issues: string[];
  strengths: string[];
}

export interface HighRiskLowQualityGap {
  endpoint: string;
  qualityScore: number;
  riskScore: number;
  primaryIssue: string;
}

export interface TestQualityReport {
  overallScore: number;
  byFile: FileQualityScore[];
  lowestQualityFiles: string[];
  highestRiskLowQualityGaps: HighRiskLowQualityGap[];
}

export interface QualityScorerOptions {
  testsGlob?: string;
  reportsDir?: string;
  failBelow?: number;
}

// ─── AI Flow Exporter Types ───────────────────────────────────────────────────

export interface MissingTestCase {
  id: string;
  description: string;
  expectedStatus: number;
}

export interface AiFlowGap {
  gapId: string;
  priority: GapPriority;
  riskScore: number;
  type: GapType;
  endpoint: {
    method: string;
    path: string;
    auth: {
      required: boolean;
      type?: AuthType;
      scheme?: string;
    };
  };
  missingTestCases: MissingTestCase[];
  requestSchema?: unknown;
  responseSchema?: unknown;
  copilotPrompt: string;
  suggestedOutputPath: string;
  existingSimilarTests: string[];
  generatedCode?: string;
}

export interface AiReadyFlows {
  generatedAt: string;
  project: {
    name: string;
    language: string;
    testFramework: string;
    appImportPath: string;
  };
  gaps: AiFlowGap[];
}

export interface AiFlowExporterOptions {
  reportsDir: string;
  outDir: string;
  format?: 'markdown' | 'json' | 'both';
  maxGaps?: number;
  priority?: GapPriority;
}

// ─── Generator Config Types ───────────────────────────────────────────────────

export interface GenerationConfig {
  enabled?: boolean;
  outputDir?: string;
  dryRun?: boolean;
  overwrite?: boolean;
  minPriority?: GapPriority;
  unitFramework?: string;
  integrationFramework?: string;
  e2eFramework?: string;
  fileNaming?: FileNamingConvention;
  includeTypes?: GapType[];
  securityTests?: {
    enabled?: boolean;
    includeInjection?: boolean;
    includeAuthBypass?: boolean;
    includeRateLimit?: boolean;
  };
  fixtures?: {
    authTokenPlaceholder?: string;
    baseUrl?: string;
  };
}

export interface TestQualityConfig {
  enabled?: boolean;
  minimumScore?: number;
  enforceOnGlob?: string;
  excludeGlob?: string;
  outputPath?: string;
}

export interface AiFlowsConfig {
  enabled?: boolean;
  outputDir?: string;
  maxGapsPerExport?: number;
  minPriority?: GapPriority;
  includeGeneratedCode?: boolean;
  copilotPromptMaxTokens?: number;
}
