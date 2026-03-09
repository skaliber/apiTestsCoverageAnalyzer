/**
 * Unit tests for path normalization and template/concatenation resolution.
 *
 * Coverage:
 *   normalizePathToTemplate
 *   resolveTemplateLiteral
 *   resolveStringConcatenation
 *   resolveJavaConcatenation
 *   resolvePythonFString
 *   stripUrlBase
 *   extractTemplateLiterals
 */

import {
  normalizePathToTemplate,
  resolveTemplateLiteral,
  resolveStringConcatenation,
  resolveJavaConcatenation,
  resolvePythonFString,
  stripUrlBase,
  extractTemplateLiterals,
} from '../../../src/coverage/deep-analysis/resolvePaths';
import { buildSymbolTableFromJs, buildSymbolTableFromJava, buildSymbolTableFromPython } from '../../../src/coverage/deep-analysis/symbolTable';
import type { SymbolTable } from '../../../src/coverage/deep-analysis/types';

// ─── normalizePathToTemplate ──────────────────────────────────────────────────

describe('normalizePathToTemplate', () => {
  it('replaces a purely numeric segment with {id}', () => {
    expect(normalizePathToTemplate('/users/123')).toBe('/users/{id}');
  });

  it('replaces a UUID segment with {id}', () => {
    expect(normalizePathToTemplate('/users/550e8400-e29b-41d4-a716-446655440000')).toBe('/users/{id}');
  });

  it('leaves existing template parameters unchanged', () => {
    expect(normalizePathToTemplate('/users/{userId}')).toBe('/users/{userId}');
  });

  it('preserves resource word segments', () => {
    expect(normalizePathToTemplate('/users/profile')).toBe('/users/profile');
  });

  it('normalizes multiple ID-like segments', () => {
    expect(normalizePathToTemplate('/users/123/orders/456')).toBe('/users/{id}/orders/{id}');
  });

  it('handles a path that is already clean', () => {
    expect(normalizePathToTemplate('/users')).toBe('/users');
  });

  it('replaces a long hex string with {id}', () => {
    expect(normalizePathToTemplate('/items/a1b2c3d4e5f67890')).toBe('/items/{id}');
  });

  it('normalizes slugs like abc-123 with digits', () => {
    expect(normalizePathToTemplate('/posts/abc-123')).toBe('/posts/{id}');
  });

  it('does not replace short all-alpha words', () => {
    expect(normalizePathToTemplate('/api/users')).toBe('/api/users');
  });
});

// ─── resolveTemplateLiteral ───────────────────────────────────────────────────

describe('resolveTemplateLiteral', () => {
  let table: SymbolTable;

  beforeEach(() => {
    table = buildSymbolTableFromJs(`
      const BASE = '/api';
      const BASE_URL = 'http://localhost:3000/api';
    `);
  });

  it('replaces a known ${IDENTIFIER} with its resolved value', () => {
    expect(resolveTemplateLiteral('${BASE}/users', table)).toBe('/api/users');
  });

  it('strips scheme+host from a resolved base URL', () => {
    expect(resolveTemplateLiteral('${BASE_URL}/users', table)).toBe('/api/users');
  });

  it('replaces an unknown ${identifier} with {identifier}', () => {
    expect(resolveTemplateLiteral('${BASE}/users/${userId}', table)).toBe('/api/users/{userId}');
  });

  it('handles a template with no interpolations', () => {
    expect(resolveTemplateLiteral('/users/all', table)).toBe('/users/all');
  });

  it('handles a template with multiple known expansions', () => {
    const t = buildSymbolTableFromJs(`const P = '/prefix'; const S = '/suffix';`);
    expect(resolveTemplateLiteral('${P}/middle${S}', t)).toBe('/prefix/middle/suffix');
  });
});

// ─── resolveStringConcatenation ───────────────────────────────────────────────

describe('resolveStringConcatenation', () => {
  let table: SymbolTable;

  beforeEach(() => {
    table = buildSymbolTableFromJs(`const BASE = '/api';`);
  });

  it('joins a constant and a quoted string', () => {
    expect(resolveStringConcatenation("BASE + '/users'", table)).toBe('/api/users');
  });

  it('joins two quoted literals', () => {
    expect(resolveStringConcatenation("'/api' + '/users'", table)).toBe('/api/users');
  });

  it('replaces unknown identifier with {identifier}', () => {
    expect(resolveStringConcatenation("BASE + '/users/' + id", table)).toBe('/api/users/{id}');
  });

  it('returns an empty string for an empty expression', () => {
    expect(resolveStringConcatenation('', table)).toBe('');
  });

  it('handles a single known identifier', () => {
    expect(resolveStringConcatenation('BASE', table)).toBe('/api');
  });

  it('strips host+scheme from a resolved URL fragment', () => {
    const t = buildSymbolTableFromJs(`const HOST = 'http://example.com/api';`);
    expect(resolveStringConcatenation("HOST + '/users'", t)).toBe('/api/users');
  });
});

// ─── resolveJavaConcatenation ─────────────────────────────────────────────────

describe('resolveJavaConcatenation', () => {
  let table: SymbolTable;

  beforeEach(() => {
    table = buildSymbolTableFromJava(`public static final String BASE = "/api";`);
  });

  it('joins a Java constant and a double-quoted string', () => {
    expect(resolveJavaConcatenation('BASE + "/users"', table)).toBe('/api/users');
  });

  it('joins two double-quoted literals', () => {
    expect(resolveJavaConcatenation('"/api" + "/users"', table)).toBe('/api/users');
  });

  it('replaces an unknown identifier with {identifier}', () => {
    expect(resolveJavaConcatenation('BASE + "/users/" + userId', table)).toBe('/api/users/{userId}');
  });

  it('handles concatenation with three resolved parts', () => {
    const t = buildSymbolTableFromJava(`
      public static final String PREFIX = "/api";
      public static final String SUFFIX = "/users";
    `);
    expect(resolveJavaConcatenation('PREFIX + SUFFIX', t)).toBe('/api/users');
  });
});

// ─── resolvePythonFString ─────────────────────────────────────────────────────

describe('resolvePythonFString', () => {
  let table: SymbolTable;

  beforeEach(() => {
    table = buildSymbolTableFromPython(`BASE_URL = "/api"`);
  });

  it('replaces a known {IDENTIFIER} with its value', () => {
    expect(resolvePythonFString('{BASE_URL}/users', table)).toBe('/api/users');
  });

  it('replaces an unknown {identifier} with {identifier} as placeholder', () => {
    expect(resolvePythonFString('/users/{user_id}', table)).toBe('/users/{user_id}');
  });

  it('handles fstring with both known and unknown identifiers', () => {
    expect(resolvePythonFString('{BASE_URL}/users/{user_id}', table)).toBe('/api/users/{user_id}');
  });

  it('leaves a plain path with no interpolations unchanged', () => {
    expect(resolvePythonFString('/users/all', table)).toBe('/users/all');
  });

  it('strips host+scheme from a resolved full URL', () => {
    const t = buildSymbolTableFromPython(`HOST = "http://localhost:8000/api"`);
    expect(resolvePythonFString('{HOST}/users', t)).toBe('/api/users');
  });
});

// ─── stripUrlBase ─────────────────────────────────────────────────────────────

describe('stripUrlBase', () => {
  it('returns a path-like value unchanged', () => {
    expect(stripUrlBase('/users')).toBe('/users');
  });

  it('returns a template variable unchanged', () => {
    expect(stripUrlBase('{userId}')).toBe('{userId}');
  });

  it('strips scheme and host from a fully qualified URL', () => {
    expect(stripUrlBase('http://example.com/api/users')).toBe('/api/users');
  });

  it('strips https scheme and host', () => {
    expect(stripUrlBase('https://api.example.com/v1/orders')).toBe('/v1/orders');
  });

  it('returns the value unchanged if it is not a valid URL and does not start with /', () => {
    expect(stripUrlBase('not-a-url')).toBe('not-a-url');
  });
});

// ─── extractTemplateLiterals ──────────────────────────────────────────────────

describe('extractTemplateLiterals', () => {
  it('extracts template literals that contain a slash', () => {
    const src = 'client.get(`/users/${id}`)';
    const result = extractTemplateLiterals(src);
    expect(result).toContain('/users/${id}');
  });

  it('extracts multiple template literals', () => {
    const src = 'client.get(`/users/${id}`); api.post(`/orders/${orderId}`)';
    const result = extractTemplateLiterals(src);
    expect(result).toHaveLength(2);
    expect(result).toContain('/users/${id}');
    expect(result).toContain('/orders/${orderId}');
  });

  it('ignores template literals without a slash', () => {
    const src = 'const msg = `Hello ${name}`;';
    const result = extractTemplateLiterals(src);
    expect(result).toHaveLength(0);
  });

  it('returns an empty array when there are no template literals', () => {
    expect(extractTemplateLiterals('const x = 1;')).toEqual([]);
  });

  it('ignores multi-line template literals', () => {
    const src = 'const html = `<div>\n  /path\n</div>`;';
    const result = extractTemplateLiterals(src);
    expect(result).toHaveLength(0);
  });
});
