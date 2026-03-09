/**
 * AST Analysis Orchestrator — primary entry point for per-file analysis.
 *
 * Three-tier fallback cascade:
 *   Tier 1: AST parse + semantic model → confidence: high/medium
 *   Tier 2: AST returned 0 results + fallbackHeuristics → regex, confidence: low
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
  const { astConfig, deepConfig } = context;

  // ── Tier 1 & 2: AST path ─────────────────────────────────────────────────
  if (astConfig.enabled !== false) {
    const astResults = analyzeFileWithAst(filePath, content, language, context);

    if (astResults !== null) {
      // AST succeeded
      if (astResults.length === 0 && astConfig.fallbackHeuristics !== false) {
        // Zero results from AST — run regex for additional coverage (lower confidence)
        return runRegexFallback(content, filePath, language, context);
      }
      return astResults;
    }
    // AST returned null (parse error or no analyzer for this language)
    // Fall through to Tier 3
  }

  // ── Tier 3: regex fallback ────────────────────────────────────────────────
  return runRegexFallback(content, filePath, language, context);
}

function runRegexFallback(
  content: string,
  filePath: string,
  language: SupportedLanguage,
  context: AnalysisContext,
): ResolvedHttpInteraction[] {
  if (!context.deepConfig.enabled) return [];

  const regexLang = language === 'auto' ? ('typescript' as const) : language;
  const regexResults = deepResolveFile(content, filePath, regexLang, context.deepConfig);

  // Tag regex results as low-confidence heuristics
  return regexResults.map((r) => ({
    ...r,
    resolutionType: r.resolutionType === 'direct' ? r.resolutionType : ('heuristic' as const),
    confidence: 'low' as const,
  }));
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
