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
});
