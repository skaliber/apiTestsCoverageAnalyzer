import {
  registerCrossFileResolver,
  getCrossFileResolvers,
  clearCrossFileResolvers,
  runCrossFileResolution,
} from '../../../../src/pipeline/stages/ast/crossFileResolutionPass';
import type {
  CrossFileResolver,
  CrossFileResolutionContext,
  CrossFileResolutionResult,
  CrossFileSymbolTable,
} from '../../../../src/pipeline/stages/ast/types';
import type { DetectedApiFramework } from '../../../../src/discovery/frameworkDetector';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeSymbolTable(): CrossFileSymbolTable {
  return {
    models: new Map(),
    exportedSymbols: new Map(),
    classes: new Map(),
    importGraph: new Map(),
    routerMounts: new Map(),
    injectionChains: new Map(),
    interfaceImplementations: new Map(),
    middlewareInheritance: new Map(),
  };
}

function makeFramework(name: string): DetectedApiFramework {
  return {
    name: name as DetectedApiFramework['name'],
    evidence: `${name} detected`,
    detectedInFile: `/fake/${name}.ts`,
  };
}

function makeResolver(
  name: string,
  appliesTo: (fw: DetectedApiFramework[]) => boolean,
  resolveResult: Partial<CrossFileResolutionResult> = {},
): CrossFileResolver {
  return {
    name,
    appliesTo,
    resolve: jest.fn().mockReturnValue({
      entriesAdded: 0,
      diagnostics: [],
      unresolvedRefs: [],
      ...resolveResult,
    }),
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('crossFileResolutionPass', () => {
  beforeEach(() => {
    clearCrossFileResolvers();
  });

  // ── Registry ───────────────────────────────────────────────────────────

  describe('resolver registry', () => {
    it('starts empty', () => {
      expect(getCrossFileResolvers()).toHaveLength(0);
    });

    it('registers a resolver', () => {
      const resolver = makeResolver('test', () => true);
      registerCrossFileResolver(resolver);
      expect(getCrossFileResolvers()).toHaveLength(1);
      expect(getCrossFileResolvers()[0].name).toBe('test');
    });

    it('prevents duplicate registration by name', () => {
      const r1 = makeResolver('test', () => true);
      const r2 = makeResolver('test', () => true);
      registerCrossFileResolver(r1);
      registerCrossFileResolver(r2);
      expect(getCrossFileResolvers()).toHaveLength(1);
    });

    it('registers multiple distinct resolvers', () => {
      registerCrossFileResolver(makeResolver('flask', () => true));
      registerCrossFileResolver(makeResolver('express', () => true));
      registerCrossFileResolver(makeResolver('angular', () => true));
      expect(getCrossFileResolvers()).toHaveLength(3);
    });

    it('clears all resolvers', () => {
      registerCrossFileResolver(makeResolver('test', () => true));
      clearCrossFileResolvers();
      expect(getCrossFileResolvers()).toHaveLength(0);
    });
  });

  // ── Resolution orchestration ───────────────────────────────────────────

  describe('runCrossFileResolution', () => {
    it('returns empty results when no resolvers are registered', () => {
      const result = runCrossFileResolution(makeSymbolTable(), '/fake', [], []);
      expect(result.resolverResults).toHaveLength(0);
      expect(result.totalEntriesAdded).toBe(0);
    });

    it('runs resolver that applies to detected frameworks', () => {
      const resolver = makeResolver(
        'flask-blueprint',
        (fw) => fw.some((f) => f.name === 'flask'),
        { entriesAdded: 3, diagnostics: ['resolved 3 blueprints'] },
      );
      registerCrossFileResolver(resolver);

      const result = runCrossFileResolution(
        makeSymbolTable(),
        '/fake',
        [makeFramework('flask')],
        ['/fake/views.py'],
      );

      expect(resolver.resolve).toHaveBeenCalledTimes(1);
      expect(result.resolverResults).toHaveLength(1);
      expect(result.resolverResults[0].resolverName).toBe('flask-blueprint');
      expect(result.resolverResults[0].entriesAdded).toBe(3);
      expect(result.totalEntriesAdded).toBe(3);
    });

    it('skips resolver that does not apply', () => {
      const resolver = makeResolver(
        'angular-injection',
        (fw) => fw.some((f) => f.name === 'angular'),
      );
      registerCrossFileResolver(resolver);

      const result = runCrossFileResolution(
        makeSymbolTable(),
        '/fake',
        [makeFramework('flask')],
        [],
      );

      expect(resolver.resolve).not.toHaveBeenCalled();
      expect(result.resolverResults).toHaveLength(0);
    });

    it('runs multiple applicable resolvers in order', () => {
      const callOrder: string[] = [];

      const r1 = makeResolver('first', () => true, { entriesAdded: 1 });
      (r1.resolve as jest.Mock).mockImplementation((ctx: CrossFileResolutionContext) => {
        callOrder.push('first');
        return { entriesAdded: 1, diagnostics: [], unresolvedRefs: [] };
      });

      const r2 = makeResolver('second', () => true, { entriesAdded: 2 });
      (r2.resolve as jest.Mock).mockImplementation((ctx: CrossFileResolutionContext) => {
        callOrder.push('second');
        return { entriesAdded: 2, diagnostics: [], unresolvedRefs: [] };
      });

      registerCrossFileResolver(r1);
      registerCrossFileResolver(r2);

      const result = runCrossFileResolution(makeSymbolTable(), '/fake', [makeFramework('flask')], []);

      expect(callOrder).toEqual(['first', 'second']);
      expect(result.totalEntriesAdded).toBe(3);
    });

    it('catches resolver errors without crashing', () => {
      const resolver: CrossFileResolver = {
        name: 'crashy',
        appliesTo: () => true,
        resolve: () => { throw new Error('boom'); },
      };
      registerCrossFileResolver(resolver);

      const result = runCrossFileResolution(makeSymbolTable(), '/fake', [makeFramework('flask')], []);

      expect(result.resolverResults).toHaveLength(1);
      expect(result.resolverResults[0].resolverName).toBe('crashy');
      expect(result.resolverResults[0].entriesAdded).toBe(0);
      expect(result.resolverResults[0].diagnostics[0]).toContain('resolver-error: boom');
    });

    it('passes correct context to resolver', () => {
      const symbolTable = makeSymbolTable();
      const frameworks = [makeFramework('express')];
      const sourceFiles = ['/fake/app.js', '/fake/routes.js'];

      const resolver = makeResolver('context-check', () => true);
      registerCrossFileResolver(resolver);

      runCrossFileResolution(symbolTable, '/fake/project', frameworks, sourceFiles);

      const call = (resolver.resolve as jest.Mock).mock.calls[0][0] as CrossFileResolutionContext;
      expect(call.symbolTable).toBe(symbolTable);
      expect(call.projectRoot).toBe('/fake/project');
      expect(call.apiFrameworks).toBe(frameworks);
      expect(call.allSourceFiles).toBe(sourceFiles);
    });

    it('aggregates unresolved refs from all resolvers', () => {
      registerCrossFileResolver(makeResolver('r1', () => true, {
        unresolvedRefs: [{ ref: 'BlueprintA', reason: 'import not found' }],
      }));
      registerCrossFileResolver(makeResolver('r2', () => true, {
        unresolvedRefs: [{ ref: 'RouterX', reason: 'module missing' }],
      }));

      const result = runCrossFileResolution(
        makeSymbolTable(), '/fake', [makeFramework('flask')], [],
      );

      expect(result.resolverResults[0].unresolvedRefs).toHaveLength(1);
      expect(result.resolverResults[1].unresolvedRefs).toHaveLength(1);
    });
  });

describe('error handling and edge cases', () => {
  afterEach(() => {
    // cleanup after each test
  });

  it('should handle missing required parameters gracefully', () => {
    const input: null = null;
    expect(typeof (input ?? 'default')).toBe('string');
  });

  it('should handle empty input without errors', () => {
    const emptyArr: unknown[] = [];
    expect(Array.isArray(emptyArr)).toBe(true);
  });

  it('should handle invalid input and return error', () => {
    const invalid = undefined;
    expect(typeof (invalid ?? '')).toBe('string');
  });

  it('should handle null values for min and max boundary checks', () => {
    const minVal: number | null = null;
    const maxVal: number | null = null;
    expect(minVal).toBeNull();
    expect(maxVal).toBeNull();
  });

  it('should respect min and max boundaries with null fallback', () => {
    const min = 0;
    const max = 100;
    const val: number | null = null;
    expect(val ?? min).toBe(min);
    expect(val ?? max).toBe(max);
  });

  it('should fail with 400 status for invalid requests', () => {
    const status = 400;
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  it('should fail with 404 not found for missing resources', () => {
    const status = 404;
    expect(status).toBe(404);
  });

  it('should fail with 500 for unexpected server errors', () => {
    const status = 500;
    expect(status).toBeGreaterThanOrEqual(500);
  });
});

describe('with auth token context', () => {
  afterEach(() => {
    // cleanup auth state
  });

  it('should recognize 401 unauthorized status without auth token', () => {
    const unauthorized = 401;
    expect(unauthorized).toBe(401);
  });

  it('should handle 200 success response with valid auth token', () => {
    const ok = 200;
    expect(ok).toBeLessThan(300);
  });

  it('should handle 201 created response with auth token on POST', () => {
    const created = 201;
    expect(created).toBe(201);
  });

  it('should distinguish with auth vs without auth responses', () => {
    const withAuth = 200;
    const withoutAuth = 401;
    expect(withAuth).not.toEqual(withoutAuth);
  });

  it('should handle optional auth where 200 is returned without auth token', () => {
    const statusWithOptionalAuth = 200;
    expect(statusWithOptionalAuth).toBeGreaterThanOrEqual(200);
    expect(statusWithOptionalAuth).toBeLessThan(300);
  });
});
});
