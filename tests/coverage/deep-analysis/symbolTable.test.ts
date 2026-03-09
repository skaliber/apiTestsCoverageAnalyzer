/**
 * Unit tests for the symbol-table builder and resolver.
 *
 * Coverage:
 *   buildSymbolTableFromJs
 *   buildSymbolTableFromJava
 *   buildSymbolTableFromKotlin
 *   buildSymbolTableFromPython
 *   resolveSymbol
 */

import {
  buildSymbolTableFromJs,
  buildSymbolTableFromJava,
  buildSymbolTableFromKotlin,
  buildSymbolTableFromPython,
  resolveSymbol,
} from '../../../src/coverage/deep-analysis/symbolTable';

// ─── buildSymbolTableFromJs ───────────────────────────────────────────────────

describe('buildSymbolTableFromJs', () => {
  it('extracts a top-level const with a single-quoted string', () => {
    const table = buildSymbolTableFromJs(`const USERS_PATH = '/users';`);
    expect(table.get('USERS_PATH')).toMatchObject({ name: 'USERS_PATH', kind: 'const', value: '/users' });
  });

  it('extracts a let variable with a double-quoted string', () => {
    const table = buildSymbolTableFromJs(`let BASE = "/api/v1";`);
    expect(table.get('BASE')).toMatchObject({ name: 'BASE', kind: 'let', value: '/api/v1' });
  });

  it('extracts a var with a backtick string', () => {
    const table = buildSymbolTableFromJs('var RESOURCE = `/resource`;');
    expect(table.get('RESOURCE')).toMatchObject({ name: 'RESOURCE', kind: 'var', value: '/resource' });
  });

  it('extracts TypeScript string enum members', () => {
    const src = `
      enum Routes {
        USERS = '/users',
        ORDERS = '/orders',
      }
    `;
    const table = buildSymbolTableFromJs(src);
    expect(table.get('Routes.USERS')).toMatchObject({ kind: 'enum', value: '/users' });
    expect(table.get('USERS')).toMatchObject({ kind: 'enum', value: '/users' });
    expect(table.get('Routes.ORDERS')).toMatchObject({ kind: 'enum', value: '/orders' });
  });

  it('extracts object literal property paths', () => {
    const src = `const Paths = { USERS: '/users', ITEMS: '/items' };`;
    const table = buildSymbolTableFromJs(src);
    expect(table.get('Paths.USERS')).toMatchObject({ kind: 'property', value: '/users' });
    expect(table.get('Paths.ITEMS')).toMatchObject({ kind: 'property', value: '/items' });
  });

  it('returns an empty table for content with no string assignments', () => {
    const table = buildSymbolTableFromJs('function foo() { return 42; }');
    expect(table.size).toBe(0);
  });

  it('handles multiple declarations', () => {
    const src = `
      const A = '/a';
      const B = '/b';
      let C = '/c';
    `;
    const table = buildSymbolTableFromJs(src);
    expect(table.get('A')?.value).toBe('/a');
    expect(table.get('B')?.value).toBe('/b');
    expect(table.get('C')?.value).toBe('/c');
  });

  it('does not pollute bare names from object properties', () => {
    const src = `const Paths = { USERS: '/users' };`;
    const table = buildSymbolTableFromJs(src);
    // bare USERS should NOT be in the table (only Paths.USERS)
    expect(table.has('USERS')).toBe(false);
  });
});

// ─── buildSymbolTableFromJava ─────────────────────────────────────────────────

describe('buildSymbolTableFromJava', () => {
  it('extracts a static final String constant', () => {
    const src = `public static final String USERS_PATH = "/users";`;
    const table = buildSymbolTableFromJava(src);
    expect(table.get('USERS_PATH')).toMatchObject({ kind: 'const', value: '/users' });
  });

  it('extracts a simple String assignment without modifiers', () => {
    const src = `String basePath = "/api/v2";`;
    const table = buildSymbolTableFromJava(src);
    expect(table.get('basePath')).toMatchObject({ kind: 'const', value: '/api/v2' });
  });

  it('extracts Java constructor-style enum members', () => {
    const src = `
      enum Routes {
        USERS("/users"),
        ORDERS("/orders");
        private final String path;
      }
    `;
    const table = buildSymbolTableFromJava(src);
    expect(table.get('Routes.USERS')).toMatchObject({ kind: 'enum', value: '/users' });
    expect(table.get('USERS')).toMatchObject({ kind: 'enum', value: '/users' });
    expect(table.get('Routes.ORDERS')).toMatchObject({ kind: 'enum', value: '/orders' });
  });

  it('returns an empty table for non-string Java content', () => {
    const table = buildSymbolTableFromJava('int x = 5;');
    expect(table.size).toBe(0);
  });

  it('handles private final String constants', () => {
    const src = `private final String endpoint = "/search";`;
    const table = buildSymbolTableFromJava(src);
    expect(table.get('endpoint')?.value).toBe('/search');
  });

  it('handles multiple constants in one class', () => {
    const src = `
      public static final String CREATE = "/create";
      public static final String UPDATE = "/update";
    `;
    const table = buildSymbolTableFromJava(src);
    expect(table.get('CREATE')?.value).toBe('/create');
    expect(table.get('UPDATE')?.value).toBe('/update');
  });
});

// ─── buildSymbolTableFromKotlin ───────────────────────────────────────────────

describe('buildSymbolTableFromKotlin', () => {
  it('extracts a const val declaration', () => {
    const src = `const val USERS_PATH = "/users"`;
    const table = buildSymbolTableFromKotlin(src);
    expect(table.get('USERS_PATH')).toMatchObject({ kind: 'const', value: '/users' });
  });

  it('extracts a plain val declaration', () => {
    const src = `val basePath = '/api'`;
    const table = buildSymbolTableFromKotlin(src);
    expect(table.get('basePath')).toMatchObject({ kind: 'const', value: '/api' });
  });

  it('extracts Kotlin enum class members', () => {
    const src = `
      enum class Routes(val path: String) {
        USERS("/users"),
        ORDERS("/orders")
      }
    `;
    const table = buildSymbolTableFromKotlin(src);
    expect(table.get('Routes.USERS')).toMatchObject({ kind: 'enum', value: '/users' });
    expect(table.get('USERS')).toMatchObject({ kind: 'enum', value: '/users' });
  });

  it('extracts object companion properties', () => {
    const src = `
      object Paths {
        const val USERS = "/users"
        const val ITEMS = "/items"
      }
    `;
    const table = buildSymbolTableFromKotlin(src);
    expect(table.get('Paths.USERS')).toMatchObject({ kind: 'property', value: '/users' });
    expect(table.get('USERS')).toMatchObject({ kind: 'const', value: '/users' });
  });

  it('returns an empty table for Kotlin content with no string assignments', () => {
    const table = buildSymbolTableFromKotlin('fun main() { println("hi") }');
    expect(table.size).toBe(0);
  });
});

// ─── buildSymbolTableFromPython ───────────────────────────────────────────────

describe('buildSymbolTableFromPython', () => {
  it('extracts an UPPER_CASE module-level constant', () => {
    const src = `USERS_PATH = '/users'`;
    const table = buildSymbolTableFromPython(src);
    expect(table.get('USERS_PATH')).toMatchObject({ kind: 'const', value: '/users' });
  });

  it('extracts a lower_case module-level string', () => {
    const src = `base_url = "/api"`;
    const table = buildSymbolTableFromPython(src);
    expect(table.get('base_url')).toMatchObject({ kind: 'let', value: '/api' });
  });

  it('extracts Python Enum class members', () => {
    const src = `
class Routes(Enum):
    USERS = "/users"
    ORDERS = "/orders"
`;
    const table = buildSymbolTableFromPython(src);
    expect(table.get('Routes.USERS')).toMatchObject({ kind: 'enum', value: '/users' });
    expect(table.get('USERS')).toMatchObject({ kind: 'enum', value: '/users' });
    expect(table.get('Routes.ORDERS')).toMatchObject({ kind: 'enum', value: '/orders' });
  });

  it('returns an empty table for Python code with no string assignments', () => {
    const table = buildSymbolTableFromPython('def main():\n    pass\n');
    expect(table.size).toBe(0);
  });

  it('handles double-quoted Python constants', () => {
    const src = `API_BASE = "/api/v1"`;
    const table = buildSymbolTableFromPython(src);
    expect(table.get('API_BASE')?.value).toBe('/api/v1');
  });
});

// ─── resolveSymbol ────────────────────────────────────────────────────────────

describe('resolveSymbol', () => {
  it('returns the value of a known symbol', () => {
    const table = buildSymbolTableFromJs(`const USERS = '/users';`);
    expect(resolveSymbol('USERS', table)).toBe('/users');
  });

  it('returns undefined for an unknown symbol', () => {
    const table = buildSymbolTableFromJs(`const USERS = '/users';`);
    expect(resolveSymbol('UNKNOWN', table)).toBeUndefined();
  });

  it('returns undefined for a symbol that has no value', () => {
    const table = new Map();
    table.set('FOO', { name: 'FOO', kind: 'const' as const });
    expect(resolveSymbol('FOO', table)).toBeUndefined();
  });

  it('respects the resolving guard to prevent infinite loops', () => {
    const table = new Map();
    table.set('BAR', { name: 'BAR', kind: 'const' as const, value: '/bar', resolving: true });
    expect(resolveSymbol('BAR', table)).toBeUndefined();
  });

  it('resolves enum entries registered under dotted name', () => {
    const table = buildSymbolTableFromJs(`enum Routes { USERS = '/users' }`);
    expect(resolveSymbol('Routes.USERS', table)).toBe('/users');
  });
});
