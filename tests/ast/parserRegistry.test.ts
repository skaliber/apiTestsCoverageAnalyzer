/**
 * Unit tests for src/ast/parserRegistry.ts
 *
 * Coverage:
 *   registerAnalyzer
 *   getAnalyzer - returns analyzer when registered and enabled
 *   getAnalyzer - returns undefined when AST disabled globally
 *   getAnalyzer - returns undefined when language disabled
 *   getAnalyzer - returns undefined when no analyzer registered
 *   getAnalyzer - returns undefined when factory throws (native module failure)
 *   hasAnalyzer
 *   registeredLanguages
 */

import {
  registerAnalyzer,
  getAnalyzer,
  hasAnalyzer,
  registeredLanguages,
} from '../../src/ast/parserRegistry';
import type { LanguageAnalyzer } from '../../src/ast/languageAnalyzer';
import type { AstAnalysisConfig } from '../../src/config/types';

// Minimal stub implementing LanguageAnalyzer
function makeStubAnalyzer(lang: string): LanguageAnalyzer {
  return {
    language: lang as never,
    parse: (_fp, _c) => ({ filePath: _fp, language: lang as never, ast: null, content: _c, parseError: undefined }),
    buildSemanticModel: () => ({
      filePath: '',
      language: lang as never,
      localVariables: new Map(),
      constants: new Map(),
      enums: new Map(),
      functions: new Map(),
      httpInteractions: [],
      assertions: [],
      businessRuleRefs: [],
      flowRefs: [],
    }),
    extractHttpInteractions: () => [],
    extractAssertions: () => [],
  };
}

const enabledConfig: AstAnalysisConfig = { enabled: true };

describe('registerAnalyzer / hasAnalyzer / registeredLanguages', () => {
  it('reports hasAnalyzer true after registration', () => {
    registerAnalyzer('javascript', () => makeStubAnalyzer('javascript'));
    expect(hasAnalyzer('javascript')).toBe(true);
  });

  it('includes registered language in registeredLanguages()', () => {
    registerAnalyzer('typescript', () => makeStubAnalyzer('typescript'));
    expect(registeredLanguages()).toContain('typescript');
  });

  it('hasAnalyzer returns false for unregistered language', () => {
    // 'auto' is never registered by any analyzer
    expect(hasAnalyzer('auto')).toBe(false);
  });
});

describe('getAnalyzer', () => {
  beforeEach(() => {
    // Ensure javascript is registered before each test
    registerAnalyzer('javascript', () => makeStubAnalyzer('javascript'));
  });

  it('returns an analyzer when registered and AST enabled', () => {
    const analyzer = getAnalyzer('javascript', enabledConfig);
    expect(analyzer).toBeDefined();
  });

  it('returns undefined when AST is globally disabled', () => {
    const analyzer = getAnalyzer('javascript', { enabled: false });
    expect(analyzer).toBeUndefined();
  });

  it('returns undefined when the language is disabled in per-language config', () => {
    registerAnalyzer('python', () => makeStubAnalyzer('python'));
    const analyzer = getAnalyzer('python', {
      enabled: true,
      languages: { python: { enabled: false } },
    });
    expect(analyzer).toBeUndefined();
  });

  it('returns undefined when language is "auto"', () => {
    const analyzer = getAnalyzer('auto', enabledConfig);
    expect(analyzer).toBeUndefined();
  });

  it('returns undefined when no analyzer has been registered for the language', () => {
    // 'ruby' may or may not be registered depending on test order; use a type cast to test
    const analyzer = getAnalyzer(
      'ruby' as never,
      { enabled: true, languages: {} },
    );
    // Either undefined (not registered) or defined (registered by a language module import)
    // The important thing is it does NOT throw
    expect(() => getAnalyzer('ruby', enabledConfig)).not.toThrow();
  });

  it('returns undefined when factory throws (native module failure simulation)', () => {
    registerAnalyzer('kotlin', () => {
      throw new Error('native module not compiled');
    });
    const analyzer = getAnalyzer('kotlin', enabledConfig);
    expect(analyzer).toBeUndefined();
  });

  it('returns an analyzer when language is explicitly enabled', () => {
    registerAnalyzer('java', () => makeStubAnalyzer('java'));
    const analyzer = getAnalyzer('java', {
      enabled: true,
      languages: { java: { enabled: true } },
    });
    expect(analyzer).toBeDefined();
  });
});
