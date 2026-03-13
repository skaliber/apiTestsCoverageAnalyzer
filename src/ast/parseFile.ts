/**
 * Per-file AST analysis entry point.
 *
 * Attempts to parse and analyze a single source file using the registered
 * LanguageAnalyzer for its language. Links assertions to HTTP interactions.
 * Returns null when no analyzer is available or when parsing fails — the
 * caller (astAnalysisOrchestrator) then falls back to regex analysis.
 */

import { getAnalyzer } from './parserRegistry';
import type { SupportedLanguage, ResolvedHttpInteraction, AnalysisContext } from './astTypes';

/**
 * Parse and semantically analyze a single source file using the AST layer.
 *
 * @returns `ResolvedHttpInteraction[]` on success, `null` to signal fallback.
 */
export function analyzeFileWithAst(
  filePath: string,
  content: string,
  language: SupportedLanguage,
  context: AnalysisContext,
): ResolvedHttpInteraction[] | null {
  const analyzer = getAnalyzer(language, context.astConfig);
  if (!analyzer) return null;

  try {
    const parsed = analyzer.parse(filePath, content);
    if (parsed.parseError) return null;

    const model = analyzer.buildSemanticModel(parsed, context);
    const interactions = analyzer.extractHttpInteractions(model, context);

    // Link assertions by matching response variable names
    if (context.astConfig.assertionAware !== false) {
      const assertions = analyzer.extractAssertions(model);
      for (const interaction of interactions) {
        if (interaction.responseVariable) {
          const linked = assertions.find(
            (a) => a.subjectVariable === interaction.responseVariable,
          );
          if (linked) {
            interaction.assertionLinked = true;
            interaction.assertionType = linked.assertionType;
          }
        }
      }
    }

    // Attach business rule refs if the analyzer supports it
    if (analyzer.extractBusinessRuleRefs) {
      const refs = analyzer.extractBusinessRuleRefs(model);
      if (refs.length > 0) {
        for (const interaction of interactions) {
          interaction.businessRuleRefs = refs;
        }
      }
    }

    // Attach flow refs if the analyzer supports it
    if (analyzer.extractFlowRefs) {
      const refs = analyzer.extractFlowRefs(model);
      if (refs.length > 0) {
        for (const interaction of interactions) {
          interaction.flowRefs = refs;
        }
      }
    }

    return interactions;
  } catch {
    // Any unexpected error → signal fallback, never crash the analysis run
    return null;
  }
}
