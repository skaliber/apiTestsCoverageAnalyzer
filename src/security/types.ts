/**
 * Normalized security finding model.
 * All scanner outputs (Semgrep, Trivy, ZAP, etc.) are mapped to this common schema.
 */

export type ScannerName = 'semgrep' | 'trivy' | 'zap' | 'gitleaks' | 'other';

export type FindingCategory =
  | 'sast'
  | 'sca'
  | 'secret'
  | 'misconfig'
  | 'dast'
  | 'auth'
  | 'injection'
  | 'data-exposure'
  | 'crypto'
  | 'unknown';

export type FindingSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SecurityFinding {
  scanner: ScannerName;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description?: string;
  ruleId?: string;
  cwe?: string[];
  cve?: string[];
  owasp?: string[];
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  endpoint?: {
    method?: string;
    path?: string;
  };
  packageName?: string;
  installedVersion?: string;
  fixedVersion?: string;
  secretType?: string;
  scannerNativePayload?: unknown;
}

// ─── Scanner configuration ────────────────────────────────────────────────────

export type ScannerMode = 'embedded' | 'import' | 'disabled';

export interface SemgrepScannerConfig {
  enabled: boolean;
  mode: ScannerMode;
  /** Semgrep config (e.g. "p/default", "p/security-audit", or path to custom rules) */
  config?: string;
  /** Binary path override */
  binaryPath?: string;
  /** Include globs */
  include?: string[];
  /** Exclude globs */
  exclude?: string[];
  /** Timeout in seconds */
  timeout?: number;
  /** Path to pre-generated Semgrep JSON report (import mode) */
  reportPath?: string;
}

export interface TrivyScannerConfig {
  enabled: boolean;
  mode: ScannerMode;
  /** Scan mode: 'fs' (filesystem) or 'repo' */
  scanMode?: 'fs' | 'repo';
  /** What to scan: combinations of 'vuln', 'misconfig', 'secret' */
  scanners?: Array<'vuln' | 'misconfig' | 'secret'>;
  /** Binary path override */
  binaryPath?: string;
  /** Timeout in seconds */
  timeout?: number;
  /** Path to pre-generated Trivy JSON report (import mode) */
  reportPath?: string;
}

export interface ZapScannerConfig {
  enabled: boolean;
  mode: ScannerMode;
  /** Base URL for dynamic scanning */
  targetUrl?: string;
  /** Scan profile */
  profile?: 'baseline' | 'full';
  /** Authentication configuration */
  auth?: {
    loginUrl?: string;
    username?: string;
    password?: string;
    tokenHeader?: string;
    tokenValue?: string;
  };
  /** Timeout in seconds */
  timeout?: number;
  /** Path to pre-generated ZAP JSON/XML report (import mode) */
  reportPath?: string;
}

export interface SecurityScannerConfigs {
  semgrep?: SemgrepScannerConfig;
  trivy?: TrivyScannerConfig;
  zap?: ZapScannerConfig;
}

// ─── Security gate configuration ─────────────────────────────────────────────

export interface SecurityGateConfig {
  /** Fail if any CRITICAL finding exists */
  failOnCritical?: boolean;
  /** Fail if any HIGH finding exists */
  failOnHigh?: boolean;
  /** Maximum allowed MEDIUM findings */
  maxMedium?: number;
  /** Maximum allowed LOW findings */
  maxLow?: number;
  /** Maximum allowed secrets (any severity) */
  maxSecrets?: number;
  /** Maximum allowed HIGH misconfigurations */
  maxMisconfigHigh?: number;
  /** Maximum allowed CRITICAL vulnerabilities */
  maxCriticalVulns?: number;
  /** Maximum allowed HIGH vulnerabilities */
  maxHighVulns?: number;
}

// ─── Top-level security scanning configuration ───────────────────────────────

export interface SecurityScanConfig {
  enabled: boolean;
  /** Workspace directory to scan. Default: '.' */
  workspace?: string;
  scanners?: SecurityScannerConfigs;
  gate?: SecurityGateConfig;
}

// ─── Scan results ─────────────────────────────────────────────────────────────

export interface ScannerResult {
  scanner: ScannerName;
  findings: SecurityFinding[];
  /** Whether the scanner ran successfully */
  success: boolean;
  /** Error message if the scanner failed */
  error?: string;
  /** Raw output or metadata from the scanner */
  metadata?: Record<string, unknown>;
}

export interface SecurityScanSummary {
  scannersRun: ScannerName[];
  totalFindings: number;
  bySeverity: Record<FindingSeverity, number>;
  byCategory: Record<FindingCategory, number>;
  byScanner: Record<ScannerName, number>;
  findings: SecurityFinding[];
  gateResult?: SecurityGateResult;
}

// ─── Gate result ─────────────────────────────────────────────────────────────

export interface SecurityGateResult {
  passed: boolean;
  reasons: string[];
  thresholds: SecurityGateConfig;
  counts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    secrets: number;
    misconfigHigh: number;
    criticalVulns: number;
    highVulns: number;
  };
}
