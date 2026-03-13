jest.mock('fs');

import {
  buildCrossFileSymbolTable,
  resolveSymbolCrossFile,
} from '../../../../src/pipeline/stages/ast/crossFileResolver';
import type { SemanticModel } from '../../../../src/ast/astTypes';
import type { CrossFileSymbolTable } from '../../../../src/pipeline/stages/ast/types';

/**
 * Factory for a minimal valid SemanticModel with optional overrides.
 */
function makeModel(overrides: Partial<SemanticModel> = {}): SemanticModel {
  return {
    filePath: '/test/file.ts',
    language: 'typescript',
    localVariables: new Map(),
    constants: new Map(),
    enums: new Map(),
    functions: new Map(),
    httpInteractions: [],
    assertions: [],
    businessRuleRefs: [],
    flowRefs: [],
    ...overrides,
  };
}

describe('buildCrossFileSymbolTable / resolveSymbolCrossFile', () => {
  // ─── Constants as exported symbols ─────────────────────────────────────────

  it('should collect constants and resolve them by name', () => {
    const model = makeModel({
      filePath: '/test/config.ts',
      constants: new Map([
        ['BASE_URL', { name: 'BASE_URL', kind: 'const', value: '/api' }],
      ]),
    });
    const models = new Map([['/test/config.ts', model]]);

    const table = buildCrossFileSymbolTable(models, '/test');

    // Should be available as a global symbol
    const resolved = resolveSymbolCrossFile('BASE_URL', '/test/config.ts', table);
    expect(resolved).toBe('/api');
  });

  // ─── Cross-file constant resolution ────────────────────────────────────────

  it('should resolve a constant from an imported file', () => {
    const fileA = makeModel({
      filePath: '/test/constants.ts',
      constants: new Map([
        ['API_HOST', { name: 'API_HOST', kind: 'const', value: 'https://api.example.com' }],
      ]),
    });
    const fileB = makeModel({
      filePath: '/test/client.ts',
      // fileB has a function that calls "constants.getHost" so the import graph
      // links fileB -> fileA through extractImportsFromModel heuristic.
      // For this test we build the table manually and verify cross-file lookup.
    });

    const models = new Map([
      ['/test/constants.ts', fileA],
      ['/test/client.ts', fileB],
    ]);

    const table = buildCrossFileSymbolTable(models, '/test');

    // Manually wire the import graph so fileB imports from fileA
    table.importGraph.set('/test/client.ts', ['/test/constants.ts']);

    // Resolve from fileB's perspective following the import chain
    const resolved = resolveSymbolCrossFile('API_HOST', '/test/client.ts', table);
    expect(resolved).toBe('https://api.example.com');
  });

  // ─── Enum member resolution ────────────────────────────────────────────────

  it('should resolve enum member via dotted name', () => {
    const model = makeModel({
      filePath: '/test/enums.ts',
      enums: new Map([
        ['Status', new Map([['ACTIVE', 'active'], ['INACTIVE', 'inactive']])],
      ]),
    });
    const models = new Map([['/test/enums.ts', model]]);

    const table = buildCrossFileSymbolTable(models, '/test');

    const resolved = resolveSymbolCrossFile('Status.ACTIVE', '/test/enums.ts', table);
    expect(resolved).toBe('active');
  });

  // ─── Class declaration extraction ──────────────────────────────────────────

  it('should extract class declarations from functions with ClassName.method naming', () => {
    const model = makeModel({
      filePath: '/test/service.ts',
      functions: new Map([
        [
          'UserService.getUser',
          {
            name: 'UserService.getUser',
            parameters: ['id'],
            bodyHttpCalls: [],
            calledFunctions: [],
          },
        ],
        [
          'UserService.createUser',
          {
            name: 'UserService.createUser',
            parameters: ['data'],
            bodyHttpCalls: [],
            calledFunctions: [],
          },
        ],
      ]),
    });
    const models = new Map([['/test/service.ts', model]]);

    const table = buildCrossFileSymbolTable(models, '/test');

    expect(table.classes.has('UserService')).toBe(true);
    const classDecl = table.classes.get('UserService')!;
    expect(classDecl.name).toBe('UserService');
    expect(classDecl.filePath).toBe('/test/service.ts');
    expect(classDecl.methods).toContain('getUser');
    expect(classDecl.methods).toContain('createUser');
  });

  // ─── Empty models ─────────────────────────────────────────────────────────

  it('should return a valid table with empty maps for empty models', () => {
    const models = new Map<string, SemanticModel>();

    const table = buildCrossFileSymbolTable(models, '/test');

    expect(table.exportedSymbols.size).toBe(0);
    expect(table.classes.size).toBe(0);
    expect(table.importGraph.size).toBe(0);
    expect(table.models).toBe(models);
  });
});
