/**
 * Deep Code Analysis — Symbol Table
 *
 * Extracts named symbols (constants, variables, enum members) from source
 * file content across all supported languages and builds a per-file symbol
 * table for downstream resolvers.
 */

import type { SymbolEntry, SymbolTable } from './types';

// ─── TypeScript / JavaScript ──────────────────────────────────────────────────

/**
 * Extract symbols from TypeScript/JavaScript source.
 *
 * Captures:
 *   - const NAME = 'value'   (top-level and local)
 *   - let NAME = 'value'
 *   - var NAME = 'value'
 *   - enum Foo { MEMBER = 'value' }  (string enums)
 *   - const obj = { key: 'value' }  — top-level object property literals
 */
export function buildSymbolTableFromJs(content: string): SymbolTable {
  const table: SymbolTable = new Map();

  // Simple const/let/var assignments with a string literal value
  const varPattern = /\b(const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*['"`]([^'"`\n]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = varPattern.exec(content)) !== null) {
    const [, kind, name, value] = m;
    table.set(name, {
      name,
      kind: kind === 'const' ? 'const' : kind === 'let' ? 'let' : 'var',
      value,
    });
  }

  // TypeScript string enum members: enum Routes { USERS = '/users' }
  const enumPattern = /\benum\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\{([^}]+)\}/g;
  while ((m = enumPattern.exec(content)) !== null) {
    const enumName = m[1];
    const body = m[2];
    const memberPattern = /([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*['"`]([^'"`\n]+)['"`]/g;
    let mm: RegExpExecArray | null;
    while ((mm = memberPattern.exec(body)) !== null) {
      const [, member, value] = mm;
      // Register as both Routes.USERS and bare USERS
      table.set(`${enumName}.${member}`, { name: `${enumName}.${member}`, kind: 'enum', value });
      table.set(member, { name: member, kind: 'enum', value });
    }
  }

  // Object literal properties: const Paths = { USERS: '/users', ... }
  const objPattern = /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*\{([^}]+)\}/g;
  while ((m = objPattern.exec(content)) !== null) {
    const objName = m[1];
    const body = m[2];
    const propPattern = /([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*['"`]([^'"`\n]+)['"`]/g;
    let mm: RegExpExecArray | null;
    while ((mm = propPattern.exec(body)) !== null) {
      const [, prop, value] = mm;
      table.set(`${objName}.${prop}`, { name: `${objName}.${prop}`, kind: 'property', value });
      // Don't register bare property names to avoid collisions
    }
  }

  return table;
}

// ─── Java ─────────────────────────────────────────────────────────────────────

/**
 * Extract symbols from Java source.
 *
 * Captures:
 *   - static final String NAME = "value";
 *   - final String NAME = "value";
 *   - String NAME = "value";
 *   - enum Routes { USERS("/users"), ... }  (constructor-style enums)
 */
export function buildSymbolTableFromJava(content: string): SymbolTable {
  const table: SymbolTable = new Map();

  // Static/final string constants
  const constPattern =
    /(?:(?:private|public|protected|package)\s+)?(?:static\s+)?(?:final\s+)?String\s+([A-Z_][A-Z0-9_]*)\s*=\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = constPattern.exec(content)) !== null) {
    table.set(m[1], { name: m[1], kind: 'const', value: m[2] });
  }

  // Camel-case constants too (e.g. private static final String basePath = "/api")
  const camelPattern =
    /(?:(?:private|public|protected|package)\s+)?(?:static\s+)?(?:final\s+)?String\s+([a-z][A-Za-z0-9_]*)\s*=\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  while ((m = camelPattern.exec(content)) !== null) {
    if (!table.has(m[1])) {
      table.set(m[1], { name: m[1], kind: 'const', value: m[2] });
    }
  }

  // Enum constructor style: USERS("/users")
  const enumBlock = /enum\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([^}]+)\}/g;
  while ((m = enumBlock.exec(content)) !== null) {
    const enumName = m[1];
    const body = m[2];
    const memberPattern = /([A-Z_][A-Z0-9_]*)\s*\(\s*"([^"]+)"/g;
    let mm: RegExpExecArray | null;
    while ((mm = memberPattern.exec(body)) !== null) {
      const [, member, value] = mm;
      table.set(`${enumName}.${member}`, { name: `${enumName}.${member}`, kind: 'enum', value });
      table.set(member, { name: member, kind: 'enum', value });
    }
  }

  return table;
}

// ─── Kotlin ───────────────────────────────────────────────────────────────────

/**
 * Extract symbols from Kotlin source.
 *
 * Captures:
 *   - const val NAME = "value"
 *   - val NAME = "value"
 *   - enum class Routes(val path: String) { USERS("/users"), ... }
 *   - object Constants { const val NAME = "value" }
 */
export function buildSymbolTableFromKotlin(content: string): SymbolTable {
  const table: SymbolTable = new Map();

  // const val and val string assignments
  const valPattern = /\b(?:const\s+)?val\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']([^"'\n]+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = valPattern.exec(content)) !== null) {
    table.set(m[1], { name: m[1], kind: 'const', value: m[2] });
  }

  // Kotlin enum class with constructor argument: USERS("/users")
  const enumBlock = /enum\s+class\s+([A-Za-z_][A-Za-z0-9_]*)[^{]*\{([^}]+)\}/gs;
  while ((m = enumBlock.exec(content)) !== null) {
    const enumName = m[1];
    const body = m[2];
    const memberPattern = /([A-Z_][A-Z0-9_]*)\s*\(\s*["']([^"']+)["']/g;
    let mm: RegExpExecArray | null;
    while ((mm = memberPattern.exec(body)) !== null) {
      const [, member, value] = mm;
      table.set(`${enumName}.${member}`, { name: `${enumName}.${member}`, kind: 'enum', value });
      table.set(member, { name: member, kind: 'enum', value });
    }
  }

  // Kotlin object/companion object property: object Routes { const val USERS = "/users" }
  const objectBlock = /(?:companion\s+)?object\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([^}]+)\}/g;
  while ((m = objectBlock.exec(content)) !== null) {
    const objName = m[1];
    const body = m[2];
    const propPattern = /\b(?:const\s+)?val\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']([^"'\n]+)["']/g;
    let mm: RegExpExecArray | null;
    while ((mm = propPattern.exec(body)) !== null) {
      const [, prop, value] = mm;
      table.set(`${objName}.${prop}`, { name: `${objName}.${prop}`, kind: 'property', value });
      if (!table.has(prop)) {
        table.set(prop, { name: prop, kind: 'const', value });
      }
    }
  }

  return table;
}

// ─── Python ───────────────────────────────────────────────────────────────────

/**
 * Extract symbols from Python source.
 *
 * Captures:
 *   - UPPER_CASE = "/path"   (module-level constants)
 *   - class Routes(Enum): USERS = "/users"
 */
export function buildSymbolTableFromPython(content: string): SymbolTable {
  const table: SymbolTable = new Map();

  // Module-level UPPER_CASE constants
  const constPattern = /^([A-Z_][A-Z0-9_]*)\s*=\s*['"]([^'"\n]+)['"]/gm;
  let m: RegExpExecArray | null;
  while ((m = constPattern.exec(content)) !== null) {
    table.set(m[1], { name: m[1], kind: 'const', value: m[2] });
  }

  // Also capture lower-case module-level string assignments
  const lowerPattern = /^([a-z_][a-z0-9_]*)\s*=\s*['"]([^'"\n]+)['"]/gm;
  while ((m = lowerPattern.exec(content)) !== null) {
    if (!table.has(m[1])) {
      table.set(m[1], { name: m[1], kind: 'let', value: m[2] });
    }
  }

  // Enum class members: class Routes(Enum):\n    USERS = "/users"
  const enumBlock = /class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*Enum[^)]*\)\s*:\s*((?:\n[ \t]+[A-Z_][A-Z0-9_]*\s*=\s*['"][^'"]+['"]\s*)+)/g;
  while ((m = enumBlock.exec(content)) !== null) {
    const enumName = m[1];
    const body = m[2];
    const memberPattern = /([A-Z_][A-Z0-9_]*)\s*=\s*['"]([^'"]+)['"]/g;
    let mm: RegExpExecArray | null;
    while ((mm = memberPattern.exec(body)) !== null) {
      const [, member, value] = mm;
      table.set(`${enumName}.${member}`, { name: `${enumName}.${member}`, kind: 'enum', value });
      table.set(member, { name: member, kind: 'enum', value });
    }
  }

  return table;
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Build a symbol table from source content for the given language.
 */
export function buildSymbolTable(
  content: string,
  language: 'typescript' | 'javascript' | 'java' | 'kotlin' | 'python' | 'ruby' | 'cucumber' | 'auto',
): SymbolTable {
  switch (language) {
    case 'java':
      return buildSymbolTableFromJava(content);
    case 'kotlin':
      return buildSymbolTableFromKotlin(content);
    case 'python':
      return buildSymbolTableFromPython(content);
    case 'typescript':
    case 'javascript':
    case 'auto':
    default:
      return buildSymbolTableFromJs(content);
  }
}

/**
 * Resolve a symbol name to its string value using the table.
 * Returns undefined when the symbol is not found or has no static value.
 * Prevents infinite loops via a resolving guard flag.
 */
export function resolveSymbol(name: string, table: SymbolTable): string | undefined {
  const entry = table.get(name);
  if (!entry || entry.resolving) return undefined;
  if (entry.value !== undefined) return entry.value;
  return undefined;
}
