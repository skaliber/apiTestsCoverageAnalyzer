/**
 * Ruby language analyzer using tree-sitter-ruby.
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

// ─── Parser ───────────────────────────────────────────────────────────────────

let cachedParser: unknown = undefined;
let parserLoaded = false;

function getRubyParser(): unknown {
  if (!parserLoaded) {
    parserLoaded = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const grammar = require('tree-sitter-ruby');
      cachedParser = createParser(grammar);
    } catch { cachedParser = null; }
  }
  return cachedParser;
}

// ─── Analyzer ─────────────────────────────────────────────────────────────────

export class RubyAnalyzer implements LanguageAnalyzer {
  readonly language: SupportedLanguage = 'ruby';

  parse(filePath: string, content: string): ParsedSourceFile {
    const parser = getRubyParser();
    if (!parser) {
      return { filePath, language: 'ruby', ast: null, content, parseError: new Error('tree-sitter-ruby not available') };
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tree = (parser as any).parse(content);
      return { filePath, language: 'ruby', ast: tree, content };
    } catch (err) {
      return { filePath, language: 'ruby', ast: null, content, parseError: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  buildSemanticModel(parsed: ParsedSourceFile, _context: AnalysisContext): SemanticModel {
    const root = parsed.ast?.rootNode ?? parsed.ast;
    if (!root) return emptyModel(parsed.filePath);

    const constants = extractRubyConstants(root);
    const functions = extractRubyFunctions(root, constants);
    const assertions = extractRubyAssertions(root);

    return {
      filePath: parsed.filePath,
      language: 'ruby',
      localVariables: new Map(),
      constants,
      enums: new Map(),
      functions,
      httpInteractions: [],
      assertions,
      businessRuleRefs: [],
      flowRefs: [],
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
          sourceLanguage: 'ruby',
          resolutionType: fn.cucumberPattern ? 'cucumber-step' : c.resolutionType,
          confidence: c.confidence,
        });
      }
    }
    return results;
  }

  extractAssertions(model: SemanticModel): SemanticAssertion[] {
    return model.assertions;
  }
  extractBusinessRuleRefs(_model: SemanticModel): BusinessRuleRef[] {
    return [];
  }
  extractFlowRefs(_model: SemanticModel): FlowRef[] {
    return [];
  }
}

// ─── Symbol extraction ────────────────────────────────────────────────────────

function extractRubyConstants(root: TsNode): Map<string, SemanticSymbol> {
  const map = new Map<string, SemanticSymbol>();

  // Ruby constants: USERS = '/users'
  const assigns = findNodes(root, ['assignment']);
  for (const assign of assigns) {
    const left = assign.childForFieldName?.('left') ?? firstChildOfType(assign, 'constant');
    const right = assign.childForFieldName?.('right');
    if (!left || !right) continue;

    const name = left.text ?? '';
    if (!name || name !== name.toUpperCase()) continue;

    const value = extractStringValue(right) ?? right.text?.replace(/^["']|["']$/g, '');
    if (value) {
      map.set(name, { name, kind: 'const', value, resolvedValue: value });
    }
  }

  return map;
}

function extractRubyFunctions(
  root: TsNode,
  constants: Map<string, SemanticSymbol>,
): Map<string, SemanticFunction> {
  const graph = new Map<string, SemanticFunction>();

  // Regular method definitions: def method_name; end
  const methodDefs = findNodes(root, ['method', 'singleton_method']);
  for (const method of methodDefs) {
    const nameNode = method.childForFieldName?.('name') ?? firstChildOfType(method, 'identifier');
    const name = nameNode?.text ?? '';
    if (!name) continue;

    const bodyHttpCalls: SemanticHttpCall[] = [];
    extractRubyHttpCalls(method, constants, bodyHttpCalls);

    graph.set(name, { name, parameters: [], bodyHttpCalls, calledFunctions: [] });
  }

  // RSpec blocks: it 'does something' do ... end
  const calls = findNodes(root, ['call']);
  for (const call of calls) {
    const methodName = call.childForFieldName?.('method')?.text ?? '';
    const isCucumber = ['Given', 'When', 'Then', 'And', 'But'].includes(methodName);
    const isRSpec = ['it', 'specify', 'example', 'before', 'after', 'context', 'describe', 'scenario'].includes(methodName);

    if (!isCucumber && !isRSpec) continue;

    const blockNode = firstChildOfType(call, 'do_block') ?? firstChildOfType(call, 'block');
    if (!blockNode) continue;

    // Extract label for Cucumber (first string arg)
    let blockName = methodName;
    let cucumberPattern: string | undefined;
    if (call.arguments) {
      const firstArg = firstChildOfType(call.arguments, 'string') ??
        firstChildOfType(call.arguments, 'regex');
      if (firstArg) {
        const label = extractStringValue(firstArg) ?? firstArg.text ?? '';
        blockName = `${methodName}:${label}`;
        if (isCucumber) cucumberPattern = label;
      }
    }

    const bodyHttpCalls: SemanticHttpCall[] = [];
    extractRubyHttpCalls(blockNode, constants, bodyHttpCalls);

    graph.set(blockName, {
      name: blockName,
      parameters: [],
      bodyHttpCalls,
      calledFunctions: [],
      cucumberPattern,
    });
  }

  return graph;
}

function extractRubyHttpCalls(
  node: TsNode,
  constants: Map<string, SemanticSymbol>,
  out: SemanticHttpCall[],
): void {
  const calls = findNodes(node, ['call']);

  for (const call of calls) {
    const methodName = call.childForFieldName?.('method')?.text ?? '';
    const lowerMethod = methodName.toLowerCase();

    const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
    if (!HTTP_METHODS.has(lowerMethod)) continue;

    // Get the args — first arg is path
    const args = call.childForFieldName?.('arguments');
    if (!args) {
      // Rails style: just `get '/path'` with no explicit parentheses
      // Try: call text is "get '/path'"
      const callText = call.text ?? '';
      const railsMatch = callText.match(
        /^(?:get|post|put|patch|delete)\s+["'`]([^"'`]+)["'`]/,
      );
      if (railsMatch) {
        const path = railsMatch[1];
        out.push({
          method: lowerMethod.toUpperCase(),
          rawPathArg: path,
          resolvedPath: path,
          normalizedPath: path.startsWith('/') ? normalizePathToTemplate(path) : undefined,
          resolutionType: 'direct',
          confidence: 'high',
        });
      }
      continue;
    }

    const firstArg =
      firstChildOfType(args, 'string') ??
      firstChildOfType(args, 'simple_string') ??
      firstChildOfType(args, 'constant');

    if (!firstArg) continue;

    let rawPath = extractStringValue(firstArg) ?? firstArg.text ?? '';
    rawPath = rawPath.replace(/^["'`]|["'`]$/g, '');

    // Resolve Ruby constants
    if (firstArg.type === 'constant') {
      const resolved = constants.get(rawPath)?.resolvedValue ?? rawPath;
      out.push({
        method: lowerMethod.toUpperCase(),
        rawPathArg: rawPath,
        resolvedPath: resolved,
        normalizedPath: resolved.startsWith('/') ? normalizePathToTemplate(resolved) : undefined,
        resolutionType: rawPath === resolved ? 'direct' : 'constant',
        confidence: rawPath === resolved ? 'high' : 'medium',
      });
      continue;
    }

    // Resolve Ruby string interpolation: "/users/#{user.id}"
    const resolvedPath = resolveRubyInterpolation(rawPath, constants);

    out.push({
      method: lowerMethod.toUpperCase(),
      rawPathArg: rawPath,
      resolvedPath,
      normalizedPath: resolvedPath.startsWith('/') ? normalizePathToTemplate(resolvedPath) : undefined,
      resolutionType: rawPath.includes('#{') ? 'interpolated-path' : 'direct',
      confidence: 'high',
    });
  }
}

function extractRubyAssertions(root: TsNode): SemanticAssertion[] {
  const assertions: SemanticAssertion[] = [];

  // expect(response.status).to eq(200) or expect(response.code).to eq('200')
  const calls = findNodes(root, ['call']);
  for (const call of calls) {
    const text = call.text ?? '';
    if (text.includes('expect(') && (text.includes('.status') || text.includes('.code'))) {
      const varMatch = text.match(/expect\((\w+)\./);
      assertions.push({
        assertionType: 'status-code',
        subjectVariable: varMatch?.[1],
      });
    }
    if (text.includes('should have_http_status') || text.includes('have_http_status')) {
      assertions.push({ assertionType: 'status-code' });
    }
  }

  return assertions;
}

function resolveRubyInterpolation(
  template: string,
  constants: Map<string, SemanticSymbol>,
): string {
  return template.replace(/#\{([^}]+)\}/g, (_match, expr: string) => {
    const trimmed = expr.trim();
    return constants.get(trimmed)?.resolvedValue ?? `{${trimmed}}`;
  });
}

function emptyModel(filePath: string): SemanticModel {
  return {
    filePath,
    language: 'ruby',
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

registerAnalyzer('ruby', () => new RubyAnalyzer());
