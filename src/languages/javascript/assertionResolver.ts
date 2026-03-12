/**
 * JavaScript/TypeScript assertion resolver.
 *
 * Detects assertion patterns linked to HTTP response variables:
 *   - expect(response).toHaveProperty(...)  → body-field
 *   - expect(response.status).toBe(200)     → status-code
 *   - expect(response.statusCode).toEqual(200) → status-code
 *   - response.expect(200)                  → fluent-chain (supertest)
 *   - .expect(res => { ... })               → fluent-chain
 */

import type { SemanticAssertion } from '../../ast/astTypes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AstNode = any;

/**
 * Extract all assertion nodes from an AST subtree.
 */
export function extractAssertions(ast: AstNode): SemanticAssertion[] {
  const assertions: SemanticAssertion[] = [];
  if (!ast) return assertions;
  walkForAssertions(ast, assertions);
  return assertions;
}

function walkForAssertions(node: AstNode, out: SemanticAssertion[]): void {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'CallExpression') {
    const assertion = tryExtractAssertion(node);
    if (assertion) {
      out.push(assertion);
    }
  }

  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'tokens' || key === 'comments') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) {
        if (c && typeof c === 'object' && c.type) walkForAssertions(c, out);
      }
    } else if (child && typeof child === 'object' && child.type) {
      walkForAssertions(child, out);
    }
  }
}

function tryExtractAssertion(callNode: AstNode): SemanticAssertion | null {
  const callee = callNode.callee;
  if (!callee) return null;

  // expect(subject) — the start of a Jest/Jasmine assertion chain
  if (callee.type === 'Identifier' && callee.name === 'expect') {
    const subject = callNode.arguments?.[0];
    if (!subject) return null;

    const { variable, assertionType } = classifyExpectSubject(subject);
    return { assertionType, subjectVariable: variable, line: callNode.loc?.start?.line };
  }

  // expect(subject).toBe / toEqual / toHaveProperty etc.
  if (callee.type === 'MemberExpression' && callee.object?.type === 'CallExpression') {
    const innerCall = callee.object;
    if (innerCall.callee?.name === 'expect') {
      const subject = innerCall.arguments?.[0];
      if (!subject) return null;
      const methodName = callee.property?.name?.toLowerCase() ?? '';
      const { variable, assertionType: subjectType } = classifyExpectSubject(subject);
      const assertionType = classifyAssertionMethod(methodName, subjectType);
      return { assertionType, subjectVariable: variable, line: callNode.loc?.start?.line };
    }
  }

  // supertest fluent: response.expect(200) or .expect(res => { ... })
  if (callee.type === 'MemberExpression' && callee.property?.name === 'expect') {
    const obj = callee.object;
    const varName =
      obj?.type === 'Identifier'
        ? obj.name
        : obj?.type === 'CallExpression'
          ? undefined // chained call — variable is unknown
          : undefined;

    const firstArg = callNode.arguments?.[0];
    if (firstArg?.type === 'Literal' && typeof firstArg.value === 'number') {
      return {
        assertionType: 'status-code',
        subjectVariable: varName,
        line: callNode.loc?.start?.line,
      };
    }
    return {
      assertionType: 'fluent-chain',
      subjectVariable: varName,
      line: callNode.loc?.start?.line,
    };
  }

  // assert(condition), assert.equal, chai assert
  if (callee.type === 'Identifier' && callee.name === 'assert') {
    return { assertionType: 'status-code', line: callNode.loc?.start?.line };
  }

  if (
    callee.type === 'MemberExpression' &&
    (callee.object?.name === 'assert' || callee.object?.name === 'chai')
  ) {
    return {
      assertionType: 'body-field',
      line: callNode.loc?.start?.line,
    };
  }

  return null;
}

function classifyExpectSubject(subject: AstNode): {
  variable: string | undefined;
  assertionType: SemanticAssertion['assertionType'];
} {
  if (subject.type === 'Identifier') {
    return { variable: subject.name, assertionType: 'body-field' };
  }

  if (subject.type === 'MemberExpression') {
    const obj = subject.object;
    const prop = subject.property?.name?.toLowerCase() ?? '';
    const variable = obj?.type === 'Identifier' ? obj.name : undefined;

    if (prop === 'status' || prop === 'statuscode' || prop === 'status_code') {
      return { variable, assertionType: 'status-code' };
    }
    if (prop === 'body' || prop === 'data' || prop === 'json') {
      return { variable, assertionType: 'body-field' };
    }
    return { variable, assertionType: 'body-field' };
  }

  if (subject.type === 'CallExpression') {
    const methodName = subject.callee?.property?.name?.toLowerCase() ?? '';
    const variable = subject.callee?.object?.name;
    if (methodName === 'json' || methodName === 'text') {
      return { variable, assertionType: 'body-field' };
    }
  }

  return { variable: undefined, assertionType: 'body-field' };
}

function classifyAssertionMethod(
  methodName: string,
  subjectType?: SemanticAssertion['assertionType'],
): SemanticAssertion['assertionType'] {
  if (
    methodName === 'tobe' ||
    methodName === 'toequal' ||
    methodName === 'tostrictequal' ||
    methodName === 'tobetruthy' ||
    methodName === 'tobefalsy'
  ) {
    // These methods are ambiguous — use subject context to decide.
    // Only classify as status-code when the subject involves status.
    return subjectType === 'status-code' ? 'status-code' : 'body-field';
  }
  if (methodName === 'tohaveproperty' || methodName === 'tocontain' || methodName === 'tomatch') {
    return 'body-field';
  }
  if (methodName === 'tothrow' || methodName === 'tothrowserror') {
    return 'exception-catch';
  }
  return 'body-field';
}
