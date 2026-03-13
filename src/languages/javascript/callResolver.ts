/**
 * JavaScript/TypeScript call graph resolver.
 *
 * Extracts function and method definitions from the AST alongside:
 *   - their call graph edges (which local functions they call)
 *   - any HTTP call sites within the function body
 *   - a static return value if the function just returns a string literal
 */

import type { SemanticFunction, SemanticHttpCall } from '../../ast/astTypes';
import { extractHttpCallsFromNode } from './httpInteractionExtractor';
import type { SemanticSymbol } from '../../ast/astTypes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AstNode = any;

/**
 * Build a map of function name → SemanticFunction from the AST.
 */
export function buildCallGraph(
  ast: AstNode,
  constants: Map<string, SemanticSymbol>,
): Map<string, SemanticFunction> {
  const graph = new Map<string, SemanticFunction>();
  if (!ast?.body) return graph;

  for (const node of ast.body) {
    extractFunctionFromTopLevel(node, graph, constants);
  }
  return graph;
}

function extractFunctionFromTopLevel(
  node: AstNode,
  graph: Map<string, SemanticFunction>,
  constants: Map<string, SemanticSymbol>,
): void {
  if (!node) return;

  switch (node.type) {
    case 'FunctionDeclaration':
      if (node.id?.name) {
        addFunction(node.id.name, node.params, node.body, graph, constants);
      }
      break;

    case 'VariableDeclaration':
      for (const decl of node.declarations ?? []) {
        if (
          decl.id?.name &&
          (decl.init?.type === 'ArrowFunctionExpression' ||
            decl.init?.type === 'FunctionExpression')
        ) {
          addFunction(decl.id.name, decl.init.params, decl.init.body, graph, constants);
        }
      }
      break;

    case 'ExpressionStatement':
      // Detect test blocks: describe('...', () => { ... })
      extractTestBlocks(node.expression, graph, constants);
      break;

    case 'ExportNamedDeclaration':
      if (node.declaration) extractFunctionFromTopLevel(node.declaration, graph, constants);
      break;

    case 'ExportDefaultDeclaration':
      if (
        node.declaration?.type === 'FunctionDeclaration' ||
        node.declaration?.type === 'ArrowFunctionExpression'
      ) {
        const name = node.declaration.id?.name ?? 'default';
        addFunction(name, node.declaration.params, node.declaration.body, graph, constants);
      }
      break;

    case 'ClassDeclaration':
      extractClassMethods(node, graph, constants);
      break;
  }
}

function extractTestBlocks(
  expr: AstNode,
  graph: Map<string, SemanticFunction>,
  constants: Map<string, SemanticSymbol>,
): void {
  if (!expr || expr.type !== 'CallExpression') return;

  const callee = expr.callee?.name ?? expr.callee?.property?.name ?? '';
  const isBlock = ['describe', 'it', 'test', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll',
    'context', 'When', 'Given', 'Then'].includes(callee);

  if (!isBlock) return;

  const labelArg = expr.arguments?.[0];
  const label = labelArg?.type === 'Literal' ? (labelArg.value ?? callee) : callee;
  const fnArg = expr.arguments?.find(
    (a: AstNode) =>
      a.type === 'ArrowFunctionExpression' || a.type === 'FunctionExpression',
  );

  if (fnArg) {
    const blockName = `${callee}:${label}`;
    addFunction(blockName, fnArg.params, fnArg.body, graph, constants);
    // Also recurse into the block body for nested describe/it
    if (fnArg.body?.body) {
      for (const stmt of fnArg.body.body) {
        extractTestBlocks(stmt?.expression, graph, constants);
      }
    }
  }
}

function extractClassMethods(
  classNode: AstNode,
  graph: Map<string, SemanticFunction>,
  constants: Map<string, SemanticSymbol>,
): void {
  for (const member of classNode.body?.body ?? []) {
    if (member.type === 'MethodDefinition' || member.type === 'PropertyDefinition') {
      const methodName = member.key?.name ?? member.key?.value;
      if (methodName && member.value?.type === 'FunctionExpression') {
        addFunction(
          methodName,
          member.value.params,
          member.value.body,
          graph,
          constants,
        );
      }
    }
  }
}

function addFunction(
  name: string,
  params: AstNode[],
  body: AstNode,
  graph: Map<string, SemanticFunction>,
  constants: Map<string, SemanticSymbol>,
): void {
  const paramNames = (params ?? [])
    .map((p: AstNode) => p.name ?? p.left?.name ?? p.argument?.name ?? '')
    .filter(Boolean);

  const calledFunctions: string[] = [];
  const httpCalls: SemanticHttpCall[] = [];
  let returnValue: string | undefined;
  const annotations: string[] = [];

  // Walk the body
  if (body) {
    walkForCalls(body, calledFunctions, constants);
    extractHttpCallsFromNode(body, constants, httpCalls);
    returnValue = extractReturnValue(body, constants);
  }

  graph.set(name, {
    name,
    parameters: paramNames,
    bodyHttpCalls: httpCalls,
    calledFunctions,
    returnValue,
    annotations,
  });
}

function walkForCalls(
  node: AstNode,
  calls: string[],
  constants: Map<string, SemanticSymbol>,
): void {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'CallExpression') {
    const name = getCallName(node.callee);
    if (name && !calls.includes(name)) calls.push(name);
  }

  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'tokens' || key === 'comments') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) {
        if (c && typeof c === 'object' && c.type) walkForCalls(c, calls, constants);
      }
    } else if (child && typeof child === 'object' && child.type) {
      walkForCalls(child, calls, constants);
    }
  }
}

function getCallName(callee: AstNode): string | undefined {
  if (!callee) return undefined;
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression') {
    const obj = callee.object?.name ?? callee.object?.type ?? '';
    const prop = callee.property?.name ?? '';
    if (obj && prop) return `${obj}.${prop}`;
    return prop || undefined;
  }
  return undefined;
}

function extractReturnValue(
  body: AstNode,
  constants: Map<string, SemanticSymbol>,
): string | undefined {
  if (!body?.body) return undefined;
  for (const stmt of body.body) {
    if (stmt.type === 'ReturnStatement' && stmt.argument) {
      return evaluateStringNode(stmt.argument, constants);
    }
  }
  return undefined;
}

/**
 * Try to evaluate a node to a static string value.
 * Handles: Literal, TemplateLiteral, Identifier (symbol lookup), BinaryExpression (+).
 */
export function evaluateStringNode(
  node: AstNode,
  constants: Map<string, SemanticSymbol>,
  localVars?: Map<string, SemanticSymbol>,
): string | undefined {
  if (!node) return undefined;

  if (node.type === 'Literal') {
    return typeof node.value === 'string' ? node.value : undefined;
  }

  if (node.type === 'TemplateLiteral') {
    return evaluateTemplateLiteral(node, constants, localVars);
  }

  if (node.type === 'Identifier') {
    return (
      localVars?.get(node.name)?.resolvedValue ??
      constants.get(node.name)?.resolvedValue
    );
  }

  if (node.type === 'MemberExpression') {
    const key = memberKey(node);
    if (key) {
      return (
        localVars?.get(key)?.resolvedValue ??
        constants.get(key)?.resolvedValue
      );
    }
    return undefined;
  }

  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const left = evaluateStringNode(node.left, constants, localVars);
    const right = evaluateStringNode(node.right, constants, localVars);
    if (left !== undefined && right !== undefined) return left + right;
    if (left !== undefined) return left + '{var}';
    if (right !== undefined) return '{var}' + right;
    return undefined;
  }

  if (node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression') {
    return evaluateStringNode(node.expression, constants, localVars);
  }

  return undefined;
}

function evaluateTemplateLiteral(
  node: AstNode,
  constants: Map<string, SemanticSymbol>,
  localVars?: Map<string, SemanticSymbol>,
): string | undefined {
  // `text ${expr} text`
  const quasis: AstNode[] = node.quasis ?? [];
  const expressions: AstNode[] = node.expressions ?? [];

  let result = '';
  for (let i = 0; i < quasis.length; i++) {
    result += quasis[i]?.value?.cooked ?? quasis[i]?.value?.raw ?? '';
    if (i < expressions.length) {
      const expr = expressions[i];
      const resolved = evaluateStringNode(expr, constants, localVars);
      result += resolved !== undefined ? resolved : '{id}';
    }
  }
  return result;
}

export function memberKey(node: AstNode): string | undefined {
  if (node.type !== 'MemberExpression') return undefined;
  const objName =
    node.object?.name ??
    (node.object?.type === 'MemberExpression' ? memberKey(node.object) : undefined);
  const propName = node.property?.name ?? node.property?.value;
  if (objName && propName) return `${objName}.${propName}`;
  return undefined;
}
