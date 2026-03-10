/**
 * Route Inference Engine
 *
 * Discovers HTTP routes from Express/Koa/Hapi/Fastify source files when no
 * OpenAPI spec is available, enabling endpoint coverage analysis without
 * a pre-authored specification.
 *
 * Patterns supported:
 *  - Express/Koa: router.get('/path', ...) / app.post('/path', ...)
 *  - Chained: router.route('/path').get(...).post(...)
 *  - JSDoc route annotations: @route {GET} /path
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Public types ─────────────────────────────────────────────────────────────

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
export type HttpMethod = typeof HTTP_METHODS[number];

export interface InferredRoute {
  method: HttpMethod;
  path: string;
  sourceFile: string;
  lineNumber: number;
}

export interface RouteInferenceResult {
  routes: InferredRoute[];
  filesAnalyzed: number;
  warnings: string[];
}

// ─── Patterns ─────────────────────────────────────────────────────────────────

/** Matches: router.get('/path', ...) or app.post('/path', ...) */
const ROUTER_METHOD_PATTERN =
  /(?:router|app|server)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/i;

/** Matches: .route('/path').get(...) — chained route definition */
const CHAINED_ROUTE_PATTERN = /(?:router|app)\s*\.\s*route\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/i;
const CHAINED_METHOD_PATTERN = /\.\s*(get|post|put|patch|delete|head|options)\s*\(/gi;

/** Matches JSDoc @route {GET} /path */
const JSDOC_ROUTE_PATTERN = /@route\s+\{(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\}\s+(\S+)/i;

// ─── Core inference function ──────────────────────────────────────────────────

/**
 * Infer routes from a single source file.
 */
export function inferRoutesFromFile(filePath: string): InferredRoute[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const lines = content.split('\n');
  const routes: InferredRoute[] = [];
  const seen = new Set<string>();

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    // 1. Direct router.method('/path', ...) pattern
    const directMatch = line.match(ROUTER_METHOD_PATTERN);
    if (directMatch) {
      const method = directMatch[1].toLowerCase() as HttpMethod;
      const routePath = directMatch[2];
      const key = `${method}:${routePath}:${filePath}:${lineIdx}`;
      if (!seen.has(key)) {
        seen.add(key);
        routes.push({ method, path: routePath, sourceFile: filePath, lineNumber: lineIdx + 1 });
      }
      continue;
    }

    // 2. JSDoc @route annotation
    const jsDocMatch = line.match(JSDOC_ROUTE_PATTERN);
    if (jsDocMatch) {
      const method = jsDocMatch[1].toLowerCase() as HttpMethod;
      const routePath = jsDocMatch[2];
      const key = `${method}:${routePath}:${filePath}:${lineIdx}`;
      if (!seen.has(key)) {
        seen.add(key);
        routes.push({ method, path: routePath, sourceFile: filePath, lineNumber: lineIdx + 1 });
      }
      continue;
    }

    // 3. Chained: .route('/path').get(...).post(...)
    const chainedPathMatch = line.match(CHAINED_ROUTE_PATTERN);
    if (chainedPathMatch) {
      const routePath = chainedPathMatch[1];
      // Gather methods from subsequent lines (up to 5 lines ahead for chaining)
      const windowEnd = Math.min(lineIdx + 5, lines.length);
      const windowText = lines.slice(lineIdx, windowEnd).join(' ');
      let methodMatch: RegExpExecArray | null;
      CHAINED_METHOD_PATTERN.lastIndex = 0;
      while ((methodMatch = CHAINED_METHOD_PATTERN.exec(windowText)) !== null) {
        const method = methodMatch[1].toLowerCase() as HttpMethod;
        const key = `${method}:${routePath}:${filePath}:${lineIdx}`;
        if (!seen.has(key)) {
          seen.add(key);
          routes.push({ method, path: routePath, sourceFile: filePath, lineNumber: lineIdx + 1 });
        }
      }
    }
  }

  return routes;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Infer routes from a set of service source files.
 */
export function inferRoutes(serviceFiles: string[]): RouteInferenceResult {
  const allRoutes: InferredRoute[] = [];
  const warnings: string[] = [];
  let filesAnalyzed = 0;

  for (const fp of serviceFiles) {
    const fileRoutes = inferRoutesFromFile(fp);
    allRoutes.push(...fileRoutes);
    filesAnalyzed++;
  }

  if (allRoutes.length === 0) {
    warnings.push('No HTTP routes detected in service files.');
  }

  return { routes: allRoutes, filesAnalyzed, warnings };
}

/**
 * Write inferred routes to the reports directory.
 * Returns the path of the written file.
 */
export function writeInferredRoutes(result: RouteInferenceResult, reportsDir: string): string {
  fs.mkdirSync(reportsDir, { recursive: true });
  const outputPath = path.join(reportsDir, 'inferred-routes.json');
  const output = {
    generated_at: new Date().toISOString(),
    route_source: 'inferred',
    files_analyzed: result.filesAnalyzed,
    route_count: result.routes.length,
    routes: result.routes,
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  return outputPath;
}
