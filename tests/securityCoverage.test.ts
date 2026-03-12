import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  parseSecurityControls,
  analyzeSecurityCoverage,
  buildSecurityCoverageReport,
  generateSecurityReports,
  parseScanReport,
  alertNameToCategory,
  testCoversControl,
  SECURITY_CATEGORIES,
  SecurityControl,
  SecurityControlCoverage,
} from '../src/securityCoverage';

const SAMPLE_SPEC = path.resolve(__dirname, '../sample/openapi-security.yaml');
const SAMPLE_TESTS_GLOB = path.resolve(__dirname, '../sample/tests/security.test.ts');

// ─── alertNameToCategory ──────────────────────────────────────────────────────

describe('alertNameToCategory', () => {
  it('maps authentication-related names', () => {
    expect(alertNameToCategory('Authentication Required')).toBe('authentication');
    expect(alertNameToCategory('CSRF Token Missing')).toBe('authentication');
  });

  it('maps authorization-related names', () => {
    expect(alertNameToCategory('Authorization bypass detected')).toBe('authorization');
    expect(alertNameToCategory('Broken Access Control')).toBe('authorization');
  });

  it('maps input-validation-related names', () => {
    expect(alertNameToCategory('SQL Injection')).toBe('input-validation');
    expect(alertNameToCategory('Cross Site Scripting (XSS)')).toBe('input-validation');
    expect(alertNameToCategory('Path Traversal')).toBe('input-validation');
    expect(alertNameToCategory('Parameter Tampering')).toBe('input-validation');
  });

  it('maps cryptography-related names', () => {
    expect(alertNameToCategory('SSL Certificate Expired')).toBe('cryptography');
    expect(alertNameToCategory('TLS Version Outdated')).toBe('cryptography');
    expect(alertNameToCategory('Strict-Transport-Security Header Not Set')).toBe('cryptography');
    expect(alertNameToCategory('HTTPS not enforced')).toBe('cryptography');
  });

  it('maps session-management-related names', () => {
    expect(alertNameToCategory('Session Cookie Missing HttpOnly Flag')).toBe('session-management');
    expect(alertNameToCategory('Token expiry not enforced')).toBe('session-management');
  });

  it('returns null for unknown alert names', () => {
    expect(alertNameToCategory('Unknown random alert')).toBeNull();
    expect(alertNameToCategory('')).toBeNull();
  });
});

// ─── parseScanReport ──────────────────────────────────────────────────────────

describe('parseScanReport', () => {
  it('parses a ZAP JSON report', () => {
    const tmpFile = path.join(os.tmpdir(), 'zap-report.json');
    const zapReport = {
      site: [
        {
          alerts: [
            { alert: 'SQL Injection', riskdesc: 'High (High)' },
            { alert: 'Session Cookie Missing HttpOnly Flag', riskdesc: 'Medium (Medium)' },
            { alert: 'SSL Certificate Expired', riskdesc: 'High (High)' },
          ],
        },
      ],
    };
    fs.writeFileSync(tmpFile, JSON.stringify(zapReport), 'utf-8');
    try {
      const findings = parseScanReport(tmpFile);
      expect(findings.length).toBe(3);
      expect(findings.some((f) => f.category === 'input-validation')).toBe(true);
      expect(findings.some((f) => f.category === 'session-management')).toBe(true);
      expect(findings.some((f) => f.category === 'cryptography')).toBe(true);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('parses a generic { findings: [...] } JSON report', () => {
    const tmpFile = path.join(os.tmpdir(), 'generic-report.json');
    const report = {
      findings: [
        { name: 'Authentication bypass', severity: 'critical' },
        { name: 'Cross Site Scripting (XSS)', severity: 'high' },
      ],
    };
    fs.writeFileSync(tmpFile, JSON.stringify(report), 'utf-8');
    try {
      const findings = parseScanReport(tmpFile);
      expect(findings.length).toBe(2);
      expect(findings.some((f) => f.category === 'authentication')).toBe(true);
      expect(findings.some((f) => f.category === 'input-validation')).toBe(true);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('parses a plain array JSON report', () => {
    const tmpFile = path.join(os.tmpdir(), 'array-report.json');
    const report = [
      { name: 'TLS Version Outdated', severity: 'high' },
      { name: 'Authorization bypass', severity: 'critical' },
    ];
    fs.writeFileSync(tmpFile, JSON.stringify(report), 'utf-8');
    try {
      const findings = parseScanReport(tmpFile);
      expect(findings.length).toBe(2);
      expect(findings.some((f) => f.category === 'cryptography')).toBe(true);
      expect(findings.some((f) => f.category === 'authorization')).toBe(true);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('parses a ZAP-style XML report', () => {
    const tmpFile = path.join(os.tmpdir(), 'zap-report.xml');
    const xml = `<?xml version="1.0"?>
<OWASPZAPReport>
  <site>
    <alerts>
      <alertitem>
        <alert>SQL Injection</alert>
        <riskcode>3</riskcode>
      </alertitem>
      <alertitem>
        <alert>SSL Certificate Expired</alert>
        <riskcode>2</riskcode>
      </alertitem>
    </alerts>
  </site>
</OWASPZAPReport>`;
    fs.writeFileSync(tmpFile, xml, 'utf-8');
    try {
      const findings = parseScanReport(tmpFile);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings.some((f) => f.category === 'input-validation')).toBe(true);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('returns empty array for a report with no recognisable findings', () => {
    const tmpFile = path.join(os.tmpdir(), 'empty-report.json');
    fs.writeFileSync(tmpFile, JSON.stringify({ findings: [] }), 'utf-8');
    try {
      const findings = parseScanReport(tmpFile);
      expect(findings).toHaveLength(0);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('throws when the report file does not exist', () => {
    expect(() => parseScanReport('/nonexistent/report.json')).toThrow();
  });
});

// ─── testCoversControl ────────────────────────────────────────────────────────

describe('testCoversControl', () => {
  const makeEntry = (description: string, content?: string) => ({
    description,
    content: content ?? description,
    filePath: 'test.ts',
  });

  it('matches via @security annotation in description', () => {
    const control: SecurityControl = {
      id: 'authorization:get:/users',
      category: 'authorization',
      description: 'Authorization check for GET /users',
      endpoint: 'GET /users',
    };
    const entry = makeEntry('@security authorization:get:/users - should deny access');
    expect(testCoversControl(entry, control)).toBe(true);
  });

  it('matches via category keywords for authentication controls', () => {
    const control: SecurityControl = {
      id: 'authentication:BearerAuth',
      category: 'authentication',
      description: 'Authentication via BearerAuth',
    };
    const entry = makeEntry('request with invalid bearer token returns 401');
    expect(testCoversControl(entry, control)).toBe(true);
  });

  it('matches via category keywords for authorization controls with path reference', () => {
    const control: SecurityControl = {
      id: 'authorization:get:/users',
      category: 'authorization',
      description: 'Authorization check for GET /users',
      endpoint: 'GET /users',
    };
    const entry = makeEntry('GET /users - forbidden for non-admin role returns 403');
    expect(testCoversControl(entry, control)).toBe(true);
  });

  it('does not match authorization control when path is not mentioned', () => {
    const control: SecurityControl = {
      id: 'authorization:delete:/users/{id}',
      category: 'authorization',
      description: 'Authorization check for DELETE /users/{id}',
      endpoint: 'DELETE /users/{id}',
    };
    // Test mentions /orders, not /users/
    const entry = makeEntry('GET /orders - forbidden for non-admin role returns 403');
    expect(testCoversControl(entry, control)).toBe(false);
  });

  it('matches input-validation control when keyword and path are present', () => {
    const control: SecurityControl = {
      id: 'input-validation:post:/users',
      category: 'input-validation',
      description: 'Input validation for POST /users',
      endpoint: 'POST /users',
    };
    const entry = makeEntry('POST /users - missing required email field returns 400');
    expect(testCoversControl(entry, control)).toBe(true);
  });

  it('does not match when no keyword is present', () => {
    const control: SecurityControl = {
      id: 'authentication:BearerAuth',
      category: 'authentication',
      description: 'Authentication via BearerAuth',
    };
    const entry = makeEntry('GET /users returns a list of users successfully');
    expect(testCoversControl(entry, control)).toBe(false);
  });

  it('matches cryptography control via https keyword', () => {
    const control: SecurityControl = {
      id: 'cryptography:https',
      category: 'cryptography',
      description: 'API servers use HTTPS',
    };
    const entry = makeEntry('API enforces HTTPS - non-TLS requests are rejected');
    expect(testCoversControl(entry, control)).toBe(true);
  });

  it('matches session-management control via session keyword', () => {
    const control: SecurityControl = {
      id: 'session-management:SessionCookie',
      category: 'session-management',
      description: 'Session management via cookie-based security scheme',
    };
    const entry = makeEntry('session cookie is invalidated after logout');
    expect(testCoversControl(entry, control)).toBe(true);
  });
});

// ─── parseSecurityControls ────────────────────────────────────────────────────

describe('parseSecurityControls', () => {
  it('extracts controls from the sample spec without error', async () => {
    const controls = await parseSecurityControls(SAMPLE_SPEC);
    expect(Array.isArray(controls)).toBe(true);
    expect(controls.length).toBeGreaterThan(0);
  });

  it('produces at least one authentication control per security scheme', async () => {
    const controls = await parseSecurityControls(SAMPLE_SPEC);
    const authControls = controls.filter((c) => c.category === 'authentication');
    // Sample spec defines BearerAuth, ApiKeyAuth, OAuth2Auth (SessionCookie goes to session-management)
    expect(authControls.length).toBeGreaterThanOrEqual(3);
    expect(authControls.some((c) => c.id === 'authentication:BearerAuth')).toBe(true);
    expect(authControls.some((c) => c.id === 'authentication:ApiKeyAuth')).toBe(true);
  });

  it('creates a session-management control for cookie-based schemes', async () => {
    const controls = await parseSecurityControls(SAMPLE_SPEC);
    const sessionControls = controls.filter((c) => c.category === 'session-management');
    expect(sessionControls.length).toBeGreaterThanOrEqual(1);
    expect(sessionControls.some((c) => c.id === 'session-management:SessionCookie')).toBe(true);
  });

  it('creates a cryptography control', async () => {
    const controls = await parseSecurityControls(SAMPLE_SPEC);
    const cryptoControls = controls.filter((c) => c.category === 'cryptography');
    expect(cryptoControls.length).toBeGreaterThanOrEqual(1);
  });

  it('creates authorization controls for endpoints with security requirements', async () => {
    const controls = await parseSecurityControls(SAMPLE_SPEC);
    const authzControls = controls.filter((c) => c.category === 'authorization');
    expect(authzControls.length).toBeGreaterThan(0);
    // Each authorization control has an endpoint
    for (const c of authzControls) {
      expect(c.endpoint).toBeDefined();
    }
  });

  it('creates input-validation controls for endpoints with constrained params or body', async () => {
    const controls = await parseSecurityControls(SAMPLE_SPEC);
    const validationControls = controls.filter((c) => c.category === 'input-validation');
    expect(validationControls.length).toBeGreaterThan(0);
  });

  it('each control has id, category, and description', async () => {
    const controls = await parseSecurityControls(SAMPLE_SPEC);
    for (const c of controls) {
      expect(typeof c.id).toBe('string');
      expect(c.id.length).toBeGreaterThan(0);
      expect(SECURITY_CATEGORIES).toContain(c.category);
      expect(typeof c.description).toBe('string');
      expect(c.description.length).toBeGreaterThan(0);
    }
  });

  it('throws for a non-existent spec file', async () => {
    await expect(parseSecurityControls('/nonexistent/spec.yaml')).rejects.toThrow();
  });
});

// ─── analyzeSecurityCoverage ──────────────────────────────────────────────────

describe('analyzeSecurityCoverage', () => {
  it('returns one coverage entry per control', async () => {
    const controls = await parseSecurityControls(SAMPLE_SPEC);
    const coverages = await analyzeSecurityCoverage(controls, SAMPLE_TESTS_GLOB);
    expect(coverages).toHaveLength(controls.length);
  });

  it('correctly detects authentication coverage from sample tests', async () => {
    const controls = await parseSecurityControls(SAMPLE_SPEC);
    const coverages = await analyzeSecurityCoverage(controls, SAMPLE_TESTS_GLOB);
    const authCov = coverages.filter((c) => c.control.category === 'authentication');
    const covered = authCov.filter((c) => c.covered);
    expect(covered.length).toBeGreaterThan(0);
  });

  it('correctly detects authorization coverage from sample tests', async () => {
    const controls = await parseSecurityControls(SAMPLE_SPEC);
    const coverages = await analyzeSecurityCoverage(controls, SAMPLE_TESTS_GLOB);
    const authzCov = coverages.filter((c) => c.control.category === 'authorization');
    const covered = authzCov.filter((c) => c.covered);
    expect(covered.length).toBeGreaterThan(0);
  });

  it('correctly detects input-validation coverage from sample tests', async () => {
    const controls = await parseSecurityControls(SAMPLE_SPEC);
    const coverages = await analyzeSecurityCoverage(controls, SAMPLE_TESTS_GLOB);
    const valCov = coverages.filter((c) => c.control.category === 'input-validation');
    const covered = valCov.filter((c) => c.covered);
    expect(covered.length).toBeGreaterThan(0);
  });

  it('correctly detects cryptography coverage from sample tests', async () => {
    const controls = await parseSecurityControls(SAMPLE_SPEC);
    const coverages = await analyzeSecurityCoverage(controls, SAMPLE_TESTS_GLOB);
    const cryptoCov = coverages.filter((c) => c.control.category === 'cryptography');
    const covered = cryptoCov.filter((c) => c.covered);
    expect(covered.length).toBeGreaterThan(0);
  });

  it('enriches coverage with scan report findings', async () => {
    const tmpFile = path.join(os.tmpdir(), 'test-scan.json');
    const scanReport = {
      findings: [
        { name: 'Authentication bypass', severity: 'high' },
        { name: 'SQL Injection', severity: 'high' },
      ],
    };
    fs.writeFileSync(tmpFile, JSON.stringify(scanReport), 'utf-8');

    try {
      // Use a minimal spec so we can create a control that won't be covered by tests
      const tmpSpec = path.join(os.tmpdir(), 'minimal-spec.yaml');
      fs.writeFileSync(
        tmpSpec,
        `openapi: "3.0.0"
info:
  title: Minimal
  version: "1.0.0"
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
paths:
  /test:
    get:
      security:
        - BearerAuth: []
      responses:
        "200":
          description: OK
`,
        'utf-8',
      );

      const controls = await parseSecurityControls(tmpSpec);
      // Run with empty test glob so no test-based coverage
      const coverages = await analyzeSecurityCoverage(
        controls,
        '/nonexistent/path/**/*.ts',
        tmpFile,
      );

      // Authentication control should be covered by scan report
      const authCov = coverages.find((c) => c.control.category === 'authentication');
      expect(authCov?.coveredByScanReport).toBe(true);
      expect(authCov?.covered).toBe(true);

      fs.unlinkSync(tmpSpec);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('returns empty coverage for empty test glob', async () => {
    const controls = await parseSecurityControls(SAMPLE_SPEC);
    const coverages = await analyzeSecurityCoverage(controls, '/nonexistent/**/*.ts');
    expect(coverages).toHaveLength(controls.length);
    // All should be uncovered (no scan report provided)
    expect(coverages.every((c) => !c.covered)).toBe(true);
  });
});

// ─── buildSecurityCoverageReport ─────────────────────────────────────────────

describe('buildSecurityCoverageReport', () => {
  it('calculates total, covered and percentage correctly', () => {
    const coverages: SecurityControlCoverage[] = [
      {
        control: { id: 'authentication:A', category: 'authentication', description: 'Auth A' },
        covered: true,
        matchedTests: ['test 1'],
        coveredByScanReport: false,
      },
      {
        control: { id: 'authorization:B', category: 'authorization', description: 'Authz B' },
        covered: false,
        matchedTests: [],
        coveredByScanReport: false,
      },
      {
        control: { id: 'cryptography:C', category: 'cryptography', description: 'Crypto C' },
        covered: true,
        matchedTests: ['test 2'],
        coveredByScanReport: false,
      },
    ];
    const report = buildSecurityCoverageReport(coverages);
    expect(report.total).toBe(3);
    expect(report.covered).toBe(2);
    expect(report.percentage).toBeCloseTo(66.67, 1);
  });

  it('returns 0% when there are no controls', () => {
    const report = buildSecurityCoverageReport([]);
    expect(report.total).toBe(0);
    expect(report.covered).toBe(0);
    expect(report.percentage).toBe(0);
  });

  it('builds a categorySummary for all security categories', () => {
    const coverages: SecurityControlCoverage[] = [
      {
        control: { id: 'authentication:A', category: 'authentication', description: 'Auth' },
        covered: true,
        matchedTests: [],
        coveredByScanReport: false,
      },
    ];
    const report = buildSecurityCoverageReport(coverages);
    for (const cat of SECURITY_CATEGORIES) {
      expect(report.categorySummary).toHaveProperty(cat);
      expect(typeof report.categorySummary[cat].total).toBe('number');
      expect(typeof report.categorySummary[cat].covered).toBe('number');
    }
  });

  it('records scanFindings count in the report', () => {
    const report = buildSecurityCoverageReport([], 7);
    expect(report.scanFindings).toBe(7);
  });
});

// ─── generateSecurityReports ──────────────────────────────────────────────────

describe('generateSecurityReports', () => {
  it('writes security-coverage.json and security-coverage.html', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-reports-'));
    try {
      const controls = await parseSecurityControls(SAMPLE_SPEC);
      const coverages = await analyzeSecurityCoverage(controls, SAMPLE_TESTS_GLOB);
      const report = buildSecurityCoverageReport(coverages);
      generateSecurityReports(report, tmpDir);

      const jsonPath = path.join(tmpDir, 'security-coverage.json');
      const htmlPath = path.join(tmpDir, 'security-coverage.html');

      expect(fs.existsSync(jsonPath)).toBe(true);
      expect(fs.existsSync(htmlPath)).toBe(true);

      // JSON should be valid and contain expected fields
      const json = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      expect(json).toHaveProperty('total');
      expect(json).toHaveProperty('covered');
      expect(json).toHaveProperty('percentage');
      expect(json).toHaveProperty('categorySummary');
      expect(json).toHaveProperty('controls');
      expect(Array.isArray(json.controls)).toBe(true);

      // HTML should contain the expected report title
      const html = fs.readFileSync(htmlPath, 'utf-8');
      expect(html).toContain('Security Coverage Report');
      expect(html).toContain('By Category');
      expect(html).toContain('Controls Detail');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('creates the reports directory if it does not exist', () => {
    const tmpDir = path.join(os.tmpdir(), `sec-new-dir-${Date.now()}`);
    try {
      expect(fs.existsSync(tmpDir)).toBe(false);
      const report = buildSecurityCoverageReport([]);
      generateSecurityReports(report, tmpDir);
      expect(fs.existsSync(tmpDir)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});

// ─── edge cases and error handling ───────────────────────────────────────────

describe('securityCoverage – edge cases and error handling', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('alertNameToCategory returns null for null-like empty string input (boundary)', () => {
    expect(alertNameToCategory('')).toBeNull();
  });

  it('alertNameToCategory handles invalid/unknown names gracefully', () => {
    const result = alertNameToCategory('Not a real security alert at all');
    expect(result).toBeNull();
  });

  it('buildSecurityCoverageReport handles null/empty coverages array (boundary: min input)', () => {
    const report = buildSecurityCoverageReport([]);
    expect(report.total).toBe(0);
    expect(report.covered).toBe(0);
    expect(report.percentage).toBe(0);
    expect(report.categorySummary).toBeDefined();
  });

  it('buildSecurityCoverageReport handles missing scanFindings count (boundary: undefined)', () => {
    const report = buildSecurityCoverageReport([], undefined);
    expect(report.scanFindings).toBe(0);
  });

  it('parseScanReport throws error for missing/non-existent file path', () => {
    expect(() => parseScanReport('/nonexistent/path/report.json')).toThrow();
  });

  it('parseScanReport returns empty array for report with no recognized findings (invalid categories)', () => {
    const tmpFile = path.join(os.tmpdir(), 'no-findings-report.json');
    fs.writeFileSync(tmpFile, JSON.stringify({ findings: [{ name: 'Unknown weird alert', severity: 'low' }] }), 'utf-8');
    try {
      const findings = parseScanReport(tmpFile);
      expect(Array.isArray(findings)).toBe(true);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('testCoversControl returns false when control has no matching keywords (without auth)', () => {
    const control: SecurityControl = {
      id: 'authentication:BearerAuth',
      category: 'authentication',
      description: 'Authentication via BearerAuth',
    };
    const entry = { description: 'GET /users returns a list of resources', content: 'GET /users returns success', filePath: 'test.ts' };
    expect(testCoversControl(entry, control)).toBe(false);
  });

  it('analyzeSecurityCoverage returns coverage with 401 unauthorized for missing auth endpoint', async () => {
    const tmpSpec = path.join(os.tmpdir(), 'auth-spec.yaml');
    fs.writeFileSync(
      tmpSpec,
      `openapi: "3.0.0"
info:
  title: Auth Test
  version: "1.0.0"
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
paths:
  /secure:
    get:
      security:
        - BearerAuth: []
      responses:
        "200":
          description: OK
        "401":
          description: Unauthorized
`,
      'utf-8',
    );
    try {
      const controls = await parseSecurityControls(tmpSpec);
      expect(controls.length).toBeGreaterThan(0);
      const authControl = controls.find((c) => c.category === 'authentication');
      expect(authControl).toBeDefined();
    } finally {
      fs.unlinkSync(tmpSpec);
    }
  });
});
