import { FlaskBlueprintResolver } from '../../../../../src/pipeline/stages/ast/resolvers/flaskBlueprintResolver';
import type {
  CrossFileSymbolTable,
  CrossFileResolutionContext,
} from '../../../../../src/pipeline/stages/ast/types';
import type { SemanticModel, RouteRegistration } from '../../../../../src/ast/astTypes';
import type { DetectedApiFramework } from '../../../../../src/discovery/frameworkDetector';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeModel(filePath: string, routeRegistrations: RouteRegistration[] = []): SemanticModel {
  return {
    filePath,
    language: 'python',
    localVariables: new Map(),
    constants: new Map(),
    enums: new Map(),
    functions: new Map(),
    httpInteractions: [],
    assertions: [],
    businessRuleRefs: [],
    flowRefs: [],
    routeRegistrations,
  };
}

function makeSymbolTable(models: Map<string, SemanticModel>): CrossFileSymbolTable {
  return {
    models,
    exportedSymbols: new Map(),
    classes: new Map(),
    importGraph: new Map(),
    routerMounts: new Map(),
    injectionChains: new Map(),
    interfaceImplementations: new Map(),
    middlewareInheritance: new Map(),
  };
}

function makeCtx(symbolTable: CrossFileSymbolTable): CrossFileResolutionContext {
  return {
    symbolTable,
    projectRoot: '/fake/project',
    apiFrameworks: [{ name: 'flask', evidence: 'Flask import', detectedInFile: '/fake/app.py' }],
    allSourceFiles: [...symbolTable.models.keys()],
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('FlaskBlueprintResolver', () => {
  const resolver = new FlaskBlueprintResolver();

  it('applies to flask framework', () => {
    expect(resolver.appliesTo([{ name: 'flask', evidence: '', detectedInFile: '' }])).toBe(true);
  });

  it('applies to fastapi framework', () => {
    expect(resolver.appliesTo([{ name: 'fastapi', evidence: '', detectedInFile: '' }])).toBe(true);
  });

  it('does not apply to express framework', () => {
    expect(resolver.appliesTo([{ name: 'express', evidence: '', detectedInFile: '' }])).toBe(false);
  });

  it('resolves Blueprint url_prefix from register_blueprint call', () => {
    // File 1: Blueprint constructor
    const blueprintModel = makeModel('/fake/views/articles.py', [
      { registrarName: 'articles_bp', path: '', sourceFile: '/fake/views/articles.py', line: 3 },
      { registrarName: 'articles_bp', path: '/articles/<slug>', methods: ['GET'], sourceFile: '/fake/views/articles.py', line: 10 },
    ]);

    // File 2: App factory with register_blueprint
    const appModel = makeModel('/fake/app.py', [
      { registrarName: 'articles_bp', path: '/api', targetModule: 'articles_bp', sourceFile: '/fake/app.py', line: 8 },
    ]);

    const models = new Map([
      ['/fake/views/articles.py', blueprintModel],
      ['/fake/app.py', appModel],
    ]);

    const symbolTable = makeSymbolTable(models);
    const result = resolver.resolve(makeCtx(symbolTable));

    expect(result.entriesAdded).toBeGreaterThan(0);
    expect(symbolTable.routerMounts.get('/fake/app.py')).toBeDefined();
    const mount = symbolTable.routerMounts.get('/fake/app.py')![0];
    expect(mount.prefix).toBe('/api');
  });

  it('resolves inline Blueprint url_prefix without register_blueprint', () => {
    const model = makeModel('/fake/views.py', [
      { registrarName: 'bp', path: '/api/articles', sourceFile: '/fake/views.py', line: 1 },
      { registrarName: 'bp', path: '/', methods: ['GET'], sourceFile: '/fake/views.py', line: 5 },
    ]);

    const symbolTable = makeSymbolTable(new Map([['/fake/views.py', model]]));
    const result = resolver.resolve(makeCtx(symbolTable));

    expect(result.entriesAdded).toBe(1);
    expect(symbolTable.routerMounts.get('/fake/views.py')).toBeDefined();
    expect(symbolTable.routerMounts.get('/fake/views.py')![0].prefix).toBe('/api/articles');
  });

  it('tracks unresolved Blueprint variables when no prefix is available', () => {
    const model = makeModel('/fake/app.py', [
      { registrarName: 'unknown_bp', path: '', targetModule: 'unknown_bp', sourceFile: '/fake/app.py', line: 5 },
    ]);

    const symbolTable = makeSymbolTable(new Map([['/fake/app.py', model]]));
    const result = resolver.resolve(makeCtx(symbolTable));

    expect(result.unresolvedRefs).toHaveLength(1);
    expect(result.unresolvedRefs[0].ref).toBe('unknown_bp');
  });

  it('handles empty models gracefully', () => {
    const symbolTable = makeSymbolTable(new Map());
    const result = resolver.resolve(makeCtx(symbolTable));

    expect(result.entriesAdded).toBe(0);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.unresolvedRefs).toHaveLength(0);
  });

  it('prefers register_blueprint prefix over Blueprint constructor prefix', () => {
    // Blueprint with url_prefix='/v1'
    const bpModel = makeModel('/fake/views.py', [
      { registrarName: 'bp', path: '/v1', sourceFile: '/fake/views.py', line: 1 },
    ]);

    // register_blueprint with url_prefix='/v2' (overrides)
    const appModel = makeModel('/fake/app.py', [
      { registrarName: 'bp', path: '/v2', targetModule: 'bp', sourceFile: '/fake/app.py', line: 5 },
    ]);

    const symbolTable = makeSymbolTable(new Map([
      ['/fake/views.py', bpModel],
      ['/fake/app.py', appModel],
    ]));

    const result = resolver.resolve(makeCtx(symbolTable));

    // Should use /v2 from register_blueprint
    const mounts = symbolTable.routerMounts.get('/fake/app.py');
    expect(mounts).toBeDefined();
    expect(mounts![0].prefix).toBe('/v2');
  });
});
