/**
 * Deep Code Analysis — Enum Resolution
 *
 * Resolves enum member references used as endpoint path arguments across all
 * supported languages.
 *
 * Supported patterns:
 *
 * TypeScript:
 *   enum Routes { USERS = '/users' }
 *   client.get(Routes.USERS)  →  GET /users
 *
 * Java:
 *   enum Routes { USERS("/users"); ... }
 *   api.get(Routes.USERS.getPath())  →  GET /users
 *
 * Kotlin:
 *   enum class Routes(val path: String) { USERS("/users") }
 *   client.get(Routes.USERS.path)  →  GET /users
 *
 * Python:
 *   class Routes(Enum): USERS = "/users"
 *   client.get(Routes.USERS.value)  →  GET /users
 */

import type { SymbolTable } from './types';
import { resolveSymbol } from './symbolTable';

/**
 * Attempt to resolve an enum reference token to its literal path value.
 *
 * The token may be in any of these forms:
 *   Routes.USERS
 *   Routes.USERS.path  (Kotlin)
 *   Routes.USERS.value  (Python)
 *   Routes.USERS.getPath()  (Java)
 */
export function resolveEnumToken(token: string, table: SymbolTable): string | undefined {
  const t = token.trim();

  // Direct table lookup (handles Routes.USERS and bare USERS)
  const direct = resolveSymbol(t, table);
  if (direct !== undefined) return direct;

  // Strip trailing .path, .value, .getPath(), .name, .ordinal()
  const withoutSuffix = t.replace(/\.(path|value|getPath\(\)|name|ordinal\(\)|get[A-Za-z]+\(\))$/, '');
  if (withoutSuffix !== t) {
    const resolved = resolveSymbol(withoutSuffix, table);
    if (resolved !== undefined) return resolved;

    // Try just the member (last segment before stripped suffix)
    const parts = withoutSuffix.split('.');
    if (parts.length >= 2) {
      const member = parts[parts.length - 1];
      const resolved2 = resolveSymbol(member, table);
      if (resolved2 !== undefined) return resolved2;

      // Try Enum.MEMBER compound
      const compound = parts.slice(-2).join('.');
      const resolved3 = resolveSymbol(compound, table);
      if (resolved3 !== undefined) return resolved3;
    }
  }

  return undefined;
}

/**
 * Extract all enum declarations from TypeScript/JavaScript source and return
 * a map of EnumName.MEMBER → value.
 */
export function extractTsEnumValues(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Allow {param} segments inside enum body strings (e.g. "/users/{id}")
  const enumPattern = /\benum\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\{((?:[^{}]|\{[^}]*\})*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = enumPattern.exec(content)) !== null) {
    const enumName = m[1];
    const body = m[2];
    const memberPattern = /([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*['"`]([^'"`\n]+)['"`]/g;
    let mm: RegExpExecArray | null;
    while ((mm = memberPattern.exec(body)) !== null) {
      result[`${enumName}.${mm[1]}`] = mm[2];
      result[mm[1]] = mm[2];
    }
  }
  return result;
}

/**
 * Extract all enum values from Java source.
 * Supports constructor-style enums: MEMBER("value")
 */
export function extractJavaEnumValues(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Allow {param} segments inside enum body strings (e.g. "/users/{id}")
  const enumBlock = /enum\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:implements[^{]*)?\{((?:[^{}]|\{[^}]*\})*)\}/gs;
  let m: RegExpExecArray | null;
  while ((m = enumBlock.exec(content)) !== null) {
    const enumName = m[1];
    const body = m[2];
    const memberPattern = /([A-Z_][A-Z0-9_]*)\s*\(\s*"([^"]+)"/g;
    let mm: RegExpExecArray | null;
    while ((mm = memberPattern.exec(body)) !== null) {
      result[`${enumName}.${mm[1]}`] = mm[2];
      result[mm[1]] = mm[2];
    }
  }
  return result;
}

/**
 * Extract all enum values from Kotlin source.
 */
export function extractKotlinEnumValues(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const enumBlock = /enum\s+class\s+([A-Za-z_][A-Za-z0-9_]*)[^{]*\{([^}]+)\}/gs;
  let m: RegExpExecArray | null;
  while ((m = enumBlock.exec(content)) !== null) {
    const enumName = m[1];
    const body = m[2];
    const memberPattern = /([A-Z_][A-Z0-9_]*)\s*\(\s*["']([^"']+)["']/g;
    let mm: RegExpExecArray | null;
    while ((mm = memberPattern.exec(body)) !== null) {
      result[`${enumName}.${mm[1]}`] = mm[2];
      result[mm[1]] = mm[2];
    }
  }
  return result;
}

/**
 * Extract all enum values from Python source.
 * Supports class Routes(Enum): MEMBER = "value"
 */
export function extractPythonEnumValues(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Note: no \s* after colon — the \n must be left for the body group to match
  // Use [ \t]* (not \s*) for trailing whitespace to avoid consuming next line's \n
  const enumBlock =
    /class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*Enum[^)]*\):((?:\n[ \t]+[A-Z_][A-Z0-9_]*\s*=\s*['"][^'"]+['"][ \t]*)+)/g;
  let m: RegExpExecArray | null;
  while ((m = enumBlock.exec(content)) !== null) {
    const enumName = m[1];
    const body = m[2];
    const memberPattern = /([A-Z_][A-Z0-9_]*)\s*=\s*['"]([^'"]+)['"]/g;
    let mm: RegExpExecArray | null;
    while ((mm = memberPattern.exec(body)) !== null) {
      result[`${enumName}.${mm[1]}`] = mm[2];
      result[mm[1]] = mm[2];
    }
  }
  return result;
}
