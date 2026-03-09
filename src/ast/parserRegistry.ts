/**
 * Language analyzer registry.
 *
 * Language modules self-register their analyzers by calling `registerAnalyzer()`
 * on module load. The orchestrator retrieves them via `getAnalyzer()`, which
 * respects per-language enable flags and handles native module load failures
 * gracefully (returning undefined so the caller falls back to regex).
 */

import type { LanguageAnalyzer } from './languageAnalyzer';
import type { SupportedLanguage } from './astTypes';
import type { AstAnalysisConfig } from '../config/types';

type AnalyzerFactory = () => LanguageAnalyzer;

const registry = new Map<SupportedLanguage, AnalyzerFactory>();

/**
 * Register a language analyzer factory.
 * Called once per language module via side-effect import at startup.
 */
export function registerAnalyzer(language: SupportedLanguage, factory: AnalyzerFactory): void {
  registry.set(language, factory);
}

/**
 * Retrieve an instantiated analyzer for a given language.
 *
 * Returns `undefined` when:
 * - AST is globally disabled (`astConfig.enabled === false`)
 * - The specific language is disabled in per-language config
 * - No analyzer has been registered for this language
 * - The factory throws (e.g. native tree-sitter module failed to load)
 *
 * Callers treat `undefined` as "use regex fallback".
 */
export function getAnalyzer(
  language: SupportedLanguage,
  astConfig: AstAnalysisConfig,
): LanguageAnalyzer | undefined {
  if (astConfig.enabled === false) return undefined;

  const normalizedLang = language === 'auto' ? undefined : language;
  if (!normalizedLang) return undefined;

  const langConfig =
    astConfig.languages?.[normalizedLang as keyof NonNullable<AstAnalysisConfig['languages']>];
  if (langConfig?.enabled === false) return undefined;

  const factory = registry.get(normalizedLang);
  if (!factory) return undefined;

  try {
    return factory();
  } catch {
    // Native module (tree-sitter grammar) failed to load — signal fallback
    return undefined;
  }
}

/**
 * Check whether any analyzer is registered (for testing).
 */
export function hasAnalyzer(language: SupportedLanguage): boolean {
  return registry.has(language);
}

/**
 * Return all registered language keys (for testing / introspection).
 */
export function registeredLanguages(): SupportedLanguage[] {
  return Array.from(registry.keys());
}
