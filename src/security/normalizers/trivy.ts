/**
 * Trivy output normalizer.
 * Converts Trivy JSON findings to the common SecurityFinding model.
 */
import {
  SecurityFinding,
  FindingCategory,
  FindingSeverity,
} from '../types';

// ─── Trivy native types ───────────────────────────────────────────────────────

interface TrivyVuln {
  VulnerabilityID: string;
  PkgName: string;
  InstalledVersion: string;
  FixedVersion?: string;
  Title?: string;
  Description?: string;
  Severity: string;
  PrimaryURL?: string;
  References?: string[];
  CweIDs?: string[];
  CVSS?: Record<string, unknown>;
  VendorIDs?: string[];
}

interface TrivySecret {
  RuleID: string;
  Category: string;
  Severity: string;
  Title: string;
  StartLine: number;
  EndLine: number;
  Match?: string;
}

interface TrivyMisconfig {
  ID: string;
  AVDID?: string;
  Type: string;
  Title: string;
  Description: string;
  Message?: string;
  Namespace?: string;
  Query?: string;
  Resolution?: string;
  Severity: string;
  PrimaryURL?: string;
  References?: string[];
  Status?: string;
  Layer?: unknown;
  CauseMetadata?: {
    Resource?: string;
    Provider?: string;
    Service?: string;
    StartLine?: number;
    EndLine?: number;
  };
}

interface TrivyResult {
  Target: string;
  Class?: string;
  Type?: string;
  Vulnerabilities?: TrivyVuln[];
  Secrets?: TrivySecret[];
  Misconfigurations?: TrivyMisconfig[];
}

interface TrivyOutput {
  SchemaVersion?: number;
  ArtifactName?: string;
  ArtifactType?: string;
  Metadata?: Record<string, unknown>;
  Results?: TrivyResult[];
}

// ─── Severity mapping ─────────────────────────────────────────────────────────

function mapTrivySeverity(severity: string): FindingSeverity {
  switch ((severity ?? '').toUpperCase()) {
    case 'CRITICAL': return 'CRITICAL';
    case 'HIGH':     return 'HIGH';
    case 'MEDIUM':   return 'MEDIUM';
    case 'LOW':
    case 'UNKNOWN':
    default:         return 'LOW';
  }
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

/**
 * Parse Trivy JSON output and return normalized SecurityFindings.
 */
export function normaliseTrivyOutput(raw: unknown): SecurityFinding[] {
  const data = raw as TrivyOutput;
  const results = data.Results ?? [];
  const findings: SecurityFinding[] = [];

  for (const result of results) {
    const filePath = result.Target;

    // ── Vulnerabilities ──────────────────────────────────────────────────────
    for (const vuln of result.Vulnerabilities ?? []) {
      const category: FindingCategory = 'sca';

      findings.push({
        scanner: 'trivy',
        category,
        severity: mapTrivySeverity(vuln.Severity),
        title: vuln.Title ?? vuln.VulnerabilityID,
        description: vuln.Description,
        ruleId: vuln.VulnerabilityID,
        cve: [vuln.VulnerabilityID],
        cwe: vuln.CweIDs,
        filePath,
        packageName: vuln.PkgName,
        installedVersion: vuln.InstalledVersion,
        fixedVersion: vuln.FixedVersion,
        scannerNativePayload: vuln,
      });
    }

    // ── Secrets ──────────────────────────────────────────────────────────────
    for (const secret of result.Secrets ?? []) {
      findings.push({
        scanner: 'trivy',
        category: 'secret',
        severity: mapTrivySeverity(secret.Severity),
        title: secret.Title,
        description: secret.Match,
        ruleId: secret.RuleID,
        filePath,
        lineStart: secret.StartLine,
        lineEnd: secret.EndLine,
        secretType: secret.Category,
        scannerNativePayload: secret,
      });
    }

    // ── Misconfigurations ────────────────────────────────────────────────────
    for (const mis of result.Misconfigurations ?? []) {
      findings.push({
        scanner: 'trivy',
        category: 'misconfig',
        severity: mapTrivySeverity(mis.Severity),
        title: mis.Title,
        description: mis.Description,
        ruleId: mis.ID,
        filePath,
        lineStart: mis.CauseMetadata?.StartLine,
        lineEnd: mis.CauseMetadata?.EndLine,
        scannerNativePayload: mis,
      });
    }
  }

  return findings;
}
