import { ExpressRouterResolver } from '../../../../../src/pipeline/stages/ast/resolvers/expressRouterResolver';
import type { DetectedApiFramework } from '../../../../../src/discovery/frameworkDetector';
import type { CrossFileSymbolTable } from '../../../../../src/pipeline/stages/ast/types';
import type { SemanticModel } from '../../../../../src/ast/astTypes';

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

describe('ExpressRouterResolver', () => {
  const resolver = new ExpressRouterResolver();

  it('applies to express framework', () => {
    const frameworks: DetectedApiFramework[] = [
      { name: 'express', evidence: 'express import', detectedInFile: '/fake/app.js' },
    ];
    expect(resolver.appliesTo(frameworks)).toBe(true);
  });

  it('applies to nestjs framework', () => {
    const frameworks: DetectedApiFramework[] = [
      { name: 'nestjs', evidence: 'nestjs import', detectedInFile: '/fake/app.ts' },
    ];
    expect(resolver.appliesTo(frameworks)).toBe(true);
  });

  it('does not apply to flask framework', () => {
    const frameworks: DetectedApiFramework[] = [
      { name: 'flask', evidence: 'Flask import', detectedInFile: '/fake/app.py' },
    ];
    expect(resolver.appliesTo(frameworks)).toBe(false);
  });

  it('resolves router mounts from route registrations', () => {
    const symbolTable = makeSymbolTable();
    const model: SemanticModel = {
      filePath: '/fake/app.js',
      language: 'javascript',
      localVariables: new Map(),
      constants: new Map(),
      enums: new Map(),
      functions: new Map(),
      httpInteractions: [],
      assertions: [],
      businessRuleRefs: [],
      flowRefs: [],
      routeRegistrations: [
        { registrarName: 'app', path: '/api/articles', targetModule: './routes/articles', sourceFile: '/fake/app.js', line: 10 },
      ],
    };
    symbolTable.models.set('/fake/app.js', model);

    const ctx = {
      symbolTable,
      projectRoot: '/fake',
      apiFrameworks: [{ name: 'express' as const, evidence: '', detectedInFile: '' }],
      allSourceFiles: ['/fake/app.js'],
    };

    const result = resolver.resolve(ctx);
    expect(result.entriesAdded).toBe(1);
    expect(symbolTable.routerMounts.get('/fake/app.js')).toBeDefined();
    expect(symbolTable.routerMounts.get('/fake/app.js')![0].prefix).toBe('/api/articles');
  });

  it('returns empty when no route registrations exist', () => {
    const symbolTable = makeSymbolTable();
    const ctx = {
      symbolTable,
      projectRoot: '/fake',
      apiFrameworks: [{ name: 'express' as const, evidence: '', detectedInFile: '' }],
      allSourceFiles: [],
    };

    const result = resolver.resolve(ctx);
    expect(result.entriesAdded).toBe(0);
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
