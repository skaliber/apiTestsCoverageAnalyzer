/**
 * AST Analysis Orchestrator — primary entry point for per-file analysis.
 *
 * Two-tier cascade:
 *   Tier 1: AST parse + semantic model → confidence: high/medium
 *           If AST parses successfully, its result is authoritative — even
 *           when that result is empty.  Silently falling through to regex
 *           when AST returns 0 would inject false positives.
 *   Tier 2: AST disabled or parse error → existing deepResolveFile(), unchanged confidence
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

  // ── Tier 1: AST path ──────────────────────────────────────────────────────
  if (astConfig.enabled !== false) {
    const astResults = analyzeFileWithAst(filePath, content, language, context);

    if (astResults !== null) {
      // AST parsed successfully — return its result verbatim.
      // Zero results means zero HTTP interactions; do NOT fall through to regex,
      // which would add low-confidence guesses and hide true gaps.
      return astResults;
    }
    // null = parse error or no analyzer registered for this language.
    // Fall through to Tier 2 so the file is still analysed.
  }

  // ── Tier 2: regex fallback ────────────────────────────────────────────────
  // Only reached when AST is disabled or could not parse the file.
  if (!deepConfig.enabled) return [];

  const regexLang = language === 'auto' ? ('typescript' as const) : language;
  return deepResolveFile(content, filePath, regexLang, deepConfig);
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

