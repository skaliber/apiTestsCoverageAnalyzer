/**
 * Deep Code Analysis — Path Resolution and Normalization
 *
 * Resolves endpoint paths built from:
 *   - Template literals: `${BASE}/users/${id}`
 *   - String concatenation: BASE + "/users/" + id
 *   - Java/Kotlin string concatenation: BASE + "/users/" + id
 *   - Python f-strings: f"{BASE}/users/{user_id}"
 *   - Ruby interpolation: "#{BASE}/users/#{id}"
 *
 * Also normalizes concrete paths or partially concrete paths to OpenAPI-style
 * path templates: /users/123 → /users/{id}
 */

import type { SymbolTable } from './types';
import { resolveToken } from './resolveConstants';

// ─── Template literal resolution (TypeScript/JavaScript) ──────────────────────

/**
 * Attempt to resolve a JavaScript/TypeScript template literal to a partial or
 * complete path string.
 *
 * Input:  `${BASE_URL}/users/${userId}`
 * Output: /users/${userId}  (if BASE_URL is known) or
 *         /users/{userId}   (normalized)
 */
export function resolveTemplateLiteral(template: string, table: SymbolTable): string {
  // Replace ${IDENTIFIER} with their resolved value or a path parameter placeholder
  return template.replace(/\$\{([^}]+)\}/g, (_match, expr) => {
    const resolved = resolveToken(expr.trim(), table);
    if (resolved !== undefined) {
      // If it resolved to a URL base, strip the scheme+host
      return stripUrlBase(resolved);
    }
    // Unknown identifer — treat as a path parameter
    return `{${expr.trim()}}`;
  });
}

/**
 * Resolve a string concatenation expression like:
 *   BASE + "/users/" + id
 *   BASE_URL + RESOURCE_PATH
 *
 * Splits on `+` and resolves each token, then joins.
 * Tokens that cannot be resolved are treated as path parameters.
 */
export function resolveStringConcatenation(expr: string, table: SymbolTable): string {
  const fragments = expr.split(/\s*\+\s*/);
  const parts: string[] = [];

  for (const frag of fragments) {
    const trimmed = frag.trim();
    if (!trimmed) continue;

    // Quoted literal
    if (/^['"`]/.test(trimmed)) {
      parts.push(trimmed.slice(1, -1));
      continue;
    }

    const resolved = resolveToken(trimmed, table);
    if (resolved !== undefined) {
      parts.push(stripUrlBase(resolved));
    } else {
      // Identifier with unknown value → path parameter
      parts.push(`{${trimmed}}`);
    }
  }

  return parts.join('');
}

/**
 * Resolve a Java string concatenation (also uses + operator).
 * Functionally identical to resolveStringConcatenation but handles Java
 * specific quoted strings (double quotes only).
 */
export function resolveJavaConcatenation(expr: string, table: SymbolTable): string {
  const fragments = expr.split(/\s*\+\s*/);
  const parts: string[] = [];

  for (const frag of fragments) {
    const trimmed = frag.trim();
    if (!trimmed) continue;

    if (/^"[^"]*"$/.test(trimmed)) {
      parts.push(trimmed.slice(1, -1));
      continue;
    }

    const resolved = resolveToken(trimmed, table);
    if (resolved !== undefined) {
      parts.push(stripUrlBase(resolved));
    } else {
      parts.push(`{${trimmed}}`);
    }
  }

  return parts.join('');
}

/**
 * Resolve a Python f-string: f"{BASE_URL}/users/{user_id}"
 *
 * Input (without the f prefix and outer quotes): {BASE_URL}/users/{user_id}
 */
export function resolvePythonFString(template: string, table: SymbolTable): string {
  return template.replace(/\{([^}]+)\}/g, (_match, expr) => {
    const resolved = resolveToken(expr.trim(), table);
    if (resolved !== undefined) {
      return stripUrlBase(resolved);
    }
    return `{${expr.trim()}}`;
  });
}

/**
 * Resolve a Ruby string interpolation: "#{BASE_URL}/users/#{id}"
 */
export function resolveRubyInterpolation(template: string, table: SymbolTable): string {
  return template.replace(/#\{([^}]+)\}/g, (_match, expr) => {
    const resolved = resolveToken(expr.trim(), table);
    if (resolved !== undefined) {
      return stripUrlBase(resolved);
    }
    return `{${expr.trim()}}`;
  });
}

// ─── Path normalization ───────────────────────────────────────────────────────

/**
 * Normalize a concrete or partially-concrete path to an OpenAPI path template.
 *
 * Rules:
 *   - UUID-like segments → {id}
 *   - Purely numeric IDs → {id}
 *   - Variable-looking segments like {variable} are kept as-is
 *   - Short alpha-numeric slugs that look like IDs (>= 8 hex chars) → {id}
 *
 * Examples:
 *   /users/123            → /users/{id}
 *   /users/abc-def-456    → /users/{id}
 *   /users/123/orders/9   → /users/{id}/orders/{id}
 *   /accounts/{accountId} → /accounts/{accountId}  (already a template)
 */
export function normalizePathToTemplate(rawPath: string): string {
  return rawPath
    .split('/')
    .map((segment) => {
      if (!segment) return segment;
      // Already a template parameter
      if (/^\{.+\}$/.test(segment)) return segment;
      // Purely numeric
      if (/^\d+$/.test(segment)) return '{id}';
      // UUID
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return '{id}';
      // Long hex / alphanumeric slug (>= 8 chars, looks like an ID, not a resource word)
      if (/^[0-9a-f]{8,}$/i.test(segment) && !/^[a-z]+$/i.test(segment)) return '{id}';
      // Mixed alphanumeric that looks like a slug: abc-123, def_456
      if (/^[a-z0-9]+-[a-z0-9-]+$/i.test(segment) && /\d/.test(segment)) return '{id}';
      return segment;
    })
    .join('/');
}

// ─── Extraction helpers ───────────────────────────────────────────────────────

/**
 * Detect and extract template literals that may contain a path.
 * Returns all template literal strings found in the content that look path-like.
 */
export function extractTemplateLiterals(content: string): string[] {
  const results: string[] = [];
  // Template literals that contain at least one /
  const pattern = /`([^`]*\/[^`]*)`/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(content)) !== null) {
    if (!m[1].includes('\n')) {
      results.push(m[1]);
    }
  }
  return results;
}

/**
 * Detect and extract Python f-string paths.
 * Returns the inner template strings.
 */
export function extractPythonFStrings(content: string): string[] {
  const results: string[] = [];
  const pattern = /f['"]([^'"]*\/[^'"]*)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(content)) !== null) {
    results.push(m[1]);
  }
  return results;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Strip the scheme and host from a fully qualified URL, returning just the path.
 * If the input already looks like a path or a template variable, return it unchanged.
 */
export function stripUrlBase(value: string): string {
  if (value.startsWith('/') || value.startsWith('{')) return value;
  try {
    const url = new URL(value);
    return url.pathname;
  } catch {
    return value;
  }
}
