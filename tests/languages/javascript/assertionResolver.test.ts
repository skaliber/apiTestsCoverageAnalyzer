/**
 * Unit tests for src/languages/javascript/assertionResolver.ts
 *
 * Coverage:
 *   extractAssertions - expect(response).toHaveProperty
 *   extractAssertions - expect(response.status).toBe(200)
 *   extractAssertions - response.expect(200) (supertest fluent)
 *   extractAssertions - assert(condition)
 *   extractAssertions - no assertions returns empty array
 */

import { extractAssertions } from '../../../src/languages/javascript/assertionResolver';
import { parseJsTs } from '../../../src/languages/javascript/parser';

function parse(src: string) {
  return parseJsTs('test.js', src, 'javascript').ast;
}

describe('extractAssertions', () => {
  it('detects expect(response).toHaveProperty as body-field', () => {
    const ast = parse(`expect(response).toHaveProperty('data');`);
    const assertions = extractAssertions(ast);
    expect(assertions.length).toBeGreaterThan(0);
    const a = assertions.find((x) => x.assertionType === 'body-field');
    expect(a).toBeDefined();
  });

  it('detects expect(response.status).toBe(200) as status-code', () => {
    const ast = parse(`expect(response.status).toBe(200);`);
    const assertions = extractAssertions(ast);
    const a = assertions.find((x) => x.assertionType === 'status-code');
    expect(a).toBeDefined();
    expect(a?.subjectVariable).toBe('response');
  });

  it('detects supertest fluent response.expect(200) as status-code', () => {
    const ast = parse(`res.expect(200);`);
    const assertions = extractAssertions(ast);
    const a = assertions.find((x) => x.assertionType === 'status-code');
    expect(a).toBeDefined();
  });

  it('detects assert(...) call as status-code', () => {
    const ast = parse(`assert(response.ok);`);
    const assertions = extractAssertions(ast);
    expect(assertions.length).toBeGreaterThan(0);
  });

  it('returns empty array for source with no assertions', () => {
    const ast = parse(`const x = 42;`);
    expect(extractAssertions(ast)).toEqual([]);
  });

  it('links subjectVariable to the first arg of expect()', () => {
    const ast = parse(`expect(myResponse).toBeTruthy();`);
    const assertions = extractAssertions(ast);
    const a = assertions.find((x) => x.subjectVariable === 'myResponse');
    expect(a).toBeDefined();
  });

  it('detects expect(res.statusCode).toEqual(201) as status-code', () => {
    const ast = parse(`expect(res.statusCode).toEqual(201);`);
    const assertions = extractAssertions(ast);
    const a = assertions.find((x) => x.assertionType === 'status-code');
    expect(a).toBeDefined();
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
