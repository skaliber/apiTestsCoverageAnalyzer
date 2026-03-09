/**
 * Deep Code Analysis — Request Object and Builder Pattern Resolution
 *
 * Detects and resolves HTTP calls that are hidden inside request object
 * construction or builder patterns.
 *
 * Supported patterns:
 *
 * TypeScript/JavaScript:
 *   const request = new ApiRequest('GET', '/users');
 *   client.execute(request);
 *
 * Java:
 *   Request req = Request.builder().method(GET).path("/users").build();
 *   client.execute(req);
 *
 * Kotlin:
 *   val req = RequestBuilder().get().path("/users").build()
 *   api.execute(req)
 *
 * Python:
 *   request = ApiRequest(method='GET', path='/users')
 *   client.execute(request)
 */

import type { SymbolTable } from './types';
import { normalizePathToTemplate } from './resolvePaths';
import { resolveToken } from './resolveConstants';

export interface RequestObjectCall {
  method: string;
  path: string;
  normalizedPath?: string;
  confidence: 'high' | 'medium' | 'low';
  pattern: string;
}

// ─── TypeScript / JavaScript ──────────────────────────────────────────────────

/**
 * Extract HTTP calls from TypeScript/JavaScript request object and builder patterns.
 *
 * Detects:
 *   new ApiRequest('GET', '/users')
 *   new Request({ method: 'GET', url: '/users' })
 *   ApiRequest.create({ method: 'get', path: '/users' })
 */
export function extractJsRequestBuilders(
  content: string,
  table: SymbolTable,
): RequestObjectCall[] {
  const calls: RequestObjectCall[] = [];
  let m: RegExpExecArray | null;

  // new SomeRequest('METHOD', '/path')
  const ctorPattern =
    /new\s+[A-Za-z][A-Za-z0-9_]*Request\s*\(\s*['"`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)[`'"]\s*,\s*['"`]([^'"`]+)['"`]/gi;
  while ((m = ctorPattern.exec(content)) !== null) {
    const path = resolveToken(m[2], table) ?? m[2];
    const normalized = normalizePathToTemplate(path);
    calls.push({
      method: m[1].toUpperCase(),
      path,
      normalizedPath: normalized !== path ? normalized : undefined,
      confidence: 'high',
      pattern: 'constructor(method, path)',
    });
  }

  // { method: 'GET', url: '/path' } or { method: 'GET', path: '/path' }
  const objLiteralPattern =
    /\{\s*(?:method|verb)\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)['"`]\s*,\s*(?:url|path|endpoint)\s*:\s*['"`]([^'"`]+)['"`]/gi;
  while ((m = objLiteralPattern.exec(content)) !== null) {
    const path = resolveToken(m[2], table) ?? m[2];
    const normalized = normalizePathToTemplate(path);
    calls.push({
      method: m[1].toUpperCase(),
      path,
      normalizedPath: normalized !== path ? normalized : undefined,
      confidence: 'high',
      pattern: 'object literal {method, path}',
    });
  }

  // fetch('/path', { method: 'POST' })
  const fetchPattern =
    /\bfetch\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*\{[^}]*(?:method|verb)\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)['"`]/gi;
  while ((m = fetchPattern.exec(content)) !== null) {
    const path = resolveToken(m[1], table) ?? m[1];
    const normalized = normalizePathToTemplate(path);
    calls.push({
      method: m[2].toUpperCase(),
      path,
      normalizedPath: normalized !== path ? normalized : undefined,
      confidence: 'high',
      pattern: 'fetch(url, {method})',
    });
  }

  return calls;
}

// ─── Java ─────────────────────────────────────────────────────────────────────

/**
 * Extract HTTP calls from Java builder patterns.
 *
 * Detects:
 *   Request.builder().method(HttpMethod.GET).path("/users").build()
 *   new HttpRequest.Builder().uri("/users").method("GET", ...).build()
 *   MockMvcRequestBuilders.get("/users")
 */
export function extractJavaRequestBuilders(
  content: string,
  table: SymbolTable,
): RequestObjectCall[] {
  const calls: RequestObjectCall[] = [];
  let m: RegExpExecArray | null;

  // .method(GET|HttpMethod.GET|"GET").path("/users") or reversed
  const builderMethodPath =
    /\.method\s*\(\s*(?:HttpMethod\.)?["']?(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["']?\s*[,)][^;]*\.(?:path|uri)\s*\(\s*"([^"]+)"/gi;
  while ((m = builderMethodPath.exec(content)) !== null) {
    const path = resolveToken(m[2], table) ?? m[2];
    const normalized = normalizePathToTemplate(path);
    calls.push({
      method: m[1].toUpperCase(),
      path,
      normalizedPath: normalized !== path ? normalized : undefined,
      confidence: 'high',
      pattern: 'builder .method().path()',
    });
  }

  // .path("/users").method("GET") reversed order
  const builderPathMethod =
    /\.(?:path|uri)\s*\(\s*"([^"]+)"\s*\)[^;]*\.method\s*\(\s*(?:HttpMethod\.)?["']?(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/gi;
  while ((m = builderPathMethod.exec(content)) !== null) {
    const path = resolveToken(m[1], table) ?? m[1];
    const normalized = normalizePathToTemplate(path);
    calls.push({
      method: m[2].toUpperCase(),
      path,
      normalizedPath: normalized !== path ? normalized : undefined,
      confidence: 'high',
      pattern: 'builder .path().method()',
    });
  }

  return calls;
}

// ─── Kotlin ───────────────────────────────────────────────────────────────────

/**
 * Extract HTTP calls from Kotlin builder patterns.
 *
 * Detects:
 *   RequestBuilder().get().path("/users").build()
 *   val req = RequestBuilder().method("GET").path("/users").build()
 */
export function extractKotlinRequestBuilders(
  content: string,
  table: SymbolTable,
): RequestObjectCall[] {
  const calls: RequestObjectCall[] = [];
  let m: RegExpExecArray | null;

  // .get().path("/users") — method via chain method name
  const chainPattern =
    /\.(get|post|put|patch|delete|head|options)\s*\(\s*\)\s*\.path\s*\(\s*["']([^"']+)["']/gi;
  while ((m = chainPattern.exec(content)) !== null) {
    const path = resolveToken(m[2], table) ?? m[2];
    const normalized = normalizePathToTemplate(path);
    calls.push({
      method: m[1].toUpperCase(),
      path,
      normalizedPath: normalized !== path ? normalized : undefined,
      confidence: 'high',
      pattern: 'builder .method().path()',
    });
  }

  // .method("GET").path("/users")
  const methodPathPattern =
    /\.method\s*\(\s*["']?(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["']?\s*\)\s*\.path\s*\(\s*["']([^"']+)["']/gi;
  while ((m = methodPathPattern.exec(content)) !== null) {
    const path = resolveToken(m[2], table) ?? m[2];
    const normalized = normalizePathToTemplate(path);
    calls.push({
      method: m[1].toUpperCase(),
      path,
      normalizedPath: normalized !== path ? normalized : undefined,
      confidence: 'high',
      pattern: 'builder .method().path()',
    });
  }

  return calls;
}

// ─── Python ───────────────────────────────────────────────────────────────────

/**
 * Extract HTTP calls from Python request object patterns.
 *
 * Detects:
 *   ApiRequest(method='GET', path='/users')
 *   requests.Request('GET', '/users')
 */
export function extractPythonRequestBuilders(
  content: string,
  table: SymbolTable,
): RequestObjectCall[] {
  const calls: RequestObjectCall[] = [];
  let m: RegExpExecArray | null;

  // ApiRequest(method='GET', path='/users')
  const kwPattern =
    /\w+\s*\(\s*method\s*=\s*['"`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)['"`]\s*,\s*(?:path|url|endpoint)\s*=\s*['"`]([^'"`]+)['"`]/gi;
  while ((m = kwPattern.exec(content)) !== null) {
    const path = resolveToken(m[2], table) ?? m[2];
    const normalized = normalizePathToTemplate(path);
    calls.push({
      method: m[1].toUpperCase(),
      path,
      normalizedPath: normalized !== path ? normalized : undefined,
      confidence: 'high',
      pattern: 'Request(method=, path=)',
    });
  }

  // requests.Request('GET', 'http://host/path')
  const posPattern =
    /requests\.Request\s*\(\s*['"`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)['"`]\s*,\s*['"`]([^'"`]+)['"`]/gi;
  while ((m = posPattern.exec(content)) !== null) {
    const path = resolveToken(m[2], table) ?? m[2];
    const normalized = normalizePathToTemplate(path);
    calls.push({
      method: m[1].toUpperCase(),
      path,
      normalizedPath: normalized !== path ? normalized : undefined,
      confidence: 'high',
      pattern: 'requests.Request(method, url)',
    });
  }

  return calls;
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Extract request builder / request object HTTP calls for any supported language.
 */
export function extractRequestBuilders(
  content: string,
  language: string,
  table: SymbolTable,
): RequestObjectCall[] {
  switch (language) {
    case 'java':
      return extractJavaRequestBuilders(content, table);
    case 'kotlin':
      return [...extractKotlinRequestBuilders(content, table), ...extractJavaRequestBuilders(content, table)];
    case 'python':
      return extractPythonRequestBuilders(content, table);
    case 'typescript':
    case 'javascript':
    default:
      return extractJsRequestBuilders(content, table);
  }
}
