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
});
