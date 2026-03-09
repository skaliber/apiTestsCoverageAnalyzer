/**
 * Deep Code Analysis — Constant Resolution
 *
 * Given a token that may be a variable or constant reference, looks it up in
 * the symbol table and returns the resolved literal string value.
 */

import type { SymbolTable } from './types';
import { resolveSymbol } from './symbolTable';

/**
 * Attempt to resolve a raw argument token found in an HTTP call to a concrete
 * string value.
 *
 * Examples:
 *   resolveToken("USERS_PATH", table)  → "/users"  (when table has USERS_PATH → /users)
 *   resolveToken("'/users'", table)    → "/users"  (quoted literal, no lookup needed)
 *   resolveToken("/users", table)      → "/users"  (already a path)
 *
 * Returns undefined when the value cannot be resolved.
 */
export function resolveToken(token: string, table: SymbolTable): string | undefined {
  const trimmed = token.trim();

  // Already a quoted string literal — strip quotes
  if (/^['"`]/.test(trimmed) && /['"`]$/.test(trimmed)) {
    return trimmed.slice(1, -1);
  }

  // Already a bare path
  if (trimmed.startsWith('/')) return trimmed;

  // Dotted access: e.g. Routes.USERS, Paths.USERS_BY_ID
  if (trimmed.includes('.')) {
    const resolved = resolveSymbol(trimmed, table);
    if (resolved !== undefined) return resolved;

    // Try just the member part (Foo.BAR → look up BAR)
    const member = trimmed.split('.').pop()!;
    return resolveSymbol(member, table);
  }

  // Simple identifier
  return resolveSymbol(trimmed, table);
}

/**
 * Given an array of path fragment tokens (e.g. from a concatenation), resolve
 * each one and join them into a single path string.
 *
 * Returns undefined when any segment cannot be resolved to a string.
 */
export function resolveFragments(fragments: string[], table: SymbolTable): string | undefined {
  const parts: string[] = [];
  for (const frag of fragments) {
    const resolved = resolveToken(frag.trim(), table);
    if (resolved === undefined) return undefined;
    parts.push(resolved);
  }
  return parts.join('');
}

/**
 * Scan source content for all constant/variable assignments with string literal
 * values and return the discovered symbol names along with their raw values as
 * a simple Record<string, string>.
 *
 * This utility is used by tests to inspect resolution results without going through
 * the full symbol table builder.
 */
export function extractStringConstants(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  // TypeScript/JavaScript: const/let/var NAME = 'value'
  const jsPattern = /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*['"`]([^'"`\n]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = jsPattern.exec(content)) !== null) {
    result[m[1]] = m[2];
  }

  // Java/Kotlin: String/val NAME = "value"
  const javaPattern = /\bString\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"\n]+)"/g;
  while ((m = javaPattern.exec(content)) !== null) {
    result[m[1]] = m[2];
  }
  const kotlinPattern = /\b(?:const\s+)?val\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']([^"'\n]+)["']/g;
  while ((m = kotlinPattern.exec(content)) !== null) {
    result[m[1]] = m[2];
  }

  // Python: NAME = 'value'
  const pyPattern = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*['"]([^'"\n]+)['"]/gm;
  while ((m = pyPattern.exec(content)) !== null) {
    result[m[1]] = m[2];
  }

  return result;
}
