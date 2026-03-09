/**
 * Central config — valid enum value constants.
 *
 * Used by the validator to verify config field values and by the default
 * config to populate the full-profile defaults.
 */

import type {
  CoverageType,
  SecurityScannerType,
  IntelligenceType,
  ReportFormat,
  QualityGateMode,
} from './types';

export const VALID_COVERAGE_TYPES: CoverageType[] = [
  'endpoint',
  'parameter',
  'business',
  'integration',
  'error',
  'security',
  'performance',
  'compatibility',
];

export const VALID_SECURITY_SCANNERS: SecurityScannerType[] = ['semgrep', 'trivy', 'zap'];

export const VALID_INTELLIGENCE_TYPES: IntelligenceType[] = [
  'ai-summary',
  'risk-prioritization',
  'recommendations',
  'scanner-interpretation',
];

export const VALID_REPORT_FORMATS: ReportFormat[] = ['json', 'html', 'csv', 'junit', 'markdown'];

export const VALID_QUALITY_GATE_MODES: QualityGateMode[] = ['strict', 'warn'];

export const VALID_ANALYSIS_MODES = ['full', 'custom'] as const;

export const SUPPORTED_VERSIONS = [1] as const;
