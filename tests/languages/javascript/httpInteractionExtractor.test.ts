/**
 * Unit tests for src/languages/javascript/httpInteractionExtractor.ts
 *
 * Coverage:
 *   extractHttpCallsFromNode - axios.METHOD patterns
 *   extractHttpCallsFromNode - fetch(url, { method }) pattern
 *   extractHttpCallsFromNode - supertest(app).METHOD(url)
 *   extractHttpCallsFromNode - constant reference resolution
 *   extractHttpCallsFromNode - template literal URL
 *   extractHttpCallsFromNode - skips non-HTTP calls
 */

import { extractHttpCallsFromNode } from '../../../src/languages/javascript/httpInteractionExtractor';
import { extractSymbols } from '../../../src/languages/javascript/symbolResolver';
import { parseJsTs } from '../../../src/languages/javascript/parser';
import type { SemanticHttpCall, SemanticSymbol } from '../../../src/ast/astTypes';

function parseAndExtract(src: string): SemanticHttpCall[] {
  const { ast } = parseJsTs('test.js', src, 'javascript');
  const { constants } = extractSymbols(ast);
  const out: SemanticHttpCall[] = [];
  extractHttpCallsFromNode(ast, constants, out);
  return out;
}

describe('extractHttpCallsFromNode', () => {
  it('extracts axios.get(url)', () => {
    const calls = parseAndExtract(`axios.get('/users');`);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].resolvedPath).toBe('/users');
  });

  it('extracts axios.post(url)', () => {
    const calls = parseAndExtract(`axios.post('/users');`);
    expect(calls[0]).toMatchObject({ method: 'POST', resolvedPath: '/users' });
  });

  it('extracts axios.delete(url)', () => {
    const calls = parseAndExtract(`axios.delete('/users/1');`);
    expect(calls[0]).toMatchObject({ method: 'DELETE' });
  });

  it('extracts fetch(url) as GET by default', () => {
    const calls = parseAndExtract(`fetch('/items');`);
    expect(calls[0]).toMatchObject({ method: 'GET', resolvedPath: '/items' });
  });

  it('extracts fetch(url, { method: "POST" })', () => {
    const calls = parseAndExtract(`fetch('/items', { method: 'POST' });`);
    expect(calls[0]).toMatchObject({ method: 'POST', resolvedPath: '/items' });
  });

  it('extracts supertest(app).get(url)', () => {
    const src = `supertest(app).get('/ping');`;
    const calls = parseAndExtract(src);
    expect(calls[0]).toMatchObject({ method: 'GET', resolvedPath: '/ping' });
  });

  it('resolves a constant reference in the URL argument', () => {
    const src = `
      const USERS_URL = '/users';
      axios.get(USERS_URL);
    `;
    const calls = parseAndExtract(src);
    expect(calls[0]).toMatchObject({ method: 'GET', resolvedPath: '/users', resolutionType: 'constant' });
  });

  it('resolves a template literal URL', () => {
    const src = 'axios.get(`/users/${id}`);';
    const calls = parseAndExtract(src);
    // Template with expression — path won't fully resolve but call is detected
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0].method).toBe('GET');
  });

  it('sets confidence=high for direct string literal URLs', () => {
    const calls = parseAndExtract(`axios.get('/orders');`);
    expect(calls[0].confidence).toBe('high');
  });

  it('sets confidence=medium for constant-resolved URLs', () => {
    const src = `
      const ORDERS_URL = '/orders';
      axios.get(ORDERS_URL);
    `;
    const calls = parseAndExtract(src);
    expect(calls[0].confidence).toBe('medium');
  });

  it('does not extract non-HTTP method calls', () => {
    const calls = parseAndExtract(`console.log('hello'); Math.sqrt(4);`);
    expect(calls).toHaveLength(0);
  });

  it('extracts multiple HTTP calls in one file', () => {
    const src = `
      axios.get('/users');
      axios.post('/orders');
      axios.delete('/items/1');
    `;
    const calls = parseAndExtract(src);
    expect(calls.length).toBeGreaterThanOrEqual(3);
    const methods = calls.map((c) => c.method);
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
    expect(methods).toContain('DELETE');
  });

  it('extracts calls from inside function bodies', () => {
    const src = `
      function testFn() {
        client.get('/test');
      }
    `;
    const calls = parseAndExtract(src);
    expect(calls[0]).toMatchObject({ method: 'GET' });
  });

  it('resolves enum member dot-path URL', () => {
    const src = `
      enum Routes { USERS = '/users' }
      axios.get(Routes.USERS);
    `;
    const calls = parseAndExtract(src);
    expect(calls[0]).toMatchObject({ resolvedPath: '/users' });
  });
});
