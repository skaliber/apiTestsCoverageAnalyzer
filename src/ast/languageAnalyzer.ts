/**
 * LanguageAnalyzer contract.
 *
 * Every supported language must implement this interface, either directly or
 * through layered composition. The interface is intentionally minimal — each
 * method is pure (no side effects) and returns well-typed data.
 */

import type {
  SupportedLanguage,
  ParsedSourceFile,
  SemanticModel,
  ResolvedHttpInteraction,
  SemanticAssertion,
  BusinessRuleRef,
  FlowRef,
  AnalysisContext,
} from './astTypes';

export interface LanguageAnalyzer {
  readonly language: SupportedLanguage;

  /**
   * Parse a source file to a raw AST.
   *
   * Must never throw. Returns a `ParsedSourceFile` with `parseError` set if
   * parsing fails — the orchestrator will fall back to regex analysis.
   */
  parse(filePath: string, content: string): ParsedSourceFile;

  /**
   * Walk the AST and produce a rich semantic model: symbols, call graph,
   * enum values, HTTP call sites, assertion nodes.
   */
  buildSemanticModel(parsed: ParsedSourceFile, context: AnalysisContext): SemanticModel;

  /**
   * Extract fully-resolved HTTP interactions from the semantic model.
   * Resolution includes constant propagation, wrapper tracing, and template
   * literal expansion up to `context.astConfig.maxCallDepth` levels.
   */
  extractHttpInteractions(
    model: SemanticModel,
    context: AnalysisContext,
  ): ResolvedHttpInteraction[];

  /**
   * Extract assertion nodes from the semantic model.
   * Used by the orchestrator to link assertions to HTTP interactions by
   * matching `assertion.subjectVariable` against `interaction.responseVariable`.
   */
  extractAssertions(model: SemanticModel): SemanticAssertion[];

  /**
   * Extract business rule references from annotations, decorators, tags,
   * or structured comments. Optional — only implement if the language supports it.
   */
  extractBusinessRuleRefs?(model: SemanticModel): BusinessRuleRef[];

  /**
   * Extract integration flow references from annotations, tags, or comments.
   * Optional — only implement if the language supports it.
   */
  extractFlowRefs?(model: SemanticModel): FlowRef[];
}
