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
import type { DeepAnalysisConfig } from './coverage/deep-analysis/types';
import { DEFAULT_DEEP_ANALYSIS_CONFIG } from './coverage/deep-analysis/types';
import { deepResolveFile } from './coverage/deep-analysis/deepEndpointResolver';
import type { ResolutionType, ConfidenceLevel } from './coverage/deep-analysis/types';
import { analyzeFile, buildAnalysisContext } from './ast/astAnalysisOrchestrator';
import type { AstAnalysisConfig } from './config/types';

export interface Endpoint {
  method: string;
  path: string;
  /** Regex that matches concrete paths (e.g. /users/123 for /users/{id}) */
  pathRegex: RegExp;
}

/**
 * Metadata for a single match between a test call and an endpoint.
 */
export interface EndpointMatch {
  /** How the endpoint was resolved */
  resolutionType: ResolutionType;
  /** Confidence level of the resolution */
  confidence: ConfidenceLevel;
  /** Whether the call was followed by a response assertion */
  assertionLinked?: boolean;
  /** The raw call text as seen in the source file */
  rawCall?: string;
}

export interface EndpointCoverage extends Endpoint {
  covered: boolean;
  testFiles: string[];
  /** Languages from which this endpoint is covered (populated when --language is used). */
  languages?: string[];
  /** Deep-analysis metadata for each match (populated when deep analysis is enabled). */
  matches?: EndpointMatch[];
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
 * Run deep analysis on a single file and return a set of endpoint indices
 * that are covered along with their match metadata.
 *
 * Returns a Map of endpoint index → EndpointMatch[] (may be multiple matches).
 */
function findDeepCoveredEndpoints(
  fileContents: string,
  filePath: string,
  endpoints: Endpoint[],
  language: SupportedLanguage,
  deepConfig: DeepAnalysisConfig,
  astConfig?: AstAnalysisConfig,
): Map<number, EndpointMatch[]> {
  const deepMatches = new Map<number, EndpointMatch[]>();

  // Use the AST orchestrator as primary path (falls back to regex automatically)
  const context = buildAnalysisContext(astConfig, deepConfig);
  const resolvedCalls = analyzeFile(fileContents, filePath, language, context);

  for (const resolved of resolvedCalls) {
    // Try both the raw path and the normalized path against each endpoint
    const pathsToTry = [resolved.path];
    if (resolved.normalizedPath && resolved.normalizedPath !== resolved.path) {
      pathsToTry.push(resolved.normalizedPath);
    }

    endpoints.forEach((endpoint, idx) => {
      if (endpoint.method !== resolved.method) return;

      for (const candidatePath of pathsToTry) {
        // Skip if it still contains unresolved placeholders that don't match templates
        // Accept both concrete paths matching the regex and template paths matching the spec path
        const matchesConcrete = !candidatePath.includes('{') && endpoint.pathRegex.test(candidatePath);
        const matchesTemplate = candidatePath === endpoint.path;

        // Also try matching normalized path patterns
        const matchesNormalized = candidatePath.includes('{') && templatePathsMatch(candidatePath, endpoint.path);

        if (matchesConcrete || matchesTemplate || matchesNormalized) {
          const match: EndpointMatch = {
            resolutionType: resolved.resolutionType,
            confidence: resolved.confidence,
            assertionLinked: resolved.assertionLinked,
            rawCall: resolved.rawCall,
          };

          const existing = deepMatches.get(idx);
          if (existing) {
            // Avoid duplicate resolution types for same endpoint
            const isDuplicate = existing.some(
              (m) => m.resolutionType === match.resolutionType && m.confidence === match.confidence,
            );
            if (!isDuplicate) existing.push(match);
          } else {
            deepMatches.set(idx, [match]);
          }
          break;
        }
      }
    });
  }

  return deepMatches;
}

/**
 * Compare two OpenAPI-style path templates for structural equivalence.
 * e.g. /users/{id} matches /users/{userId}
 */
function templatePathsMatch(a: string, b: string): boolean {
  const partsA = a.split('/');
  const partsB = b.split('/');
  if (partsA.length !== partsB.length) return false;
  return partsA.every((seg, i) => {
    const segB = partsB[i]!;
    // Both are params → match
    if (/^\{.+\}$/.test(seg) && /^\{.+\}$/.test(segB)) return true;
    // One is param, other isn't
    if (/^\{.+\}$/.test(seg) || /^\{.+\}$/.test(segB)) return false;
    return seg === segB;
  });
}

/**
 * Analyse test files matching the given glob pattern and determine which
 * endpoints from the spec are covered.
 *
 * When `languages` is supplied the appropriate language-specific HTTP-call
 * extractor is used for each file (based on its extension when `languages`
 * contains `'auto'`, or the first matching language otherwise).
 *
 * When `deepAnalysisConfig` is supplied (and enabled), the deep analysis
 * layer is also run to catch indirect calls (constants, templates, wrappers, etc.).
 */
export async function analyzeTestCoverage(
  endpoints: Endpoint[],
  testGlob: string,
  languages?: SupportedLanguage[],
  deepAnalysisConfig?: DeepAnalysisConfig,
  astAnalysisConfig?: AstAnalysisConfig,
): Promise<EndpointCoverage[]> {
  const testFiles = await fg(testGlob, { onlyFiles: true });

  const coverageMap: EndpointCoverage[] = endpoints.map((ep) => ({
    ...ep,
    covered: false,
    testFiles: [],
    languages: [],
    matches: [],
  }));

  const deepConfig: DeepAnalysisConfig = deepAnalysisConfig ?? DEFAULT_DEEP_ANALYSIS_CONFIG;

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

    const fileLanguage = lang ?? 'javascript';

    // ── Direct regex-based coverage detection ─────────────────────────────
    const directCoveredIndices = findCoveredEndpoints(contents, endpoints, lang);

    for (const idx of directCoveredIndices) {
      coverageMap[idx].covered = true;
      if (!coverageMap[idx].testFiles.includes(filePath)) {
        coverageMap[idx].testFiles.push(filePath);
      }
      if (!coverageMap[idx].languages!.includes(fileLanguage)) {
        coverageMap[idx].languages!.push(fileLanguage);
      }
      // Record as a direct match
      const alreadyHasDirect = coverageMap[idx].matches?.some((m) => m.resolutionType === 'direct');
      if (!alreadyHasDirect) {
        coverageMap[idx].matches!.push({ resolutionType: 'direct', confidence: 'high' });
      }
    }

    // ── Deep analysis coverage detection ──────────────────────────────────
    if (deepConfig.enabled) {
      const deepCovered = findDeepCoveredEndpoints(
        contents,
        filePath,
        endpoints,
        fileLanguage as SupportedLanguage,
        deepConfig,
        astAnalysisConfig,
      );

      for (const [idx, matches] of deepCovered.entries()) {
        // Skip if already covered by direct detection (don't downgrade)
        coverageMap[idx].covered = true;
        if (!coverageMap[idx].testFiles.includes(filePath)) {
          coverageMap[idx].testFiles.push(filePath);
        }
        if (!coverageMap[idx].languages!.includes(fileLanguage)) {
          coverageMap[idx].languages!.push(fileLanguage);
        }
        for (const match of matches) {
          // Don't add duplicate match entries
          const isDuplicate = coverageMap[idx].matches!.some(
            (m) => m.resolutionType === match.resolutionType && m.rawCall === match.rawCall,
          );
          if (!isDuplicate) {
            coverageMap[idx].matches!.push(match);
          }
        }
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
 *
 * The JSON report includes deep-analysis match metadata per endpoint.
 * The HTML report shows resolution type and confidence badges.
 */
export function generateReports(report: CoverageReport, reportsDir: string): void {
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // ── JSON report ──────────────────────────────────────────────────────────
  const jsonPath = path.join(reportsDir, 'endpoint-coverage.json');
  const jsonReport = {
    total: report.total,
    covered: report.covered,
    percentage: report.percentage,
    endpoints: report.endpoints.map(({ method, path: p, covered, testFiles, languages, matches }) => ({
      method,
      path: p,
      covered,
      testFiles,
      ...(languages && languages.length > 0 ? { languages } : {}),
      ...(matches && matches.length > 0 ? { matches } : {}),
    })),
  };
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf-8');

  // ── HTML report ──────────────────────────────────────────────────────────
  const htmlPath = path.join(reportsDir, 'endpoint-coverage.html');
  const rows = report.endpoints
    .map(({ method, path: p, covered, testFiles, languages, matches }) => {
      const rowClass = covered ? 'covered' : 'uncovered';
      const status = covered ? '&#10003; Covered' : '&#10007; Not covered';
      const files = testFiles.length > 0 ? testFiles.join('<br>') : '&mdash;';
      const langs = languages && languages.length > 0 ? languages.join(', ') : '&mdash;';

      // Resolution type + confidence badges
      let matchBadges = '&mdash;';
      if (matches && matches.length > 0) {
        const uniqueTypes = [...new Set(matches.map((m) => m.resolutionType))];
        matchBadges = uniqueTypes
          .map((rt) => {
            const bestMatch = matches.find((m) => m.resolutionType === rt);
            const conf = bestMatch?.confidence ?? 'medium';
            const assertLinked = bestMatch?.assertionLinked ? ' &#10003;' : '';
            const confClass = conf === 'high' ? 'conf-high' : conf === 'medium' ? 'conf-medium' : 'conf-low';
            return `<span class="badge badge-${rt}">${rt}</span> <span class="${confClass}">${conf}${assertLinked}</span>`;
          })
          .join(' ');
      }

      return `    <tr class="${rowClass}">
      <td>${method}</td>
      <td>${p}</td>
      <td>${status}</td>
      <td>${files}</td>
      <td>${langs}</td>
      <td>${matchBadges}</td>
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
    .badge { display: inline-block; padding: 0.1rem 0.4rem; border-radius: 3px;
             font-size: 0.75rem; font-weight: 600; color: #fff;
             background: #555; margin-right: 0.2rem; }
    .badge-direct { background: #2a9d8f; }
    .badge-constant { background: #457b9d; }
    .badge-enum { background: #6a4c93; }
    .badge-string-template { background: #e9c46a; color: #333; }
    .badge-wrapper-method { background: #e76f51; }
    .badge-request-builder { background: #264653; }
    .badge-client-mapping { background: #c77dff; }
    .badge-heuristic { background: #aaa; }
    .conf-high { color: #2a9d8f; font-weight: 600; font-size: 0.8rem; }
    .conf-medium { color: #e9c46a; font-weight: 600; font-size: 0.8rem; }
    .conf-low { color: #e76f51; font-weight: 600; font-size: 0.8rem; }
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
        <th>Resolution</th>
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
