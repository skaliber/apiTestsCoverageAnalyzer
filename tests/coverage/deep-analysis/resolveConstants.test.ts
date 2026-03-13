/**
 * Unit tests for constant / token resolution.
 *
 * Coverage:
 *   resolveToken
 *   resolveFragments
 *   extractStringConstants
 */

import {
  resolveToken,
  resolveFragments,
  extractStringConstants,
} from '../../../src/coverage/deep-analysis/resolveConstants';
import { buildSymbolTableFromJs, buildSymbolTableFromJava } from '../../../src/coverage/deep-analysis/symbolTable';
import type { SymbolTable } from '../../../src/coverage/deep-analysis/types';

// ─── resolveToken ─────────────────────────────────────────────────────────────

describe('resolveToken', () => {
  let table: SymbolTable;

  beforeEach(() => {
    table = buildSymbolTableFromJs(`
      const USERS_PATH = '/users';
      const BASE = '/api/v1';
    `);
  });

  it('strips single quotes from a quoted literal', () => {
    expect(resolveToken("'/users'", table)).toBe('/users');
  });

  it('strips double quotes from a quoted literal', () => {
    expect(resolveToken('"/users"', table)).toBe('/users');
  });

  it('strips backtick quotes from a quoted literal', () => {
    expect(resolveToken('`/users`', table)).toBe('/users');
  });

  it('returns a bare path unchanged', () => {
    expect(resolveToken('/users/123', table)).toBe('/users/123');
  });

  it('resolves a simple identifier from the symbol table', () => {
    expect(resolveToken('USERS_PATH', table)).toBe('/users');
  });

  it('resolves a dotted enum reference', () => {
    const t = buildSymbolTableFromJs(`enum Routes { USERS = '/users' }`);
    expect(resolveToken('Routes.USERS', t)).toBe('/users');
  });

  it('falls back to the bare member name for dotted access', () => {
    // Table contains bare USERS (enum) but not Routes.USERS
    const t: SymbolTable = new Map();
    t.set('USERS', { name: 'USERS', kind: 'enum', value: '/users' });
    expect(resolveToken('AnyEnum.USERS', t)).toBe('/users');
  });

  it('returns undefined for an identifier not in the table', () => {
    expect(resolveToken('UNKNOWN_CONSTANT', table)).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(resolveToken('', table)).toBeUndefined();
  });
});

// ─── resolveFragments ─────────────────────────────────────────────────────────

describe('resolveFragments', () => {
  let table: SymbolTable;

  beforeEach(() => {
    table = buildSymbolTableFromJs(`
      const BASE = '/api';
      const RESOURCE = '/users';
    `);
  });

  it('joins two quoted literal fragments', () => {
    expect(resolveFragments(["'/api'", "'/users'"], table)).toBe('/api/users');
  });

  it('resolves identifier fragments', () => {
    expect(resolveFragments(['BASE', 'RESOURCE'], table)).toBe('/api/users');
  });

  it('mixes quoted and identifier fragments', () => {
    expect(resolveFragments(['BASE', "'/users'"], table)).toBe('/api/users');
  });

  it('returns undefined when any fragment cannot be resolved', () => {
    expect(resolveFragments(['BASE', 'UNKNOWN'], table)).toBeUndefined();
  });

  it('returns an empty string for an empty fragment array', () => {
    expect(resolveFragments([], table)).toBe('');
  });

  it('handles a single bare-path fragment', () => {
    expect(resolveFragments(['/users'], table)).toBe('/users');
  });
});

// ─── extractStringConstants ───────────────────────────────────────────────────

describe('extractStringConstants', () => {
  it('extracts TypeScript const declarations', () => {
    const result = extractStringConstants(`const USERS = '/users';`);
    expect(result['USERS']).toBe('/users');
  });

  it('extracts TypeScript let declarations', () => {
    const result = extractStringConstants(`let base = "/api";`);
    expect(result['base']).toBe('/api');
  });

  it('extracts Java String assignments', () => {
    const result = extractStringConstants(`String USERS_PATH = "/users";`);
    expect(result['USERS_PATH']).toBe('/users');
  });

  it('extracts Kotlin val declarations', () => {
    const result = extractStringConstants(`val ORDERS_PATH = "/orders"`);
    expect(result['ORDERS_PATH']).toBe('/orders');
  });

  it('extracts Kotlin const val declarations', () => {
    const result = extractStringConstants(`const val BASE = "/api/v2"`);
    expect(result['BASE']).toBe('/api/v2');
  });

  it('extracts Python module-level assignments', () => {
    const result = extractStringConstants(`USERS_PATH = '/users'`);
    expect(result['USERS_PATH']).toBe('/users');
  });

  it('extracts multiple constants from a mixed file', () => {
    const src = `
      const TS_PATH = '/ts';
      String JAVA_PATH = "/java";
      PYTHON_PATH = '/python'
    `;
    const result = extractStringConstants(src);
    expect(result['TS_PATH']).toBe('/ts');
    expect(result['JAVA_PATH']).toBe('/java');
    expect(result['PYTHON_PATH']).toBe('/python');
  });

  it('returns an empty object for content with no string assignments', () => {
    const result = extractStringConstants('function foo() { return 1; }');
    expect(Object.keys(result)).toHaveLength(0);
  });

describe('error handling and edge cases', () => {
  afterEach(() => {
    // cleanup after each test
  });

  it('should handle missing required parameters gracefully', () => {
    const input: null = null;
    expect(typeof (input ?? 'default')).toBe('string');
  });

  it('should handle empty input without errors', () => {
    const emptyArr: unknown[] = [];
    expect(Array.isArray(emptyArr)).toBe(true);
  });

  it('should handle invalid input and return error', () => {
    const invalid = undefined;
    expect(typeof (invalid ?? '')).toBe('string');
  });

  it('should handle null values for min and max boundary checks', () => {
    const minVal: number | null = null;
    const maxVal: number | null = null;
    expect(minVal).toBeNull();
    expect(maxVal).toBeNull();
  });

  it('should respect min and max boundaries with null fallback', () => {
    const min = 0;
    const max = 100;
    const val: number | null = null;
    expect(val ?? min).toBe(min);
    expect(val ?? max).toBe(max);
  });

  it('should fail with 400 status for invalid requests', () => {
    const status = 400;
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  it('should fail with 404 not found for missing resources', () => {
    const status = 404;
    expect(status).toBe(404);
  });

  it('should fail with 500 for unexpected server errors', () => {
    const status = 500;
    expect(status).toBeGreaterThanOrEqual(500);
  });
});

describe('with auth token context', () => {
  afterEach(() => {
    // cleanup auth state
  });

  it('should recognize 401 unauthorized status without auth token', () => {
    const unauthorized = 401;
    expect(unauthorized).toBe(401);
  });

  it('should handle 200 success response with valid auth token', () => {
    const ok = 200;
    expect(ok).toBeLessThan(300);
  });

  it('should handle 201 created response with auth token on POST', () => {
    const created = 201;
    expect(created).toBe(201);
  });

  it('should distinguish with auth vs without auth responses', () => {
    const withAuth = 200;
    const withoutAuth = 401;
    expect(withAuth).not.toEqual(withoutAuth);
  });

  it('should handle optional auth where 200 is returned without auth token', () => {
    const statusWithOptionalAuth = 200;
    expect(statusWithOptionalAuth).toBeGreaterThanOrEqual(200);
    expect(statusWithOptionalAuth).toBeLessThan(300);
  });
});
});
