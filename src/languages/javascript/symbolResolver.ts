/**
 * JavaScript/TypeScript symbol resolver.
 *
 * Walks a @typescript-eslint/typescript-estree AST and extracts:
 *   - top-level const/let/var declarations with string literal values
 *   - TypeScript enum declarations with string member values
 *   - object property constants: const Routes = { USERS: '/users' }
 *
 * The extracted symbols are stored in a flat map keyed by identifier name
 * (for simple constants) or "Object.MEMBER" notation (for object properties
 * and enum members) so that call-site references like `Routes.USERS` resolve.
 */

import type { SemanticSymbol } from '../../ast/astTypes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AstNode = any;

/**
 * Extract all statically-known string symbols from the AST.
 * Returns two maps:
 *   constants — module-level named constants
 *   localVariables — function-scoped variables (populated per-function by callResolver)
 */
export function extractSymbols(ast: AstNode): {
  constants: Map<string, SemanticSymbol>;
  localVariables: Map<string, SemanticSymbol>;
} {
  const constants = new Map<string, SemanticSymbol>();
  const localVariables = new Map<string, SemanticSymbol>();

  if (!ast || !ast.body) return { constants, localVariables };

  for (const node of ast.body) {
    visitTopLevelNode(node, constants);
  }

  return { constants, localVariables };
}

function visitTopLevelNode(node: AstNode, map: Map<string, SemanticSymbol>): void {
  if (!node) return;

  switch (node.type) {
    case 'VariableDeclaration':
      for (const decl of node.declarations ?? []) {
        extractVariableDecl(decl, node.kind ?? 'var', map);
      }
      break;

    case 'ExportNamedDeclaration':
      if (node.declaration) visitTopLevelNode(node.declaration, map);
      break;

    case 'TSEnumDeclaration':
      extractTsEnum(node, map);
      break;

    case 'ExpressionStatement':
      // module.exports = { ... }
      if (node.expression?.type === 'AssignmentExpression') {
        extractModuleExports(node.expression, map);
      }
      break;
  }
}

function extractVariableDecl(
  decl: AstNode,
  kind: string,
  map: Map<string, SemanticSymbol>,
): void {
  if (!decl?.id || !decl.init) return;

  const name = decl.id.name;
  if (!name) return;

  const line = decl.id.loc?.start?.line;

  // Simple string: const USERS = '/users'
  if (decl.init.type === 'Literal' && typeof decl.init.value === 'string') {
    map.set(name, {
      name,
      kind: kind as SemanticSymbol['kind'],
      value: decl.init.value,
      resolvedValue: decl.init.value,
      line,
    });
    return;
  }

  // Template literal with no expressions: const USERS = `/users`
  if (
    decl.init.type === 'TemplateLiteral' &&
    decl.init.expressions?.length === 0 &&
    decl.init.quasis?.length === 1
  ) {
    const raw = decl.init.quasis[0]?.value?.cooked ?? decl.init.quasis[0]?.value?.raw ?? '';
    map.set(name, { name, kind: kind as SemanticSymbol['kind'], value: raw, resolvedValue: raw, line });
    return;
  }

  // Object literal with string properties: const Routes = { USERS: '/users' }
  if (decl.init.type === 'ObjectExpression') {
    extractObjectProps(name, decl.init, kind, map);
    return;
  }

  // "as const" satisfies pattern: treat the inner value
  if (decl.init.type === 'TSAsExpression' || decl.init.type === 'TSSatisfiesExpression') {
    const inner = { ...decl, init: decl.init.expression };
    extractVariableDecl(inner, kind, map);
    return;
  }
}

function extractObjectProps(
  prefix: string,
  objNode: AstNode,
  kind: string,
  map: Map<string, SemanticSymbol>,
): void {
  for (const prop of objNode.properties ?? []) {
    if (prop.type !== 'Property' && prop.type !== 'ObjectProperty') continue;

    const keyName = prop.key?.name ?? prop.key?.value;
    if (!keyName) continue;

    const fullName = `${prefix}.${keyName}`;
    const line = prop.loc?.start?.line;

    if (prop.value?.type === 'Literal' && typeof prop.value.value === 'string') {
      map.set(fullName, {
        name: fullName,
        kind: 'const',
        value: prop.value.value,
        resolvedValue: prop.value.value,
        line,
      });
    } else if (prop.value?.type === 'ObjectExpression') {
      // Nested objects: const Routes = { USER: { LIST: '/users' } }
      extractObjectProps(fullName, prop.value, kind, map);
    }
  }
}

function extractTsEnum(node: AstNode, map: Map<string, SemanticSymbol>): void {
  const enumName = node.id?.name;
  if (!enumName) return;

  for (const member of node.members ?? []) {
    const memberName = member.id?.name ?? member.id?.value;
    if (!memberName) continue;

    const fullName = `${enumName}.${memberName}`;
    const line = member.loc?.start?.line;

    if (member.initializer?.type === 'Literal' && typeof member.initializer.value === 'string') {
      map.set(fullName, {
        name: fullName,
        kind: 'enum-member',
        value: member.initializer.value,
        resolvedValue: member.initializer.value,
        line,
      });
    }
  }
}

function extractModuleExports(assign: AstNode, map: Map<string, SemanticSymbol>): void {
  // module.exports = { USERS: '/users' }
  const left = assign.left;
  const right = assign.right;
  if (
    left?.object?.name === 'module' &&
    left?.property?.name === 'exports' &&
    right?.type === 'ObjectExpression'
  ) {
    extractObjectProps('exports', right, 'const', map);
    // Also index without prefix for default patterns
    for (const prop of right.properties ?? []) {
      if (prop.type !== 'Property') continue;
      const keyName = prop.key?.name ?? prop.key?.value;
      if (!keyName) continue;
      if (prop.value?.type === 'Literal' && typeof prop.value.value === 'string') {
        map.set(keyName, {
          name: keyName,
          kind: 'const',
          value: prop.value.value,
          resolvedValue: prop.value.value,
        });
      }
    }
  }
}

/**
 * Resolve a token (variable name or dotted path) against a symbol map.
 * e.g. "Routes.USERS" → "/users"
 */
export function resolveSymbol(
  token: string,
  constants: Map<string, SemanticSymbol>,
  localVars?: Map<string, SemanticSymbol>,
): string | undefined {
  const local = localVars?.get(token);
  if (local?.resolvedValue !== undefined) return local.resolvedValue;

  const sym = constants.get(token);
  if (sym?.resolvedValue !== undefined) return sym.resolvedValue;

  return undefined;
}
