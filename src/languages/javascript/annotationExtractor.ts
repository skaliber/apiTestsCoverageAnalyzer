/**
 * Business rule and integration flow annotation extractor for JS/TS.
 *
 * Detects annotations in test files as:
 *   - JSDoc-style comments: @businessRule BR-001, @flowId FLOW-001
 *   - jest.each tags or describe block labels with rule IDs
 *   - Cucumber-style tags in describe/it names: 'BR-001 user can login'
 */

import type { BusinessRuleRef, FlowRef } from '../../ast/astTypes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AstNode = any;

const BUSINESS_RULE_PATTERN = /(?:@businessRule|@business-rule|BR-?(\w+))\s*([\w-]+)?/gi;
const FLOW_ID_PATTERN = /(?:@flowId|@flow-id|FLOW-?(\w+))\s*([\w-]+)?/gi;

/**
 * Extract business rule references from JSDoc comments and string labels in the AST.
 */
export function extractBusinessRuleRefs(ast: AstNode): BusinessRuleRef[] {
  const refs: BusinessRuleRef[] = [];
  if (!ast) return refs;

  // Check comments
  for (const comment of ast.comments ?? []) {
    const text = comment.value ?? '';
    const matches = [...text.matchAll(BUSINESS_RULE_PATTERN)];
    for (const match of matches) {
      const ruleId = (match[1] ?? match[2] ?? '').trim();
      if (ruleId) {
        refs.push({ ruleId, source: 'comment', line: comment.loc?.start?.line });
      }
    }
  }

  // Check string literals in describe/it block labels
  extractFromStringLabels(ast, BUSINESS_RULE_PATTERN, refs, 'comment');

  return refs;
}

/**
 * Extract flow references from JSDoc comments and string labels in the AST.
 */
export function extractFlowRefs(ast: AstNode): FlowRef[] {
  const refs: FlowRef[] = [];
  if (!ast) return refs;

  for (const comment of ast.comments ?? []) {
    const text = comment.value ?? '';
    const matches = [...text.matchAll(FLOW_ID_PATTERN)];
    for (const match of matches) {
      const flowId = (match[1] ?? match[2] ?? '').trim();
      if (flowId) {
        refs.push({ flowId, source: 'comment', line: comment.loc?.start?.line });
      }
    }
  }

  return refs;
}

function extractFromStringLabels(
  ast: AstNode,
  pattern: RegExp,
  refs: BusinessRuleRef[],
  source: BusinessRuleRef['source'],
): void {
  if (!ast?.body) return;
  for (const node of ast.body) {
    walkStringLabels(node, pattern, refs, source);
  }
}

function walkStringLabels(
  node: AstNode,
  pattern: RegExp,
  refs: BusinessRuleRef[],
  source: BusinessRuleRef['source'],
): void {
  if (!node || typeof node !== 'object') return;

  if (
    node.type === 'CallExpression' &&
    (node.callee?.name === 'describe' || node.callee?.name === 'it' || node.callee?.name === 'test')
  ) {
    const label = node.arguments?.[0];
    if (label?.type === 'Literal' && typeof label.value === 'string') {
      pattern.lastIndex = 0;
      const matches = [...label.value.matchAll(pattern)];
      for (const match of matches) {
        const ruleId = (match[1] ?? match[2] ?? '').trim();
        if (ruleId) refs.push({ ruleId, source, line: label.loc?.start?.line });
      }
    }
  }

  for (const key of ['body', 'expression', 'declaration', 'declarations', 'arguments']) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) {
        if (c && typeof c === 'object') walkStringLabels(c, pattern, refs, source);
      }
    } else if (child && typeof child === 'object') {
      walkStringLabels(child, pattern, refs, source);
    }
  }
}
