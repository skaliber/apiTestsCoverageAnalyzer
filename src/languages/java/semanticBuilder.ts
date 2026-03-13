/**
 * Java semantic model builder.
 *
 * Walks the tree-sitter Java CST to extract:
 *   - static final String constants and enum members
 *   - method definitions with their HTTP call bodies
 *   - assertion patterns
 *   - Cucumber step definition annotations
 */

import type {
  SemanticModel,
  SemanticSymbol,
  SemanticFunction,
  SemanticHttpCall,
  SemanticAssertion,
  BusinessRuleRef,
  FlowRef,
} from '../../ast/astTypes';
import {
  findNodes,
  walkTree,
  extractStringValue,
  firstChildOfType,
  type TsNode,
} from '../shared/treeSitterUtils';
import { normalizePathToTemplate } from '../../coverage/deep-analysis/resolvePaths';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'request']);

// ─── Symbol extraction ────────────────────────────────────────────────────────

export function extractJavaSymbols(
  root: TsNode,
): { constants: Map<string, SemanticSymbol>; enums: Map<string, Map<string, string>> } {
  const constants = new Map<string, SemanticSymbol>();
  const enums = new Map<string, Map<string, string>>();

  // Field declarations: private static final String USERS = "/users";
  const fieldDecls = findNodes(root, ['field_declaration']);
  for (const field of fieldDecls) {
    const modifiers = extractModifierTexts(field);
    if (!modifiers.includes('static') || !modifiers.includes('final')) continue;

    const declarators = findNodes(field, ['variable_declarator']);
    for (const decl of declarators) {
      const nameNode = firstChildOfType(decl, 'identifier');
      const valueNode = firstChildOfType(decl, 'string_literal');
      if (nameNode && valueNode) {
        const name = nameNode.text ?? '';
        const value = extractStringValue(valueNode) ?? '';
        constants.set(name, { name, kind: 'const', value, resolvedValue: value });
      }
    }
  }

  // Local variable declarations inside methods: String USERS = "/users";
  const localDecls = findNodes(root, ['local_variable_declaration']);
  for (const decl of localDecls) {
    const declarators = findNodes(decl, ['variable_declarator']);
    for (const vd of declarators) {
      const nameNode = firstChildOfType(vd, 'identifier');
      const valueNode = firstChildOfType(vd, 'string_literal');
      if (nameNode && valueNode) {
        const name = nameNode.text ?? '';
        const value = extractStringValue(valueNode) ?? '';
        constants.set(name, { name, kind: 'let', value, resolvedValue: value });
      }
    }
  }

  // Enum declarations
  const enumDecls = findNodes(root, ['enum_declaration']);
  for (const enumDecl of enumDecls) {
    const enumName = firstChildOfType(enumDecl, 'identifier')?.text ?? '';
    if (!enumName) continue;

    const memberMap = new Map<string, string>();
    const constants2 = findNodes(enumDecl, ['enum_constant']);
    for (const constant of constants2) {
      const memberName = firstChildOfType(constant, 'identifier')?.text ?? '';
      const argList = firstChildOfType(constant, 'argument_list');
      if (argList) {
        const strLit = firstChildOfType(argList, 'string_literal');
        if (strLit && memberName) {
          const value = extractStringValue(strLit) ?? '';
          memberMap.set(memberName, value);
          const fullName = `${enumName}.${memberName}`;
          constants.set(fullName, {
            name: fullName,
            kind: 'enum-member',
            value,
            resolvedValue: value,
          });
        }
      }
    }
    if (memberMap.size > 0) enums.set(enumName, memberMap);
  }

  return { constants, enums };
}

// ─── Function/method extraction ───────────────────────────────────────────────

export function extractJavaFunctions(
  root: TsNode,
  constants: Map<string, SemanticSymbol>,
): Map<string, SemanticFunction> {
  const graph = new Map<string, SemanticFunction>();

  const methodDecls = findNodes(root, ['method_declaration']);
  for (const method of methodDecls) {
    const nameNode = method.childForFieldName?.('name') ?? firstChildOfType(method, 'identifier');
    const name = nameNode?.text ?? '';
    if (!name) continue;

    const annotations = extractAnnotationNames(method);
    const block = method.childForFieldName?.('body') ?? firstChildOfType(method, 'block');

    const bodyHttpCalls: SemanticHttpCall[] = [];
    const calledFunctions: string[] = [];
    let returnValue: string | undefined;

    if (block) {
      extractJavaHttpCalls(block, constants, bodyHttpCalls);
      extractCalledMethods(block, calledFunctions);
      returnValue = extractJavaReturnValue(block, constants);
    }

    // Cucumber step pattern from annotation
    const cucumberPattern = extractCucumberPattern(annotations, method);

    graph.set(name, {
      name,
      parameters: [],
      bodyHttpCalls,
      calledFunctions,
      returnValue,
      annotations,
      cucumberPattern,
    });
  }

  return graph;
}

// ─── HTTP call extraction ─────────────────────────────────────────────────────

export function extractJavaHttpCalls(
  block: TsNode,
  constants: Map<string, SemanticSymbol>,
  out: SemanticHttpCall[],
): void {
  const methodInvocations = findNodes(block, ['method_invocation']);

  for (const invoc of methodInvocations) {
    const methodName =
      invoc.childForFieldName?.('name')?.text ?? firstChildNamed(invoc, 'identifier')?.text ?? '';
    const lowerMethod = methodName.toLowerCase();

    if (!HTTP_METHODS.has(lowerMethod)) continue;

    const argList = invoc.childForFieldName?.('arguments') ?? firstChildOfType(invoc, 'argument_list');
    if (!argList) continue;

    // Extract the first string argument (path)
    const firstStringArg = findFirstStringInArgList(argList, constants);
    if (!firstStringArg) continue;

    const { value: path, isDirect, varName } = firstStringArg;

    // Try to detect the HTTP method from context
    let httpMethod = lowerMethod.toUpperCase();

    // RestAssured: .when().get("/path") or .given().get("/path")
    // The method name IS the HTTP method in RestAssured style
    if (!HTTP_METHODS.has(lowerMethod)) continue;

    // MockMvc: perform(get("/path")) — perform wraps a method call
    if (lowerMethod === 'perform') {
      // The arg is another method invocation
      continue; // Handled when we process the inner get/post
    }

    if (lowerMethod === 'request') {
      // generic request(method, path) — try to get HTTP method from first arg
      const stringArgs = findAllStringsInArgList(argList, constants);
      if (stringArgs.length >= 2) {
        httpMethod = stringArgs[0].value.toUpperCase();
        const pathVal = stringArgs[1].value;
        const normalizedPath = pathVal.startsWith('/') ? normalizePathToTemplate(pathVal) : undefined;
        out.push({
          method: httpMethod,
          rawPathArg: varName ?? pathVal,
          resolvedPath: pathVal,
          normalizedPath,
          resolutionType: isDirect ? 'direct' : 'constant',
          confidence: isDirect ? 'high' : 'medium',
        });
        continue;
      }
    }

    const normalizedPath = path.startsWith('/') ? normalizePathToTemplate(path) : undefined;
    out.push({
      method: httpMethod,
      rawPathArg: varName ?? path,
      resolvedPath: path,
      normalizedPath,
      resolutionType: isDirect ? 'direct' : 'constant',
      confidence: isDirect ? 'high' : 'medium',
    });
  }
}

// ─── Assertion extraction ─────────────────────────────────────────────────────

export function extractJavaAssertions(root: TsNode): SemanticAssertion[] {
  const assertions: SemanticAssertion[] = [];

  const methodInvocations = findNodes(root, ['method_invocation']);
  for (const invoc of methodInvocations) {
    const name =
      invoc.childForFieldName?.('name')?.text ?? firstChildNamed(invoc, 'identifier')?.text ?? '';

    const lowerName = name.toLowerCase();

    if (
      lowerName.startsWith('assertequals') ||
      lowerName.startsWith('assertthat') ||
      lowerName.startsWith('assertnotnull') ||
      lowerName.startsWith('assert') ||
      lowerName === 'statuscode' ||
      lowerName === 'statusmustbe'
    ) {
      const type: SemanticAssertion['assertionType'] =
        lowerName.includes('status') ? 'status-code' : 'body-field';
      assertions.push({ assertionType: type });
    }
  }

  return assertions;
}

// ─── Business rule and flow ref extraction ────────────────────────────────────

export function extractJavaBusinessRuleRefs(root: TsNode): BusinessRuleRef[] {
  const refs: BusinessRuleRef[] = [];
  const annotations = findNodes(root, ['annotation', 'marker_annotation']);

  for (const ann of annotations) {
    const annText = ann.text ?? '';
    const brMatch = annText.match(/@(?:BusinessRule|businessRule|Tag)\s*\(\s*["']?([^)"'\s]+)/);
    if (brMatch) {
      refs.push({ ruleId: brMatch[1], source: 'annotation' });
    }
  }

  return refs;
}

export function extractJavaFlowRefs(root: TsNode): FlowRef[] {
  const refs: FlowRef[] = [];
  const annotations = findNodes(root, ['annotation', 'marker_annotation']);

  for (const ann of annotations) {
    const annText = ann.text ?? '';
    const flowMatch = annText.match(/@(?:Flow|IntegrationFlow|FlowId)\s*\(\s*["']?([^)"'\s]+)/);
    if (flowMatch) {
      refs.push({ flowId: flowMatch[1], source: 'annotation' });
    }
  }

  return refs;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractModifierTexts(node: TsNode): string[] {
  const modifiers: string[] = [];
  walkTree(node, (n) => {
    if (n.type === 'modifier' || n.type === 'final' || n.type === 'static' || n.type === 'public' ||
        n.type === 'private' || n.type === 'protected') {
      modifiers.push(n.text ?? '');
    }
  });
  return modifiers;
}

function extractAnnotationNames(node: TsNode): string[] {
  const names: string[] = [];
  for (let i = 0; i < (node?.childCount ?? 0); i++) {
    const child = node.child(i);
    if (child?.type === 'modifiers') {
      walkTree(child, (n) => {
        if (n.type === 'annotation' || n.type === 'marker_annotation') {
          // Get the annotation name
          const nameNode = firstChildOfType(n, 'identifier');
          if (nameNode) names.push('@' + (nameNode.text ?? ''));
        }
      });
    }
  }
  return names;
}

function extractCucumberPattern(annotations: string[], methodNode: TsNode): string | undefined {
  const cucumberAnnotations = ['@Given', '@When', '@Then', '@And', '@But'];
  for (const ann of annotations) {
    if (cucumberAnnotations.some((ca) => ann.startsWith(ca))) {
      // Extract the pattern string from the annotation
      const annNodes = findNodes(methodNode, ['annotation']);
      for (const annNode of annNodes) {
        const strLit = firstChildOfType(annNode, 'string_literal');
        if (strLit) return extractStringValue(strLit);
      }
    }
  }
  return undefined;
}

function firstChildNamed(node: TsNode, type: string): TsNode | undefined {
  if (!node) return undefined;
  // Find last identifier child (method name is usually at end of member access)
  let found: TsNode | undefined;
  for (let i = 0; i < (node.childCount ?? 0); i++) {
    const child = node.child(i);
    if (child?.type === type) found = child;
  }
  return found;
}

function findFirstStringInArgList(
  argList: TsNode,
  constants: Map<string, SemanticSymbol>,
): { value: string; isDirect: boolean; varName?: string } | undefined {
  for (let i = 0; i < (argList?.childCount ?? 0); i++) {
    const child = argList.child(i);
    if (!child) continue;

    if (child.type === 'string_literal') {
      const value = extractStringValue(child) ?? '';
      if (value) return { value, isDirect: true };
    }

    if (child.type === 'identifier') {
      const varName = child.text ?? '';
      const resolved = constants.get(varName)?.resolvedValue;
      if (resolved) return { value: resolved, isDirect: false, varName };
    }

    // Field access: Routes.USERS
    if (child.type === 'field_access' || child.type === 'member_access') {
      const objName = child.childForFieldName?.('object')?.text ?? '';
      const fieldName = child.childForFieldName?.('field')?.text ?? '';
      if (objName && fieldName) {
        const key = `${objName}.${fieldName}`;
        const resolved = constants.get(key)?.resolvedValue;
        if (resolved) return { value: resolved, isDirect: false, varName: key };
      }
    }
  }
  return undefined;
}

function findAllStringsInArgList(
  argList: TsNode,
  constants: Map<string, SemanticSymbol>,
): Array<{ value: string; isDirect: boolean }> {
  const results: Array<{ value: string; isDirect: boolean }> = [];
  for (let i = 0; i < (argList?.childCount ?? 0); i++) {
    const child = argList.child(i);
    if (!child) continue;
    if (child.type === 'string_literal') {
      const value = extractStringValue(child) ?? '';
      if (value) results.push({ value, isDirect: true });
    }
    if (child.type === 'identifier') {
      const resolved = constants.get(child.text ?? '')?.resolvedValue;
      if (resolved) results.push({ value: resolved, isDirect: false });
    }
  }
  return results;
}

function extractCalledMethods(block: TsNode, out: string[]): void {
  const invocations = findNodes(block, ['method_invocation']);
  for (const inv of invocations) {
    const name =
      inv.childForFieldName?.('name')?.text ?? firstChildNamed(inv, 'identifier')?.text ?? '';
    if (name && !out.includes(name)) out.push(name);
  }
}

function extractJavaReturnValue(
  block: TsNode,
  constants: Map<string, SemanticSymbol>,
): string | undefined {
  const returnStmts = findNodes(block, ['return_statement']);
  for (const ret of returnStmts) {
    const strLit = firstChildOfType(ret, 'string_literal');
    if (strLit) return extractStringValue(strLit);

    const identifier = firstChildOfType(ret, 'identifier');
    if (identifier) {
      return constants.get(identifier.text ?? '')?.resolvedValue;
    }
  }
  return undefined;
}
