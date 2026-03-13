import { VuexActionResolver } from '../../../../../src/pipeline/stages/ast/resolvers/vuexActionResolver';
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

describe('VuexActionResolver', () => {
  const resolver = new VuexActionResolver();

  it('applies to vue framework', () => {
    const frameworks: DetectedApiFramework[] = [
      { name: 'vue', evidence: 'Vuex import', detectedInFile: '/fake/store.js' },
    ];
    expect(resolver.appliesTo(frameworks)).toBe(true);
  });

  it('does not apply to angular framework', () => {
    const frameworks: DetectedApiFramework[] = [
      { name: 'angular', evidence: 'HttpClient', detectedInFile: '/fake/service.ts' },
    ];
    expect(resolver.appliesTo(frameworks)).toBe(false);
  });

  it('returns empty results when no models exist', () => {
    const symbolTable = makeSymbolTable();
    const ctx = {
      symbolTable,
      projectRoot: '/fake',
      apiFrameworks: [{ name: 'vue' as const, evidence: '', detectedInFile: '' }],
      allSourceFiles: [],
    };

    const result = resolver.resolve(ctx);
    expect(result.entriesAdded).toBe(0);
  });
});
