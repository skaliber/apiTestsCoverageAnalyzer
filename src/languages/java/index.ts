/**
 * Java language analyzer.
 * Uses tree-sitter-java for AST parsing.
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
import { parseJava } from './parser';
import {
  extractJavaSymbols,
  extractJavaFunctions,
  extractJavaAssertions,
  extractJavaBusinessRuleRefs,
  extractJavaFlowRefs,
} from './semanticBuilder';
import { normalizePathToTemplate } from '../../coverage/deep-analysis/resolvePaths';

export class JavaAnalyzer implements LanguageAnalyzer {
  readonly language: SupportedLanguage = 'java';

  parse(filePath: string, content: string): ParsedSourceFile {
    return parseJava(filePath, content);
  }

  buildSemanticModel(parsed: ParsedSourceFile, _context: AnalysisContext): SemanticModel {
    const root = parsed.ast?.rootNode ?? parsed.ast;
    if (!root) {
      return emptyModel(parsed.filePath, 'java');
    }

    const { constants, enums } = extractJavaSymbols(root);
    const functions = extractJavaFunctions(root, constants);
    const assertions = extractJavaAssertions(root);
    const businessRuleRefs = extractJavaBusinessRuleRefs(root);
    const flowRefs = extractJavaFlowRefs(root);

    return {
      filePath: parsed.filePath,
      language: 'java',
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

    function add(call: ResolvedHttpInteraction): void {
      const key = `${call.method}:${call.normalizedPath ?? call.path}`;
      if (seen.has(key)) return;
      seen.add(key);
      results.push(call);
    }

    for (const fn of model.functions.values()) {
      for (const c of fn.bodyHttpCalls) {
        const path = c.resolvedPath ?? c.rawPathArg;
        if (!path) continue;
        const normalizedPath = path.startsWith('/') ? normalizePathToTemplate(path) : undefined;

        add({
          method: c.method,
          path,
          normalizedPath,
          sourceFile: model.filePath,
          sourceLanguage: 'java',
          resolutionType: c.resolutionType,
          confidence: c.confidence,
          assertionLinked: false,
          rawCall: c.rawPathArg,
          // Cucumber metadata
          ...(fn.cucumberPattern ? { resolutionType: 'cucumber-step' as const } : {}),
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

registerAnalyzer('java', () => new JavaAnalyzer());
