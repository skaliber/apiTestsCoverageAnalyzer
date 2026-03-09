/**
 * Semgrep output normalizer.
 * Converts Semgrep JSON findings to the common SecurityFinding model.
 */
import {
  SecurityFinding,
  FindingCategory,
  FindingSeverity,
} from '../types';

// ─── Semgrep native types ─────────────────────────────────────────────────────

interface SemgrepResult {
  checkId: string;
  path: string;
  start: { line: number; col?: number };
  end: { line: number; col?: number };
  extra: {
    message?: string;
    severity?: string;
    metadata?: {
      category?: string;
      cwe?: string | string[];
      owasp?: string | string[];
      references?: string[];
      technology?: string[];
    };
    fix?: string;
    lines?: string;
  };
}

interface SemgrepOutput {
  results?: SemgrepResult[];
  errors?: unknown[];
  version?: string;
}

// ─── Severity mapping ─────────────────────────────────────────────────────────

function mapSemgrepSeverity(severity: string | undefined): FindingSeverity {
  switch ((severity ?? '').toUpperCase()) {
    case 'CRITICAL':
      return 'CRITICAL';
    case 'ERROR':
      return 'HIGH';
    case 'WARNING':
    case 'WARN':
      return 'MEDIUM';
    case 'INFO':
    case 'NOTE':
      return 'LOW';
    default:
      return 'MEDIUM';
  }
}

// ─── Category mapping ─────────────────────────────────────────────────────────

function mapSemgrepCategory(
  checkId: string,
  metadata?: SemgrepResult['extra']['metadata'],
): FindingCategory {
  const cat = (metadata?.category ?? '').toLowerCase();

  if (cat === 'security') {
    // Derive more specific category from the rule ID and CWE/OWASP tags
    const idLower = checkId.toLowerCase();
    const cwes = normaliseTags(metadata?.cwe);
    const owasp = normaliseTags(metadata?.owasp);

    if (
      cwes.some((c) => c.includes('89') || c.includes('943')) ||
      idLower.includes('injection') ||
      idLower.includes('sqli') ||
      idLower.includes('xss')
    ) {
      return 'injection';
    }
    if (
      cwes.some((c) => c.includes('798') || c.includes('259') || c.includes('321')) ||
      idLower.includes('hardcoded') ||
      idLower.includes('secret') ||
      idLower.includes('password')
    ) {
      return 'secret';
    }
    if (
      cwes.some((c) => c.includes('287') || c.includes('306') || c.includes('384')) ||
      idLower.includes('auth')
    ) {
      return 'auth';
    }
    if (
      cwes.some((c) => c.includes('311') || c.includes('319') || c.includes('327')) ||
      idLower.includes('crypto') ||
      idLower.includes('cipher') ||
      idLower.includes('tls') ||
      idLower.includes('ssl')
    ) {
      return 'crypto';
    }
    if (owasp.some((o) => o.includes('A3') || o.includes('sensitive'))) {
      return 'data-exposure';
    }
    return 'sast';
  }

  if (cat.includes('secret') || cat.includes('credential')) return 'secret';
  if (cat.includes('inject')) return 'injection';
  if (cat.includes('auth')) return 'auth';
  if (cat.includes('crypto') || cat.includes('cipher')) return 'crypto';
  if (cat.includes('exposure') || cat.includes('disclosure')) return 'data-exposure';
  if (cat.includes('config') || cat.includes('misconfiguration')) return 'misconfig';

  return 'sast';
}

function normaliseTags(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

/**
 * Parse a Semgrep JSON output buffer and return normalized SecurityFindings.
 */
export function normalizeSemgrepOutput(raw: unknown): SecurityFinding[] {
  const data = raw as SemgrepOutput;
  const results = data.results ?? [];

  return results.map((r): SecurityFinding => {
    const cwe = normaliseTags(r.extra?.metadata?.cwe);
    const owasp = normaliseTags(r.extra?.metadata?.owasp);

    return {
      scanner: 'semgrep',
      category: mapSemgrepCategory(r.checkId, r.extra?.metadata),
      severity: mapSemgrepSeverity(r.extra?.severity),
      title: r.extra?.message ?? r.checkId,
      description: r.extra?.lines,
      ruleId: r.checkId,
      cwe: cwe.length > 0 ? cwe : undefined,
      owasp: owasp.length > 0 ? owasp : undefined,
      filePath: r.path,
      lineStart: r.start?.line,
      lineEnd: r.end?.line,
      scannerNativePayload: r,
    };
  });
}
