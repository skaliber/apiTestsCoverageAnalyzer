/**
 * Unit tests for assertion-awareness helpers.
 *
 * Coverage:
 *   isAssertionLinked
 *   extractResponseVariables
 *   buildAssertionMap
 */

import {
  isAssertionLinked,
  extractResponseVariables,
  buildAssertionMap,
} from '../../../src/coverage/deep-analysis/resolveAssertions';

// ─── isAssertionLinked ────────────────────────────────────────────────────────

describe('isAssertionLinked', () => {
  // TypeScript / Jest

  it('returns true when the variable is used in a Jest expect() call', () => {
    const content = `
      const response = client.get('/users');
      expect(response.status).toBe(200);
    `;
    expect(isAssertionLinked('response', content)).toBe(true);
  });

  it('returns false when the variable is never asserted in a Jest context', () => {
    const content = `
      const response = client.get('/users');
      console.log(response);
    `;
    expect(isAssertionLinked('response', content)).toBe(false);
  });

  // Java / JUnit

  it('returns true when the variable appears in assertEquals', () => {
    const content = `
      Response response = api.get("/users");
      assertEquals(200, response.getStatusCode());
    `;
    expect(isAssertionLinked('response', content)).toBe(true);
  });

  it('returns true when the variable appears in assertThat', () => {
    const content = `
      Response resp = api.post("/orders");
      assertThat(resp.getBody()).isNotEmpty();
    `;
    expect(isAssertionLinked('resp', content)).toBe(true);
  });

  it('returns true when the variable appears in assertNotNull', () => {
    const content = `
      Response r = api.get("/search");
      assertNotNull(r);
    `;
    expect(isAssertionLinked('r', content)).toBe(true);
  });

  // Python / pytest

  it('returns true for a Python assert statement', () => {
    const content = `
response = client.get('/users')
assert response.status_code == 200
    `;
    expect(isAssertionLinked('response', content)).toBe(true);
  });

  it('returns true for Python unittest self.assertEqual', () => {
    const content = `
response = client.get('/users')
self.assertEqual(response.status_code, 200)
    `;
    expect(isAssertionLinked('response', content)).toBe(true);
  });

  it('returns false for an empty variable name', () => {
    expect(isAssertionLinked('', 'expect(response.status).toBe(200);')).toBe(false);
  });

  // Kotlin / Kotest

  it('returns true for a Kotest shouldBe assertion', () => {
    const content = `
      val response = client.get("/users")
      response.status shouldBe 200
    `;
    expect(isAssertionLinked('response', content)).toBe(true);
  });

  // RestAssured

  it('returns true for a RestAssured .then() chain', () => {
    const content = `
      Response response = given().get("/users");
      response.then().statusCode(200);
    `;
    expect(isAssertionLinked('response', content)).toBe(true);
  });
});

// ─── extractResponseVariables ────────────────────────────────────────────────

describe('extractResponseVariables', () => {
  it('extracts a TypeScript const assignment from a client.get call', () => {
    const content = `const resp = client.get('/users');`;
    const vars = extractResponseVariables(content);
    expect(vars).toEqual(
      expect.arrayContaining([{ varName: 'resp', method: 'GET', path: '/users' }]),
    );
  });

  it('extracts a TypeScript let assignment from a client.post call', () => {
    const content = `let result = api.post('/orders');`;
    const vars = extractResponseVariables(content);
    expect(vars).toEqual(
      expect.arrayContaining([{ varName: 'result', method: 'POST', path: '/orders' }]),
    );
  });

  it('extracts a Java Response assignment', () => {
    const content = `Response response = api.get("/users");`;
    const vars = extractResponseVariables(content);
    expect(vars).toEqual(
      expect.arrayContaining([{ varName: 'response', method: 'GET', path: '/users' }]),
    );
  });

  it('extracts a Python client.get assignment', () => {
    const content = `response = client.get('/users')`;
    const vars = extractResponseVariables(content);
    expect(vars).toEqual(
      expect.arrayContaining([{ varName: 'response', method: 'GET', path: '/users' }]),
    );
  });

  it('extracts a Python requests.post assignment', () => {
    const content = `resp = requests.post('/orders')`;
    const vars = extractResponseVariables(content);
    expect(vars).toEqual(
      expect.arrayContaining([{ varName: 'resp', method: 'POST', path: '/orders' }]),
    );
  });

  it('returns an empty array when there are no HTTP call assignments', () => {
    expect(extractResponseVariables('const x = 1;')).toEqual([]);
  });

  it('extracts multiple response variables', () => {
    const content = `
      const r1 = api.get('/users');
      const r2 = api.post('/orders');
    `;
    const vars = extractResponseVariables(content);
    const names = vars.map((v) => v.varName);
    expect(names).toContain('r1');
    expect(names).toContain('r2');
  });

  it('extracts ValidatableResponse Java type', () => {
    const content = `ValidatableResponse res = given().get("/search");`;
    const vars = extractResponseVariables(content);
    expect(vars.some((v) => v.varName === 'res')).toBe(true);
  });
});

// ─── buildAssertionMap ────────────────────────────────────────────────────────

describe('buildAssertionMap', () => {
  it('maps a variable to true when an assertion is present', () => {
    const content = `
      const response = client.get('/users');
      expect(response.status).toBe(200);
    `;
    const map = buildAssertionMap(content);
    expect(map.get('response')).toBe(true);
  });

  it('maps a variable to false when no assertion is present', () => {
    const content = `const response = client.get('/users');`;
    const map = buildAssertionMap(content);
    expect(map.get('response')).toBe(false);
  });

  it('returns an empty map when no response variables are found', () => {
    const map = buildAssertionMap('const x = 1;');
    expect(map.size).toBe(0);
  });

  it('maps multiple variables independently', () => {
    const content = `
      const r1 = api.get('/users');
      expect(r1.status).toBe(200);
      const r2 = api.post('/orders');
    `;
    const map = buildAssertionMap(content);
    expect(map.get('r1')).toBe(true);
    expect(map.get('r2')).toBe(false);
  });

  it('handles Python assert statements', () => {
    const content = `
response = client.get('/users')
assert response.status_code == 200
    `;
    const map = buildAssertionMap(content);
    expect(map.get('response')).toBe(true);
  });
});
