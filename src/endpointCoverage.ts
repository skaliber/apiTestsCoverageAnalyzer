import SwaggerParser from '@apidevtools/swagger-parser';
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import { OpenAPI } from 'openapi-types';

export interface Endpoint {
  method: string;
  path: string;
  /** Regex that matches concrete paths (e.g. /users/123 for /users/{id}) */
  pathRegex: RegExp;
}

export interface EndpointCoverage extends Endpoint {
  covered: boolean;
  testFiles: string[];
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
 */
function findCoveredEndpoints(fileContents: string, endpoints: Endpoint[]): Set<number> {
  const covered = new Set<number>();

  // Pattern: METHOD /path  (e.g. GET /users, POST /orders, GET /users/123)
  // Matches strings like 'GET /users', "POST /orders/456", `DELETE /users/789`
  const callPattern = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(\/[^\s'"`,)]*)/gi;
  let match: RegExpExecArray | null;

  while ((match = callPattern.exec(fileContents)) !== null) {
    const method = match[1].toUpperCase();
    const calledPath = match[2];

    endpoints.forEach((endpoint, idx) => {
      if (endpoint.method === method && endpoint.pathRegex.test(calledPath)) {
        covered.add(idx);
      }
    });
  }

  return covered;
}

/**
 * Analyse test files matching the given glob pattern and determine which
 * endpoints from the spec are covered.
 */
export async function analyzeTestCoverage(
  endpoints: Endpoint[],
  testGlob: string,
): Promise<EndpointCoverage[]> {
  const testFiles = await fg(testGlob, { onlyFiles: true });

  const coverageMap: EndpointCoverage[] = endpoints.map((ep) => ({
    ...ep,
    covered: false,
    testFiles: [],
  }));

  for (const filePath of testFiles) {
    const contents = fs.readFileSync(filePath, 'utf-8');
    const coveredIndices = findCoveredEndpoints(contents, endpoints);
    for (const idx of coveredIndices) {
      coverageMap[idx].covered = true;
      coverageMap[idx].testFiles.push(filePath);
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
    endpoints: report.endpoints.map(({ method, path: p, covered, testFiles }) => ({
      method,
      path: p,
      covered,
      testFiles,
    })),
  };
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf-8');

  // HTML report
  const htmlPath = path.join(reportsDir, 'endpoint-coverage.html');
  const rows = report.endpoints
    .map(({ method, path: p, covered, testFiles }) => {
      const rowClass = covered ? 'covered' : 'uncovered';
      const status = covered ? '✅ Covered' : '❌ Not covered';
      const files = testFiles.length > 0 ? testFiles.join('<br>') : '—';
      return `    <tr class="${rowClass}">
      <td>${method}</td>
      <td>${p}</td>
      <td>${status}</td>
      <td>${files}</td>
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
