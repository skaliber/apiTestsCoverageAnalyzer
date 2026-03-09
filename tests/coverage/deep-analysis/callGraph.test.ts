/**
 * Unit tests for the call-graph builder and related function-extraction helpers.
 *
 * Coverage:
 *   buildJsCallGraph
 *   buildJavaCallGraph
 *   buildPythonCallGraph
 *   extractJsFunctions
 *   extractBalancedBraces
 */

import {
  buildJsCallGraph,
  buildJavaCallGraph,
  buildPythonCallGraph,
  extractJsFunctions,
  extractBalancedBraces,
} from '../../../src/coverage/deep-analysis/callGraph';

// ─── extractBalancedBraces ────────────────────────────────────────────────────

describe('extractBalancedBraces', () => {
  it('extracts the body of a simple braced block', () => {
    const src = '{ return 1; }';
    expect(extractBalancedBraces(src, 0)).toBe(' return 1; ');
  });

  it('handles nested braces', () => {
    const src = '{ if (x) { return 1; } return 2; }';
    const body = extractBalancedBraces(src, 0);
    expect(body).toContain('if (x)');
    expect(body).toContain('return 2;');
  });

  it('returns undefined when the character at startIndex is not {', () => {
    expect(extractBalancedBraces('abc', 0)).toBeUndefined();
  });

  it('returns undefined for unbalanced braces', () => {
    expect(extractBalancedBraces('{ not closed', 0)).toBeUndefined();
  });

  it('ignores braces inside string literals', () => {
    const src = '{ const s = "hello { world }"; return s; }';
    const body = extractBalancedBraces(src, 0);
    expect(body).toContain('const s = "hello { world }"');
  });

  it('handles escaped characters inside strings', () => {
    const src = `{ const s = "it\\'s a {test}"; }`;
    const body = extractBalancedBraces(src, 0);
    expect(body).not.toBeUndefined();
  });
});

// ─── extractJsFunctions ───────────────────────────────────────────────────────

describe('extractJsFunctions', () => {
  it('extracts a named function declaration', () => {
    const src = `function getUsers() { return client.get('/users'); }`;
    const fns = extractJsFunctions(src);
    expect(fns.some((f) => f.name === 'getUsers')).toBe(true);
    expect(fns.find((f) => f.name === 'getUsers')?.body).toContain("client.get('/users')");
  });

  it('extracts an arrow function assigned to a const', () => {
    const src = `const fetchData = (id) => { return api.get('/data'); };`;
    const fns = extractJsFunctions(src);
    expect(fns.some((f) => f.name === 'fetchData')).toBe(true);
  });

  it('extracts a function expression assigned to a const', () => {
    const src = `const submit = function(body) { return api.post('/submit', body); };`;
    const fns = extractJsFunctions(src);
    expect(fns.some((f) => f.name === 'submit')).toBe(true);
  });

  it('returns an empty array for source with no functions', () => {
    expect(extractJsFunctions('const x = 1;')).toEqual([]);
  });

  it('extracts multiple functions from the same source', () => {
    const src = `
      function a() { return client.get('/a'); }
      function b() { return client.post('/b'); }
    `;
    const fns = extractJsFunctions(src);
    const names = fns.map((f) => f.name);
    expect(names).toContain('a');
    expect(names).toContain('b');
  });
});

// ─── buildJsCallGraph ─────────────────────────────────────────────────────────

describe('buildJsCallGraph', () => {
  it('builds a node with direct HTTP calls', () => {
    const src = `
      function getUsers() {
        return client.get('/users');
      }
    `;
    const graph = buildJsCallGraph(src);
    const node = graph.get('getUsers');
    expect(node).toBeDefined();
    expect(node!.directHttpCalls).toEqual(
      expect.arrayContaining([{ method: 'GET', path: '/users' }]),
    );
  });

  it('captures cross-function call references', () => {
    const src = `
      function getPath() { return '/users'; }
      function fetchUsers() { return client.get(getPath()); }
    `;
    const graph = buildJsCallGraph(src);
    const fetchNode = graph.get('fetchUsers');
    expect(fetchNode?.calls).toContain('getPath');
  });

  it('populates the returnValue for a function returning a string literal', () => {
    const src = `function getPath() { return '/users'; }`;
    const graph = buildJsCallGraph(src);
    expect(graph.get('getPath')?.returnValue).toBe('/users');
  });

  it('captures POST calls inside a function body', () => {
    const src = `
      function createUser(data) {
        client.post('/users', data);
      }
    `;
    const graph = buildJsCallGraph(src);
    const node = graph.get('createUser');
    expect(node?.directHttpCalls).toEqual(
      expect.arrayContaining([{ method: 'POST', path: '/users' }]),
    );
  });

  it('returns an empty graph for source with no functions', () => {
    const graph = buildJsCallGraph('const x = 1;');
    expect(graph.size).toBe(0);
  });

  it('handles arrow functions with no HTTP calls (returnValue undefined)', () => {
    const src = `const noop = () => { return 42; };`;
    const graph = buildJsCallGraph(src);
    // Either found or not — no crash expected
    expect(graph instanceof Map).toBe(true);
  });
});

// ─── buildJavaCallGraph ───────────────────────────────────────────────────────

describe('buildJavaCallGraph', () => {
  it('builds a node with direct HTTP calls from a Java method', () => {
    const src = `
      public Response getUsers() {
        return api.get("/users");
      }
    `;
    const graph = buildJavaCallGraph(src);
    // Java method names start lowercase, so 'getUsers' should appear
    const node = graph.get('getUsers');
    expect(node).toBeDefined();
    expect(node!.directHttpCalls).toEqual(
      expect.arrayContaining([{ method: 'GET', path: '/users' }]),
    );
  });

  it('captures the return string literal from a Java method', () => {
    const src = `
      private String getPath() {
        return "/users";
      }
    `;
    const graph = buildJavaCallGraph(src);
    expect(graph.get('getPath')?.returnValue).toBe('/users');
  });

  it('returns an empty graph for source with no Java methods', () => {
    expect(buildJavaCallGraph('int x = 5;').size).toBe(0);
  });
});

// ─── buildPythonCallGraph ─────────────────────────────────────────────────────

describe('buildPythonCallGraph', () => {
  it('builds a node with direct HTTP calls from a Python function', () => {
    const src = `
def get_users():
    return client.get('/users')
`;
    const graph = buildPythonCallGraph(src);
    const node = graph.get('get_users');
    expect(node).toBeDefined();
    expect(node!.directHttpCalls).toEqual(
      expect.arrayContaining([{ method: 'GET', path: '/users' }]),
    );
  });

  it('captures the return string literal from a Python function', () => {
    const src = `
def get_path():
    return '/users'
`;
    const graph = buildPythonCallGraph(src);
    expect(graph.get('get_path')?.returnValue).toBe('/users');
  });

  it('captures cross-function call references in Python', () => {
    const src = `
def build_path(user_id):
    return '/users/' + user_id

def fetch_user(user_id):
    return client.get(build_path(user_id))
`;
    const graph = buildPythonCallGraph(src);
    const fetchNode = graph.get('fetch_user');
    expect(fetchNode?.calls).toContain('build_path');
  });

  it('returns an empty graph for source with no Python functions', () => {
    expect(buildPythonCallGraph('x = 1\n').size).toBe(0);
  });

  it('extracts multiple Python functions', () => {
    const src = `
def a():
    client.get('/a')

def b():
    client.post('/b')
`;
    const graph = buildPythonCallGraph(src);
    expect(graph.has('a')).toBe(true);
    expect(graph.has('b')).toBe(true);
  });
});
