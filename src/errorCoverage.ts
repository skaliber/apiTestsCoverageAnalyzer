import SwaggerParser from '@apidevtools/swagger-parser';
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import { OpenAPIV3 } from 'openapi-types';

// ─── Data structures ─────────────────────────────────────────────────────────

export type ErrorCategory =
  | 'missing-parameter'
  | 'invalid-value'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'server-error';

export const ERROR_CATEGORIES: ErrorCategory[] = [
  'missing-parameter',
  'invalid-value',
  'unauthorized',
  'forbidden',
  'not-found',
  'conflict',
  'server-error',
];

export interface ErrorScenario {
  /** Unique key, e.g. "POST /users:400" */
  id: string;
  endpoint: string;
  method: string;
  path: string;
  statusCode: number;
  description: string;
  categories: ErrorCategory[];
}

export interface ErrorScenarioCoverage {
  scenario: ErrorScenario;
  covered: boolean;
  /** Test description strings that matched this scenario */
  matchedTests: string[];
}

export interface CategorySummary {
  total: number;
  covered: number;
}

export interface ErrorCoverageReport {
  total: number;
  covered: number;
  percentage: number;
  scenarios: ErrorScenarioCoverage[];
  categorySummary: Record<ErrorCategory, CategorySummary>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Map a HTTP status code (and optional description) to one or more error
 * categories that are relevant for heuristic matching.
 */
export function statusCodeToCategories(statusCode: number, description: string): ErrorCategory[] {
  const descLower = description.toLowerCase();
  const categories: ErrorCategory[] = [];

  switch (statusCode) {
    case 400:
      // Distinguish by description when possible; otherwise include both
      if (descLower.includes('missing') || descLower.includes('required')) {
        categories.push('missing-parameter');
      } else if (
        descLower.includes('invalid') ||
        descLower.includes('format') ||
        descLower.includes('type') ||
        descLower.includes('value')
      ) {
        categories.push('invalid-value');
      } else {
        categories.push('missing-parameter', 'invalid-value');
      }
      break;
    case 401:
      categories.push('unauthorized');
      break;
    case 403:
      categories.push('forbidden');
      break;
    case 404:
      categories.push('not-found');
      break;
    case 409:
      categories.push('conflict');
      break;
    case 422:
      categories.push('invalid-value');
      break;
    case 500:
    case 502:
    case 503:
    case 504:
      categories.push('server-error');
      break;
    default:
      if (statusCode >= 400 && statusCode < 500) {
        categories.push('invalid-value');
      } else if (statusCode >= 500) {
        categories.push('server-error');
      }
  }

  return categories;
}

// ─── Spec parsing ─────────────────────────────────────────────────────────────

/**
 * Parse an OpenAPI 3 spec and return all non-2xx (error) response scenarios.
 */
export async function parseErrorScenarios(specPath: string): Promise<ErrorScenario[]> {
  const api = (await SwaggerParser.dereference(specPath)) as OpenAPIV3.Document;
  const scenarios: ErrorScenario[] = [];

  if (!api.paths) return scenarios;

  for (const [apiPath, pathItem] of Object.entries(api.paths)) {
    if (!pathItem) continue;

    for (const method of HTTP_METHODS) {
      const operation = (pathItem as Record<string, unknown>)[method] as
        | OpenAPIV3.OperationObject
        | undefined;
      if (!operation) continue;

      if (!operation.responses) continue;

      const endpoint = `${method.toUpperCase()} ${apiPath}`;

      for (const [statusCodeStr, responseObj] of Object.entries(operation.responses)) {
        const statusCode = parseInt(statusCodeStr, 10);

        // Only 4xx and 5xx responses
        if (isNaN(statusCode) || statusCode < 400) continue;

        const response = responseObj as OpenAPIV3.ResponseObject;
        const description = response.description ?? '';
        const categories = statusCodeToCategories(statusCode, description);

        scenarios.push({
          id: `${endpoint}:${statusCode}`,
          endpoint,
          method: method.toUpperCase(),
          path: apiPath,
          statusCode,
          description,
          categories,
        });
      }
    }
  }

  return scenarios;
}

// ─── Test segment extraction ─────────────────────────────────────────────────

interface TestSegment {
  description: string;
  content: string;
}

/**
 * Split a test file into individual test blocks (test / it declarations).
 */
function extractTestSegments(fileContents: string): TestSegment[] {
  const segments: TestSegment[] = [];
  const declPattern = /\b(?:test|it)\s*\(\s*(['"`])([\s\S]*?)\1/g;
  const positions: Array<{ start: number; desc: string }> = [];

  let m: RegExpExecArray | null;
  while ((m = declPattern.exec(fileContents)) !== null) {
    positions.push({ start: m.index, desc: m[2] });
  }

  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].start;
    const end = i + 1 < positions.length ? positions[i + 1].start : fileContents.length;
    segments.push({ description: positions[i].desc, content: fileContents.slice(start, end) });
  }

  return segments;
}

// ─── Endpoint matching ────────────────────────────────────────────────────────

/**
 * Return true if the test segment appears to exercise the endpoint associated
 * with the given error scenario.
 *
 * Detection strategy (in order):
 *  1. Description contains "METHOD /pathBase" (e.g. "POST /users")
 *  2. Description contains the path base
 *  3. Content contains the path base AND the HTTP method as a string literal
 */
export function segmentMentionsEndpoint(segment: TestSegment, scenario: ErrorScenario): boolean {
  const contentLower = segment.content.toLowerCase();
  const descLower = segment.description.toLowerCase();
  const pathBase = scenario.path.split('{')[0].toLowerCase(); // e.g. "/users/" or "/users"
  const methodLower = scenario.method.toLowerCase();

  // 1. Description contains "METHOD /pathBase" phrase
  if (descLower.includes(`${methodLower} ${pathBase}`)) return true;

  // 2. Description contains the pathBase AND method keyword
  if (descLower.includes(pathBase) && descLower.includes(methodLower)) return true;

  // 3. Content contains pathBase (as a URL string) AND method (as a string literal)
  const pathInContent = contentLower.includes(pathBase);
  const methodInContent =
    contentLower.includes(`'${methodLower}'`) ||
    contentLower.includes(`"${methodLower}"`);

  if (pathInContent && methodInContent) return true;

  return false;
}

// ─── Category heuristics ──────────────────────────────────────────────────────

/**
 * Return true when a segment's description or content hints that it is
 * exercising the given error category.
 */
export function matchesCategoryHeuristic(segment: TestSegment, category: ErrorCategory): boolean {
  const descLower = segment.description.toLowerCase();
  const contentLower = segment.content.toLowerCase();

  switch (category) {
    case 'missing-parameter':
      // Description keywords
      if (
        descLower.includes('missing') ||
        descLower.includes('without') ||
        descLower.includes('omit') ||
        descLower.includes('no body') ||
        descLower.includes('required field')
      )
        return true;
      // Code: delete obj.field or field = undefined
      if (/delete\s+\w+\.\w+/.test(segment.content)) return true;
      if (/\w+\s*=\s*undefined/.test(segment.content)) return true;
      return false;

    case 'invalid-value':
      // Description keywords
      if (
        descLower.includes('invalid') ||
        descLower.includes('wrong type') ||
        descLower.includes('bad value') ||
        descLower.includes('malformed') ||
        descLower.includes('incorrect format') ||
        descLower.includes('out of range') ||
        descLower.includes('exceeds')
      )
        return true;
      // Code: field: null or field: undefined
      if (/['"]?\w+['"]?\s*:\s*(null|undefined)\b/.test(segment.content)) return true;
      return false;

    case 'unauthorized':
      // Description keywords
      if (
        descLower.includes('unauthorized') ||
        descLower.includes('unauthenticated') ||
        descLower.includes('no token') ||
        descLower.includes('missing token') ||
        descLower.includes('invalid token') ||
        descLower.includes('no auth') ||
        descLower.includes('missing auth') ||
        descLower.includes('without auth') ||
        descLower.includes('without token') ||
        descLower.includes('missing api key') ||
        descLower.includes('invalid api key') ||
        descLower.includes('no api key')
      )
        return true;
      // Code: Authorization header with empty or bare "Bearer " token
      if (/authorization\s*:\s*['"]\s*['"]/.test(contentLower)) return true;
      if (/authorization\s*:\s*['"]bearer\s+['"]/.test(contentLower)) return true;
      return false;

    case 'forbidden':
      // Description keywords
      if (
        descLower.includes('forbidden') ||
        descLower.includes('not allowed') ||
        descLower.includes('insufficient permission') ||
        descLower.includes('access denied') ||
        descLower.includes('no permission')
      )
        return true;
      return false;

    case 'not-found':
      // Description keywords
      if (
        descLower.includes('not found') ||
        descLower.includes('nonexistent') ||
        descLower.includes('non-existent') ||
        descLower.includes('unknown id') ||
        descLower.includes('does not exist') ||
        descLower.includes('missing resource')
      )
        return true;
      // Code: very large / obviously fake numeric IDs (6+ digits)
      if (/\/\d{6,}/.test(segment.content)) return true;
      if (/['"`]\d{6,}['"`]/.test(segment.content)) return true;
      // Nil UUID
      if (/00000000-0000-0000-0000-000000000000/.test(segment.content)) return true;
      return false;

    case 'conflict':
      if (
        descLower.includes('conflict') ||
        descLower.includes('duplicate') ||
        descLower.includes('already exists') ||
        descLower.includes('already registered') ||
        descLower.includes('already in use') ||
        descLower.includes('taken')
      )
        return true;
      return false;

    case 'server-error':
      if (
        descLower.includes('server error') ||
        descLower.includes('internal error') ||
        descLower.includes('service unavailable') ||
        descLower.includes('unexpected error')
      )
        return true;
      return false;
  }
}

// ─── Coverage determination ───────────────────────────────────────────────────

/**
 * Return true if the segment contains a direct status-code assertion
 * matching the scenario's status code.
 *
 * Recognised patterns:
 *   .toBe(400)  .toEqual(400)  status === 400  statusCode: 400
 *   expect(…).toBe(400)
 */
function hasStatusCodeAssertion(segment: TestSegment, statusCode: number): boolean {
  const patterns = [
    new RegExp(`\\.toBe\\(\\s*${statusCode}\\s*\\)`),
    new RegExp(`\\.toEqual\\(\\s*${statusCode}\\s*\\)`),
    new RegExp(`status\\s*[=!]=+\\s*${statusCode}\\b`),
    new RegExp(`statusCode\\s*[=!]=+\\s*${statusCode}\\b`),
    new RegExp(`statusCode\\s*:\\s*${statusCode}\\b`),
  ];
  return patterns.some((p) => p.test(segment.content));
}

/**
 * Return true if the segment contains an assertion on an error message body
 * that is consistent with the given category.
 *
 * Examples detected:
 *   expect(res.body).toHaveProperty('error')
 *   expect(res.body.message).toContain('not found')
 *   expect(thrown.message).toMatch(/unauthorized/i)
 */
function hasErrorMessageAssertion(segment: TestSegment, category: ErrorCategory): boolean {
  const contentLower = segment.content.toLowerCase();

  // Generic: any error-body assertion
  const hasBodyErrorProp =
    /tohaveproperty\s*\(\s*['"]error['"]/.test(contentLower) ||
    /\.body\.error/.test(contentLower) ||
    /\.body\.message/.test(contentLower);

  if (!hasBodyErrorProp) return false;

  // Narrow by category keyword inside the assertion
  const categoryKeywords: Record<ErrorCategory, string[]> = {
    'missing-parameter': ['required', 'missing', 'must be provided'],
    'invalid-value': ['invalid', 'format', 'type', 'must be', 'out of range'],
    unauthorized: ['unauthorized', 'unauthenticated', 'token', 'api key'],
    forbidden: ['forbidden', 'permission', 'access denied'],
    'not-found': ['not found', 'does not exist'],
    conflict: ['conflict', 'duplicate', 'already', 'in use'],
    'server-error': ['internal', 'server error', 'unexpected'],
  };

  const keywords = categoryKeywords[category];
  // If any keyword appears anywhere in the test content → match
  return keywords.some((kw) => contentLower.includes(kw));
}

/**
 * Decide whether a single test segment covers the given error scenario.
 */
export function segmentCoversScenario(segment: TestSegment, scenario: ErrorScenario): boolean {
  // 1. Direct status code assertion
  if (hasStatusCodeAssertion(segment, scenario.statusCode)) return true;

  // 2. Category heuristics from description
  for (const cat of scenario.categories) {
    if (matchesCategoryHeuristic(segment, cat)) return true;
  }

  // 3. Indirect error-body assertion with category keywords
  for (const cat of scenario.categories) {
    if (hasErrorMessageAssertion(segment, cat)) return true;
  }

  return false;
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

/**
 * Scan test files matching testGlob and determine which error scenarios are
 * covered using heuristic analysis.
 */
export async function analyzeErrorCoverage(
  scenarios: ErrorScenario[],
  testGlob: string,
): Promise<ErrorScenarioCoverage[]> {
  const testFiles = await fg(testGlob, { onlyFiles: true });

  // Pre-read and segment all test files
  const allSegments: TestSegment[] = [];
  for (const filePath of testFiles) {
    const contents = fs.readFileSync(filePath, 'utf-8');
    allSegments.push(...extractTestSegments(contents));
  }

  return scenarios.map((scenario) => {
    const matchedTests: string[] = [];

    for (const segment of allSegments) {
      if (segmentMentionsEndpoint(segment, scenario) && segmentCoversScenario(segment, scenario)) {
        matchedTests.push(segment.description);
      }
    }

    return {
      scenario,
      covered: matchedTests.length > 0,
      matchedTests,
    };
  });
}

// ─── Report building ──────────────────────────────────────────────────────────

/**
 * Aggregate error coverage results into a summary report.
 */
export function buildErrorCoverageReport(
  coverages: ErrorScenarioCoverage[],
): ErrorCoverageReport {
  const total = coverages.length;
  const covered = coverages.filter((c) => c.covered).length;
  const percentage = total === 0 ? 0 : Math.round((covered / total) * 10000) / 100;

  // Per-category tallies
  const categorySummary = ERROR_CATEGORIES.reduce(
    (acc, cat) => {
      acc[cat] = { total: 0, covered: 0 };
      return acc;
    },
    {} as Record<ErrorCategory, CategorySummary>,
  );

  for (const c of coverages) {
    for (const cat of c.scenario.categories) {
      categorySummary[cat].total += 1;
      if (c.covered) categorySummary[cat].covered += 1;
    }
  }

  return { total, covered, percentage, scenarios: coverages, categorySummary };
}

// ─── Report generation ────────────────────────────────────────────────────────

/**
 * Write JSON and HTML error-coverage reports to reportsDir.
 */
export function generateErrorReports(report: ErrorCoverageReport, reportsDir: string): void {
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // ── JSON ─────────────────────────────────────────────────────────────────
  const jsonPath = path.join(reportsDir, 'error-coverage.json');
  const jsonReport = {
    total: report.total,
    covered: report.covered,
    percentage: report.percentage,
    categorySummary: report.categorySummary,
    scenarios: report.scenarios.map(({ scenario, covered, matchedTests }) => ({
      id: scenario.id,
      endpoint: scenario.endpoint,
      statusCode: scenario.statusCode,
      description: scenario.description,
      categories: scenario.categories,
      covered,
      matchedTests,
    })),
  };
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf-8');

  // ── HTML ─────────────────────────────────────────────────────────────────
  const htmlPath = path.join(reportsDir, 'error-coverage.html');

  const catHeaders = ERROR_CATEGORIES.map((c) => `<th>${c}</th>`).join('\n        ');

  const rows = report.scenarios
    .map(({ scenario, covered, matchedTests }) => {
      const rowClass = covered ? 'covered' : 'uncovered';
      const statusCell = covered ? '✅ Covered' : '❌ Not covered';

      const catCells = ERROR_CATEGORIES.map((cat) => {
        if (!scenario.categories.includes(cat)) return '<td class="na">—</td>';
        return covered ? '<td class="yes">✅</td>' : '<td class="no">❌</td>';
      }).join('\n        ');

      const testsHint =
        matchedTests.length > 0 ? matchedTests.map((t) => `• ${t}`).join('<br>') : '—';

      return `      <tr class="${rowClass}" title="${testsHint}">
        <td>${scenario.endpoint}</td>
        <td>${scenario.statusCode}</td>
        <td>${scenario.description}</td>
        <td>${statusCell}</td>
        ${catCells}
      </tr>`;
    })
    .join('\n');

  const catSummaryRows = ERROR_CATEGORIES.map((cat) => {
    const s = report.categorySummary[cat];
    const pct = s.total === 0 ? '—' : `${Math.round((s.covered / s.total) * 100)}%`;
    return `      <tr>
        <td>${cat}</td>
        <td>${s.covered}/${s.total}</td>
        <td>${pct}</td>
      </tr>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Error Coverage Report</title>
  <style>
    body { font-family: sans-serif; padding: 2rem; }
    h1, h2 { margin-bottom: 0.5rem; }
    .summary { margin-bottom: 1.5rem; font-size: 1.1rem; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
    th, td { border: 1px solid #ccc; padding: 0.5rem 1rem; text-align: left; }
    th { background: #f0f0f0; }
    tr.covered { background: #e6ffe6; }
    tr.uncovered { background: #ffe6e6; }
    td.yes { color: #2a7a2a; font-weight: bold; }
    td.no  { color: #aa2222; font-weight: bold; }
    td.na  { color: #999; }
  </style>
</head>
<body>
  <h1>Error Coverage Report</h1>
  <div class="summary">
    Covered: <strong>${report.covered}/${report.total}</strong> error scenarios
    (<strong>${report.percentage}%</strong>)
  </div>
  <table>
    <thead>
      <tr>
        <th>Endpoint</th>
        <th>Status</th>
        <th>Description</th>
        <th>Coverage</th>
        ${catHeaders}
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <h2>Category Summary</h2>
  <table>
    <thead>
      <tr><th>Category</th><th>Covered / Total</th><th>%</th></tr>
    </thead>
    <tbody>
${catSummaryRows}
    </tbody>
  </table>
</body>
</html>`;

  fs.writeFileSync(htmlPath, html, 'utf-8');
}
