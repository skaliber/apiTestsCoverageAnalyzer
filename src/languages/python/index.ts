/**
 * Python language analyzer using tree-sitter-python.
 */

import type { LanguageAnalyzer } from '../../ast/languageAnalyzer';
import type {
  SupportedLanguage,
  ParsedSourceFile,
  SemanticModel,
  SemanticSymbol,
  SemanticFunction,
  SemanticHttpCall,
  ResolvedHttpInteraction,
  SemanticAssertion,
  BusinessRuleRef,
  FlowRef,
  AnalysisContext,
  DecoratorStack,
  DecoratorInfo,
  RouteRegistration,
  SecurityClassification,
} from '../../ast/astTypes';
import { registerAnalyzer } from '../../ast/parserRegistry';
import {
  createParser,
  findNodes,
  firstChildOfType,
  extractStringValue,
  type TsNode,
} from '../shared/treeSitterUtils';
import { normalizePathToTemplate } from '../../coverage/deep-analysis/resolvePaths';
import {
  detectWebtestCalls,
  webtestCallsToHttpCalls,
  detectPytestFixtures,
} from './testPatternDetector';

// ─── Parser ───────────────────────────────────────────────────────────────────

let cachedParser: unknown = undefined;
let parserLoaded = false;

function getPythonParser(): unknown {
  if (!parserLoaded) {
    parserLoaded = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const grammar = require('tree-sitter-python');
      cachedParser = createParser(grammar);
    } catch { cachedParser = null; }
  }
  return cachedParser;
}

// ─── Analyzer ─────────────────────────────────────────────────────────────────

export class PythonAnalyzer implements LanguageAnalyzer {
  readonly language: SupportedLanguage = 'python';

  parse(filePath: string, content: string): ParsedSourceFile {
    const parser = getPythonParser();
    if (!parser) {
      return { filePath, language: 'python', ast: null, content, parseError: new Error('tree-sitter-python not available') };
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tree = (parser as any).parse(content);
      return { filePath, language: 'python', ast: tree, content };
    } catch (err) {
      return { filePath, language: 'python', ast: null, content, parseError: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  buildSemanticModel(parsed: ParsedSourceFile, _context: AnalysisContext): SemanticModel {
    const root = parsed.ast?.rootNode ?? parsed.ast;
    if (!root) return emptyModel(parsed.filePath);

    const constants = extractPythonConstants(root);
    const functions = extractPythonFunctions(root, constants);
    const assertions = extractPythonAssertions(root);
    const businessRuleRefs = extractPythonBusinessRefs(root);

    // Feature 27: Flask/FastAPI pattern detection
    const decoratorStacks = extractFlaskDecoratorStacks(root, parsed.filePath);
    const routeRegistrations = extractFlaskRouteRegistrations(root, parsed.filePath);

    // Feature 27: webtest API call detection
    const sourceText = root.text ?? parsed.content ?? '';
    const webtestCalls = detectWebtestCalls(sourceText, parsed.filePath);
    if (webtestCalls.length > 0) {
      const httpCalls = webtestCallsToHttpCalls(webtestCalls);
      // Merge webtest HTTP calls into the functions map under a synthetic entry
      const webtestFunc: SemanticFunction = {
        name: '__webtest_calls__',
        parameters: [],
        bodyHttpCalls: httpCalls,
        calledFunctions: [],
      };
      functions.set('__webtest_calls__', webtestFunc);
    }

    return {
      filePath: parsed.filePath,
      language: 'python',
      localVariables: new Map(),
      constants,
      enums: new Map(),
      functions,
      httpInteractions: [],
      assertions,
      businessRuleRefs,
      flowRefs: [],
      decoratorStacks,
      routeRegistrations,
    };
  }

  extractHttpInteractions(model: SemanticModel, _ctx: AnalysisContext): ResolvedHttpInteraction[] {
    const results: ResolvedHttpInteraction[] = [];
    const seen = new Set<string>();
    for (const fn of model.functions.values()) {
      for (const c of fn.bodyHttpCalls) {
        const path = c.resolvedPath ?? c.rawPathArg;
        if (!path) continue;
        const key = `${c.method}:${path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          method: c.method,
          path,
          normalizedPath: path.startsWith('/') ? normalizePathToTemplate(path) : undefined,
          sourceFile: model.filePath,
          sourceLanguage: 'python',
          resolutionType: c.resolutionType,
          confidence: c.confidence,
        });
      }
    }
    return results;
  }

  extractAssertions(model: SemanticModel): SemanticAssertion[] {
    return model.assertions;
  }
  extractBusinessRuleRefs(model: SemanticModel): BusinessRuleRef[] {
    return model.businessRuleRefs;
  }
  extractFlowRefs(model: SemanticModel): FlowRef[] {
    // Feature 27: Resolve pytest fixture chains
    const refs: FlowRef[] = [...model.flowRefs];

    // Use function parameter names to discover fixture dependencies
    // In pytest, function parameters that aren't built-in fixtures are fixture references
    const builtinFixtures = new Set([
      'request', 'tmp_path', 'tmpdir', 'capsys', 'capfd', 'monkeypatch',
      'pytestconfig', 'recwarn', 'caplog', 'cache', 'self',
    ]);

    for (const [funcName, func] of model.functions) {
      for (const param of func.parameters) {
        if (param && !builtinFixtures.has(param)) {
          refs.push({ flowId: `fixture:${param}`, source: 'tag' });
        }
      }
    }

    return refs;
  }
}

// ─── Symbol extraction ────────────────────────────────────────────────────────

function extractPythonConstants(root: TsNode): Map<string, SemanticSymbol> {
  const map = new Map<string, SemanticSymbol>();

  // Module-level assignments: USERS = '/users' or USERS: str = '/users'
  const assignments = findNodes(root, ['assignment', 'augmented_assignment']);
  for (const assign of assignments) {
    const nameNode = assign.childForFieldName?.('left') ?? firstChildOfType(assign, 'identifier');
    if (!nameNode) continue;

    const name = nameNode.text ?? '';
    // Only module-level UPPER_CASE constants
    if (name === name.toUpperCase() && name.length > 1) {
      const valueNode = assign.childForFieldName?.('right');
      const strValue = extractPythonString(valueNode);
      if (strValue !== undefined) {
        map.set(name, { name, kind: 'const', value: strValue, resolvedValue: strValue });
      }
    }
  }

  return map;
}

function extractPythonFunctions(
  root: TsNode,
  constants: Map<string, SemanticSymbol>,
): Map<string, SemanticFunction> {
  const graph = new Map<string, SemanticFunction>();

  const fnDefs = findNodes(root, ['function_definition']);
  for (const fn of fnDefs) {
    const nameNode = fn.childForFieldName?.('name') ?? firstChildOfType(fn, 'identifier');
    const name = nameNode?.text ?? '';
    if (!name) continue;

    const decorators = extractPythonDecorators(fn);
    const body = fn.childForFieldName?.('body') ?? firstChildOfType(fn, 'block');

    const bodyHttpCalls: SemanticHttpCall[] = [];
    const calledFunctions: string[] = [];

    if (body) {
      extractPythonHttpCalls(body, constants, bodyHttpCalls);
      extractPythonCalls(body, calledFunctions);
    }

    graph.set(name, {
      name,
      parameters: [],
      bodyHttpCalls,
      calledFunctions,
      annotations: decorators,
    });
  }

  // Also check class methods
  const classDefs = findNodes(root, ['class_definition']);
  for (const cls of classDefs) {
    const clsBody = cls.childForFieldName?.('body') ?? firstChildOfType(cls, 'block');
    if (!clsBody) continue;
    const methods = findNodes(clsBody, ['function_definition']);
    for (const method of methods) {
      const nameNode = method.childForFieldName?.('name') ?? firstChildOfType(method, 'identifier');
      const name = nameNode?.text ?? '';
      if (!name || name === '__init__') continue;
      const methodBody = method.childForFieldName?.('body') ?? firstChildOfType(method, 'block');
      const bodyHttpCalls: SemanticHttpCall[] = [];
      if (methodBody) extractPythonHttpCalls(methodBody, constants, bodyHttpCalls);
      graph.set(name, { name, parameters: [], bodyHttpCalls, calledFunctions: [] });
    }
  }

  return graph;
}

function extractPythonHttpCalls(
  body: TsNode,
  constants: Map<string, SemanticSymbol>,
  out: SemanticHttpCall[],
): void {
  // requests.get(url), httpx.post(url), self.client.get(url), client.get(url)
  const calls = findNodes(body, ['call']);
  for (const call of calls) {
    const funcNode = call.childForFieldName?.('function') ?? firstChildOfType(call, 'attribute');
    if (!funcNode) continue;

    const funcText = funcNode.text ?? '';
    const match = funcText.match(
      /(?:requests|httpx|self\.client|client|self\.app|app|testapp|self\.testapp)\.(get|post|post_json|put|put_json|patch|patch_json|delete|delete_json|head|options)/i,
    );
    if (!match) continue;

    const [, methodName] = match;
    // Normalize webtest methods: post_json → POST, put_json → PUT, etc.
    const normalizedMethod = methodName.replace(/_json$/i, '').toUpperCase();
    const argList = call.childForFieldName?.('arguments') ?? firstChildOfType(call, 'argument_list');
    if (!argList) continue;

    const pathArg = firstChildOfType(argList, 'string') ?? firstChildOfType(argList, 'concatenated_string');
    if (!pathArg) continue;

    const rawPath = extractPythonString(pathArg);
    if (!rawPath) continue;

    // Resolve f-string variables against constants
    const resolvedPath = rawPath.includes('{') ? resolveFString(rawPath, constants) : rawPath;

    out.push({
      method: normalizedMethod,
      rawPathArg: rawPath,
      resolvedPath,
      normalizedPath: resolvedPath.startsWith('/') ? normalizePathToTemplate(resolvedPath) : undefined,
      resolutionType: rawPath === resolvedPath ? 'direct' : 'interpolated-path',
      confidence: rawPath === resolvedPath ? 'high' : 'medium',
    });
  }
}

function extractPythonAssertions(root: TsNode): SemanticAssertion[] {
  const assertions: SemanticAssertion[] = [];
  const assertStmts = findNodes(root, ['assert_statement']);
  for (const stmt of assertStmts) {
    const text = stmt.text ?? '';
    const type: SemanticAssertion['assertionType'] =
      text.includes('status_code') || text.includes('status') ? 'status-code' : 'body-field';
    const varMatch = text.match(/assert\s+(\w+)\./);
    assertions.push({ assertionType: type, subjectVariable: varMatch?.[1] });
  }

  // self.assertEqual(response.status_code, 200)
  const calls = findNodes(root, ['call']);
  for (const call of calls) {
    const funcText = call.childForFieldName?.('function')?.text ?? '';
    if (funcText.includes('assertEqual') || funcText.includes('assertStatus')) {
      const argText = call.childForFieldName?.('arguments')?.text ?? '';
      const varMatch = argText.match(/(\w+)\.status/);
      assertions.push({
        assertionType: 'status-code',
        subjectVariable: varMatch?.[1],
      });
    }
  }

  return assertions;
}

function extractPythonBusinessRefs(root: TsNode): BusinessRuleRef[] {
  const refs: BusinessRuleRef[] = [];
  const decorators = findNodes(root, ['decorator']);
  for (const dec of decorators) {
    const text = dec.text ?? '';
    const match = text.match(/@(?:pytest\.mark\.|mark\.)?(?:businessRule|business_rule)\s*\(\s*["']([^"']+)/);
    if (match) refs.push({ ruleId: match[1], source: 'decorator' });
  }
  return refs;
}

function extractPythonDecorators(fn: TsNode): string[] {
  const decorators: string[] = [];
  for (let i = 0; i < (fn?.childCount ?? 0); i++) {
    const child = fn.child(i);
    if (child?.type === 'decorator') decorators.push(child.text ?? '');
  }
  return decorators;
}

function extractPythonCalls(body: TsNode, out: string[]): void {
  const calls = findNodes(body, ['call']);
  for (const call of calls) {
    const func = call.childForFieldName?.('function')?.text ?? '';
    if (func && !out.includes(func)) out.push(func);
  }
}

function extractPythonString(node: TsNode): string | undefined {
  if (!node) return undefined;
  const raw = node.text ?? '';
  if ((raw.startsWith('"') || raw.startsWith("'") || raw.startsWith('f"') || raw.startsWith("f'"))) {
    return raw.replace(/^f?["']|["']$/g, '');
  }
  return undefined;
}

function resolveFString(template: string, constants: Map<string, SemanticSymbol>): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    return constants.get(name)?.resolvedValue ?? `{${name}}`;
  });
}

function emptyModel(filePath: string): SemanticModel {
  return {
    filePath,
    language: 'python',
    localVariables: new Map(),
    constants: new Map(),
    enums: new Map(),
    functions: new Map(),
    httpInteractions: [],
    assertions: [],
    businessRuleRefs: [],
    flowRefs: [],
  };
}

// ─── Flask / FastAPI pattern extraction (Feature 27) ─────────────────────────

/**
 * Extract decorator stacks for Flask/FastAPI route functions.
 * Groups decorators by the function they decorate:
 *   @blueprint.route('/articles', methods=['GET'])
 *   @use_kwargs({...})
 *   @marshal_with(ArticleSchema)
 *   @jwt_required
 *   def get_articles():
 *     → DecoratorStack for 'get_articles' with 4 decorators
 */
function extractFlaskDecoratorStacks(root: TsNode, filePath: string): DecoratorStack[] {
  const stacks: DecoratorStack[] = [];
  const fnDefs = findNodes(root, ['function_definition']);

  for (const fn of fnDefs) {
    const nameNode = fn.childForFieldName?.('name') ?? firstChildOfType(fn, 'identifier');
    const funcName = nameNode?.text ?? '';
    if (!funcName) continue;

    const decorators: DecoratorInfo[] = [];
    for (let i = 0; i < (fn?.childCount ?? 0); i++) {
      const child = fn.child(i);
      if (child?.type !== 'decorator') continue;

      const decText = child.text ?? '';
      const dec = parseFlaskDecorator(decText, child.startPosition?.row);
      if (dec) decorators.push(dec);
    }

    if (decorators.length > 0) {
      stacks.push({
        functionName: funcName,
        decorators,
        sourceFile: filePath,
        line: fn.startPosition?.row ? fn.startPosition.row + 1 : undefined,
      });
    }
  }

  return stacks;
}

/**
 * Parse a single Flask/FastAPI decorator into a DecoratorInfo.
 */
function parseFlaskDecorator(text: string, line?: number): DecoratorInfo | null {
  // @blueprint.route('/path', methods=['GET', 'POST'])
  const routeMatch = text.match(/@(\w+)\.route\s*\(\s*['"]([^'"]+)['"]/);
  if (routeMatch) {
    const args: Record<string, string> = { path: routeMatch[2] };
    const methodsMatch = text.match(/methods\s*=\s*\[([^\]]+)\]/);
    if (methodsMatch) args.methods = methodsMatch[1].replace(/['"]/g, '').trim();
    return { name: 'route', fullText: text, args, line };
  }

  // @use_kwargs({...}) or @use_kwargs(SchemaClass)
  const useKwargsMatch = text.match(/@use_kwargs\s*\((.+)\)/s);
  if (useKwargsMatch) {
    return { name: 'use_kwargs', fullText: text, args: { schema: useKwargsMatch[1].trim() }, line };
  }

  // @marshal_with(SchemaClass)
  const marshalMatch = text.match(/@marshal_with\s*\(\s*(\w+)/);
  if (marshalMatch) {
    return { name: 'marshal_with', fullText: text, args: { schema: marshalMatch[1] }, line };
  }

  // @jwt_required, @jwt_required(), @jwt_required(optional=True), @jwt_optional
  if (text.includes('@jwt_required') || text.includes('@jwt_optional')) {
    const isOptional = text.includes('jwt_optional') || text.includes('optional=True') || text.includes('optional = True');
    return {
      name: isOptional ? 'jwt_optional' : 'jwt_required',
      fullText: text,
      args: { optional: isOptional ? 'true' : 'false' },
      line,
    };
  }

  // @login_required
  if (text.includes('@login_required')) {
    return { name: 'login_required', fullText: text, args: {}, line };
  }

  // Generic decorator
  const genericMatch = text.match(/@(\w[\w.]*)/);
  if (genericMatch) {
    return { name: genericMatch[1], fullText: text, line };
  }

  return null;
}

/**
 * Extract Flask Blueprint route registrations.
 * Detects: Blueprint() constructors, register_blueprint() calls,
 *          @blueprint.route() registrations.
 */
function extractFlaskRouteRegistrations(root: TsNode, filePath: string): RouteRegistration[] {
  const registrations: RouteRegistration[] = [];

  // Use regex on the full source text since tree-sitter node traversal
  // for call arguments is complex. This is a targeted pattern match.
  const sourceText = root.text ?? '';
  const lines = sourceText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Blueprint constructor: bp = Blueprint('name', __name__, url_prefix='/api')
    const bpMatch = line.match(/(\w+)\s*=\s*Blueprint\s*\(\s*['"](\w+)['"](?:[^)]*?url_prefix\s*=\s*['"]([^'"]+)['"])?\s*\)/);
    if (bpMatch) {
      registrations.push({
        registrarName: bpMatch[1],
        path: bpMatch[3] ?? '',
        sourceFile: filePath,
        line: i + 1,
      });
      continue;
    }

    // register_blueprint(bp, url_prefix='/api/articles')
    const regMatch = line.match(/register_blueprint\s*\(\s*(\w+)(?:\s*,\s*url_prefix\s*=\s*['"]([^'"]+)['"])?\s*\)/);
    if (regMatch) {
      registrations.push({
        registrarName: regMatch[1],
        path: regMatch[2] ?? '',
        targetModule: regMatch[1],
        sourceFile: filePath,
        line: i + 1,
      });
      continue;
    }

    // @blueprint.route('/path', methods=[...])
    const routeMatch = line.match(/@(\w+)\.route\s*\(\s*['"]([^'"]+)['"]/);
    if (routeMatch) {
      const methodsMatch = line.match(/methods\s*=\s*\[([^\]]+)\]/);
      const methods = methodsMatch
        ? methodsMatch[1].replace(/['"]/g, '').split(',').map((m: string) => m.trim().toUpperCase())
        : ['GET'];
      registrations.push({
        registrarName: routeMatch[1],
        path: routeMatch[2],
        methods,
        sourceFile: filePath,
        line: i + 1,
      });
    }
  }

  return registrations;
}

/**
 * Classify JWT/auth security from decorator information.
 */
export function classifyFlaskSecurity(decorators: DecoratorInfo[]): SecurityClassification | undefined {
  for (const dec of decorators) {
    if (dec.name === 'jwt_required') {
      return { type: 'jwt', required: true, optional: false, sourcePattern: '@jwt_required' };
    }
    if (dec.name === 'jwt_optional') {
      return { type: 'jwt', required: false, optional: true, sourcePattern: '@jwt_optional' };
    }
    if (dec.name === 'login_required') {
      return { type: 'session', required: true, optional: false, sourcePattern: '@login_required' };
    }
  }
  return undefined;
}

registerAnalyzer('python', () => new PythonAnalyzer());
