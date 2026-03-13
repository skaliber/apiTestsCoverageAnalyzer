/**
 * AST Analysis Orchestrator — primary entry point for per-file analysis.
 *
 * Three-tier cascade:
 *   Tier 1: AST parse + semantic model → confidence: high/medium
 *           AST yields ≥1 interactions → return them verbatim (authoritative)
 *   Tier 2: AST parse succeeds but yields 0 interactions AND fallbackHeuristics is true
 *           → run deepResolveFile(), tag all results resolutionType:'heuristic' + confidence:'low'
 *   Tier 3: AST disabled or parse error → existing deepResolveFile(), unchanged confidence
 *
 * All language modules must be imported (side-effect) before this is called
 * so their analyzers are registered. Use `registerAllAnalyzers()` at startup.
 */

import { analyzeFileWithAst } from './parseFile';
import { deepResolveFile } from '../coverage/deep-analysis/deepEndpointResolver';
import type { ResolvedHttpInteraction, SupportedLanguage, AnalysisContext } from './astTypes';
import type { AstAnalysisConfig } from '../config/types';
import { DEFAULT_DEEP_ANALYSIS_CONFIG } from '../coverage/deep-analysis/types';

export type AnalysisTier = 'ast' | 'ast-heuristic-fallback' | 'regex-fallback';

export interface FileAnalysisDiagnostics {
  requestedLanguage: SupportedLanguage;
  effectiveRegexLanguage: Exclude<SupportedLanguage, 'auto'>;
  tierUsed: AnalysisTier;
  astEnabled: boolean;
  deepAnalysisEnabled: boolean;
  fallbackHeuristicsEnabled: boolean;
  astParseSucceeded: boolean;
  astAnalyzerReturnedResults: boolean;
  astInteractionCount: number;
  fallbackInteractionCount: number;
  usedHeuristicTagging: boolean;
  fallbackReason?: 'ast-empty' | 'ast-disabled' | 'ast-parse-error-or-missing-analyzer';
}

export interface FileAnalysisResult {
  interactions: ResolvedHttpInteraction[];
  diagnostics: FileAnalysisDiagnostics;
}

/**
 * Analyze a single source file with detailed diagnostics. Returns fully-resolved HTTP interactions and diagnostics.
 *
 * @param content       Raw source text
 * @param filePath      Absolute path (used for error messages, deduplication)
 * @param language      Detected language (or 'auto')
 * @param context       Combined AST + deep-analysis config
 */
export function analyzeFileDetailed(
  content: string,
  filePath: string,
  language: SupportedLanguage,
  context: AnalysisContext,
): FileAnalysisResult {
  const { astConfig, deepConfig } = context;
  const fallbackEnabled = astConfig.fallbackHeuristics !== false;
  const astEnabled = astConfig.enabled !== false;
  const deepAnalysisEnabled = !!deepConfig.enabled;
  const effectiveRegexLanguage = language === 'auto' ? ('typescript' as const) : language;

  const baseDiagnostics = {
    requestedLanguage: language,
    effectiveRegexLanguage,
    astEnabled,
    deepAnalysisEnabled,
    fallbackHeuristicsEnabled: fallbackEnabled,
  } as const;

  if (astEnabled) {
    const astResults = analyzeFileWithAst(filePath, content, language, context);

    if (astResults !== null) {
      if (astResults.length > 0) {
        return {
          interactions: astResults,
          diagnostics: {
            ...baseDiagnostics,
            tierUsed: 'ast',
            astParseSucceeded: true,
            astAnalyzerReturnedResults: true,
            astInteractionCount: astResults.length,
            fallbackInteractionCount: 0,
            usedHeuristicTagging: false,
          },
        };
      }

      if (fallbackEnabled && deepAnalysisEnabled) {
        const heuristicResults = deepResolveFile(content, filePath, effectiveRegexLanguage, deepConfig);
        return {
          interactions: heuristicResults.map((interaction) => ({
            ...interaction,
            resolutionType: 'heuristic' as const,
            confidence: 'low' as const,
          })),
          diagnostics: {
            ...baseDiagnostics,
            tierUsed: 'ast-heuristic-fallback',
            astParseSucceeded: true,
            astAnalyzerReturnedResults: false,
            astInteractionCount: 0,
            fallbackInteractionCount: heuristicResults.length,
            usedHeuristicTagging: true,
            fallbackReason: 'ast-empty',
          },
        };
      }

      return {
        interactions: astResults,
        diagnostics: {
          ...baseDiagnostics,
          tierUsed: 'ast',
          astParseSucceeded: true,
          astAnalyzerReturnedResults: false,
          astInteractionCount: 0,
          fallbackInteractionCount: 0,
          usedHeuristicTagging: false,
        },
      };
    }
  }

  if (!deepAnalysisEnabled) {
    return {
      interactions: [],
      diagnostics: {
        ...baseDiagnostics,
        tierUsed: 'regex-fallback',
        astParseSucceeded: false,
        astAnalyzerReturnedResults: false,
        astInteractionCount: 0,
        fallbackInteractionCount: 0,
        usedHeuristicTagging: false,
        fallbackReason: astEnabled ? 'ast-parse-error-or-missing-analyzer' : 'ast-disabled',
      },
    };
  }

  const regexResults = deepResolveFile(content, filePath, effectiveRegexLanguage, deepConfig);
  return {
    interactions: regexResults,
    diagnostics: {
      ...baseDiagnostics,
      tierUsed: 'regex-fallback',
      astParseSucceeded: false,
      astAnalyzerReturnedResults: false,
      astInteractionCount: 0,
      fallbackInteractionCount: regexResults.length,
      usedHeuristicTagging: false,
      fallbackReason: astEnabled ? 'ast-parse-error-or-missing-analyzer' : 'ast-disabled',
    },
  };
}

/**
 * Analyze a single source file. Returns fully-resolved HTTP interactions.
 *
 * @param content       Raw source text
 * @param filePath      Absolute path (used for error messages, deduplication)
 * @param language      Detected language (or 'auto')
 * @param context       Combined AST + deep-analysis config
 */
export function analyzeFile(
  content: string,
  filePath: string,
  language: SupportedLanguage,
  context: AnalysisContext,
): ResolvedHttpInteraction[] {
  return analyzeFileDetailed(content, filePath, language, context).interactions;
}

/**
 * Bootstrap function — import all language analyzer modules so they
 * register themselves in the parser registry. Must be called once at
 * CLI/library startup before any `analyzeFile()` call.
 */
export function registerAllAnalyzers(): void {
  try { require('../languages/javascript/index'); } catch { /* not available */ }
  try { require('../languages/typescript/index'); } catch { /* not available */ }
  try { require('../languages/java/index'); } catch { /* not available */ }
  try { require('../languages/kotlin/index'); } catch { /* not available */ }
  try { require('../languages/python/index'); } catch { /* not available */ }
  try { require('../languages/ruby/index'); } catch { /* not available */ }
}

/**
 * Build a default AnalysisContext from partial config.
 * Useful for call sites that don't yet pass a full context.
 */
export function buildAnalysisContext(
  astConfig?: AstAnalysisConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deepConfig?: any,
): AnalysisContext {
  return {
    astConfig: {
      enabled: true,
      fallbackHeuristics: true,
      maxCallDepth: 4,
      assertionAware: true,
      languages: {
        java: { enabled: true },
        kotlin: { enabled: true },
        python: { enabled: true },
        ruby: { enabled: true },
        javascript: { enabled: true },
        typescript: { enabled: true },
        cucumber: { enabled: true },
      },
      ...astConfig,
    },
    deepConfig: deepConfig ?? DEFAULT_DEEP_ANALYSIS_CONFIG,
  };
}
