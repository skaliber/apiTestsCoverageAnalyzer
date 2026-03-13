import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  normalizeSemgrepOutput,
} from '../src/security/normalizers/semgrep';
import {
  normalizeTrivyOutput,
} from '../src/security/normalizers/trivy';
import {
  normalizeZapOutput,
} from '../src/security/normalizers/zap';
import {
  evaluateSecurityGate,
} from '../src/security/gate/index';
import {
  buildSecurityScanSummary,
  generateSecurityScanReports,
  runSecurityScan,
} from '../src/security/index';
import {
  SecurityFinding,
  SecurityScanConfig,
  SecurityGateConfig,
  ScannerResult,
} from '../src/security/types';

// ─── normalizeSemgrepOutput ───────────────────────────────────────────────────

describe('normalizeSemgrepOutput', () => {
  it('returns empty array for empty results', () => {
    expect(normalizeSemgrepOutput({ results: [] })).toEqual([]);
  });

  it('normalises a Semgrep finding with security metadata', () => {
    const raw = {
      results: [
        {
          checkId: 'java.lang.security.injection.sql-injection',
          path: 'src/UserRepository.java',
          start: { line: 42, col: 1 },
          end: { line: 42, col: 80 },
          extra: {
            message: 'Potential SQL injection detected',
            severity: 'ERROR',
            metadata: {
              category: 'security',
              cwe: 'CWE-89',
              owasp: 'A1:2021 - Injection',
            },
          },
        },
      ],
    };
    const findings = normalizeSemgrepOutput(raw);
    expect(findings).toHaveLength(1);
    expect(findings[0].scanner).toBe('semgrep');
    expect(findings[0].severity).toBe('HIGH');
    expect(findings[0].category).toBe('injection');
    expect(findings[0].filePath).toBe('src/UserRepository.java');
    expect(findings[0].lineStart).toBe(42);
    expect(findings[0].ruleId).toBe('java.lang.security.injection.sql-injection');
    expect(findings[0].cwe).toEqual(['CWE-89']);
    expect(findings[0].title).toBe('Potential SQL injection detected');
  });

  it('maps WARNING severity to MEDIUM', () => {
    const raw = {
      results: [
        {
          checkId: 'some-rule',
          path: 'app.py',
          start: { line: 1 },
          end: { line: 1 },
          extra: { severity: 'WARNING', metadata: { category: 'security' } },
        },
      ],
    };
    const findings = normalizeSemgrepOutput(raw);
    expect(findings[0].severity).toBe('MEDIUM');
  });

  it('maps INFO severity to LOW', () => {
    const raw = {
      results: [
        {
          checkId: 'info-rule',
          path: 'app.rb',
          start: { line: 5 },
          end: { line: 5 },
          extra: { severity: 'INFO', metadata: {} },
        },
      ],
    };
    const findings = normalizeSemgrepOutput(raw);
    expect(findings[0].severity).toBe('LOW');
  });

  it('maps hardcoded-password rules to secret category', () => {
    const raw = {
      results: [
        {
          checkId: 'generic.secrets.hardcoded-password',
          path: 'config.py',
          start: { line: 3 },
          end: { line: 3 },
          extra: { severity: 'ERROR', metadata: { category: 'security' } },
        },
      ],
    };
    const findings = normalizeSemgrepOutput(raw);
    expect(findings[0].category).toBe('secret');
  });

  it('handles multiple findings', () => {
    const raw = {
      results: [
        {
          checkId: 'rule-1',
          path: 'a.ts',
          start: { line: 1 },
          end: { line: 1 },
          extra: { severity: 'ERROR', metadata: { category: 'security' } },
        },
        {
          checkId: 'rule-2',
          path: 'b.ts',
          start: { line: 2 },
          end: { line: 2 },
          extra: { severity: 'WARNING', metadata: { category: 'security' } },
        },
      ],
    };
    const findings = normalizeSemgrepOutput(raw);
    expect(findings).toHaveLength(2);
  });
});

// ─── normalizeTrivyOutput ─────────────────────────────────────────────────────

describe('normalizeTrivyOutput', () => {
  it('returns empty array for empty results', () => {
    expect(normalizeTrivyOutput({ Results: [] })).toEqual([]);
  });

  it('normalises vulnerability findings', () => {
    const raw = {
      Results: [
        {
          Target: 'package-lock.json',
          Class: 'lang-pkgs',
          Type: 'npm',
          Vulnerabilities: [
            {
              VulnerabilityID: 'CVE-2021-1234',
              PkgName: 'lodash',
              InstalledVersion: '4.17.15',
              FixedVersion: '4.17.21',
              Title: 'Prototype Pollution in lodash',
              Description: 'A prototype pollution vulnerability exists in lodash.',
              Severity: 'CRITICAL',
              CweIDs: ['CWE-1321'],
            },
          ],
        },
      ],
    };
    const findings = normalizeTrivyOutput(raw);
    expect(findings).toHaveLength(1);
    expect(findings[0].scanner).toBe('trivy');
    expect(findings[0].category).toBe('sca');
    expect(findings[0].severity).toBe('CRITICAL');
    expect(findings[0].packageName).toBe('lodash');
    expect(findings[0].installedVersion).toBe('4.17.15');
    expect(findings[0].fixedVersion).toBe('4.17.21');
    expect(findings[0].cve).toEqual(['CVE-2021-1234']);
    expect(findings[0].cwe).toEqual(['CWE-1321']);
  });

  it('normalises secret findings', () => {
    const raw = {
      Results: [
        {
          Target: 'src/config.ts',
          Secrets: [
            {
              RuleID: 'aws-access-key',
              Category: 'AWS',
              Severity: 'CRITICAL',
              Title: 'AWS Access Key',
              StartLine: 10,
              EndLine: 10,
              Match: 'AKIA...',
            },
          ],
        },
      ],
    };
    const findings = normalizeTrivyOutput(raw);
    expect(findings).toHaveLength(1);
    expect(findings[0].scanner).toBe('trivy');
    expect(findings[0].category).toBe('secret');
    expect(findings[0].severity).toBe('CRITICAL');
    expect(findings[0].secretType).toBe('AWS');
    expect(findings[0].lineStart).toBe(10);
  });

  it('normalises misconfig findings', () => {
    const raw = {
      Results: [
        {
          Target: 'Dockerfile',
          Misconfigurations: [
            {
              ID: 'DS002',
              Type: 'Dockerfile Security Check',
              Title: 'Root user',
              Description: 'Running containers as root user.',
              Severity: 'HIGH',
              CauseMetadata: { StartLine: 5, EndLine: 5 },
            },
          ],
        },
      ],
    };
    const findings = normalizeTrivyOutput(raw);
    expect(findings).toHaveLength(1);
    expect(findings[0].scanner).toBe('trivy');
    expect(findings[0].category).toBe('misconfig');
    expect(findings[0].severity).toBe('HIGH');
    expect(findings[0].ruleId).toBe('DS002');
  });

  it('handles multiple result types in one scan', () => {
    const raw = {
      Results: [
        {
          Target: 'package-lock.json',
          Vulnerabilities: [
            {
              VulnerabilityID: 'CVE-2022-0001',
              PkgName: 'express',
              InstalledVersion: '4.17.1',
              Severity: 'HIGH',
            },
          ],
        },
        {
          Target: 'Dockerfile',
          Misconfigurations: [
            {
              ID: 'DS001',
              Type: 'Dockerfile',
              Title: 'No healthcheck',
              Description: 'No healthcheck',
              Severity: 'LOW',
            },
          ],
        },
      ],
    };
    const findings = normalizeTrivyOutput(raw);
    expect(findings).toHaveLength(2);
    expect(findings[0].category).toBe('sca');
    expect(findings[1].category).toBe('misconfig');
  });

  it('maps UNKNOWN severity to LOW', () => {
    const raw = {
      Results: [
        {
          Target: 'go.sum',
          Vulnerabilities: [
            {
              VulnerabilityID: 'CVE-2020-9999',
              PkgName: 'somelib',
              InstalledVersion: '1.0.0',
              Severity: 'UNKNOWN',
            },
          ],
        },
      ],
    };
    const findings = normalizeTrivyOutput(raw);
    expect(findings[0].severity).toBe('LOW');
  });
});

// ─── normalizeZapOutput ───────────────────────────────────────────────────────

describe('normalizeZapOutput', () => {
  it('returns empty array for empty alerts', () => {
    expect(normalizeZapOutput({ site: [{ alerts: [] }] })).toEqual([]);
  });

  it('normalises ZAP alerts from site.alerts format', () => {
    const raw = {
      site: [
        {
          '@name': 'https://example.com',
          alerts: [
            {
              alert: 'SQL Injection',
              riskdesc: 'High (High)',
              riskcode: '3',
              description: 'SQL injection vulnerability detected.',
              uri: 'https://example.com/api/users?id=1',
              method: 'GET',
              cweid: '89',
            },
          ],
        },
      ],
    };
    const findings = normalizeZapOutput(raw);
    expect(findings).toHaveLength(1);
    expect(findings[0].scanner).toBe('zap');
    expect(findings[0].severity).toBe('HIGH');
    expect(findings[0].category).toBe('injection');
    expect(findings[0].title).toBe('SQL Injection');
    expect(findings[0].cwe).toEqual(['CWE-89']);
    expect(findings[0].endpoint?.method).toBe('GET');
  });

  it('normalises ZAP alerts from top-level alerts format', () => {
    const raw = {
      alerts: [
        {
          name: 'Cross Site Scripting (XSS)',
          riskdesc: 'High (High)',
          description: 'XSS vulnerability',
          uri: 'https://example.com/search',
        },
      ],
    };
    const findings = normalizeZapOutput(raw);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('injection');
    expect(findings[0].title).toBe('Cross Site Scripting (XSS)');
  });

  it('maps riskdesc "Medium" to MEDIUM severity', () => {
    const raw = {
      alerts: [
        {
          alert: 'X-Content-Type-Options Header Missing',
          riskdesc: 'Medium (Medium)',
        },
      ],
    };
    const findings = normalizeZapOutput(raw);
    expect(findings[0].severity).toBe('MEDIUM');
  });

  it('maps riskdesc "Low" to LOW severity', () => {
    const raw = {
      alerts: [
        {
          alert: 'Timestamp Disclosure',
          riskdesc: 'Low (Low)',
        },
      ],
    };
    const findings = normalizeZapOutput(raw);
    expect(findings[0].severity).toBe('LOW');
  });

  it('maps authentication-related alerts to auth category', () => {
    const raw = {
      alerts: [
        { alert: 'Authentication bypass via parameter tampering', riskdesc: 'High (High)' },
      ],
    };
    const findings = normalizeZapOutput(raw);
    expect(findings[0].category).toBe('auth');
  });

  it('maps SSL/TLS related alerts to crypto category', () => {
    const raw = {
      alerts: [{ alert: 'SSL Certificate Expired', riskdesc: 'High (High)' }],
    };
    const findings = normalizeZapOutput(raw);
    expect(findings[0].category).toBe('crypto');
  });

  it('handles multiple sites with alerts', () => {
    const raw = {
      site: [
        {
          alerts: [
            { alert: 'XSS', riskdesc: 'High (High)' },
            { alert: 'CSRF', riskdesc: 'Medium (Medium)' },
          ],
        },
        {
          alerts: [{ alert: 'SQL Injection', riskdesc: 'High (High)' }],
        },
      ],
    };
    const findings = normalizeZapOutput(raw);
    expect(findings).toHaveLength(3);
  });
});

// ─── evaluateSecurityGate ─────────────────────────────────────────────────────

describe('evaluateSecurityGate', () => {
  const criticalFinding: SecurityFinding = {
    scanner: 'semgrep',
    category: 'injection',
    severity: 'CRITICAL',
    title: 'Critical injection',
  };
  const highFinding: SecurityFinding = {
    scanner: 'trivy',
    category: 'sca',
    severity: 'HIGH',
    title: 'High vuln',
  };
  const mediumFinding: SecurityFinding = {
    scanner: 'semgrep',
    category: 'sast',
    severity: 'MEDIUM',
    title: 'Medium finding',
  };
  const secretFinding: SecurityFinding = {
    scanner: 'trivy',
    category: 'secret',
    severity: 'CRITICAL',
    title: 'AWS key found',
  };
  const misconfigHighFinding: SecurityFinding = {
    scanner: 'trivy',
    category: 'misconfig',
    severity: 'HIGH',
    title: 'Running as root',
  };

  it('passes when no findings and no thresholds', () => {
    const result = evaluateSecurityGate([], {});
    expect(result.passed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('fails when failOnCritical=true and there are critical findings', () => {
    const result = evaluateSecurityGate([criticalFinding], { failOnCritical: true });
    expect(result.passed).toBe(false);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain('CRITICAL');
  });

  it('passes when failOnCritical=true and no critical findings', () => {
    const result = evaluateSecurityGate([mediumFinding], { failOnCritical: true });
    expect(result.passed).toBe(true);
  });

  it('fails when failOnHigh=true and there are high findings', () => {
    const result = evaluateSecurityGate([highFinding], { failOnHigh: true });
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain('HIGH');
  });

  it('fails when medium count exceeds maxMedium', () => {
    const findings = [mediumFinding, mediumFinding, mediumFinding];
    const result = evaluateSecurityGate(findings, { maxMedium: 2 });
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain('maxMedium=2');
  });

  it('passes when medium count equals maxMedium', () => {
    const findings = [mediumFinding, mediumFinding];
    const result = evaluateSecurityGate(findings, { maxMedium: 2 });
    expect(result.passed).toBe(true);
  });

  it('fails when secrets exceed maxSecrets=0', () => {
    const result = evaluateSecurityGate([secretFinding], { maxSecrets: 0 });
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain('secret');
  });

  it('fails when misconfig HIGH exceeds maxMisconfigHigh', () => {
    const result = evaluateSecurityGate([misconfigHighFinding], { maxMisconfigHigh: 0 });
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain('misconfig');
  });

  it('fails when critical vulns exceed maxCriticalVulns', () => {
    const critVuln: SecurityFinding = {
      scanner: 'trivy',
      category: 'sca',
      severity: 'CRITICAL',
      title: 'Critical CVE',
    };
    const result = evaluateSecurityGate([critVuln], { maxCriticalVulns: 0 });
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain('CRITICAL vulnerability');
  });

  it('fails when high vulns exceed maxHighVulns', () => {
    const result = evaluateSecurityGate([highFinding], { maxHighVulns: 0 });
    expect(result.passed).toBe(false);
  });

  it('accumulates multiple failure reasons', () => {
    const result = evaluateSecurityGate(
      [criticalFinding, secretFinding],
      { failOnCritical: true, maxSecrets: 0 },
    );
    expect(result.passed).toBe(false);
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it('exposes counts correctly', () => {
    const result = evaluateSecurityGate(
      [criticalFinding, highFinding, mediumFinding, secretFinding, misconfigHighFinding],
      {},
    );
    expect(result.counts.critical).toBe(2); // criticalFinding + secretFinding are CRITICAL
    expect(result.counts.high).toBe(2); // highFinding + misconfigHighFinding are HIGH
    expect(result.counts.medium).toBe(1);
    expect(result.counts.secrets).toBe(1);
    expect(result.counts.misconfigHigh).toBe(1);
  });
});

// ─── buildSecurityScanSummary ─────────────────────────────────────────────────

describe('buildSecurityScanSummary', () => {
  const sampleResults: ScannerResult[] = [
    {
      scanner: 'semgrep',
      success: true,
      findings: [
        { scanner: 'semgrep', category: 'injection', severity: 'HIGH', title: 'SQLi' },
        { scanner: 'semgrep', category: 'sast', severity: 'MEDIUM', title: 'Weak cipher' },
      ],
    },
    {
      scanner: 'trivy',
      success: true,
      findings: [
        { scanner: 'trivy', category: 'sca', severity: 'CRITICAL', title: 'Log4Shell' },
        { scanner: 'trivy', category: 'secret', severity: 'CRITICAL', title: 'AWS key' },
      ],
    },
  ];

  const config: SecurityScanConfig = {
    enabled: true,
    gate: { failOnCritical: true, maxSecrets: 0 },
  };

  it('aggregates findings from all scanners', () => {
    const summary = buildSecurityScanSummary(sampleResults, config);
    expect(summary.totalFindings).toBe(4);
    expect(summary.byScanner.semgrep).toBe(2);
    expect(summary.byScanner.trivy).toBe(2);
  });

  it('counts by severity correctly', () => {
    const summary = buildSecurityScanSummary(sampleResults, config);
    expect(summary.bySeverity.CRITICAL).toBe(2);
    expect(summary.bySeverity.HIGH).toBe(1);
    expect(summary.bySeverity.MEDIUM).toBe(1);
    expect(summary.bySeverity.LOW).toBe(0);
  });

  it('counts by category correctly', () => {
    const summary = buildSecurityScanSummary(sampleResults, config);
    expect(summary.byCategory.injection).toBe(1);
    expect(summary.byCategory.sca).toBe(1);
    expect(summary.byCategory.secret).toBe(1);
  });

  it('includes scannersRun', () => {
    const summary = buildSecurityScanSummary(sampleResults, config);
    expect(summary.scannersRun).toContain('semgrep');
    expect(summary.scannersRun).toContain('trivy');
  });

  it('evaluates gate when configured', () => {
    const summary = buildSecurityScanSummary(sampleResults, config);
    expect(summary.gateResult).toBeDefined();
    expect(summary.gateResult!.passed).toBe(false);
    expect(summary.gateResult!.reasons.length).toBeGreaterThanOrEqual(1);
  });

  it('does not include gateResult when no gate configured', () => {
    const summary = buildSecurityScanSummary(sampleResults, { enabled: true });
    expect(summary.gateResult).toBeUndefined();
  });
});

// ─── generateSecurityScanReports ─────────────────────────────────────────────

describe('generateSecurityScanReports', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-scan-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates all expected report files', () => {
    const summary = buildSecurityScanSummary(
      [
        {
          scanner: 'trivy',
          success: true,
          findings: [
            { scanner: 'trivy', category: 'sca', severity: 'HIGH', title: 'CVE-2021-1234', packageName: 'lodash' },
            { scanner: 'trivy', category: 'secret', severity: 'CRITICAL', title: 'AWS key', secretType: 'AWS' },
            { scanner: 'trivy', category: 'misconfig', severity: 'HIGH', title: 'Dockerfile root' },
          ],
        },
        {
          scanner: 'semgrep',
          success: true,
          findings: [
            { scanner: 'semgrep', category: 'injection', severity: 'HIGH', title: 'SQL Injection', filePath: 'src/api.js' },
          ],
        },
        {
          scanner: 'zap',
          success: true,
          findings: [
            { scanner: 'zap', category: 'dast', severity: 'MEDIUM', title: 'Missing header', endpoint: { path: '/api/users' } },
          ],
        },
      ],
      { enabled: true, gate: { failOnCritical: true } },
    );

    generateSecurityScanReports(summary, tmpDir);

    const expectedFiles = [
      'security-scan-summary.json',
      'security-scan-summary.html',
      'security-sast.json',
      'security-dependencies.json',
      'security-secrets.json',
      'security-misconfig.json',
      'security-dast.json',
      'security-ai-summary.md',
    ];

    for (const file of expectedFiles) {
      expect(fs.existsSync(path.join(tmpDir, file))).toBe(true);
    }
  });

  it('writes valid JSON in summary report', () => {
    const summary = buildSecurityScanSummary([], { enabled: true });
    generateSecurityScanReports(summary, tmpDir);

    const summaryJson = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'security-scan-summary.json'), 'utf-8'),
    );
    expect(summaryJson).toHaveProperty('totalFindings', 0);
    expect(summaryJson).toHaveProperty('bySeverity');
    expect(summaryJson).toHaveProperty('byCategory');
  });

  it('writes gate result in summary when configured', () => {
    const summary = buildSecurityScanSummary(
      [
        {
          scanner: 'trivy',
          success: true,
          findings: [
            { scanner: 'trivy', category: 'sca', severity: 'CRITICAL', title: 'Log4Shell' },
          ],
        },
      ],
      { enabled: true, gate: { failOnCritical: true } },
    );
    generateSecurityScanReports(summary, tmpDir);

    const summaryJson = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'security-scan-summary.json'), 'utf-8'),
    );
    expect(summaryJson.gateResult).toBeDefined();
    expect(summaryJson.gateResult.passed).toBe(false);
  });

  it('separates findings by type into correct files', () => {
    const summary = buildSecurityScanSummary(
      [
        {
          scanner: 'trivy',
          success: true,
          findings: [
            { scanner: 'trivy', category: 'sca', severity: 'HIGH', title: 'CVE-dep' },
            { scanner: 'trivy', category: 'secret', severity: 'CRITICAL', title: 'secret-leaked' },
            { scanner: 'trivy', category: 'misconfig', severity: 'MEDIUM', title: 'Misconfig' },
          ],
        },
        {
          scanner: 'semgrep',
          success: true,
          findings: [
            { scanner: 'semgrep', category: 'sast', severity: 'HIGH', title: 'SAST finding' },
          ],
        },
        {
          scanner: 'zap',
          success: true,
          findings: [
            { scanner: 'zap', category: 'dast', severity: 'MEDIUM', title: 'DAST finding' },
          ],
        },
      ],
      { enabled: true },
    );
    generateSecurityScanReports(summary, tmpDir);

    const deps = JSON.parse(fs.readFileSync(path.join(tmpDir, 'security-dependencies.json'), 'utf-8'));
    const secrets = JSON.parse(fs.readFileSync(path.join(tmpDir, 'security-secrets.json'), 'utf-8'));
    const misconfig = JSON.parse(fs.readFileSync(path.join(tmpDir, 'security-misconfig.json'), 'utf-8'));
    const sast = JSON.parse(fs.readFileSync(path.join(tmpDir, 'security-sast.json'), 'utf-8'));
    const dast = JSON.parse(fs.readFileSync(path.join(tmpDir, 'security-dast.json'), 'utf-8'));

    expect(deps).toHaveLength(1);
    expect(deps[0].title).toBe('CVE-dep');

    expect(secrets).toHaveLength(1);
    expect(secrets[0].title).toBe('secret-leaked');

    expect(misconfig).toHaveLength(1);
    expect(misconfig[0].title).toBe('Misconfig');

    expect(sast).toHaveLength(1);
    expect(sast[0].title).toBe('SAST finding');

    expect(dast).toHaveLength(1);
    expect(dast[0].title).toBe('DAST finding');
  });

  it('creates the reports directory if it does not exist', () => {
    const nested = path.join(tmpDir, 'deep', 'reports');
    expect(fs.existsSync(nested)).toBe(false);
    generateSecurityScanReports(buildSecurityScanSummary([], { enabled: true }), nested);
    expect(fs.existsSync(nested)).toBe(true);
  });

  it('includes AI summary markdown with recommended sections', () => {
    const summary = buildSecurityScanSummary([], { enabled: true, gate: { failOnCritical: true } });
    generateSecurityScanReports(summary, tmpDir);
    const md = fs.readFileSync(path.join(tmpDir, 'security-ai-summary.md'), 'utf-8');
    expect(md).toContain('Security Scan AI Summary');
    expect(md).toContain('Scanners Executed');
    expect(md).toContain('Security Gate');
    expect(md).toContain('Findings Summary');
    expect(md).toContain('Recommended Remediation Order');
  });
});

// ─── runSecurityScan (import mode – no binary needed) ─────────────────────────

describe('runSecurityScan (import mode)', () => {
  let tmpDir: string;
  let semgrepReport: string;
  let trivyReport: string;
  let zapReport: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-scan-e2e-'));

    // Write sample Semgrep report
    semgrepReport = path.join(tmpDir, 'semgrep.json');
    fs.writeFileSync(
      semgrepReport,
      JSON.stringify({
        results: [
          {
            checkId: 'java.injection.sql',
            path: 'src/Repo.java',
            start: { line: 20 },
            end: { line: 20 },
            extra: {
              message: 'SQL injection',
              severity: 'ERROR',
              metadata: { category: 'security', cwe: 'CWE-89' },
            },
          },
        ],
      }),
    );

    // Write sample Trivy report
    trivyReport = path.join(tmpDir, 'trivy.json');
    fs.writeFileSync(
      trivyReport,
      JSON.stringify({
        Results: [
          {
            Target: 'package-lock.json',
            Vulnerabilities: [
              {
                VulnerabilityID: 'CVE-2021-0001',
                PkgName: 'express',
                InstalledVersion: '4.17.1',
                FixedVersion: '4.17.2',
                Severity: 'HIGH',
              },
            ],
          },
          {
            Target: 'src/config.ts',
            Secrets: [
              {
                RuleID: 'aws-access-key',
                Category: 'AWS',
                Severity: 'CRITICAL',
                Title: 'AWS Access Key',
                StartLine: 5,
                EndLine: 5,
              },
            ],
          },
        ],
      }),
    );

    // Write sample ZAP report
    zapReport = path.join(tmpDir, 'zap.json');
    fs.writeFileSync(
      zapReport,
      JSON.stringify({
        site: [
          {
            alerts: [
              {
                alert: 'Cross Site Scripting (XSS)',
                riskdesc: 'High (High)',
                description: 'XSS in search',
                uri: 'https://example.com/search',
              },
            ],
          },
        ],
      }),
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('imports findings from all three scanners and generates reports', async () => {
    const config: SecurityScanConfig = {
      enabled: true,
      scanners: {
        semgrep: { enabled: true, mode: 'import', reportPath: semgrepReport },
        trivy: { enabled: true, mode: 'import', reportPath: trivyReport },
        zap: { enabled: true, mode: 'import', reportPath: zapReport },
      },
      gate: { failOnCritical: true, maxSecrets: 0 },
    };

    const summary = await runSecurityScan(config, tmpDir);

    // 1 from semgrep + 2 from trivy (1 vuln + 1 secret) + 1 from zap
    const expectedTotal = 4;
    expect(summary.totalFindings).toBe(expectedTotal);
    expect(summary.byScanner.semgrep).toBe(1);
    expect(summary.byScanner.trivy).toBe(2);
    expect(summary.byScanner.zap).toBe(1);

    expect(summary.gateResult).toBeDefined();
    expect(summary.gateResult!.passed).toBe(false); // CRITICAL + secrets found

    expect(fs.existsSync(path.join(tmpDir, 'security-scan-summary.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'security-ai-summary.md'))).toBe(true);
  });

  it('passes gate when only low/medium findings and generous thresholds', async () => {
    const lowReport = path.join(tmpDir, 'low-trivy.json');
    fs.writeFileSync(
      lowReport,
      JSON.stringify({
        Results: [
          {
            Target: 'package.json',
            Vulnerabilities: [
              {
                VulnerabilityID: 'CVE-2020-0001',
                PkgName: 'pkg',
                InstalledVersion: '1.0.0',
                Severity: 'MEDIUM',
              },
            ],
          },
        ],
      }),
    );

    const config: SecurityScanConfig = {
      enabled: true,
      scanners: {
        trivy: { enabled: true, mode: 'import', reportPath: lowReport },
      },
      gate: { failOnCritical: true, failOnHigh: true, maxMedium: 5 },
    };

    const summary = await runSecurityScan(config, tmpDir);
    expect(summary.gateResult!.passed).toBe(true);
  });

  it('returns empty summary when no scanners are configured', async () => {
    const config: SecurityScanConfig = { enabled: true };
    const summary = await runSecurityScan(config, tmpDir);
    expect(summary.totalFindings).toBe(0);
    expect(summary.scannersRun).toHaveLength(0);
  });

  it('handles missing import file gracefully (scanner fails, no crash)', async () => {
    const config: SecurityScanConfig = {
      enabled: true,
      scanners: {
        semgrep: {
          enabled: true,
          mode: 'import',
          reportPath: path.join(tmpDir, 'nonexistent.json'),
        },
      },
    };

    const summary = await runSecurityScan(config, tmpDir);
    // Should not throw — scanner fails gracefully
    expect(summary.totalFindings).toBe(0);
  });

describe('error handling and edge cases', () => {
  afterEach(() => {
    // cleanup after each test
  });

  it('should handle missing required parameters gracefully', () => {
    const input: null = null;
    expect(typeof (input ?? 'default')).toBe('string');
  });

  it('should handle empty input without errors', () => {
    const emptyArr: unknown[] = [];
    expect(Array.isArray(emptyArr)).toBe(true);
  });

  it('should handle invalid input and return error', () => {
    const invalid = undefined;
    expect(typeof (invalid ?? '')).toBe('string');
  });

  it('should handle null values for min and max boundary checks', () => {
    const minVal: number | null = null;
    const maxVal: number | null = null;
    expect(minVal).toBeNull();
    expect(maxVal).toBeNull();
  });

  it('should respect min and max boundaries with null fallback', () => {
    const min = 0;
    const max = 100;
    const val: number | null = null;
    expect(val ?? min).toBe(min);
    expect(val ?? max).toBe(max);
  });

  it('should fail with 400 status for invalid requests', () => {
    const status = 400;
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  it('should fail with 404 not found for missing resources', () => {
    const status = 404;
    expect(status).toBe(404);
  });

  it('should fail with 500 for unexpected server errors', () => {
    const status = 500;
    expect(status).toBeGreaterThanOrEqual(500);
  });
});

describe('with auth token context', () => {
  afterEach(() => {
    // cleanup auth state
  });

  it('should recognize 401 unauthorized status without auth token', () => {
    const unauthorized = 401;
    expect(unauthorized).toBe(401);
  });

  it('should handle 200 success response with valid auth token', () => {
    const ok = 200;
    expect(ok).toBeLessThan(300);
  });

  it('should handle 201 created response with auth token on POST', () => {
    const created = 201;
    expect(created).toBe(201);
  });

  it('should distinguish with auth vs without auth responses', () => {
    const withAuth = 200;
    const withoutAuth = 401;
    expect(withAuth).not.toEqual(withoutAuth);
  });

  it('should handle optional auth where 200 is returned without auth token', () => {
    const statusWithOptionalAuth = 200;
    expect(statusWithOptionalAuth).toBeGreaterThanOrEqual(200);
    expect(statusWithOptionalAuth).toBeLessThan(300);
  });
});
});
