/**
 * JavaScript language analyzer.
 *
 * Implements the LanguageAnalyzer contract using @typescript-eslint/typescript-estree.
 * Registered for both 'javascript' and (via TypeScriptAnalyzer) 'typescript'.
 */

import type { LanguageAnalyzer } from '../../ast/languageAnalyzer';
import type {
  SupportedLanguage,
  ParsedSourceFile,
  SemanticModel,
  SemanticHttpCall,
  ResolvedHttpInteraction,
  SemanticAssertion,
  BusinessRuleRef,
  FlowRef,
  AnalysisContext,
} from '../../ast/astTypes';
import { registerAnalyzer } from '../../ast/parserRegistry';
import { parseJsTs } from './parser';
import { extractSymbols } from './symbolResolver';
import { buildCallGraph } from './callResolver';
import { extractHttpCallsFromNode } from './httpInteractionExtractor';
import { extractAssertions as extractAssertionNodes } from './assertionResolver';
import { normalizePathToTemplate } from '../../coverage/deep-analysis/resolvePaths';
import { extractBusinessRuleRefs, extractFlowRefs } from './annotationExtractor';

export class JavaScriptAnalyzer implements LanguageAnalyzer {
  readonly language: SupportedLanguage = 'javascript';

  parse(filePath: string, content: string): ParsedSourceFile {
    return parseJsTs(filePath, content, this.language);
  }

  buildSemanticModel(parsed: ParsedSourceFile, _context: AnalysisContext): SemanticModel {
    const { constants, localVariables } = extractSymbols(parsed.ast);
    const functions = buildCallGraph(parsed.ast, constants);
    const httpInteractions: SemanticHttpCall[] = [];
    const assertions = extractAssertionNodes(parsed.ast);
    const businessRuleRefs = extractBusinessRuleRefs(parsed.ast);
    const flowRefs = extractFlowRefs(parsed.ast);

    // Extract top-level HTTP calls (outside function bodies)
    if (parsed.ast?.body) {
      extractHttpCallsFromNode(parsed.ast, constants, httpInteractions);
    }

    return {
      filePath: parsed.filePath,
      language: this.language,
      localVariables,
      constants,
      enums: new Map(),
      functions,
      httpInteractions,
      assertions,
      businessRuleRefs,
      flowRefs,
    };
  }

  extractHttpInteractions(
    model: SemanticModel,
    context: AnalysisContext,
  ): ResolvedHttpInteraction[] {
    const results: ResolvedHttpInteraction[] = [];
    const seen = new Set<string>();
    const maxDepth = context.astConfig.maxCallDepth ?? 4;

    function addCall(
      method: string,
      path: string,
      rawPathArg: string,
      resolutionType: ResolvedHttpInteraction['resolutionType'],
      confidence: ResolvedHttpInteraction['confidence'],
      responseVariable?: string,
    ): void {
      const normalizedPath = path.startsWith('/') ? normalizePathToTemplate(path) : undefined;
      const key = `${method}:${normalizedPath ?? path}:${resolutionType}`;
      if (seen.has(key)) return;
      seen.add(key);

      results.push({
        method,
        path,
        normalizedPath,
        sourceFile: model.filePath,
        sourceLanguage: model.language,
        resolutionType,
        confidence,
        responseVariable,
        rawCall: rawPathArg,
      });
    }

    // From function bodies (most test interactions are inside it/test blocks)
    for (const fn of model.functions.values()) {
      for (const call of fn.bodyHttpCalls) {
        const path = call.resolvedPath ?? call.rawPathArg;
        if (!path) continue;
        addCall(
          call.method,
          path,
          call.rawPathArg,
          call.resolutionType,
          call.confidence,
          call.responseVariable,
        );
      }
    }

    // From top-level (module-level calls)
    for (const call of model.httpInteractions) {
      const path = call.resolvedPath ?? call.rawPathArg;
      if (!path) continue;
      addCall(
        call.method,
        path,
        call.rawPathArg,
        call.resolutionType,
        call.confidence,
        call.responseVariable,
      );
    }

    // Wrapper function resolution: trace calledFunctions up to maxDepth
    if (context.deepConfig.resolveWrappers) {
      this.resolveWrappers(model, maxDepth, addCall, seen);
    }

    return results;
  }

  private resolveWrappers(
    model: SemanticModel,
    maxDepth: number,
    addCall: (
      method: string,
      path: string,
      rawPathArg: string,
      resolutionType: ResolvedHttpInteraction['resolutionType'],
      confidence: ResolvedHttpInteraction['confidence'],
      responseVariable?: string,
    ) => void,
    seen: Set<string>,
  ): void {
    // For each function that calls another local function but has no direct HTTP calls,
    // try to resolve the called function's HTTP interactions
    for (const fn of model.functions.values()) {
      if (fn.bodyHttpCalls.length > 0) continue; // Already has direct calls
      for (const calledName of fn.calledFunctions) {
        this.traceHelper(calledName, model, maxDepth, addCall, seen, new Set());
      }
    }
  }

  private traceHelper(
    fnName: string,
    model: SemanticModel,
    depth: number,
    addCall: (
      method: string,
      path: string,
      rawPathArg: string,
      resolutionType: ResolvedHttpInteraction['resolutionType'],
      confidence: ResolvedHttpInteraction['confidence'],
      responseVariable?: string,
    ) => void,
    seen: Set<string>,
    visited: Set<string>,
  ): void {
    if (depth <= 0 || visited.has(fnName)) return;
    visited.add(fnName);

    const fn = model.functions.get(fnName);
    if (!fn) return;

    for (const call of fn.bodyHttpCalls) {
      const path = call.resolvedPath ?? call.rawPathArg;
      if (!path) continue;
      addCall(call.method, path, call.rawPathArg, 'wrapper-method', 'medium');
    }

    for (const nested of fn.calledFunctions) {
      this.traceHelper(nested, model, depth - 1, addCall, seen, visited);
    }
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

// Register the JavaScript analyzer
registerAnalyzer('javascript', () => new JavaScriptAnalyzer());
