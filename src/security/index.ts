/**
 * Security scanning orchestrator.
 * Coordinates scanner execution, normalization, report generation,
 * and security gate evaluation.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  SecurityScanConfig,
  SecurityScanSummary,
  SecurityFinding,
  FindingSeverity,
  FindingCategory,
  ScannerName,
  ScannerResult,
} from './types';
import { runSemgrep } from './scanners/semgrep';
import { runTrivy } from './scanners/trivy';
import { runZap } from './scanners/zap';
import { evaluateSecurityGate } from './gate/index';

// ─── Re-exports ───────────────────────────────────────────────────────────────

export * from './types';
export { normalizeSemgrepOutput } from './normalizers/semgrep';
export { normalizeTrivyOutput } from './normalizers/trivy';
export { normalizeZapOutput } from './normalizers/zap';
export { evaluateSecurityGate } from './gate/index';

// ─── Scanner orchestration ────────────────────────────────────────────────────

/**
 * Run all configured security scanners and collect findings.
 */
export async function runSecurityScanners(
  config: SecurityScanConfig,
): Promise<ScannerResult[]> {
  const workspace = path.resolve(config.workspace ?? '.');
  const results: ScannerResult[] = [];
  const scanners = config.scanners ?? {};

  if (scanners.semgrep?.enabled) {
    results.push(await runSemgrep(scanners.semgrep, workspace));
  }

  if (scanners.trivy?.enabled) {
    results.push(await runTrivy(scanners.trivy, workspace));
  }

  if (scanners.zap?.enabled) {
    results.push(await runZap(scanners.zap));
  }

  return results;
}

// ─── Summary builder ──────────────────────────────────────────────────────────

/**
 * Build a SecurityScanSummary from scanner results.
 */
export function buildSecurityScanSummary(
  results: ScannerResult[],
  config: SecurityScanConfig,
): SecurityScanSummary {
  const allFindings: SecurityFinding[] = results.flatMap((r) => r.findings);
  const scannersRun = results
    .filter((r) => r.success || r.findings.length > 0)
    .map((r) => r.scanner);

  const bySeverity: Record<FindingSeverity, number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };
  const byCategory: Record<FindingCategory, number> = {
    sast: 0,
    sca: 0,
    secret: 0,
    misconfig: 0,
    dast: 0,
    auth: 0,
    injection: 0,
    'data-exposure': 0,
    crypto: 0,
    unknown: 0,
  };
  const byScanner: Record<ScannerName, number> = {
    semgrep: 0,
    trivy: 0,
    zap: 0,
    gitleaks: 0,
    other: 0,
  };

  for (const finding of allFindings) {
    bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
    byCategory[finding.category] = (byCategory[finding.category] ?? 0) + 1;
    byScanner[finding.scanner] = (byScanner[finding.scanner] ?? 0) + 1;
  }

  const gateResult =
    config.gate
      ? evaluateSecurityGate(allFindings, config.gate)
      : undefined;

  return {
    scannersRun,
    totalFindings: allFindings.length,
    bySeverity,
    byCategory,
    byScanner,
    findings: allFindings,
    gateResult,
  };
}

// ─── Report generation ────────────────────────────────────────────────────────

/**
 * Generate all security scan reports in the given directory.
 */
export function generateSecurityScanReports(
  summary: SecurityScanSummary,
  reportsDir: string,
): void {
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const { findings } = summary;

  // ── security-scan-summary.json ────────────────────────────────────────────
  const summaryJson = {
    scannersRun: summary.scannersRun,
    totalFindings: summary.totalFindings,
    bySeverity: summary.bySeverity,
    byCategory: summary.byCategory,
    byScanner: summary.byScanner,
    gateResult: summary.gateResult,
  };
  fs.writeFileSync(
    path.join(reportsDir, 'security-scan-summary.json'),
    JSON.stringify(summaryJson, null, 2),
    'utf-8',
  );

  // ── security-sast.json ────────────────────────────────────────────────────
  const sast = findings.filter(
    (f) => f.scanner === 'semgrep' || f.category === 'sast' || f.category === 'injection',
  );
  fs.writeFileSync(
    path.join(reportsDir, 'security-sast.json'),
    JSON.stringify(sast, null, 2),
    'utf-8',
  );

  // ── security-dependencies.json ────────────────────────────────────────────
  const deps = findings.filter((f) => f.category === 'sca');
  fs.writeFileSync(
    path.join(reportsDir, 'security-dependencies.json'),
    JSON.stringify(deps, null, 2),
    'utf-8',
  );

  // ── security-secrets.json ─────────────────────────────────────────────────
  const secrets = findings.filter((f) => f.category === 'secret');
  fs.writeFileSync(
    path.join(reportsDir, 'security-secrets.json'),
    JSON.stringify(secrets, null, 2),
    'utf-8',
  );

  // ── security-misconfig.json ───────────────────────────────────────────────
  const misconfig = findings.filter((f) => f.category === 'misconfig');
  fs.writeFileSync(
    path.join(reportsDir, 'security-misconfig.json'),
    JSON.stringify(misconfig, null, 2),
    'utf-8',
  );

  // ── security-dast.json ────────────────────────────────────────────────────
  const dast = findings.filter((f) => f.scanner === 'zap' || f.category === 'dast');
  fs.writeFileSync(
    path.join(reportsDir, 'security-dast.json'),
    JSON.stringify(dast, null, 2),
    'utf-8',
  );

  // ── security-ai-summary.md ────────────────────────────────────────────────
  const md = buildAiSummaryMarkdown(summary);
  fs.writeFileSync(path.join(reportsDir, 'security-ai-summary.md'), md, 'utf-8');

  // ── security-scan-summary.html ────────────────────────────────────────────
  const html = buildSummaryHtml(summary);
  fs.writeFileSync(
    path.join(reportsDir, 'security-scan-summary.html'),
    html,
    'utf-8',
  );
}

// ─── AI-friendly Markdown report ──────────────────────────────────────────────

function buildAiSummaryMarkdown(summary: SecurityScanSummary): string {
  const { findings, gateResult } = summary;
  const gate = gateResult ? (gateResult.passed ? '✅ PASSED' : '❌ FAILED') : 'Not configured';

  const topSecrets = findings.filter((f) => f.category === 'secret').slice(0, 5);
  const topCritical = findings
    .filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH')
    .slice(0, 10);

  const listFindings = (items: SecurityFinding[]): string =>
    items.length === 0
      ? '- None\n'
      : items
          .map(
            (f) =>
              `- **[${f.severity}]** ${f.title}${f.filePath ? ` — \`${f.filePath}\`` : ''}${f.packageName ? ` (${f.packageName} ${f.installedVersion ?? ''})` : ''}`,
          )
          .join('\n') + '\n';

  return `# Security Scan AI Summary

## Scanners Executed
${summary.scannersRun.length > 0 ? summary.scannersRun.map((s) => `- ${s}`).join('\n') : '- None'}

## Security Gate
**Status:** ${gate}
${gateResult && !gateResult.passed ? `\n**Failure reasons:**\n${gateResult.reasons.map((r) => `- ${r}`).join('\n')}` : ''}

## Findings Summary

| Severity | Count |
|----------|-------|
| CRITICAL | ${summary.bySeverity.CRITICAL} |
| HIGH | ${summary.bySeverity.HIGH} |
| MEDIUM | ${summary.bySeverity.MEDIUM} |
| LOW | ${summary.bySeverity.LOW} |

| Category | Count |
|----------|-------|
${Object.entries(summary.byCategory)
  .filter(([, v]) => v > 0)
  .map(([k, v]) => `| ${k} | ${v} |`)
  .join('\n')}

## Top Risks

### Secrets Found (${findings.filter((f) => f.category === 'secret').length})
${listFindings(topSecrets)}

### Critical / High Findings (${topCritical.length} shown)
${listFindings(topCritical)}

## Recommended Remediation Order

1. **Secrets** — revoke and rotate immediately (${findings.filter((f) => f.category === 'secret').length} found)
2. **Critical Vulnerabilities** — patch or mitigate (${summary.bySeverity.CRITICAL} found)
3. **Auth Flaws** — fix authentication/authorization issues (${summary.byCategory.auth} found)
4. **Injection Risks** — fix injection vulnerabilities (${summary.byCategory.injection} found)
5. **Misconfigurations** — resolve HIGH/CRITICAL misconfigurations (${summary.byCategory.misconfig} found)
6. **Medium Findings** — address remaining MEDIUM issues (${summary.bySeverity.MEDIUM} found)
`;
}

// ─── HTML summary report ──────────────────────────────────────────────────────

function buildSummaryHtml(summary: SecurityScanSummary): string {
  const gateStatus = summary.gateResult
    ? summary.gateResult.passed
      ? '<span style="color:green">✅ PASSED</span>'
      : `<span style="color:red">❌ FAILED</span>`
    : '<span style="color:gray">Not configured</span>';

  const gateReasons =
    summary.gateResult && !summary.gateResult.passed
      ? `<ul>${summary.gateResult.reasons.map((r) => `<li>${r}</li>`).join('')}</ul>`
      : '';

  const severityRows = (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as FindingSeverity[])
    .map((s) => {
      const count = summary.bySeverity[s];
      const cls = s === 'CRITICAL' ? 'bad' : s === 'HIGH' ? 'bad' : s === 'MEDIUM' ? 'warn' : '';
      return `<tr class="${cls}"><td>${s}</td><td>${count}</td></tr>`;
    })
    .join('\n');

  const categoryRows = Object.entries(summary.byCategory)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
    .join('\n');

  const findingRows = summary.findings
    .slice(0, 200)
    .map((f) => {
      const cls =
        f.severity === 'CRITICAL' || f.severity === 'HIGH'
          ? 'bad'
          : f.severity === 'MEDIUM'
          ? 'warn'
          : '';
      const file = f.filePath ? `<code>${f.filePath}${f.lineStart ? `:${f.lineStart}` : ''}</code>` : '—';
      const pkg = f.packageName ? `${f.packageName} ${f.installedVersion ?? ''}` : '—';
      return `<tr class="${cls}">
        <td>${f.scanner}</td>
        <td>${f.severity}</td>
        <td>${f.category}</td>
        <td>${f.title}</td>
        <td>${file}</td>
        <td>${pkg}</td>
      </tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Security Scan Summary</title>
  <style>
    body { font-family: sans-serif; padding: 2rem; }
    h1, h2 { margin-bottom: 0.5rem; }
    .gate { font-size: 1.2rem; margin-bottom: 1rem; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
    th, td { border: 1px solid #ccc; padding: 0.5rem 1rem; text-align: left; }
    th { background: #f0f0f0; }
    tr.bad { background: #ffe6e6; }
    tr.warn { background: #fff9e6; }
  </style>
</head>
<body>
  <h1>Security Scan Summary</h1>
  <div class="gate">
    Security Gate: ${gateStatus}
    ${gateReasons}
  </div>

  <h2>Scanners Run</h2>
  <p>${summary.scannersRun.length > 0 ? summary.scannersRun.join(', ') : 'None'}</p>

  <h2>Findings by Severity</h2>
  <table>
    <thead><tr><th>Severity</th><th>Count</th></tr></thead>
    <tbody>${severityRows}</tbody>
  </table>

  <h2>Findings by Category</h2>
  <table>
    <thead><tr><th>Category</th><th>Count</th></tr></thead>
    <tbody>${categoryRows || '<tr><td colspan="2">No findings</td></tr>'}</tbody>
  </table>

  <h2>Findings Detail (up to 200)</h2>
  <table>
    <thead>
      <tr><th>Scanner</th><th>Severity</th><th>Category</th><th>Title</th><th>File</th><th>Package</th></tr>
    </thead>
    <tbody>${findingRows || '<tr><td colspan="6">No findings</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

// ─── Full security scan workflow ───────────────────────────────────────────────

/**
 * Run the complete security scan workflow:
 * 1. Execute configured scanners
 * 2. Normalize findings
 * 3. Build summary
 * 4. Evaluate gate
 * 5. Generate reports
 *
 * Returns the SecurityScanSummary for further use.
 */
export async function runSecurityScan(
  config: SecurityScanConfig,
  reportsDir: string = 'reports',
): Promise<SecurityScanSummary> {
  const results = await runSecurityScanners(config);
  const summary = buildSecurityScanSummary(results, config);
  const resolvedDir = path.resolve(reportsDir);
  generateSecurityScanReports(summary, resolvedDir);
  return summary;
}
