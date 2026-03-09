/**
 * Deep Code Analysis — Method Chain Resolution
 *
 * Traces method calls to helper/wrapper functions within the same file,
 * following the call graph up to a configurable depth.
 *
 * Also detects builder-style method chains that resolve to HTTP calls.
 *
 * Supported patterns:
 *
 * TypeScript/JavaScript:
 *   function getUsers(client) { return client.get('/users'); }
 *   getUsers(apiClient);  → GET /users
 *
 * Java:
 *   private Response fetchUser(String id) { return api.get("/users/" + id); }
 *   fetchUser(userId);  → GET /users/{id}
 *
 * Python:
 *   def fetch_customer(customer_id): return client.get(build_path(customer_id))
 */

import type { CallGraph, ResolvedHttpCall } from './types';
import { normalizePathToTemplate } from './resolvePaths';
import type { SymbolTable } from './types';
import { resolveToken } from './resolveConstants';

// ─── Wrapper method resolution ────────────────────────────────────────────────

/**
 * Given a function call expression like `getUsers(apiClient)`, look up the
 * callee in the call graph, recurse into its body (up to maxDepth), and return
 * any HTTP calls found inside.
 */
export function resolveWrapperCall(
  callee: string,
  graph: CallGraph,
  table: SymbolTable,
  sourceFile: string,
  sourceLanguage: string,
  maxDepth: number,
  currentDepth = 0,
): ResolvedHttpCall[] {
  if (currentDepth >= maxDepth) return [];
  const node = graph.get(callee);
  if (!node) return [];

  const results: ResolvedHttpCall[] = [];

  // Direct HTTP calls found inside this function body
  for (const { method, path } of node.directHttpCalls) {
    const normalized = normalizePathToTemplate(path);
    results.push({
      method,
      path,
      normalizedPath: normalized !== path ? normalized : undefined,
      sourceFile,
      sourceLanguage,
      resolutionType: 'wrapper-method',
      confidence: 'high',
    });
  }

  // HTTP calls found by resolving the return value as a path
  if (node.returnValue) {
    // If the function returns a path string, it may be used inside a call
    // that's resolved by the caller. Nothing to add here directly.
  }

  // Recurse into called local functions
  for (const calledName of node.calls) {
    const nested = resolveWrapperCall(
      calledName,
      graph,
      table,
      sourceFile,
      sourceLanguage,
      maxDepth,
      currentDepth + 1,
    );
    for (const call of nested) {
      results.push({ ...call, resolutionType: 'wrapper-method', confidence: currentDepth === 0 ? 'high' : 'medium' });
    }
  }

  return results;
}

/**
 * Resolve the path returned by a helper function when it is passed as the
 * argument to an HTTP call.
 *
 * Example: client.get(getUserPath(userId))
 *   → getUserPath is in the call graph, returns `/users/${userId}`
 *   → normalized: /users/{id}
 */
export function resolveHelperReturnPath(
  calleeName: string,
  graph: CallGraph,
  table: SymbolTable,
  maxDepth: number,
  currentDepth = 0,
): string | undefined {
  if (currentDepth >= maxDepth) return undefined;
  const node = graph.get(calleeName);
  if (!node) return undefined;

  // Direct return value
  if (node.returnValue !== undefined) {
    // Resolve any constants in the return value
    const resolved = resolveToken(node.returnValue, table);
    return resolved ?? node.returnValue;
  }

  // If the function body contains a template literal return
  const templateReturn = /return\s+`([^`]+)`/.exec(node.body);
  if (templateReturn) {
    return templateReturn[1];
  }

  // Recurse: if this function itself calls another helper that returns a path
  for (const called of node.calls) {
    const nested = resolveHelperReturnPath(called, graph, table, maxDepth, currentDepth + 1);
    if (nested !== undefined) return nested;
  }

  return undefined;
}

// ─── Python path builder detection ───────────────────────────────────────────

/**
 * Detect calls to local helper functions inside HTTP call argument positions
 * in Python source.
 *
 * Example:
 *   client.get(build_customer_path(customer_id))
 *   → extracts 'build_customer_path' as a path-builder call
 */
export function extractPythonHelperCallsInHttpArgs(
  content: string,
): Array<{ method: string; helperName: string }> {
  const calls: Array<{ method: string; helperName: string }> = [];

  // Pattern: .get(helper_name(...)  or requests.get(helper_name(...))
  const pattern =
    /\b(?:client|self\.client|requests|httpx)\.(get|post|put|patch|delete|head|options)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), helperName: m[2] });
  }

  return calls;
}

/**
 * Detect calls to local helper functions inside HTTP call argument positions
 * in TypeScript/JavaScript source.
 *
 * Example:
 *   client.get(getUserPath(userId))
 */
export function extractJsHelperCallsInHttpArgs(
  content: string,
): Array<{ method: string; helperName: string }> {
  const calls: Array<{ method: string; helperName: string }> = [];

  const pattern =
    /\.(get|post|put|patch|delete|head|options)\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), helperName: m[2] });
  }

  return calls;
}

/**
 * Detect calls to local helper functions inside HTTP call argument positions
 * in Java/Kotlin source.
 */
export function extractJavaHelperCallsInHttpArgs(
  content: string,
): Array<{ method: string; helperName: string }> {
  const calls: Array<{ method: string; helperName: string }> = [];

  // api.get(userPath(id)) or client.get(buildPath(id))
  const pattern =
    /\.(get|post|put|patch|delete|head|options)\s*\(\s*([a-z][A-Za-z0-9_]*)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), helperName: m[2] });
  }

  return calls;
}
