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
});
