/**
 * Security gate evaluator.
 * Evaluates normalized findings against configured thresholds and returns a pass/fail result.
 */
import {
  SecurityFinding,
  SecurityGateConfig,
  SecurityGateResult,
} from '../types';

// ─── Gate evaluation ──────────────────────────────────────────────────────────

/**
 * Count findings matching specific criteria.
 */
function countFindings(findings: SecurityFinding[], predicate: (f: SecurityFinding) => boolean): number {
  return findings.filter(predicate).length;
}

/**
 * Evaluate the security gate against normalized findings.
 * Returns a SecurityGateResult with pass/fail status and detailed reasons.
 */
export function evaluateSecurityGate(
  findings: SecurityFinding[],
  config: SecurityGateConfig,
): SecurityGateResult {
  const reasons: string[] = [];

  const counts = {
    critical: countFindings(findings, (f) => f.severity === 'CRITICAL'),
    high: countFindings(findings, (f) => f.severity === 'HIGH'),
    medium: countFindings(findings, (f) => f.severity === 'MEDIUM'),
    low: countFindings(findings, (f) => f.severity === 'LOW'),
    secrets: countFindings(findings, (f) => f.category === 'secret'),
    misconfigHigh: countFindings(
      findings,
      (f) => f.category === 'misconfig' && (f.severity === 'HIGH' || f.severity === 'CRITICAL'),
    ),
    criticalVulns: countFindings(
      findings,
      (f) => f.category === 'sca' && f.severity === 'CRITICAL',
    ),
    highVulns: countFindings(
      findings,
      (f) => f.category === 'sca' && f.severity === 'HIGH',
    ),
  };

  // ── failOnCritical ────────────────────────────────────────────────────────
  if (config.failOnCritical && counts.critical > 0) {
    reasons.push(`${counts.critical} CRITICAL finding(s) found (failOnCritical=true)`);
  }

  // ── failOnHigh ────────────────────────────────────────────────────────────
  if (config.failOnHigh && counts.high > 0) {
    reasons.push(`${counts.high} HIGH finding(s) found (failOnHigh=true)`);
  }

  // ── maxMedium ─────────────────────────────────────────────────────────────
  if (config.maxMedium !== undefined && counts.medium > config.maxMedium) {
    reasons.push(
      `${counts.medium} MEDIUM finding(s) found, exceeds maxMedium=${config.maxMedium}`,
    );
  }

  // ── maxLow ────────────────────────────────────────────────────────────────
  if (config.maxLow !== undefined && counts.low > config.maxLow) {
    reasons.push(`${counts.low} LOW finding(s) found, exceeds maxLow=${config.maxLow}`);
  }

  // ── maxSecrets ────────────────────────────────────────────────────────────
  if (config.maxSecrets !== undefined && counts.secrets > config.maxSecrets) {
    reasons.push(
      `${counts.secrets} secret(s) found, exceeds maxSecrets=${config.maxSecrets}`,
    );
  }

  // ── maxMisconfigHigh ─────────────────────────────────────────────────────
  if (config.maxMisconfigHigh !== undefined && counts.misconfigHigh > config.maxMisconfigHigh) {
    reasons.push(
      `${counts.misconfigHigh} HIGH/CRITICAL misconfiguration(s) found, exceeds maxMisconfigHigh=${config.maxMisconfigHigh}`,
    );
  }

  // ── maxCriticalVulns ─────────────────────────────────────────────────────
  if (config.maxCriticalVulns !== undefined && counts.criticalVulns > config.maxCriticalVulns) {
    reasons.push(
      `${counts.criticalVulns} CRITICAL vulnerability(ies) found, exceeds maxCriticalVulns=${config.maxCriticalVulns}`,
    );
  }

  // ── maxHighVulns ─────────────────────────────────────────────────────────
  if (config.maxHighVulns !== undefined && counts.highVulns > config.maxHighVulns) {
    reasons.push(
      `${counts.highVulns} HIGH vulnerability(ies) found, exceeds maxHighVulns=${config.maxHighVulns}`,
    );
  }

  return {
    passed: reasons.length === 0,
    reasons,
    thresholds: config,
    counts,
  };
}
