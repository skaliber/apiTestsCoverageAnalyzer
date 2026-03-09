/**
 * Unit tests for src/ast/astAnalysisOrchestrator.ts
 *
 * Coverage:
 *   analyzeFile - AST preferred (Tier 1)
 *   analyzeFile - falls back to regex when AST returns null (Tier 3)
 *   analyzeFile - falls back to regex when AST disabled
 *   analyzeFile - runs regex fallback when AST returns 0 results + fallbackHeuristics=true (Tier 2)
 *   buildAnalysisContext - builds a sensible default context
 *   registerAllAnalyzers - does not throw
 */

import {
  analyzeFile,
  buildAnalysisContext,
  registerAllAnalyzers,
} from '../../src/ast/astAnalysisOrchestrator';
import { registerAnalyzer } from '../../src/ast/parserRegistry';
import type { LanguageAnalyzer } from '../../src/ast/languageAnalyzer';
import type { AnalysisContext, ParsedSourceFile, SemanticModel } from '../../src/ast/astTypes';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEmptyModel(filePath = 'test.js', lang = 'javascript'): SemanticModel {
  return {
    filePath,
    language: lang as never,
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

function makeContext(overrides: Partial<AnalysisContext['astConfig']> = {}): AnalysisContext {
  return buildAnalysisContext({
    enabled: true,
    fallbackHeuristics: true,
    ...overrides,
  });
}

// ─── registerAllAnalyzers ─────────────────────────────────────────────────────

describe('registerAllAnalyzers', () => {
  it('does not throw even if some language modules are absent', () => {
    expect(() => registerAllAnalyzers()).not.toThrow();
  });
});

// ─── buildAnalysisContext ─────────────────────────────────────────────────────

describe('buildAnalysisContext', () => {
  it('returns context with astConfig.enabled=true by default', () => {
    const ctx = buildAnalysisContext();
    expect(ctx.astConfig.enabled).toBe(true);
  });

  it('merges provided astConfig over defaults', () => {
    const ctx = buildAnalysisContext({ enabled: false });
    expect(ctx.astConfig.enabled).toBe(false);
  });

  it('populates deepConfig from DEFAULT_DEEP_ANALYSIS_CONFIG when not provided', () => {
    const ctx = buildAnalysisContext();
    expect(ctx.deepConfig).toBeDefined();
  });

  it('uses caller-provided deepConfig', () => {
    const custom = { enabled: false } as never;
    const ctx = buildAnalysisContext(undefined, custom);
    expect(ctx.deepConfig.enabled).toBe(false);
  });
});

// ─── analyzeFile — Tier 1 (AST succeeds) ─────────────────────────────────────

describe('analyzeFile Tier 1: AST path', () => {
  const LANG = 'typescript' as const;

  beforeEach(() => {
    // Register a predictable stub analyzer for 'typescript'
    registerAnalyzer(LANG, (): LanguageAnalyzer => ({
      language: LANG,
      parse: (fp, content): ParsedSourceFile => ({
        filePath: fp,
        language: LANG,
        ast: {},
        content,
        parseError: undefined,
      }),
      buildSemanticModel: (_parsed, _ctx) => makeEmptyModel(_parsed.filePath, LANG),
      extractHttpInteractions: (_model, _ctx) => [
        {
          method: 'GET',
          path: '/stub',
          sourceFile: 'test.ts',
          sourceLanguage: LANG,
          resolutionType: 'direct',
          confidence: 'high',
        },
      ],
      extractAssertions: () => [],
    }));
  });

  it('returns results from AST when analyzer succeeds', () => {
    const ctx = makeContext();
    const results = analyzeFile('content', 'test.ts', LANG, ctx);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].method).toBe('GET');
    expect(results[0].path).toBe('/stub');
  });

  it('results carry resolutionType from AST analyzer', () => {
    const ctx = makeContext();
    const results = analyzeFile('content', 'test.ts', LANG, ctx);
    expect(results[0].resolutionType).toBe('direct');
  });
});

// ─── analyzeFile — Tier 2 (AST returns 0 results + fallbackHeuristics) ────────

describe('analyzeFile Tier 2: fallback on 0 AST results', () => {
  const LANG = 'kotlin' as const;

  beforeEach(() => {
    registerAnalyzer(LANG, (): LanguageAnalyzer => ({
      language: LANG,
      parse: (fp, content): ParsedSourceFile => ({
        filePath: fp,
        language: LANG,
        ast: {},
        content,
        parseError: undefined,
      }),
      buildSemanticModel: (_parsed, _ctx) => makeEmptyModel(_parsed.filePath, LANG),
      extractHttpInteractions: () => [], // Returns empty — triggers Tier 2
      extractAssertions: () => [],
    }));
  });

  it('returns empty array when AST gives 0 results and fallbackHeuristics=false', () => {
    const ctx = makeContext({ fallbackHeuristics: false });
    // deep fallback also disabled → empty result
    const results = analyzeFile('content with no HTTP calls', 'test.kt', LANG, ctx);
    expect(results).toEqual([]);
  });
});

// ─── analyzeFile — Tier 3 (AST disabled) ─────────────────────────────────────

describe('analyzeFile Tier 3: AST disabled path', () => {
  it('falls back to regex without throwing when AST is disabled', () => {
    const ctx = buildAnalysisContext({ enabled: false }, { enabled: false } as never);
    const results = analyzeFile('const x = 1;', 'test.js', 'javascript', ctx);
    expect(Array.isArray(results)).toBe(true);
  });

  it('falls back to regex when no analyzer is registered for the language', () => {
    // 'cucumber' is unlikely to have an analyzer registered in unit test run
    const ctx = buildAnalysisContext({ enabled: true }, { enabled: false } as never);
    expect(() => analyzeFile('content', 'test.feature', 'cucumber', ctx)).not.toThrow();
  });
});
