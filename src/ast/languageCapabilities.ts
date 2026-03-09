/**
 * AST-layer language capability registry.
 *
 * Describes what each language analyzer can do and which parser backend it uses.
 * Used by the orchestrator to decide whether to attempt AST analysis for a given
 * language and whether to expect assertion linking, enum resolution, etc.
 */

import type { SupportedLanguage } from './astTypes';

export type ParserBackend = 'typescript-estree' | 'tree-sitter' | 'regex-fallback';

export interface LanguageCapabilities {
  language: SupportedLanguage;
  parserBackend: ParserBackend;
  supportsSymbolResolution: boolean;
  supportsCallGraph: boolean;
  supportsEnumResolution: boolean;
  supportsStringInterpolation: boolean;
  supportsAssertionLinking: boolean;
  supportsRequestBuilders: boolean;
  supportsCucumber: boolean;
  /** Which step-definition languages this analyzer can trace (Cucumber only) */
  cucumberStepLanguages?: SupportedLanguage[];
}

export const LANGUAGE_CAPABILITIES: Record<string, LanguageCapabilities> = {
  typescript: {
    language: 'typescript',
    parserBackend: 'typescript-estree',
    supportsSymbolResolution: true,
    supportsCallGraph: true,
    supportsEnumResolution: true,
    supportsStringInterpolation: true,
    supportsAssertionLinking: true,
    supportsRequestBuilders: true,
    supportsCucumber: false,
  },
  javascript: {
    language: 'javascript',
    parserBackend: 'typescript-estree',
    supportsSymbolResolution: true,
    supportsCallGraph: true,
    supportsEnumResolution: false,
    supportsStringInterpolation: true,
    supportsAssertionLinking: true,
    supportsRequestBuilders: true,
    supportsCucumber: false,
  },
  java: {
    language: 'java',
    parserBackend: 'tree-sitter',
    supportsSymbolResolution: true,
    supportsCallGraph: true,
    supportsEnumResolution: true,
    supportsStringInterpolation: false,
    supportsAssertionLinking: true,
    supportsRequestBuilders: true,
    supportsCucumber: true,
    cucumberStepLanguages: ['java'],
  },
  kotlin: {
    language: 'kotlin',
    parserBackend: 'tree-sitter',
    supportsSymbolResolution: true,
    supportsCallGraph: true,
    supportsEnumResolution: true,
    supportsStringInterpolation: true,
    supportsAssertionLinking: true,
    supportsRequestBuilders: true,
    supportsCucumber: true,
    cucumberStepLanguages: ['kotlin'],
  },
  python: {
    language: 'python',
    parserBackend: 'tree-sitter',
    supportsSymbolResolution: true,
    supportsCallGraph: true,
    supportsEnumResolution: true,
    supportsStringInterpolation: true,
    supportsAssertionLinking: true,
    supportsRequestBuilders: false,
    supportsCucumber: false,
  },
  ruby: {
    language: 'ruby',
    parserBackend: 'tree-sitter',
    supportsSymbolResolution: true,
    supportsCallGraph: true,
    supportsEnumResolution: false,
    supportsStringInterpolation: true,
    supportsAssertionLinking: true,
    supportsRequestBuilders: false,
    supportsCucumber: true,
    cucumberStepLanguages: ['ruby'],
  },
  cucumber: {
    language: 'cucumber',
    parserBackend: 'regex-fallback',
    supportsSymbolResolution: false,
    supportsCallGraph: false,
    supportsEnumResolution: false,
    supportsStringInterpolation: false,
    supportsAssertionLinking: false,
    supportsRequestBuilders: false,
    supportsCucumber: true,
  },
};
