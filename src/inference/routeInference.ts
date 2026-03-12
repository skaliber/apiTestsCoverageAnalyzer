/**
 * Route Inference Engine
 *
 * Discovers HTTP routes from Express/Koa/Hapi/Fastify source files when no
 * OpenAPI spec is available, enabling endpoint coverage analysis without
 * a pre-authored specification.
 *
 * Patterns supported:
 *  - Express/Koa: router.get('/path', ...) / app.post('/path', ...)
 *  - Multi-line: router.get(\n  '/path', ...) — path on next line
 *  - Chained: router.route('/path').get(...).post(...)
 *  - JSDoc route annotations: @route {GET} /path (used only when no code pattern found)
 *
 * Deduplication:
 *  - Routes are deduplicated by method:path within each file.
 *  - Actual code patterns take priority over JSDoc annotations.
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Public types ─────────────────────────────────────────────────────────────

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
export type HttpMethod = typeof HTTP_METHODS[number];

export interface InferredRoute {
  method: HttpMethod;
  path: string;
  /** Primary service function called in the route handler, if detectable */
  handlerFunction?: string;
  sourceFile: string;
  lineNumber: number;
  /** How this route was discovered */
  discoveredVia: 'code' | 'jsdoc';
}

export interface RouteInferenceResult {
  routes: InferredRoute[];
  filesAnalyzed: number;
  warnings: string[];
}

// ─── Patterns ─────────────────────────────────────────────────────────────────

/** Matches: router.get('/path', ...) or app.post('/path', ...) — on a single line */
const ROUTER_METHOD_INLINE =
  /(?:router|app|server)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/i;

/**
 * Matches the beginning of a router.method( call that spans multiple lines.
 * Group 1 = method name (get|post|...).
 * The route path is expected on the same or next line.
 */
const ROUTER_METHOD_MULTILINE_START =
  /(?:router|app|server)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*$/i;

/** Matches a standalone route path string (first arg in multi-line route) */
const ROUTE_PATH_LINE = /^\s*['"`]([^'"`]+)['"`]\s*,?\s*$/;

/** Matches: router.route('/path').get(...) — chained route definition */
const CHAINED_ROUTE_PATTERN = /(?:router|app)\s*\.\s*route\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/i;
const CHAINED_METHOD_PATTERN = /\.\s*(get|post|put|patch|delete|head|options)\s*\(/gi;

/** Matches JSDoc @route {GET} /path */
const JSDOC_ROUTE_PATTERN = /@route\s+\{(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\}\s+(\S+)/i;

// ─── AngularJS / $http / fetch / axios patterns ────────────────────────────

/**
 * Detects that a file uses HTTP client patterns ($http, fetch, axios).
 * Used to gate the URL+method object-form scan so we only activate it in
 * files that actually make HTTP calls (avoids scanning every JS file).
 */
const HTTP_CLIENT_SIGNAL = /\$http|\bfetch\s*\(|\baxios\b|\bsuperagent\b/;

/**
 * Matches client-side HTTP method calls: requests.get('/path'), api.post('/path'), etc.
 * Group 1 = HTTP method, Group 2 = path literal starting with /
 * Also handles: superagent.get(`${base}/path`) → captures the static suffix
 */
const HTTP_CLIENT_METHOD_CALL =
  /\b\w+\s*\.\s*(get|post|put|patch|delete|del|head|options)\s*\(\s*(?:[^'"`\n]*?\+\s*)?['"`](\/[^'"`?\n]+)/i;

/**
 * Signals that this JS/TS file is a client-side HTTP service layer.
 * Expands on HTTP_CLIENT_SIGNAL to include superagent and common wrapper patterns.
 */
const HTTP_SERVICE_SIGNAL = /\bsuperagent\b|\brequests\s*\.\s*(?:get|post|put|delete|del)\b|\bapi\s*\.\s*(?:get|post|put|delete)\b/;

/**
 * Matches a `url:` property that ends with a literal path segment starting
 * with `/`.  Handles both bare and concatenated forms:
 *   url: '/articles'
 *   url: this._AppConstants.api + '/articles'
 *   url: `${base}/articles`
 * Group 1 = the static path portion (starts with /).
 */
const ANGULAR_HTTP_URL_KEY =
  /\burl\s*:(?:[^'"`\n]*?\+\s*)?['"`](\/[^'"`?#{\n]+)['"`]/;

/**
 * Matches a `method:` property with an HTTP verb value.
 *   method: 'GET'   method: "POST"
 * Group 1 = the HTTP method (uppercase).
 */
const ANGULAR_HTTP_METHOD_KEY = /\bmethod\s*:\s*['"]([A-Z]+)['"]/i;

/**
 * Number of lines to search around a `method:` key when looking for the
 * paired `url:` key in the same AngularJS $http config object.
 */
const ANGULAR_HTTP_SCAN_WINDOW = 12;

/**
 * Matches the primary async service function call within a route handler body.
 * e.g. `await deleteComment(...)` or `const result = await getArticles(...)`.
 * Group 1 = function name.
 *
 * Note: This only detects `await`-based async calls. Synchronous handlers
 * (e.g. `res.json(getUsers())`) are not matched by this pattern.
 */
const HANDLER_FUNCTION_PATTERN = /(?:await|const\s+\w+\s*=\s*await)\s+([a-zA-Z][a-zA-Z0-9]*)\s*\(/;

/**
 * Number of source lines scanned ahead to find the primary handler function
 * when the route is defined on a single line (router.method('/path', ...)).
 * The inline form starts the handler function close to the route definition.
 */
const HANDLER_SCAN_WINDOW_INLINE = 20;

/**
 * Number of source lines scanned ahead to find the primary handler function
 * when the route is defined with the path on the next line. The multi-line
 * form has more preamble (middleware, auth, etc.) before the handler function.
 */
const HANDLER_SCAN_WINDOW_MULTILINE = 25;

// ─── Core inference function ──────────────────────────────────────────────────

/**
 * Infer routes from a single source file.
 * Routes are deduplicated by method:path within the file.
 * Code-based patterns take priority over JSDoc annotations for the same method+path.
 */
export function inferRoutesFromFile(filePath: string): InferredRoute[] {
  // Dispatch to language-specific parsers before falling back to the generic (Node/Express) path
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.java' || ext === '.kt' || ext === '.kts') {
    return inferRoutesFromJavaFile(filePath);
  }
  if (ext === '.py') {
    return inferRoutesFromPythonFile(filePath);
  }
  if (ext === '.php') {
    return inferRoutesFromPhpFile(filePath);
  }

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const lines = content.split('\n');
  // key = "method:path" → route (code-found routes win over jsdoc)
  const byKey = new Map<string, InferredRoute>();

  const addRoute = (
    method: HttpMethod,
    routePath: string,
    lineNumber: number,
    discoveredVia: 'code' | 'jsdoc',
    handlerFunction?: string,
  ) => {
    const key = `${method}:${routePath}`;
    const existing = byKey.get(key);
    // Prefer code-discovered over jsdoc; if same source, first occurrence wins
    if (!existing || (discoveredVia === 'code' && existing.discoveredVia === 'jsdoc')) {
      byKey.set(key, { method, path: routePath, handlerFunction, sourceFile: filePath, lineNumber, discoveredVia });
    }
  };

  // Pre-check: does this file use AngularJS $http, fetch, or axios?
  // We only enable the object-form method+url scanner for such files to
  // avoid false positives in ordinary JS/TS source.
  const usesHttpClient = HTTP_CLIENT_SIGNAL.test(content);

  // Pre-check: does this file use a client-side HTTP service wrapper (requests.*, api.*, etc.)?
  const usesHttpServiceWrapper = HTTP_SERVICE_SIGNAL.test(content);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    // 1a. router.method('/path', ...) — all on one line
    const inlineMatch = line.match(ROUTER_METHOD_INLINE);
    if (inlineMatch) {
      const method = inlineMatch[1].toLowerCase() as HttpMethod;
      const routePath = inlineMatch[2];
      // Scan up to HANDLER_SCAN_WINDOW_INLINE following lines for the primary await function call
      const handlerFn = findHandlerFunction(lines, lineIdx, HANDLER_SCAN_WINDOW_INLINE);
      addRoute(method, routePath, lineIdx + 1, 'code', handlerFn);
      continue;
    }

    // 1b. router.method(\n  '/path', ...) — method and path on separate lines
    const multilineStart = line.match(ROUTER_METHOD_MULTILINE_START);
    if (multilineStart && lineIdx + 1 < lines.length) {
      const nextLine = lines[lineIdx + 1];
      const pathMatch = nextLine.match(ROUTE_PATH_LINE);
      if (pathMatch) {
        const method = multilineStart[1].toLowerCase() as HttpMethod;
        const routePath = pathMatch[1];
        const handlerFn = findHandlerFunction(lines, lineIdx, HANDLER_SCAN_WINDOW_MULTILINE);
        addRoute(method, routePath, lineIdx + 1, 'code', handlerFn);
        lineIdx++; // skip the path line
        continue;
      }
    }

    // 2. JSDoc @route annotation (only added if no code pattern found for same route)
    const jsDocMatch = line.match(JSDOC_ROUTE_PATTERN);
    if (jsDocMatch) {
      const method = jsDocMatch[1].toLowerCase() as HttpMethod;
      const routePath = jsDocMatch[2];
      addRoute(method, routePath, lineIdx + 1, 'jsdoc');
      continue;
    }

    // 3. Chained: .route('/path').get(...).post(...)
    const chainedPathMatch = line.match(CHAINED_ROUTE_PATTERN);
    if (chainedPathMatch) {
      const routePath = chainedPathMatch[1];
      const windowEnd = Math.min(lineIdx + 5, lines.length);
      const windowText = lines.slice(lineIdx, windowEnd).join(' ');
      let methodMatch: RegExpExecArray | null;
      CHAINED_METHOD_PATTERN.lastIndex = 0;
      while ((methodMatch = CHAINED_METHOD_PATTERN.exec(windowText)) !== null) {
        const method = methodMatch[1].toLowerCase() as HttpMethod;
        addRoute(method, routePath, lineIdx + 1, 'code');
      }
    }

    // 4. HapiJS server.route({ method: 'GET', path: '/path', ... })
    const hapiMethodMatch = line.match(/method\s*:\s*['"](\w+)['"]/);
    const hapiPathMatch = line.match(/path\s*:\s*['"]([^'"]+)['"]/);
    if (hapiMethodMatch && hapiPathMatch) {
      const method = hapiMethodMatch[1].toLowerCase();
      if (HTTP_METHODS.includes(method as HttpMethod)) {
        addRoute(method as HttpMethod, hapiPathMatch[1], lineIdx + 1, 'code');
        continue;
      }
    }

    // 5. AngularJS / fetch / axios — { url: base + '/path', method: 'GET' }
    //    Only active when the file contains an HTTP-client signal.
    if (usesHttpClient) {
      const httpMethodKey = line.match(ANGULAR_HTTP_METHOD_KEY);
      if (httpMethodKey) {
        const httpVerb = httpMethodKey[1].toLowerCase();
        if (HTTP_METHODS.includes(httpVerb as HttpMethod)) {
          // Scan a window around this line to find the paired url: key
          const searchStart = Math.max(0, lineIdx - ANGULAR_HTTP_SCAN_WINDOW);
          const searchEnd = Math.min(lines.length, lineIdx + ANGULAR_HTTP_SCAN_WINDOW);
          for (let j = searchStart; j < searchEnd; j++) {
            const urlKeyMatch = lines[j].match(ANGULAR_HTTP_URL_KEY);
            if (urlKeyMatch) {
              addRoute(httpVerb as HttpMethod, urlKeyMatch[1], lineIdx + 1, 'code');
              break;
            }
          }
        }
      }
    }

    // 6. Client-side HTTP method calls: requests.get('/path'), api.post('/path')
    //    Only activate for files that contain HTTP service signals to avoid false positives
    if (usesHttpServiceWrapper) {
      const clientCallMatch = line.match(HTTP_CLIENT_METHOD_CALL);
      if (clientCallMatch) {
        let httpMethod = clientCallMatch[1].toLowerCase();
        // Normalize 'del' → 'delete'
        if (httpMethod === 'del') httpMethod = 'delete';
        if (HTTP_METHODS.includes(httpMethod as HttpMethod)) {
          const routePath = clientCallMatch[2].split('?')[0]; // strip query string
          addRoute(httpMethod as HttpMethod, routePath, lineIdx + 1, 'code');
        }
      }
    }
  }

  return [...byKey.values()];
}

/**
 * Scan ahead in the source lines from `startLine` to find the first awaited
 * service function call in the route handler body.
 */
function findHandlerFunction(lines: string[], startLine: number, maxLines: number): string | undefined {
  const end = Math.min(startLine + maxLines, lines.length);
  for (let i = startLine; i < end; i++) {
    const m = lines[i].match(HANDLER_FUNCTION_PATTERN);
    if (m) return m[1];
  }
  return undefined;
}

// ─── Java / Spring inference ──────────────────────────────────────────────────

/**
 * Matches class-level @RequestMapping (sets the base path for all methods).
 *   @RequestMapping(path = "/articles/{slug}")
 *   @RequestMapping("/articles")
 *   @RequestMapping("tags")          ← no leading slash
 */
const SPRING_CLASS_BASE_PATH =
  /@RequestMapping\s*\(\s*(?:path\s*=\s*)?["']([^"']+)["']/;

/**
 * Matches any Spring method-mapping annotation and an optional path argument.
 *   @GetMapping                       → GET, no sub-path
 *   @GetMapping(path = "feed")        → GET, sub-path "feed"
 *   @GetMapping("feed")               → GET, sub-path "feed"
 *   @PostMapping(path = "follow")     → POST, sub-path "follow"
 *   @RequestMapping(path = "{id}", method = RequestMethod.DELETE)
 *   @RequestMapping(path = "/users", method = POST)
 */
const SPRING_METHOD_MAPPING =
  /@(Get|Post|Put|Patch|Delete)Mapping(?:\s*\(\s*(?:path\s*=\s*)?["']([^"']*)["'])?/i;

/** Matches @RequestMapping with explicit method= (used when special HTTP method needed) */
const SPRING_REQUEST_MAPPING_EXPLICIT =
  /@RequestMapping\s*\((?:[^)]*?\bpath\s*=\s*["']([^"']+)["'][^)]*?\bmethod\s*=\s*(?:RequestMethod\.)?([A-Z]+)|(?:[^)]*?\bmethod\s*=\s*(?:RequestMethod\.)?([A-Z]+)[^)]*?\bpath\s*=\s*["']([^"']+)["']))/;

/**
 * Matches DGS @DgsQuery and @DgsMutation annotations.
 *   @DgsQuery                          → Query field (method name = field name)
 *   @DgsQuery(field = "articles")      → Query field "articles"
 *   @DgsMutation(field = "createArticle") → Mutation field "createArticle"
 */
const DGS_QUERY = /@DgsQuery(?:\s*\(\s*(?:field\s*=\s*)?["']?(\w+)["']?\s*\))?/;
const DGS_MUTATION = /@DgsMutation(?:\s*\(\s*(?:field\s*=\s*)?["']?(\w+)["']?\s*\))?/;

/**
 * Matches Spring GraphQL @QueryMapping and @MutationMapping.
 *   @QueryMapping                      → Query (method name)
 *   @QueryMapping("articles")          → Query "articles"
 *   @MutationMapping("createArticle")  → Mutation "createArticle"
 */
const SPRING_QUERY_MAPPING = /@QueryMapping(?:\s*\(\s*["']?(\w+)["']?\s*\))?/;
const SPRING_MUTATION_MAPPING = /@MutationMapping(?:\s*\(\s*["']?(\w+)["']?\s*\))?/;

/**
 * Infer Spring routes from a  Java or Kotlin source file.
 * Works in two passes:
 *  1. Scan for class-level @RequestMapping to capture the base path.
 *  2. Scan for method-level @xMapping annotations and combine with the base.
 */
function inferRoutesFromJavaFile(filePath: string): InferredRoute[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const lines = content.split('\n');
  const byKey = new Map<string, InferredRoute>();

  const addRoute = (method: HttpMethod, routePath: string, lineNumber: number) => {
    const key = `${method}:${routePath}`;
    if (!byKey.has(key)) {
      byKey.set(key, { method, path: routePath, sourceFile: filePath, lineNumber, discoveredVia: 'code' });
    }
  };

  // ── Pass 1: find class-level base path ──────────────────────────────────────
  let basePath = '';
  for (const line of lines) {
    const bm = line.match(SPRING_CLASS_BASE_PATH);
    if (bm) {
      basePath = bm[1].startsWith('/') ? bm[1] : '/' + bm[1];
      break;
    }
  }

  // ── Pass 2: find method-level annotations ───────────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // @GetMapping / @PostMapping / @PutMapping / @PatchMapping / @DeleteMapping
    const mm = line.match(SPRING_METHOD_MAPPING);
    if (mm) {
      const httpMethod = mm[1].toLowerCase() as HttpMethod;
      const subPath = mm[2] ?? '';
      const fullPath = subPath
        ? basePath + (subPath.startsWith('/') ? subPath : '/' + subPath)
        : basePath || '/';
      addRoute(httpMethod, fullPath, i + 1);
      continue;
    }

    // @RequestMapping(path = "...", method = REQUEST_METHOD_...)
    const em = line.match(SPRING_REQUEST_MAPPING_EXPLICIT);
    if (em) {
      // Two capture group orderings depending on which comes first
      const rawPath = em[1] ?? em[4] ?? '';
      const rawMethod = (em[2] ?? em[3] ?? '').toLowerCase();
      if (rawPath && rawMethod && HTTP_METHODS.includes(rawMethod as HttpMethod)) {
        const fullPath = rawPath.startsWith('/')
          ? rawPath
          : basePath + '/' + rawPath;
        addRoute(rawMethod as HttpMethod, fullPath, i + 1);
      }
    }

    // DGS @DgsQuery / @DgsMutation — detect as POST /graphql (convention)
    const dgsQ = line.match(DGS_QUERY);
    if (dgsQ) {
      const fieldName = dgsQ[1] || findNextMethodNameInJava(lines, i);
      if (fieldName) {
        addRoute('post', '/graphql', i + 1);
      }
      continue;
    }
    const dgsM = line.match(DGS_MUTATION);
    if (dgsM) {
      const fieldName = dgsM[1] || findNextMethodNameInJava(lines, i);
      if (fieldName) {
        addRoute('post', '/graphql', i + 1);
      }
      continue;
    }

    // Spring GraphQL @QueryMapping / @MutationMapping — detect as POST /graphql
    const sqm = line.match(SPRING_QUERY_MAPPING);
    if (sqm) {
      addRoute('post', '/graphql', i + 1);
      continue;
    }
    const smm = line.match(SPRING_MUTATION_MAPPING);
    if (smm) {
      addRoute('post', '/graphql', i + 1);
      continue;
    }
  }

  return [...byKey.values()];
}

/** Find the next method name after an annotation line (for DGS/GraphQL) */
function findNextMethodNameInJava(javaLines: string[], fromLine: number): string | undefined {
  for (let j = fromLine + 1; j < Math.min(fromLine + 5, javaLines.length); j++) {
    const methodMatch = javaLines[j].match(/(?:public|private|protected|fun)\s+\S+\s+(\w+)\s*\(/);
    if (methodMatch) return methodMatch[1];
    const kotlinMatch = javaLines[j].match(/fun\s+(\w+)\s*\(/);
    if (kotlinMatch) return kotlinMatch[1];
  }
  return undefined;
}



// ─── Python / Flask / FastAPI inference ───────────────────────────────────────

/**
 * Matches Flask @app.route() and @blueprint.route() decorators.
 *   @app.route('/articles', methods=['GET', 'POST'])
 *   @blueprint.route('/articles/<slug>', methods=['PUT'])
 *   @app.route('/tags')   ← defaults to GET
 */
const FLASK_ROUTE =
  /@(\w+)\.route\s*\(\s*['"]([^'"]+)['"](?:[^\n]*?\bmethods\s*=\s*[\[(]([^\])\n]+)[\])])?/;

/**
 * Matches FastAPI decorators.
 *   @app.get('/articles')
 *   @router.post('/users')
 *   @app.delete('/articles/{slug}')
 */
const FASTAPI_ROUTE =
  /@(\w+)\.(get|post|put|patch|delete|head|options)\s*\(\s*['"]([^'"]+)['"]/i;

/**
 * Matches Flask Blueprint constructor.
 *   articles = Blueprint('articles', __name__)
 *   bp = Blueprint("users", __name__, url_prefix="/users")
 */
const FLASK_BLUEPRINT_CTOR =
  /(\w+)\s*=\s*Blueprint\s*\(\s*['"][^'"]+['"](?:\s*,\s*[^,)]+)*?(?:\s*,\s*url_prefix\s*=\s*['"]([^'"]+)['"])?\s*\)/;

/**
 * Matches FastAPI APIRouter constructor with prefix.
 *   router = APIRouter(prefix="/articles")
 */
const FASTAPI_APIROUTER =
  /(\w+)\s*=\s*APIRouter\s*\([^)]*?prefix\s*=\s*['"]([^'"]+)['"]/;

/**
 * Scan ahead for a Python `def function_name(` line following a decorator.
 * Skips additional decorator lines and stops at the first non-decorator,
 * non-blank, non-comment line that is not a def.
 */
function findPythonHandlerFunction(lines: string[], fromLine: number): string | undefined {
  for (let j = fromLine + 1; j < Math.min(fromLine + 6, lines.length); j++) {
    const m = lines[j].match(/^def\s+(\w+)\s*\(/);
    if (m) return m[1];
    // Skip decorator lines
    if (!lines[j].trim().startsWith('@') && lines[j].trim().length > 0 && !lines[j].trim().startsWith('#')) break;
  }
  return undefined;
}

/**
 * Infer routes from a Python (Flask/FastAPI) source file.
 */
function inferRoutesFromPythonFile(filePath: string): InferredRoute[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const lines = content.split('\n');
  const byKey = new Map<string, InferredRoute>();

  const addRoute = (method: HttpMethod, routePath: string, lineNumber: number, handlerFunction?: string) => {
    const key = `${method}:${routePath}`;
    if (!byKey.has(key)) {
      byKey.set(key, { method, path: routePath, handlerFunction, sourceFile: filePath, lineNumber, discoveredVia: 'code' });
    }
  };

  // Pass 1: Detect blueprint/router prefix for the file
  let localPrefix = '';
  for (const line of lines) {
    const bpMatch = line.match(FLASK_BLUEPRINT_CTOR);
    if (bpMatch && bpMatch[2]) {
      localPrefix = bpMatch[2];
      break;
    }
    const arMatch = line.match(FASTAPI_APIROUTER);
    if (arMatch && arMatch[2]) {
      localPrefix = arMatch[2];
      break;
    }
  }

  // Pass 2: Detect routes
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Flask @xxx.route('/path', methods=[...])
    const flaskMatch = line.match(FLASK_ROUTE);
    if (flaskMatch) {
      const routePath = flaskMatch[2];
      const methodsList = flaskMatch[3];
      const fullPath = localPrefix + (routePath.startsWith('/') ? routePath : '/' + routePath);
      // Normalize Flask <param> to {param}
      const normalizedPath = fullPath.replace(/<(?:\w+:)?(\w+)>/g, '{$1}');
      const handlerFn = findPythonHandlerFunction(lines, i);

      if (methodsList) {
        // Parse methods=['GET', 'POST'] or methods=('GET', 'POST') → individual routes
        const methods = methodsList.replace(/['"]/g, '').split(',').map((m) => m.trim().toLowerCase());
        for (const m of methods) {
          if (HTTP_METHODS.includes(m as HttpMethod)) {
            addRoute(m as HttpMethod, normalizedPath, i + 1, handlerFn);
          }
        }
      } else {
        // Default to GET
        addRoute('get', normalizedPath, i + 1, handlerFn);
      }
      continue;
    }

    // FastAPI @xxx.get('/path'), @xxx.post('/path'), etc.
    const fastapiMatch = line.match(FASTAPI_ROUTE);
    if (fastapiMatch) {
      const httpMethod = fastapiMatch[2].toLowerCase() as HttpMethod;
      const routePath = fastapiMatch[3];
      const fullPath = localPrefix + (routePath.startsWith('/') ? routePath : '/' + routePath);
      const handlerFn = findPythonHandlerFunction(lines, i);
      // FastAPI uses {param} natively
      addRoute(httpMethod, fullPath, i + 1, handlerFn);
      continue;
    }
  }

  return [...byKey.values()];
}



// ─── PHP / Slim inference ─────────────────────────────────────────────────────

/**
 * Matches Slim PHP route definitions:
 *   $app->get('/articles', Controller::class . ':method')
 *   $app->post('/articles/{slug}', 'Controller:method')
 *   $group->get('/articles', ArticleController::class . ':list')
 */
const SLIM_ROUTE =
  /\$\w+->(get|post|put|patch|delete|options|head)\s*\(\s*['"]([^'"]+)['"]/i;

/**
 * Matches Slim group definitions:
 *   $app->group('/api', function($group) { ... })
 *   $app->group('/api/articles', function(RouteCollectorProxy $group) { ... })
 */
const SLIM_GROUP = /\$\w+->group\s*\(\s*['"]([^'"]+)['"]/;

function inferRoutesFromPhpFile(filePath: string): InferredRoute[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const lines = content.split('\n');
  const byKey = new Map<string, InferredRoute>();

  const addRoute = (method: HttpMethod, routePath: string, lineNumber: number) => {
    const key = `${method}:${routePath}`;
    if (!byKey.has(key)) {
      byKey.set(key, { method, path: routePath, sourceFile: filePath, lineNumber, discoveredVia: 'code' });
    }
  };

  // Track group prefixes
  let groupPrefix = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Group prefix
    const groupMatch = line.match(SLIM_GROUP);
    if (groupMatch) {
      groupPrefix = groupMatch[1];
      continue;
    }

    // Route definition
    const routeMatch = line.match(SLIM_ROUTE);
    if (routeMatch) {
      const method = routeMatch[1].toLowerCase() as HttpMethod;
      const path = routeMatch[2];
      const fullPath = groupPrefix
        ? groupPrefix + (path.startsWith('/') ? path : '/' + path)
        : path;
      addRoute(method, fullPath, i + 1);
    }
  }

  return [...byKey.values()];
}



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
