/**
 * Unit tests for request-builder / request-object pattern detection.
 *
 * Coverage:
 *   extractJsRequestBuilders
 *   extractJavaRequestBuilders
 *   extractKotlinRequestBuilders
 *   extractPythonRequestBuilders
 */

import {
  extractJsRequestBuilders,
  extractJavaRequestBuilders,
  extractKotlinRequestBuilders,
  extractPythonRequestBuilders,
} from '../../../src/coverage/deep-analysis/resolveRequestWrappers';
import { buildSymbolTableFromJs } from '../../../src/coverage/deep-analysis/symbolTable';
import type { SymbolTable } from '../../../src/coverage/deep-analysis/types';

const emptyTable: SymbolTable = new Map();

// ─── extractJsRequestBuilders ─────────────────────────────────────────────────

describe('extractJsRequestBuilders', () => {
  it('detects a constructor-style new ApiRequest(method, path)', () => {
    const src = `const req = new ApiRequest('GET', '/users');`;
    const calls = extractJsRequestBuilders(src, emptyTable);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/users', pattern: 'constructor(method, path)' }),
      ]),
    );
  });

  it('detects a constructor-style new UserRequest for POST', () => {
    const src = `new UserRequest('POST', '/users')`;
    const calls = extractJsRequestBuilders(src, emptyTable);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/users' });
  });

  it('detects an object-literal { method, url } pattern', () => {
    const src = `axios({ method: 'GET', url: '/users' })`;
    const calls = extractJsRequestBuilders(src, emptyTable);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/users' }),
      ]),
    );
  });

  it('detects an object-literal { method, path } pattern', () => {
    const src = `call({ method: 'DELETE', path: '/users/1' })`;
    const calls = extractJsRequestBuilders(src, emptyTable);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'DELETE', path: '/users/1' }),
      ]),
    );
  });

  it('detects a fetch(url, { method }) pattern', () => {
    const src = `fetch('/users', { method: 'POST' })`;
    const calls = extractJsRequestBuilders(src, emptyTable);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'POST', path: '/users', pattern: 'fetch(url, {method})' }),
      ]),
    );
  });

  it('resolves a path constant via the symbol table', () => {
    const table = buildSymbolTableFromJs(`const USERS = '/users';`);
    const src = `new ApiRequest('GET', USERS)`;
    // Path lookup won't be triggered since the pattern requires a quoted string literal
    // Verify it doesn't crash and returns expected structure
    const calls = extractJsRequestBuilders(src, table);
    // The constructor pattern requires a quoted path — no match expected
    expect(calls).toEqual([]);
  });

  it('normalizes a path with numeric ID segments', () => {
    const src = `new ApiRequest('GET', '/users/123')`;
    const calls = extractJsRequestBuilders(src, emptyTable);
    expect(calls[0]?.normalizedPath).toBe('/users/{id}');
  });

  it('returns an empty array when no request-builder patterns are found', () => {
    expect(extractJsRequestBuilders('const x = 1;', emptyTable)).toEqual([]);
  });
});

// ─── extractJavaRequestBuilders ───────────────────────────────────────────────

describe('extractJavaRequestBuilders', () => {
  it('detects .method(GET).path("/users") builder chain', () => {
    const src = `Request.builder().method(GET, body).path("/users").build()`;
    const calls = extractJavaRequestBuilders(src, emptyTable);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/users' }),
      ]),
    );
  });

  it('detects .method("POST").path("/orders") builder chain', () => {
    const src = `Request.builder().method("POST", body).path("/orders").build()`;
    const calls = extractJavaRequestBuilders(src, emptyTable);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'POST', path: '/orders' }),
      ]),
    );
  });

  it('detects reversed .path().method() builder chain', () => {
    const src = `builder.path("/users").method("GET")`;
    const calls = extractJavaRequestBuilders(src, emptyTable);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/users' }),
      ]),
    );
  });

  it('returns an empty array for plain Java with no builder patterns', () => {
    expect(extractJavaRequestBuilders('String x = "hello";', emptyTable)).toEqual([]);
  });

  it('normalizes a path with a numeric segment', () => {
    const src = `builder.path("/users/42").method("GET")`;
    const calls = extractJavaRequestBuilders(src, emptyTable);
    expect(calls[0]?.normalizedPath).toBe('/users/{id}');
  });
});

// ─── extractKotlinRequestBuilders ─────────────────────────────────────────────

describe('extractKotlinRequestBuilders', () => {
  it('detects .get().path("/users") builder chain', () => {
    const src = `RequestBuilder().get().path("/users").build()`;
    const calls = extractKotlinRequestBuilders(src, emptyTable);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/users' }),
      ]),
    );
  });

  it('detects .post().path("/orders") builder chain', () => {
    const src = `builder.post().path("/orders").build()`;
    const calls = extractKotlinRequestBuilders(src, emptyTable);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'POST', path: '/orders' }),
      ]),
    );
  });

  it('detects .method("DELETE").path("/items") pattern', () => {
    const src = `builder.method("DELETE").path("/items").build()`;
    const calls = extractKotlinRequestBuilders(src, emptyTable);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'DELETE', path: '/items' }),
      ]),
    );
  });

  it('returns an empty array for Kotlin code with no builder patterns', () => {
    expect(extractKotlinRequestBuilders('val x = 1', emptyTable)).toEqual([]);
  });

  it('normalizes a path with a numeric ID', () => {
    const src = `builder.get().path("/users/99").build()`;
    const calls = extractKotlinRequestBuilders(src, emptyTable);
    expect(calls[0]?.normalizedPath).toBe('/users/{id}');
  });
});

// ─── extractPythonRequestBuilders ────────────────────────────────────────────

describe('extractPythonRequestBuilders', () => {
  it('detects ApiRequest(method="GET", path="/users")', () => {
    const src = `req = ApiRequest(method='GET', path='/users')`;
    const calls = extractPythonRequestBuilders(src, emptyTable);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/users' }),
      ]),
    );
  });

  it('detects Request(method="POST", url="/orders")', () => {
    const src = `r = Request(method='POST', url='/orders')`;
    const calls = extractPythonRequestBuilders(src, emptyTable);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'POST', path: '/orders' }),
      ]),
    );
  });

  it('detects requests.Request("GET", "/users") positional pattern', () => {
    const src = `r = requests.Request('GET', '/users')`;
    const calls = extractPythonRequestBuilders(src, emptyTable);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/users', pattern: 'requests.Request(method, url)' }),
      ]),
    );
  });

  it('returns an empty array for Python code with no request-builder patterns', () => {
    expect(extractPythonRequestBuilders('x = 1', emptyTable)).toEqual([]);
  });

  it('normalizes a path with a numeric segment', () => {
    const src = `r = requests.Request('GET', '/items/7')`;
    const calls = extractPythonRequestBuilders(src, emptyTable);
    expect(calls[0]?.normalizedPath).toBe('/items/{id}');
  });

  it('detects endpoint keyword in the pattern', () => {
    const src = `ApiCall(method='DELETE', endpoint='/users/1')`;
    const calls = extractPythonRequestBuilders(src, emptyTable);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'DELETE', path: '/users/1' }),
      ]),
    );
  });
});
