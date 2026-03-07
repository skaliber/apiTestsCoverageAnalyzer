/**
 * Coverage Intelligence – Risk Scoring Engine.
 *
 * Implements a deterministic, formula-driven risk score for each functional
 * finding or missing-test recommendation.
 *
 * Formula:
 *   Risk Score =
 *     0.30 * SeverityWeight +
 *     0.20 * ExposureWeight +
 *     0.15 * CriticalityWeight +
 *     0.15 * MissingCoverageWeight +
 *     0.10 * SecuritySignalWeight +
 *     0.05 * FlowImpactWeight +
 *     0.05 * ChangeVolatilityWeight
 *
 * All components are normalized to 0–100.  Final score is clamped to 0–100
 * and rounded to the nearest integer.
 */

import type {
  Severity,
  RiskBand,
  RiskScoreComponents,
  RecommendationPriority,
  FindingCategory,
} from './types';

// ─── Component weights ────────────────────────────────────────────────────────

const WEIGHTS = {
  severity: 0.30,
  exposure: 0.20,
  criticality: 0.15,
  missingCoverage: 0.15,
  securitySignal: 0.10,
  flowImpact: 0.05,
  changeVolatility: 0.05,
} as const;

// ─── Severity mapping ─────────────────────────────────────────────────────────

/** Maps severity label → 0-100 score component. */
export function severityToWeight(severity: Severity | string): number {
  switch (severity.toUpperCase()) {
    case 'CRITICAL': return 100;
    case 'HIGH':     return 75;
    case 'MEDIUM':   return 50;
    case 'LOW':      return 25;
    default:         return 25;
  }
}

// ─── Category-based defaults ──────────────────────────────────────────────────

/**
 * Derive default exposure, criticality, and flow-impact values from the
 * finding category and optional endpoint information.
 */
export function defaultExposureWeight(
  category: FindingCategory | string,
  endpointPath?: string,
): number {
  // Auth/authz gaps are typically on exposed endpoints
  if (category === 'missing-auth-test' || category === 'security-finding-unprotected') {
    return 80;
  }
  // Public endpoint patterns
  if (endpointPath) {
    const lower = endpointPath.toLowerCase();
    if (lower.includes('admin') || lower.includes('internal')) return 30;
    if (lower.includes('auth') || lower.includes('login') || lower.includes('token')) return 90;
    if (lower.includes('payment') || lower.includes('wallet') || lower.includes('transfer')) return 90;
  }
  return 50; // default
}

export function defaultCriticalityWeight(
  category: FindingCategory | string,
  endpointPath?: string,
): number {
  const criticalCategories: Array<FindingCategory | string> = [
    'missing-auth-test',
    'security-finding-unprotected',
  ];
  if (criticalCategories.includes(category)) return 90;

  if (endpointPath) {
    const lower = endpointPath.toLowerCase();
    if (
      lower.includes('payment') ||
      lower.includes('wallet') ||
      lower.includes('transfer') ||
      lower.includes('refund') ||
      lower.includes('debit') ||
      lower.includes('charge')
    ) {
      return 95;
    }
    if (lower.includes('auth') || lower.includes('login') || lower.includes('token')) return 90;
    if (lower.includes('profile') || lower.includes('account') || lower.includes('user')) return 50;
  }

  switch (category) {
    case 'uncovered-endpoint':           return 70;
    case 'missing-business-rule-test':   return 75;
    case 'missing-flow-step-test':       return 65;
    case 'error-scenario-gap':           return 55;
    case 'missing-negative-test':        return 60;
    case 'missing-boundary-test':        return 45;
    case 'compatibility-risk':           return 70;
    case 'performance-risk':             return 60;
    case 'high-risk-parameter-gap':      return 55;
    default:                             return 40;
  }
}

export function defaultFlowImpactWeight(
  category: FindingCategory | string,
  endpointPath?: string,
): number {
  if (category === 'missing-flow-step-test') return 80;
  if (endpointPath) {
    const lower = endpointPath.toLowerCase();
    if (lower.includes('payment') || lower.includes('checkout') || lower.includes('signup')) {
      return 80;
    }
  }
  switch (category) {
    case 'uncovered-endpoint':           return 30;
    case 'missing-business-rule-test':   return 50;
    case 'security-finding-unprotected': return 60;
    case 'compatibility-risk':           return 60;
    default:                             return 20;
  }
}

// ─── Core scoring function ────────────────────────────────────────────────────

export interface RiskScoreInput {
  severity: Severity | string;
  category: FindingCategory | string;
  endpointPath?: string;
  /** Override individual components (0-100 each) */
  components?: Partial<RiskScoreComponents>;
  /** Whether linked security scanner findings exist */
  hasSecuritySignal?: boolean;
  /** Whether there are zero tests covering this area */
  zeroCoverage?: boolean;
}

/**
 * Compute a 0–100 risk score for a finding or recommendation.
 */
export function computeRiskScore(input: RiskScoreInput): number {
  const c = input.components ?? {};

  const severityW   = c.severityWeight       ?? severityToWeight(input.severity);
  const exposureW   = c.exposureWeight        ?? defaultExposureWeight(input.category, input.endpointPath);
  const criticalW   = c.criticalityWeight     ?? defaultCriticalityWeight(input.category, input.endpointPath);
  const missingCovW = c.missingCoverageWeight ?? (input.zeroCoverage ? 100 : 75);
  const secSignalW  = c.securitySignalWeight  ?? (input.hasSecuritySignal ? 100 : 0);
  const flowImpW    = c.flowImpactWeight      ?? defaultFlowImpactWeight(input.category, input.endpointPath);
  const changeVolW  = c.changeVolatilityWeight ?? 40; // default when no git data

  const raw =
    WEIGHTS.severity      * severityW  +
    WEIGHTS.exposure      * exposureW  +
    WEIGHTS.criticality   * criticalW  +
    WEIGHTS.missingCoverage * missingCovW +
    WEIGHTS.securitySignal  * secSignalW  +
    WEIGHTS.flowImpact      * flowImpW    +
    WEIGHTS.changeVolatility * changeVolW;

  return Math.min(100, Math.max(0, Math.round(raw)));
}

// ─── Risk band ────────────────────────────────────────────────────────────────

export function scoreToRiskBand(score: number): RiskBand {
  if (score >= 75) return 'Critical';
  if (score >= 50) return 'High';
  if (score >= 25) return 'Moderate';
  return 'Low';
}

// ─── Priority assignment ──────────────────────────────────────────────────────

/** Derive recommendation priority from risk score, with override rules. */
export function scoreToPriority(
  score: number,
  overrides?: {
    isCriticalSecurityFinding?: boolean;
    isMoneyMovementEndpoint?: boolean;
    isAuthGap?: boolean;
    isZeroCoverageCriticalFlow?: boolean;
  },
): RecommendationPriority {
  // Override rules: never lower than P1 for high-stakes scenarios
  const mustBeP1OrHigher =
    overrides?.isCriticalSecurityFinding ||
    overrides?.isMoneyMovementEndpoint ||
    overrides?.isAuthGap ||
    overrides?.isZeroCoverageCriticalFlow;

  let priority: RecommendationPriority;
  if (score >= 85) {
    priority = 'P0';
  } else if (score >= 70) {
    priority = 'P1';
  } else if (score >= 50) {
    priority = 'P2';
  } else {
    priority = 'P3';
  }

  if (mustBeP1OrHigher && (priority === 'P2' || priority === 'P3')) {
    return 'P1';
  }
  return priority;
}
