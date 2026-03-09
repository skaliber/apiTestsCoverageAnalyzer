/**
 * Kotlin language analyzer.
 * Reuses Java semantic builder logic since Kotlin syntax is similar for HTTP patterns.
 */

import type { LanguageAnalyzer } from '../../ast/languageAnalyzer';
import type {
  SupportedLanguage,
  ParsedSourceFile,
  SemanticModel,
  ResolvedHttpInteraction,
  SemanticAssertion,
  BusinessRuleRef,
  FlowRef,
  AnalysisContext,
} from '../../ast/astTypes';
import { registerAnalyzer } from '../../ast/parserRegistry';
import { parseKotlin } from './parser';
import {
  extractJavaSymbols,
  extractJavaFunctions,
  extractJavaAssertions,
  extractJavaBusinessRuleRefs,
  extractJavaFlowRefs,
} from '../java/semanticBuilder';
import {
  findNodes,
  firstChildOfType,
  extractStringValue,
  type TsNode,
} from '../shared/treeSitterUtils';
import { normalizePathToTemplate } from '../../coverage/deep-analysis/resolvePaths';
import type { SemanticHttpCall, SemanticSymbol } from '../../ast/astTypes';

export class KotlinAnalyzer implements LanguageAnalyzer {
  readonly language: SupportedLanguage = 'kotlin';

  parse(filePath: string, content: string): ParsedSourceFile {
    return parseKotlin(filePath, content);
  }

  buildSemanticModel(parsed: ParsedSourceFile, _context: AnalysisContext): SemanticModel {
    const astPayload = parsed.ast;
    const root = astPayload?.tree?.rootNode ?? astPayload?.rootNode ?? astPayload;

    if (!root) {
      return emptyModel(parsed.filePath, 'kotlin');
    }

    // Use Java semantic builder as base (reuses tree-sitter traversal)
    const { constants, enums } = extractJavaSymbols(root);

    // Augment with Kotlin-specific: val/var top-level properties
    extractKotlinProperties(root, constants);

    const functions = extractJavaFunctions(root, constants);

    // Add Ktor-specific HTTP calls
    augmentWithKtorCalls(root, constants, functions);

    const assertions = extractJavaAssertions(root);
    const businessRuleRefs = extractJavaBusinessRuleRefs(root);
    const flowRefs = extractJavaFlowRefs(root);

    return {
      filePath: parsed.filePath,
      language: 'kotlin',
      localVariables: new Map(),
      constants,
      enums,
      functions,
      httpInteractions: [],
      assertions,
      businessRuleRefs,
      flowRefs,
    };
  }

  extractHttpInteractions(
    model: SemanticModel,
    _context: AnalysisContext,
  ): ResolvedHttpInteraction[] {
    const results: ResolvedHttpInteraction[] = [];
    const seen = new Set<string>();

    for (const fn of model.functions.values()) {
      for (const c of fn.bodyHttpCalls) {
        const path = c.resolvedPath ?? c.rawPathArg;
        if (!path) continue;
        const key = `${c.method}:${path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const normalizedPath = path.startsWith('/') ? normalizePathToTemplate(path) : undefined;
        results.push({
          method: c.method,
          path,
          normalizedPath,
          sourceFile: model.filePath,
          sourceLanguage: 'kotlin',
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
    return model.flowRefs;
  }
}

/** Extract Kotlin val/var property declarations */
function extractKotlinProperties(root: TsNode, constants: Map<string, SemanticSymbol>): void {
  // Kotlin tree-sitter uses property_declaration
  const propDecls = findNodes(root, ['property_declaration']);
  for (const prop of propDecls) {
    const nameNode = firstChildOfType(prop, 'simple_identifier') ?? firstChildOfType(prop, 'identifier');
    const valueNode = firstChildOfType(prop, 'string_literal');
    if (nameNode && valueNode) {
      const name = nameNode.text ?? '';
      const value = extractStringValue(valueNode) ?? '';
      if (name && value.startsWith('/')) {
        constants.set(name, { name, kind: 'const', value, resolvedValue: value });
      }
    }
  }
}

/** Detect Ktor client DSL: client.get("/path") { ... } */
function augmentWithKtorCalls(
  root: TsNode,
  constants: Map<string, SemanticSymbol>,
  functions: Map<string, import('../../ast/astTypes').SemanticFunction>,
): void {
  // Ktor uses call_expression with method name get/post/put etc.
  const callExprs = findNodes(root, ['call_expression', 'function_call']);
  for (const call of callExprs) {
    const callText = call.text ?? '';
    // Heuristic: detect client.METHOD("/path")
    const ktorMatch = callText.match(
      /(?:client|httpClient)\.(get|post|put|patch|delete)\s*[\({]\s*["'`]([^"'`]+)["'`]/,
    );
    if (ktorMatch) {
      const [, method, path] = ktorMatch;
      const fakeCall: SemanticHttpCall = {
        method: method.toUpperCase(),
        rawPathArg: path,
        resolvedPath: path,
        normalizedPath: path.startsWith('/') ? normalizePathToTemplate(path) : undefined,
        resolutionType: 'direct',
        confidence: 'high',
      };
      // Attach to a synthetic function
      const syntheticFn = functions.get('_kotlin_ktor_calls') ?? {
        name: '_kotlin_ktor_calls',
        parameters: [],
        bodyHttpCalls: [],
        calledFunctions: [],
      };
      syntheticFn.bodyHttpCalls.push(fakeCall);
      functions.set('_kotlin_ktor_calls', syntheticFn);
    }
    void constants; // suppress unused warning
  }
}

function emptyModel(filePath: string, language: SupportedLanguage): SemanticModel {
  return {
    filePath,
    language,
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

registerAnalyzer('kotlin', () => new KotlinAnalyzer());
