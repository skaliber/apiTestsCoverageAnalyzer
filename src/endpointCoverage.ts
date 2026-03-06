import SwaggerParser from '@apidevtools/swagger-parser';
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import { OpenAPI } from 'openapi-types';
import {
  SupportedLanguage,
  detectLanguageFromExtension,
  extractHttpCalls,
  extractHttpCallsFromJs,
} from './languageDetection';

export interface Endpoint {
  method: string;
  path: string;
  /** Regex that matches concrete paths (e.g. /users/123 for /users/{id}) */
  pathRegex: RegExp;
}

export interface EndpointCoverage extends Endpoint {
  covered: boolean;
  testFiles: string[];
  /** Languages from which this endpoint is covered (populated when --language is used). */
  languages?: string[];
}

export interface CoverageReport {
  total: number;
  covered: number;
  percentage: number;
  endpoints: EndpointCoverage[];
}

/**
 * Convert an OpenAPI path template (e.g. /users/{id}/orders) to a RegExp
 * that matches concrete paths (e.g. /users/123/orders).
 */
export function pathToRegex(apiPath: string): RegExp {
  // Split on parameter placeholders, escape each static segment, then rejoin
  const pattern = apiPath
    .split(/\{[^}]+\}/)
    .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^\\/]+');
  return new RegExp(`^${pattern}$`);
}

/**
 * Parse an OpenAPI/Swagger spec file and return a flat list of endpoints.
 */
export async function parseOpenApiSpec(specPath: string): Promise<Endpoint[]> {
  const api = await SwaggerParser.dereference(specPath);
  const endpoints: Endpoint[] = [];

  const paths = (api as OpenAPI.Document & { paths?: Record<string, unknown> }).paths;
  if (!paths) return endpoints;

  const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

  for (const [apiPath, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of httpMethods) {
      if (method in (pathItem as Record<string, unknown>)) {
        endpoints.push({
          method: method.toUpperCase(),
          path: apiPath,
          pathRegex: pathToRegex(apiPath),
        });
      }
    }
  }

  return endpoints;
}

/**
 * Search a file's contents for HTTP calls matching any of the given endpoints.
 * Returns an array of matched endpoint indices.
 *
 * When `language` is provided the appropriate language-specific extractor is
 * used; otherwise the JavaScript/TypeScript extractor is used as a fallback.
 */
function findCoveredEndpoints(
  fileContents: string,
  endpoints: Endpoint[],
  language?: SupportedLanguage,
): Set<number> {
  const covered = new Set<number>();

  // Choose extractor based on language hint
  const httpCalls =
    language && language !== 'auto'
      ? extractHttpCalls(fileContents, language)
      : extractHttpCallsFromJs(fileContents);

  for (const call of httpCalls) {
    // Skip OpenAPI path templates that appear in comments/descriptions
    if (call.path.includes('{')) continue;

    endpoints.forEach((endpoint, idx) => {
      if (endpoint.method === call.method && endpoint.pathRegex.test(call.path)) {
        covered.add(idx);
      }
    });
  }

  return covered;
}

/**
 * Analyse test files matching the given glob pattern and determine which
 * endpoints from the spec are covered.
 *
 * When `languages` is supplied the appropriate language-specific HTTP-call
 * extractor is used for each file (based on its extension when `languages`
 * contains `'auto'`, or the first matching language otherwise).
 */
export async function analyzeTestCoverage(
  endpoints: Endpoint[],
  testGlob: string,
  languages?: SupportedLanguage[],
): Promise<EndpointCoverage[]> {
  const testFiles = await fg(testGlob, { onlyFiles: true });

  const coverageMap: EndpointCoverage[] = endpoints.map((ep) => ({
    ...ep,
    covered: false,
    testFiles: [],
    languages: [],
  }));

  for (const filePath of testFiles) {
    const contents = fs.readFileSync(filePath, 'utf-8');

    // Determine the language for this file
    let lang: SupportedLanguage | undefined;
    if (languages && languages.length > 0 && !languages.includes('auto')) {
      // Use the first explicitly provided language
      lang = languages[0];
    } else {
      // Auto-detect from extension
      lang = detectLanguageFromExtension(filePath) ?? undefined;
    }

    const coveredIndices = findCoveredEndpoints(contents, endpoints, lang);
    const fileLanguage = lang ?? 'javascript';

    for (const idx of coveredIndices) {
      coverageMap[idx].covered = true;
      coverageMap[idx].testFiles.push(filePath);
      if (!coverageMap[idx].languages!.includes(fileLanguage)) {
        coverageMap[idx].languages!.push(fileLanguage);
      }
    }
  }

  return coverageMap;
}

/**
 * Build the coverage summary numbers from a coverage map.
 */
export function buildCoverageReport(coverageMap: EndpointCoverage[]): CoverageReport {
  const total = coverageMap.length;
  const coveredCount = coverageMap.filter((ep) => ep.covered).length;
  const percentage = total === 0 ? 0 : Math.round((coveredCount / total) * 10000) / 100;
  return { total, covered: coveredCount, percentage, endpoints: coverageMap };
}

/**
 * Write JSON and HTML coverage reports to the given directory.
 */
export function generateReports(report: CoverageReport, reportsDir: string): void {
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // JSON report
  const jsonPath = path.join(reportsDir, 'endpoint-coverage.json');
  const jsonReport = {
    total: report.total,
    covered: report.covered,
    percentage: report.percentage,
    endpoints: report.endpoints.map(({ method, path: p, covered, testFiles, languages }) => ({
      method,
      path: p,
      covered,
      testFiles,
      ...(languages && languages.length > 0 ? { languages } : {}),
    })),
  };
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf-8');

  // HTML report
  const htmlPath = path.join(reportsDir, 'endpoint-coverage.html');
  const rows = report.endpoints
    .map(({ method, path: p, covered, testFiles, languages }) => {
      const rowClass = covered ? 'covered' : 'uncovered';
      const status = covered ? '✅ Covered' : '❌ Not covered';
      const files = testFiles.length > 0 ? testFiles.join('<br>') : '—';
      const langs = languages && languages.length > 0 ? languages.join(', ') : '—';
      return `    <tr class="${rowClass}">
      <td>${method}</td>
      <td>${p}</td>
      <td>${status}</td>
      <td>${files}</td>
      <td>${langs}</td>
    </tr>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Endpoint Coverage Report</title>
  <style>
    body { font-family: sans-serif; padding: 2rem; }
    h1 { margin-bottom: 0.5rem; }
    .summary { margin-bottom: 1.5rem; font-size: 1.1rem; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 0.5rem 1rem; text-align: left; }
    th { background: #f0f0f0; }
    tr.covered { background: #e6ffe6; }
    tr.uncovered { background: #ffe6e6; }
  </style>
</head>
<body>
  <h1>Endpoint Coverage Report</h1>
  <div class="summary">
    Covered: <strong>${report.covered}/${report.total}</strong> endpoints
    (<strong>${report.percentage}%</strong>)
  </div>
  <table>
    <thead>
      <tr>
        <th>Method</th>
        <th>Path</th>
        <th>Status</th>
        <th>Test Files</th>
        <th>Languages</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
</body>
</html>`;
  fs.writeFileSync(htmlPath, html, 'utf-8');
}
