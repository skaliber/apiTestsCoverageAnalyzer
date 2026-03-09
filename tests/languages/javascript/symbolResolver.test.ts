/**
 * Unit tests for src/languages/javascript/symbolResolver.ts
 *
 * Coverage:
 *   extractSymbols - const/let/var with string literals
 *   extractSymbols - TypeScript enum string members
 *   extractSymbols - object literal properties
 *   extractSymbols - export named declarations
 *   extractSymbols - module.exports = { ... }
 *   resolveSymbol - lookups in constants and local vars
 */

import { extractSymbols, resolveSymbol } from '../../../src/languages/javascript/symbolResolver';
import { parseJsTs } from '../../../src/languages/javascript/parser';

function parse(src: string) {
  const result = parseJsTs('test.ts', src, 'typescript');
  return result.ast;
}

describe('extractSymbols', () => {
  it('extracts a top-level const with a string literal', () => {
    const ast = parse(`const USERS_PATH = '/users';`);
    const { constants } = extractSymbols(ast);
    expect(constants.get('USERS_PATH')).toMatchObject({
      name: 'USERS_PATH',
      kind: 'const',
      value: '/users',
      resolvedValue: '/users',
    });
  });

  it('extracts a let variable with a double-quoted string', () => {
    const ast = parse(`let BASE = "/api/v1";`);
    const { constants } = extractSymbols(ast);
    expect(constants.get('BASE')).toMatchObject({ kind: 'let', value: '/api/v1' });
  });

  it('extracts a var with a template literal (no expressions)', () => {
    const ast = parse('var RESOURCE = `/resource`;');
    const { constants } = extractSymbols(ast);
    expect(constants.get('RESOURCE')).toMatchObject({ value: '/resource' });
  });

  it('extracts TypeScript enum string members with qualified and short key', () => {
    const src = `
      enum Routes {
        USERS = '/users',
        ORDERS = '/orders',
      }
    `;
    const ast = parse(src);
    const { constants } = extractSymbols(ast);
    expect(constants.get('Routes.USERS')).toMatchObject({ kind: 'enum-member', value: '/users' });
    expect(constants.get('Routes.ORDERS')).toMatchObject({ kind: 'enum-member', value: '/orders' });
  });

  it('extracts object literal property paths', () => {
    const src = `const Paths = { USERS: '/users', ITEMS: '/items' };`;
    const ast = parse(src);
    const { constants } = extractSymbols(ast);
    expect(constants.get('Paths.USERS')).toMatchObject({ value: '/users' });
    expect(constants.get('Paths.ITEMS')).toMatchObject({ value: '/items' });
  });

  it('extracts export named declarations', () => {
    const src = `export const API_BASE = '/api';`;
    const ast = parse(src);
    const { constants } = extractSymbols(ast);
    expect(constants.get('API_BASE')).toMatchObject({ value: '/api' });
  });

  it('extracts module.exports = { ... } patterns', () => {
    const src = `module.exports = { USERS: '/users' };`;
    const ast = parse(src);
    const { constants } = extractSymbols(ast);
    // Both exports.USERS and the bare short key
    expect(constants.get('USERS') ?? constants.get('exports.USERS')).toMatchObject({ value: '/users' });
  });

  it('returns empty maps for content with no string assignments', () => {
    const ast = parse('function foo() { return 42; }');
    const { constants } = extractSymbols(ast);
    expect(constants.size).toBe(0);
  });

  it('handles nested object (...ROUTES = { USER: { LIST: "/users" } } )', () => {
    const src = `const ROUTES = { USER: { LIST: '/users/list' } };`;
    const ast = parse(src);
    const { constants } = extractSymbols(ast);
    expect(constants.get('ROUTES.USER.LIST')).toMatchObject({ value: '/users/list' });
  });
});

describe('resolveSymbol', () => {
  it('resolves a constant by name', () => {
    const ast = parse(`const FOO = '/foo';`);
    const { constants } = extractSymbols(ast);
    expect(resolveSymbol('FOO', constants)).toBe('/foo');
  });

  it('returns undefined for unknown symbol', () => {
    expect(resolveSymbol('UNKNOWN', new Map())).toBeUndefined();
  });

  it('resolves a local variable preferentially over constants', () => {
    const constants = new Map([['X', { name: 'X', kind: 'const' as const, resolvedValue: '/const' }]]);
    const localVars = new Map([['X', { name: 'X', kind: 'let' as const, resolvedValue: '/local' }]]);
    expect(resolveSymbol('X', constants, localVars)).toBe('/local');
  });

  it('falls back to constants when local variable is absent', () => {
    const constants = new Map([['Y', { name: 'Y', kind: 'const' as const, resolvedValue: '/y' }]]);
    expect(resolveSymbol('Y', constants, new Map())).toBe('/y');
  });
});
