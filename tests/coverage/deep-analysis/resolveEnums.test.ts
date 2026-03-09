/**
 * Unit tests for enum value extraction and resolution.
 *
 * Coverage:
 *   resolveEnumToken
 *   extractTsEnumValues
 *   extractJavaEnumValues
 *   extractKotlinEnumValues
 *   extractPythonEnumValues
 */

import {
  resolveEnumToken,
  extractTsEnumValues,
  extractJavaEnumValues,
  extractKotlinEnumValues,
  extractPythonEnumValues,
} from '../../../src/coverage/deep-analysis/resolveEnums';
import { buildSymbolTableFromJs, buildSymbolTableFromJava, buildSymbolTableFromKotlin, buildSymbolTableFromPython } from '../../../src/coverage/deep-analysis/symbolTable';
import type { SymbolTable } from '../../../src/coverage/deep-analysis/types';

// ─── resolveEnumToken ─────────────────────────────────────────────────────────

describe('resolveEnumToken', () => {
  let tsTable: SymbolTable;
  let javaTable: SymbolTable;
  let kotlinTable: SymbolTable;
  let pythonTable: SymbolTable;

  beforeEach(() => {
    tsTable = buildSymbolTableFromJs(`enum Routes { USERS = '/users', ORDERS = '/orders' }`);

    javaTable = buildSymbolTableFromJava(`
      enum Routes {
        USERS("/users"),
        ORDERS("/orders");
      }
    `);

    kotlinTable = buildSymbolTableFromKotlin(`
      enum class Routes(val path: String) {
        USERS("/users"),
        ITEMS("/items")
      }
    `);

    pythonTable = buildSymbolTableFromPython(`
class Routes(Enum):
    USERS = "/users"
    ITEMS = "/items"
`);
  });

  it('resolves a TypeScript Routes.USERS token', () => {
    expect(resolveEnumToken('Routes.USERS', tsTable)).toBe('/users');
  });

  it('resolves a bare USERS token for TypeScript enum', () => {
    expect(resolveEnumToken('USERS', tsTable)).toBe('/users');
  });

  it('resolves a Kotlin Routes.USERS.path token', () => {
    expect(resolveEnumToken('Routes.USERS.path', kotlinTable)).toBe('/users');
  });

  it('resolves a Python Routes.USERS.value token', () => {
    expect(resolveEnumToken('Routes.USERS.value', pythonTable)).toBe('/users');
  });

  it('resolves a Java Routes.USERS.getPath() token', () => {
    expect(resolveEnumToken('Routes.USERS.getPath()', javaTable)).toBe('/users');
  });

  it('returns undefined for a token that has no matching enum entry', () => {
    expect(resolveEnumToken('Routes.MISSING', tsTable)).toBeUndefined();
  });

  it('returns undefined for an entirely unknown enum', () => {
    expect(resolveEnumToken('Unknown.VALUE', tsTable)).toBeUndefined();
  });

  it('resolves Routes.ORDERS correctly', () => {
    expect(resolveEnumToken('Routes.ORDERS', tsTable)).toBe('/orders');
  });
});

// ─── extractTsEnumValues ──────────────────────────────────────────────────────

describe('extractTsEnumValues', () => {
  it('extracts all members from a TypeScript string enum', () => {
    const src = `enum Routes { USERS = '/users', ORDERS = '/orders' }`;
    const result = extractTsEnumValues(src);
    expect(result['Routes.USERS']).toBe('/users');
    expect(result['USERS']).toBe('/users');
    expect(result['Routes.ORDERS']).toBe('/orders');
    expect(result['ORDERS']).toBe('/orders');
  });

  it('handles enums with backtick values', () => {
    const src = 'enum Paths { BASE = `/api` }';
    const result = extractTsEnumValues(src);
    expect(result['BASE']).toBe('/api');
    expect(result['Paths.BASE']).toBe('/api');
  });

  it('extracts members across multiple enums', () => {
    const src = `
      enum Routes { USERS = '/users' }
      enum Methods { GET = 'get' }
    `;
    const result = extractTsEnumValues(src);
    expect(result['Routes.USERS']).toBe('/users');
    expect(result['Methods.GET']).toBe('get');
  });

  it('returns an empty object when no enums are present', () => {
    expect(extractTsEnumValues('const x = 1;')).toEqual({});
  });

  it('ignores numeric enum members', () => {
    const src = `enum Status { OK = 200 }`;
    const result = extractTsEnumValues(src);
    // No string value for OK
    expect(result['OK']).toBeUndefined();
  });
});

// ─── extractJavaEnumValues ────────────────────────────────────────────────────

describe('extractJavaEnumValues', () => {
  it('extracts constructor-style Java enum members', () => {
    const src = `
      enum Routes {
        USERS("/users"),
        ORDERS("/orders");
        private final String path;
        Routes(String path) { this.path = path; }
      }
    `;
    const result = extractJavaEnumValues(src);
    expect(result['Routes.USERS']).toBe('/users');
    expect(result['USERS']).toBe('/users');
    expect(result['Routes.ORDERS']).toBe('/orders');
  });

  it('returns an empty object for a Java file without enums', () => {
    expect(extractJavaEnumValues('public class Foo {}')).toEqual({});
  });

  it('handles enum member names with underscores', () => {
    const src = `enum Paths { USERS_BY_ID("/users/{id}") }`;
    const result = extractJavaEnumValues(src);
    expect(result['USERS_BY_ID']).toBe('/users/{id}');
  });

  it('extracts multiple members from the same enum', () => {
    const src = `
      enum Api {
        CREATE("/create"),
        READ("/read"),
        UPDATE("/update"),
        DELETE("/delete")
      }
    `;
    const result = extractJavaEnumValues(src);
    expect(result['CREATE']).toBe('/create');
    expect(result['DELETE']).toBe('/delete');
  });
});

// ─── extractKotlinEnumValues ──────────────────────────────────────────────────

describe('extractKotlinEnumValues', () => {
  it('extracts Kotlin enum class members', () => {
    const src = `
      enum class Routes(val path: String) {
        USERS("/users"),
        ORDERS("/orders")
      }
    `;
    const result = extractKotlinEnumValues(src);
    expect(result['Routes.USERS']).toBe('/users');
    expect(result['USERS']).toBe('/users');
    expect(result['Routes.ORDERS']).toBe('/orders');
  });

  it('returns an empty object for Kotlin code with no enum classes', () => {
    expect(extractKotlinEnumValues('val x = 1')).toEqual({});
  });

  it('handles single-quoted strings in Kotlin enum', () => {
    const src = `enum class Paths(val p: String) { BASE('/api') }`;
    const result = extractKotlinEnumValues(src);
    expect(result['BASE']).toBe('/api');
  });

  it('extracts members from multiple Kotlin enums', () => {
    const src = `
      enum class Routes(val path: String) { USERS("/users") }
      enum class Verbs(val v: String) { GET("GET") }
    `;
    const result = extractKotlinEnumValues(src);
    expect(result['Routes.USERS']).toBe('/users');
    expect(result['Verbs.GET']).toBe('GET');
  });
});

// ─── extractPythonEnumValues ──────────────────────────────────────────────────

describe('extractPythonEnumValues', () => {
  it('extracts Python Enum class members', () => {
    const src = `
class Routes(Enum):
    USERS = "/users"
    ORDERS = "/orders"
`;
    const result = extractPythonEnumValues(src);
    expect(result['Routes.USERS']).toBe('/users');
    expect(result['USERS']).toBe('/users');
    expect(result['Routes.ORDERS']).toBe('/orders');
  });

  it('returns an empty object for Python code with no Enum classes', () => {
    expect(extractPythonEnumValues('x = 1\n')).toEqual({});
  });

  it('handles single-quoted member values', () => {
    const src = `
class Paths(Enum):
    BASE = '/api'
`;
    const result = extractPythonEnumValues(src);
    expect(result['BASE']).toBe('/api');
  });

  it('handles Enum class members with underscores', () => {
    const src = `
class Routes(Enum):
    USERS_BY_ID = "/users/{id}"
`;
    const result = extractPythonEnumValues(src);
    expect(result['USERS_BY_ID']).toBe('/users/{id}');
  });
});
