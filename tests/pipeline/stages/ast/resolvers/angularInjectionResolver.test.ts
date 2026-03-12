import { AngularInjectionResolver } from '../../../../../src/pipeline/stages/ast/resolvers/angularInjectionResolver';
import type { DetectedApiFramework } from '../../../../../src/discovery/frameworkDetector';
import type { CrossFileSymbolTable } from '../../../../../src/pipeline/stages/ast/types';

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

describe('AngularInjectionResolver', () => {
  const resolver = new AngularInjectionResolver();

  it('applies to angular framework', () => {
    const frameworks: DetectedApiFramework[] = [
      { name: 'angular', evidence: 'HttpClient import', detectedInFile: '/fake/service.ts' },
    ];
    expect(resolver.appliesTo(frameworks)).toBe(true);
  });

  it('does not apply to express framework', () => {
    const frameworks: DetectedApiFramework[] = [
      { name: 'express', evidence: 'express', detectedInFile: '/fake/app.js' },
    ];
    expect(resolver.appliesTo(frameworks)).toBe(false);
  });

  it('returns empty results when no classes have HTTP calls', () => {
    const symbolTable = makeSymbolTable();
    const ctx = {
      symbolTable,
      projectRoot: '/fake',
      apiFrameworks: [{ name: 'angular' as const, evidence: '', detectedInFile: '' }],
      allSourceFiles: [],
    };

    const result = resolver.resolve(ctx);
    expect(result.entriesAdded).toBe(0);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('resolves injection chains for services with HTTP calls', () => {
    const symbolTable = makeSymbolTable();

    // Register a service class with HTTP calls
    symbolTable.classes.set('ArticlesService', {
      name: 'ArticlesService',
      implementsInterfaces: [],
      methods: ['getArticles'],
      filePath: '/fake/articles.service.ts',
    });

    // Add a model with HTTP calls
    symbolTable.models.set('/fake/articles.service.ts', {
      filePath: '/fake/articles.service.ts',
      language: 'typescript',
      localVariables: new Map(),
      constants: new Map(),
      enums: new Map(),
      functions: new Map([
        ['getArticles', {
          name: 'getArticles',
          parameters: [],
          bodyHttpCalls: [{
            method: 'GET',
            rawPathArg: '/api/articles',
            resolutionType: 'direct',
            confidence: 'high',
          }],
          calledFunctions: [],
        }],
      ]),
      httpInteractions: [],
      assertions: [],
      businessRuleRefs: [],
      flowRefs: [],
    });

    // Pre-populate injection chain (as angularDetector would)
    symbolTable.injectionChains.set('/fake/articles.component.ts', [
      {
        consumerFile: '/fake/articles.component.ts',
        consumerClass: 'ArticlesComponent',
        serviceClass: 'ArticlesService',
        serviceFile: '/fake/articles.service.ts',
        injectionStyle: 'constructor',
      },
    ]);

    const ctx = {
      symbolTable,
      projectRoot: '/fake',
      apiFrameworks: [{ name: 'angular' as const, evidence: '', detectedInFile: '' }],
      allSourceFiles: ['/fake/articles.service.ts', '/fake/articles.component.ts'],
    };

    const result = resolver.resolve(ctx);
    // Should find the injection chain since ArticlesService has HTTP calls
    // and there's already a consumer in injectionChains
    expect(result.entriesAdded).toBeGreaterThan(0);
  });
});
