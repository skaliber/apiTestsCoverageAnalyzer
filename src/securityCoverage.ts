import SwaggerParser from '@apidevtools/swagger-parser';
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import { OpenAPIV3 } from 'openapi-types';
import type { AstAnalysisConfig, DeepAnalysisCoverageConfig } from './config/types';
import {
  analyzeFile as astAnalyzeFile,
  buildAnalysisContext,
  registerAllAnalyzers,
} from './ast/astAnalysisOrchestrator';
import type { ResolvedHttpInteraction, SupportedLanguage } from './ast/astTypes';

// ─── Data structures ──────────────────────────────────────────────────────────

export type SecurityCategory =
  | 'authentication'
  | 'authorization'
  | 'input-validation'
  | 'cryptography'
  | 'session-management';

export const SECURITY_CATEGORIES: SecurityCategory[] = [
  'authentication',
  'authorization',
  'input-validation',
  'cryptography',
  'session-management',
];

export interface SecurityControl {
  /** Unique identifier, e.g. "authentication:BearerAuth" or "authorization:get:/users" */
  id: string;
  /** Which security domain this control belongs to */
  category: SecurityCategory;
  /** Human-readable description */
  description: string;
  /** Endpoint string, e.g. "GET /users", for endpoint-specific controls */
  endpoint?: string;
  /** Additional detail, e.g. scheme type */
  detail?: string;
}

export interface SecurityControlCoverage {
  control: SecurityControl;
  /** True if covered by at least one test or scan report finding */
  covered: boolean;
  /** Test description strings that matched this control */
  matchedTests: string[];
  /** Whether this was covered by an external scan report finding */
  coveredByScanReport: boolean;
  /**
   * AST metadata when coverage was informed by semantic analysis.
   */
  astMetadata?: {
    sourceLanguage?: string;
    resolutionType?: string;
    confidence?: string;
  };
}

/**
 * Options to enable AST-augmented security coverage analysis.
 */
export interface AstSecurityAnalysisOptions {
  astConfig: AstAnalysisConfig;
  deepConfig?: DeepAnalysisCoverageConfig;
}

export interface SecurityCategorySummary {
  total: number;
  covered: number;
}

export interface SecurityCoverageReport {
  total: number;
  covered: number;
  percentage: number;
  controls: SecurityControlCoverage[];
  categorySummary: Record<SecurityCategory, SecurityCategorySummary>;
  /** Number of findings ingested from the external scan report */
  scanFindings: number;
}

// ─── Keyword maps ─────────────────────────────────────────────────────────────

/** Keywords used to detect security tests in test descriptions */
export const SECURITY_KEYWORDS: Record<SecurityCategory, string[]> = {
  'authentication': [
    '401', 'unauthorized', 'unauthenticated', 'authentication',
    'bearer', 'jwt', 'api key', 'apikey', 'login', 'sign in',
    'credential', 'no token', 'missing token', 'invalid token', 'auth token',
  ],
  'authorization': [
    '403', 'forbidden', 'authorization', 'permission', 'access denied',
    'role', 'privilege', 'rbac', 'access control', 'not allowed',
  ],
  'input-validation': [
    '400', '422', 'invalid', 'validation', 'bad request', 'malformed',
    'boundary', 'required field', 'missing field', 'missing required',
    'special characters', 'sql injection', 'xss', 'injection',
    'overflow', 'sanitize', 'required name', 'required email',
  ],
  'cryptography': [
    'https', 'ssl', 'tls', 'certificate', 'encrypt', 'secure connection',
    'cipher', 'hash', 'hmac', 'signing algorithm',
  ],
  'session-management': [
    'session', 'cookie', 'logout', 'sign out', 'refresh token',
    'token expiry', 'expired token', 'session timeout', 'revoke', 'invalidate',
  ],
};

/** ZAP / scanner alert name patterns → SecurityCategory mappings */
const SCANNER_ALERT_PATTERNS: Array<{ pattern: RegExp; category: SecurityCategory }> = [
  { pattern: /authentication/i, category: 'authentication' },
  { pattern: /csrf|anti.forgery/i, category: 'authentication' },
  { pattern: /authorization|access.control/i, category: 'authorization' },
  { pattern: /injection|xss|cross.site|parameter.tamper|path.traversal|directory.traversal/i, category: 'input-validation' },
  { pattern: /ssl|tls|certificate|cipher|transport.security|https/i, category: 'cryptography' },
  { pattern: /session|cookie|token.expir/i, category: 'session-management' },
];

// ─── Parsing the OpenAPI spec ─────────────────────────────────────────────────

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const;

/**
 * Extract security controls from a validated OpenAPI 3.x document.
 * Controls are derived from:
 *  - Security schemes (authentication / session-management)
 *  - Endpoint security requirements (authorization)
 *  - Parameter / request-body validation constraints (input-validation)
 *  - Server URLs (cryptography)
 */
export async function parseSecurityControls(specPath: string): Promise<SecurityControl[]> {
  const api = (await SwaggerParser.validate(specPath)) as OpenAPIV3.Document;
  const controls: SecurityControl[] = [];

  // ── 1. Authentication / session-management: one control per security scheme ─
  const schemes = (api.components?.securitySchemes ?? {}) as Record<
    string,
    OpenAPIV3.SecuritySchemeObject
  >;
  for (const [name, scheme] of Object.entries(schemes)) {
    const isSession =
      scheme.type === 'apiKey' &&
      (scheme as OpenAPIV3.ApiKeySecurityScheme).in === 'cookie';
    const category: SecurityCategory = isSession ? 'session-management' : 'authentication';

    let detail: string = scheme.type;
    if (scheme.type === 'http') {
      detail = `http/${(scheme as OpenAPIV3.HttpSecurityScheme).scheme}`;
    } else if (scheme.type === 'oauth2') {
      detail = 'oauth2';
    } else if (scheme.type === 'openIdConnect') {
      detail = 'openIdConnect';
    } else if (scheme.type === 'apiKey') {
      const loc = (scheme as OpenAPIV3.ApiKeySecurityScheme).in;
      detail = `apiKey/${loc}`;
    }

    controls.push({
      id: `${category}:${name}`,
      category,
      description:
        category === 'session-management'
          ? `Session management via cookie-based security scheme "${name}"`
          : `Authentication via security scheme "${name}" (${detail})`,
      detail,
    });
  }

  // ── 2. Cryptography: HTTPS server usage ──────────────────────────────────
  if (api.servers && api.servers.length > 0) {
    const allHttps = api.servers.every(
      (s) => s.url.startsWith('https://') || s.url.startsWith('/'),
    );
    controls.push({
      id: 'cryptography:https',
      category: 'cryptography',
      description: allHttps
        ? 'API servers use HTTPS – verify TLS configuration in tests'
        : 'API servers include non-HTTPS URLs – cryptographic transport security may be missing',
      detail: allHttps ? 'https' : 'mixed',
    });
  } else {
    controls.push({
      id: 'cryptography:transport',
      category: 'cryptography',
      description: 'Verify that the API enforces secure transport (HTTPS/TLS)',
      detail: 'unspecified',
    });
  }

  // ── 3. Authorization & input-validation: per endpoint ────────────────────
  const globalSecurity = api.security ?? [];

  for (const [apiPath, pathItem] of Object.entries(api.paths ?? {})) {
    if (!pathItem) continue;

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method] as OpenAPIV3.OperationObject | undefined;
      if (!operation) continue;

      const endpoint = `${method.toUpperCase()} ${apiPath}`;

      // Determine effective security: operation-level overrides global; empty array means no auth
      const effectiveSecurity =
        operation.security !== undefined ? operation.security : globalSecurity;

      // Authorization control: endpoint has security requirements
      if (effectiveSecurity.length > 0) {
        controls.push({
          id: `authorization:${method}:${apiPath}`,
          category: 'authorization',
          description: `Authorization check for ${endpoint}`,
          endpoint,
          detail: effectiveSecurity
            .flatMap((req) => Object.keys(req))
            .join(', '),
        });
      }

      // Input-validation control: endpoint has constrained parameters or request body
      const hasValidatedParams = hasParameterValidation(operation, pathItem);
      const hasValidatedBody = hasRequestBodyValidation(operation);
      if (hasValidatedParams || hasValidatedBody) {
        controls.push({
          id: `input-validation:${method}:${apiPath}`,
          category: 'input-validation',
          description: `Input validation for ${endpoint}`,
          endpoint,
          detail:
            hasValidatedParams && hasValidatedBody
              ? 'parameters+body'
              : hasValidatedParams
              ? 'parameters'
              : 'body',
        });
      }
    }
  }

  return controls;
}

function hasParameterValidation(
  operation: OpenAPIV3.OperationObject,
  pathItem: OpenAPIV3.PathItemObject,
): boolean {
  const params = [
    ...(pathItem.parameters ?? []),
    ...(operation.parameters ?? []),
  ];
  return params.some((p) => {
    if (!('schema' in p) || !p.schema) return false;
    if (p.required) return true;
    const s = p.schema as OpenAPIV3.SchemaObject;
    return !!(
      s.enum ||
      s.pattern ||
      s.minLength !== undefined ||
      s.maxLength !== undefined ||
      s.minimum !== undefined ||
      s.maximum !== undefined ||
      s.format
    );
  });
}

function hasRequestBodyValidation(operation: OpenAPIV3.OperationObject): boolean {
  if (!operation.requestBody) return false;
  const rb = operation.requestBody as OpenAPIV3.RequestBodyObject;
  if (rb.required) return true;
  for (const mediaObj of Object.values(rb.content ?? {})) {
    const schema = mediaObj.schema as OpenAPIV3.SchemaObject | undefined;
    if (!schema) continue;
    if (schema.required && schema.required.length > 0) return true;
    if (schema.properties) {
      for (const prop of Object.values(schema.properties)) {
        const ps = prop as OpenAPIV3.SchemaObject;
        if (
          ps.enum ||
          ps.pattern ||
          ps.format ||
          ps.minLength !== undefined ||
          ps.maxLength !== undefined ||
          ps.minimum !== undefined ||
          ps.maximum !== undefined
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

// ─── Scan report parsing ──────────────────────────────────────────────────────

export interface ScanFinding {
  name: string;
  category: SecurityCategory;
  severity?: string;
  endpoint?: string;
}

/**
 * Parse an external security scanner report and return normalised findings.
 *
 * Supported formats:
 *   • ZAP JSON  – `{ "site": [{ "alerts": [{ "alert": "...", "riskdesc": "..." }] }] }`
 *   • Generic   – `{ "findings": [{ "name": "...", "severity": "..." }] }`
 *   • Array     – `[{ "name": "...", "severity": "..." }]`
 *   • XML       – basic regex extraction of alert/name elements
 */
export function parseScanReport(reportPath: string): ScanFinding[] {
  const raw = fs.readFileSync(reportPath, 'utf-8');
  const ext = path.extname(reportPath).toLowerCase();

  if (ext === '.xml') {
    return parseScanReportXml(raw);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Try XML fallback for files without .xml extension
    return parseScanReportXml(raw);
  }

  return normaliseScanReport(parsed);
}

function parseScanReportXml(xml: string): ScanFinding[] {
  const findings: ScanFinding[] = [];
  // Extract content from <alert> or <name> tags (common in OWASP ZAP XML reports)
  const tagPattern = /<(?:alert|name)>([\s\S]*?)<\/(?:alert|name)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagPattern.exec(xml)) !== null) {
    const name = m[1].trim();
    if (name) {
      const category = alertNameToCategory(name);
      if (category) {
        findings.push({ name, category });
      }
    }
  }
  return findings;
}

function normaliseScanReport(parsed: unknown): ScanFinding[] {
  if (!parsed || typeof parsed !== 'object') return [];

  // ZAP JSON format: { "site": [{ "alerts": [...] }] }
  if ('site' in (parsed as Record<string, unknown>)) {
    const findings: ScanFinding[] = [];
    const sites = ((parsed as Record<string, unknown>).site as unknown[]) ?? [];
    for (const site of sites) {
      if (!site || typeof site !== 'object') continue;
      const alerts = ((site as Record<string, unknown>).alerts as unknown[]) ?? [];
      for (const alert of alerts) {
        if (!alert || typeof alert !== 'object') continue;
        const a = alert as Record<string, unknown>;
        const name = String(a.alert ?? a.name ?? '');
        const severity = String(a.riskdesc ?? a.severity ?? '');
        const category = alertNameToCategory(name);
        if (category) {
          findings.push({ name, category, severity });
        }
      }
    }
    return findings;
  }

  // Generic { findings: [...] } format
  if ('findings' in (parsed as Record<string, unknown>)) {
    const items = ((parsed as Record<string, unknown>).findings as unknown[]) ?? [];
    return extractFindingsFromArray(items);
  }

  // Plain array
  if (Array.isArray(parsed)) {
    return extractFindingsFromArray(parsed);
  }

  return [];
}

function extractFindingsFromArray(items: unknown[]): ScanFinding[] {
  const findings: ScanFinding[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const i = item as Record<string, unknown>;
    const name = String(i.name ?? i.alert ?? i.title ?? '');
    const severity = String(i.severity ?? i.riskdesc ?? i.risk ?? '');
    const endpoint =
      typeof i.endpoint === 'string'
        ? i.endpoint
        : typeof i.url === 'string'
        ? i.url
        : undefined;
    const category = alertNameToCategory(name);
    if (category) {
      findings.push({ name, category, severity, endpoint });
    }
  }
  return findings;
}

/**
 * Map a scanner alert name to a SecurityCategory using known patterns.
 * Returns null if the alert name does not map to any category.
 */
export function alertNameToCategory(name: string): SecurityCategory | null {
  for (const { pattern, category } of SCANNER_ALERT_PATTERNS) {
    if (pattern.test(name)) return category;
  }
  return null;
}

// ─── Test analysis ────────────────────────────────────────────────────────────

interface TestEntry {
  description: string;
  content: string;
  filePath: string;
}

function extractTestEntries(filePath: string, fileContents: string): TestEntry[] {
  const entries: TestEntry[] = [];
  const declPattern = /\b(?:test|it)\s*\(\s*(['"`])([\s\S]*?)\1/g;
  const positions: Array<{ start: number; desc: string }> = [];

  let m: RegExpExecArray | null;
  while ((m = declPattern.exec(fileContents)) !== null) {
    positions.push({ start: m.index, desc: m[2] });
  }

  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].start;
    const end = i + 1 < positions.length ? positions[i + 1].start : fileContents.length;
    entries.push({
      description: positions[i].desc,
      content: fileContents.slice(start, end),
      filePath,
    });
  }

  return entries;
}

/**
 * Determine whether a test entry covers a given security control.
 *
 * Matching rules (in order of precedence):
 *   1. `@security <controlId>` annotation in description or surrounding content
 *   2. Category keywords present in the test description
 *   3. For endpoint-specific controls, the test description or content must
 *      also reference the endpoint path (matched after stripping path params)
 */
export function testCoversControl(entry: TestEntry, control: SecurityControl): boolean {
  // 1. Annotation-based match: @security authorization:get:/users
  const annotationPattern = new RegExp(`@security\\s+${escapeRegex(control.id)}`, 'i');
  if (annotationPattern.test(entry.description) || annotationPattern.test(entry.content)) {
    return true;
  }

  // 2. Category keywords in description
  const descLower = entry.description.toLowerCase();
  const keywords = SECURITY_KEYWORDS[control.category];
  const hasKeyword = keywords.some((kw) => descLower.includes(kw.toLowerCase()));
  if (!hasKeyword) return false;

  // 3. For endpoint-specific controls, also require the path to be mentioned
  if (control.endpoint) {
    const endpointPath = control.endpoint.split(' ')[1]; // e.g. "/users/{id}"
    // Normalise path params: /users/{id} → /users/
    const normalised = endpointPath.replace(/\{[^}]+\}/g, '');
    const contentLower = entry.content.toLowerCase();
    if (
      !descLower.includes(normalised.toLowerCase()) &&
      !contentLower.includes(normalised.toLowerCase())
    ) {
      return false;
    }
  }

  return true;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── AST augmentation ─────────────────────────────────────────────────────────

/** Detect language from file extension for AST analysis. */
function detectLanguageForSec(filePath: string): SupportedLanguage {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts': case '.tsx': return 'typescript';
    case '.js': case '.jsx': return 'javascript';
    case '.java': return 'java';
    case '.kt': case '.kts': return 'kotlin';
    case '.py': return 'python';
    case '.rb': return 'ruby';
    case '.feature': return 'cucumber';
    default: return 'auto';
  }
}

/** Normalise path for loose matching. */
function normalizeSecPath(p: string): string {
  return p.split('?')[0].replace(/\/$/, '').toLowerCase();
}

type SecAstMap = Map<string, ResolvedHttpInteraction[]>;

/** Build an endpoint → interactions lookup from test files. */
function buildSecAstMap(
  testFiles: string[],
  astOptions: AstSecurityAnalysisOptions,
): SecAstMap {
  registerAllAnalyzers();
  const context = buildAnalysisContext(astOptions.astConfig, astOptions.deepConfig);
  const map: SecAstMap = new Map();

  for (const filePath of testFiles) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }
    const lang = detectLanguageForSec(filePath);
    const interactions = astAnalyzeFile(content, filePath, lang, context);
    for (const interaction of interactions) {
      const key = normalizeSecPath(interaction.normalizedPath ?? interaction.path);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(interaction);
    }
  }

  return map;
}

/**
 * Map parameterScenarios / assertionType to SecurityCategory coverage signals.
 * Returns the categories that the interaction hints at.
 */
function interactionToSecCategories(interaction: ResolvedHttpInteraction): SecurityCategory[] {
  const cats: SecurityCategory[] = [];
  const scenarios = (interaction.parameterScenarios ?? []).map((s) => s.toLowerCase());

  // Authentication signals
  if (
    interaction.assertionType === 'status-code' ||
    interaction.assertionType === 'fluent-chain' ||
    scenarios.some((s) =>
      s.includes('unauth') || s.includes('token') || s.includes('bearer') ||
      s.includes('credential') || s.includes('login') || s.includes('401')
    )
  ) {
    cats.push('authentication');
  }

  // Authorization signals
  if (
    scenarios.some((s) =>
      s.includes('forbidden') || s.includes('permission') || s.includes('role') ||
      s.includes('access') || s.includes('403')
    )
  ) {
    cats.push('authorization');
  }

  // Input-validation signals
  if (
    scenarios.some((s) =>
      s.includes('invalid') || s.includes('missing') || s.includes('malformed') ||
      s.includes('injection') || s.includes('xss') || s.includes('400') || s.includes('422')
    )
  ) {
    cats.push('input-validation');
  }

  // Cryptography signals
  if (
    scenarios.some((s) =>
      s.includes('https') || s.includes('ssl') || s.includes('tls') || s.includes('encrypt')
    )
  ) {
    cats.push('cryptography');
  }

  // Session-management signals
  if (
    scenarios.some((s) =>
      s.includes('session') || s.includes('cookie') || s.includes('logout') ||
      s.includes('refresh') || s.includes('expir')
    )
  ) {
    cats.push('session-management');
  }

  return cats;
}

/**
 * Check if any AST interactions at a control's endpoint cover the control.
 */
function checkAstSecurityCoverage(
  astMap: SecAstMap,
  control: SecurityControl,
): { covered: boolean; astMetadata?: SecurityControlCoverage['astMetadata'] } {
  // For endpoint-specific controls, find interactions at that path
  const matchingInteractions: ResolvedHttpInteraction[] = [];

  for (const [, interactions] of astMap) {
    for (const interaction of interactions) {
      // Endpoint-specific controls: require path match
      if (control.endpoint) {
        const endpointPath = control.endpoint.split(' ')[1];
        const normalised = endpointPath.replace(/\{[^}]+\}/g, '').toLowerCase();
        const iPath = normalizeSecPath(interaction.normalizedPath ?? interaction.path);
        if (!iPath.startsWith(normalised)) continue;
        const method = control.endpoint.split(' ')[0].toUpperCase();
        if (interaction.method.toUpperCase() !== method) continue;
      }

      const coveredCats = interactionToSecCategories(interaction);
      if (coveredCats.includes(control.category)) {
        matchingInteractions.push(interaction);
      }
    }
  }

  if (matchingInteractions.length === 0) return { covered: false };

  const best = matchingInteractions.find(
    (i) => i.confidence === 'high',
  ) ?? matchingInteractions.find(
    (i) => i.confidence === 'medium',
  ) ?? matchingInteractions[0];

  return {
    covered: true,
    astMetadata: {
      sourceLanguage: best.sourceLanguage,
      resolutionType: best.resolutionType,
      confidence: best.confidence,
    },
  };
}

// ─── Main analysis ────────────────────────────────────────────────────────────

/**
 * Analyse test files (and optionally an external scan report) to determine
 * which security controls from the spec are covered. Optionally augments
 * text-scan results with AST-derived semantic signals when `astOptions` is
 * provided.
 */
export async function analyzeSecurityCoverage(
  controls: SecurityControl[],
  testGlob: string,
  scanReportPath?: string,
  astOptions?: AstSecurityAnalysisOptions,
): Promise<SecurityControlCoverage[]> {
  // Load and parse test files
  const testFiles = await fg(testGlob, { onlyFiles: true });
  const allEntries: TestEntry[] = [];
  for (const filePath of testFiles) {
    const contents = fs.readFileSync(filePath, 'utf-8');
    allEntries.push(...extractTestEntries(filePath, contents));
  }

  // Load scan report findings
  const scanFindings: ScanFinding[] = scanReportPath ? parseScanReport(scanReportPath) : [];

  // Build AST map when options provided
  const astMap: SecAstMap | null = astOptions
    ? buildSecAstMap(testFiles, astOptions)
    : null;

  return controls.map((control) => {
    // ── Text-scan pass ──────────────────────────────────────────────────────
    const matchedTests: string[] = [];
    for (const entry of allEntries) {
      if (testCoversControl(entry, control)) {
        if (!matchedTests.includes(entry.description)) {
          matchedTests.push(entry.description);
        }
      }
    }

    // Scan-report-based coverage
    const coveredByScanReport = scanFindings.some((f) => f.category === control.category);
    let covered = matchedTests.length > 0 || coveredByScanReport;

    let astMetadata: SecurityControlCoverage['astMetadata'] | undefined;

    // ── AST augmentation pass ───────────────────────────────────────────────
    if (astMap !== null) {
      const astResult = checkAstSecurityCoverage(astMap, control);
      if (astResult.covered) {
        covered = true;
        astMetadata = astResult.astMetadata;
      }
    }

    return { control, covered, matchedTests, coveredByScanReport, astMetadata };
  });
}

// ─── Report building ──────────────────────────────────────────────────────────

/**
 * Build the coverage summary from per-control coverages.
 */
export function buildSecurityCoverageReport(
  coverages: SecurityControlCoverage[],
  scanFindings: number = 0,
): SecurityCoverageReport {
  const total = coverages.length;
  const coveredCount = coverages.filter((c) => c.covered).length;
  const percentage = total === 0 ? 0 : Math.round((coveredCount / total) * 10000) / 100;

  const categorySummary = {} as Record<SecurityCategory, SecurityCategorySummary>;
  for (const cat of SECURITY_CATEGORIES) {
    const catControls = coverages.filter((c) => c.control.category === cat);
    categorySummary[cat] = {
      total: catControls.length,
      covered: catControls.filter((c) => c.covered).length,
    };
  }

  return {
    total,
    covered: coveredCount,
    percentage,
    controls: coverages,
    categorySummary,
    scanFindings,
  };
}

// ─── Report generation ────────────────────────────────────────────────────────

/**
 * Write JSON and HTML security-coverage reports to the given directory.
 */
export function generateSecurityReports(
  report: SecurityCoverageReport,
  reportsDir: string,
): void {
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // ── JSON ────────────────────────────────────────────────────────────────
  const jsonPath = path.join(reportsDir, 'security-coverage.json');
  const jsonReport = {
    total: report.total,
    covered: report.covered,
    percentage: report.percentage,
    scanFindings: report.scanFindings,
    categorySummary: report.categorySummary,
    controls: report.controls.map(
      ({ control, covered, matchedTests, coveredByScanReport }) => ({
        id: control.id,
        category: control.category,
        description: control.description,
        endpoint: control.endpoint,
        covered,
        matchedTests,
        coveredByScanReport,
      }),
    ),
  };
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf-8');

  // ── HTML ────────────────────────────────────────────────────────────────
  const htmlPath = path.join(reportsDir, 'security-coverage.html');

  const catRows = SECURITY_CATEGORIES.map((cat) => {
    const s = report.categorySummary[cat];
    const pct = s.total === 0 ? 100 : Math.round((s.covered / s.total) * 100);
    const rowClass = pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad';
    return `    <tr class="${rowClass}">
      <td>${cat}</td>
      <td>${s.covered}/${s.total}</td>
      <td>${pct}%</td>
    </tr>`;
  }).join('\n');

  const controlRows = report.controls
    .map(({ control, covered, matchedTests, coveredByScanReport }) => {
      const rowClass = covered ? 'covered' : 'uncovered';
      const status = covered
        ? coveredByScanReport && matchedTests.length === 0
          ? '🔍 Scanner only'
          : '✅ Covered'
        : '❌ Not covered';
      const tests = matchedTests.length > 0 ? matchedTests.join('<br>') : '—';
      const endpoint = control.endpoint ?? '—';
      return `    <tr class="${rowClass}">
      <td>${control.id}</td>
      <td>${control.category}</td>
      <td>${control.description}</td>
      <td>${endpoint}</td>
      <td>${status}</td>
      <td>${tests}</td>
    </tr>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Security Coverage Report</title>
  <style>
    body { font-family: sans-serif; padding: 2rem; }
    h1, h2 { margin-bottom: 0.5rem; }
    .summary { margin-bottom: 1.5rem; font-size: 1.1rem; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
    th, td { border: 1px solid #ccc; padding: 0.5rem 1rem; text-align: left; }
    th { background: #f0f0f0; }
    tr.good { background: #e6ffe6; }
    tr.warn { background: #fff9e6; }
    tr.bad { background: #ffe6e6; }
    tr.covered { background: #e6ffe6; }
    tr.uncovered { background: #ffe6e6; }
  </style>
</head>
<body>
  <h1>Security Coverage Report</h1>
  <div class="summary">
    Covered: <strong>${report.covered}/${report.total}</strong> security controls
    (<strong>${report.percentage}%</strong>)
    ${report.scanFindings > 0 ? `&nbsp;|&nbsp; External scan findings: <strong>${report.scanFindings}</strong>` : ''}
  </div>
  <h2>By Category</h2>
  <table>
    <thead>
      <tr><th>Category</th><th>Covered / Total</th><th>%</th></tr>
    </thead>
    <tbody>
${catRows}
    </tbody>
  </table>
  <h2>Controls Detail</h2>
  <table>
    <thead>
      <tr>
        <th>Control ID</th>
        <th>Category</th>
        <th>Description</th>
        <th>Endpoint</th>
        <th>Status</th>
        <th>Matched Tests</th>
      </tr>
    </thead>
    <tbody>
${controlRows}
    </tbody>
  </table>
</body>
</html>`;

  fs.writeFileSync(htmlPath, html, 'utf-8');
}
