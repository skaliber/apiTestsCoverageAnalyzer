import {
  traverseInheritanceChain,
  resolveImportedHelper,
  resolveFixtureInjection,
} from '../../../../src/pipeline/stages/ast/abstractLayerTraversal';
import type { CrossFileSymbolTable, ClassDeclaration } from '../../../../src/pipeline/stages/ast/types';
import type { SemanticModel, SemanticAssertion, SemanticHttpCall } from '../../../../src/ast/astTypes';

/**
 * Factory for a minimal valid SemanticModel.
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

/**
 * Factory for a minimal CrossFileSymbolTable.
 */
function makeTable(overrides: Partial<CrossFileSymbolTable> = {}): CrossFileSymbolTable {
  return {
    models: new Map(),
    exportedSymbols: new Map(),
    classes: new Map(),
    importGraph: new Map(),
    routerMounts: new Map(),
    injectionChains: new Map(),
    interfaceImplementations: new Map(),
    middlewareInheritance: new Map(),
    ...overrides,
  };
}

describe('traverseInheritanceChain', () => {
  // ─── Depth 1 inheritance ───────────────────────────────────────────────────

  it('should resolve assertions from a direct base class (depth 1)', () => {
    const baseAssertions: SemanticAssertion[] = [
      { assertionType: 'status-code', subjectVariable: 'response' },
    ];

    const baseModel = makeModel({
      filePath: '/test/base.ts',
      assertions: baseAssertions,
    });

    const childModel = makeModel({
      filePath: '/test/child.ts',
      assertions: [],
    });

    const classes = new Map<string, ClassDeclaration>([
      ['ChildTest', { name: 'ChildTest', methods: [], filePath: '/test/child.ts', extendsClass: 'BaseTest' }],
      ['BaseTest', { name: 'BaseTest', methods: [], filePath: '/test/base.ts' }],
    ]);

    const table = makeTable({
      models: new Map([
        ['/test/base.ts', baseModel],
        ['/test/child.ts', childModel],
      ]),
      classes,
    });

    const result = traverseInheritanceChain('ChildTest', table);

    expect(result.resolvedAssertions).toHaveLength(1);
    expect(result.resolvedAssertions[0].assertionType).toBe('status-code');
    expect(result.assertionSource).toBe('inherited');
    expect(result.traversalDepth).toBe(1);
    expect(result.cycleDetected).toBe(false);
    expect(result.resolution).toBe('full');
  });

  // ─── Depth 3 chain ────────────────────────────────────────────────────────

  it('should resolve assertions from a depth-3 chain (A extends B extends C)', () => {
    const grandparentAssertions: SemanticAssertion[] = [
      { assertionType: 'body-field', subjectVariable: 'res' },
    ];

    const models = new Map<string, SemanticModel>([
      ['/test/a.ts', makeModel({ filePath: '/test/a.ts', assertions: [] })],
      ['/test/b.ts', makeModel({ filePath: '/test/b.ts', assertions: [] })],
      ['/test/c.ts', makeModel({ filePath: '/test/c.ts', assertions: grandparentAssertions })],
    ]);

    const classes = new Map<string, ClassDeclaration>([
      ['ClassA', { name: 'ClassA', methods: [], filePath: '/test/a.ts', extendsClass: 'ClassB' }],
      ['ClassB', { name: 'ClassB', methods: [], filePath: '/test/b.ts', extendsClass: 'ClassC' }],
      ['ClassC', { name: 'ClassC', methods: [], filePath: '/test/c.ts' }],
    ]);

    const table = makeTable({ models, classes });

    const result = traverseInheritanceChain('ClassA', table);

    expect(result.resolvedAssertions).toHaveLength(1);
    expect(result.resolvedAssertions[0].assertionType).toBe('body-field');
    expect(result.traversalDepth).toBe(2);
    expect(result.assertionSource).toBe('inherited');
    expect(result.resolution).toBe('full');
  });

  // ─── Depth cap hit ────────────────────────────────────────────────────────

  it('should mark resolution as partial when depth cap is exceeded', () => {
    // Chain: A → B → C → D (depth 3), but cap set to 2
    const models = new Map<string, SemanticModel>([
      ['/test/a.ts', makeModel({ filePath: '/test/a.ts' })],
      ['/test/b.ts', makeModel({ filePath: '/test/b.ts' })],
      ['/test/c.ts', makeModel({ filePath: '/test/c.ts' })],
      ['/test/d.ts', makeModel({ filePath: '/test/d.ts' })],
    ]);

    const classes = new Map<string, ClassDeclaration>([
      ['A', { name: 'A', methods: [], filePath: '/test/a.ts', extendsClass: 'B' }],
      ['B', { name: 'B', methods: [], filePath: '/test/b.ts', extendsClass: 'C' }],
      ['C', { name: 'C', methods: [], filePath: '/test/c.ts', extendsClass: 'D' }],
      ['D', { name: 'D', methods: [], filePath: '/test/d.ts' }],
    ]);

    const table = makeTable({ models, classes });

    const result = traverseInheritanceChain('A', table, 2);

    expect(result.resolution).toBe('partial');
    expect(result.unresolvedChain).toBeDefined();
    expect(result.unresolvedChain!.some((s) => s.includes('depth cap'))).toBe(true);
  });

  // ─── Cycle detection ──────────────────────────────────────────────────────

  it('should detect cycles and not loop infinitely (A extends B, B extends A)', () => {
    const models = new Map<string, SemanticModel>([
      ['/test/a.ts', makeModel({ filePath: '/test/a.ts' })],
      ['/test/b.ts', makeModel({ filePath: '/test/b.ts' })],
    ]);

    const classes = new Map<string, ClassDeclaration>([
      ['CycleA', { name: 'CycleA', methods: [], filePath: '/test/a.ts', extendsClass: 'CycleB' }],
      ['CycleB', { name: 'CycleB', methods: [], filePath: '/test/b.ts', extendsClass: 'CycleA' }],
    ]);

    const table = makeTable({ models, classes });

    const result = traverseInheritanceChain('CycleA', table);

    expect(result.cycleDetected).toBe(true);
    expect(result.resolution).toBe('partial');
  });

  // ─── Class not found ──────────────────────────────────────────────────────

  it('should return direct assertion source for an unknown class (depth 0)', () => {
    const table = makeTable();

    const result = traverseInheritanceChain('UnknownClass', table);

    expect(result.traversalDepth).toBe(0);
    expect(result.assertionSource).toBe('direct');
    expect(result.resolvedAssertions).toHaveLength(0);
    expect(result.resolvedHttpCalls).toHaveLength(0);
    expect(result.resolution).toBe('full');
  });
});

describe('resolveImportedHelper', () => {
  // ─── Helper with HTTP calls ────────────────────────────────────────────────

  it('should resolve HTTP calls from an imported helper function', () => {
    const httpCall: SemanticHttpCall = {
      method: 'GET',
      rawPathArg: '/api/users',
      resolvedPath: '/api/users',
      resolutionType: 'direct',
      confidence: 'high',
    };

    const helperModel = makeModel({
      filePath: '/test/helpers.ts',
      functions: new Map([
        [
          'fetchUsers',
          {
            name: 'fetchUsers',
            parameters: [],
            bodyHttpCalls: [httpCall],
            calledFunctions: [],
          },
        ],
      ]),
    });

    const testModel = makeModel({
      filePath: '/test/test.spec.ts',
    });

    const table = makeTable({
      models: new Map([
        ['/test/helpers.ts', helperModel],
        ['/test/test.spec.ts', testModel],
      ]),
      importGraph: new Map([
        ['/test/test.spec.ts', ['/test/helpers.ts']],
      ]),
    });

    const result = resolveImportedHelper('fetchUsers', '/test/test.spec.ts', table);

    expect(result.resolvedHttpCalls).toHaveLength(1);
    expect(result.resolvedHttpCalls[0].method).toBe('GET');
    expect(result.resolvedHttpCalls[0].rawPathArg).toBe('/api/users');
  });
});

describe('resolveFixtureInjection', () => {
  // ─── Fixture found ────────────────────────────────────────────────────────

  it('should resolve a fixture function and set assertionSource to fixture', () => {
    const httpCall: SemanticHttpCall = {
      method: 'POST',
      rawPathArg: '/api/setup',
      resolvedPath: '/api/setup',
      resolutionType: 'direct',
      confidence: 'high',
    };

    const fixtureModel = makeModel({
      filePath: '/test/fixtures.ts',
      functions: new Map([
        [
          'setupDatabase',
          {
            name: 'setupDatabase',
            parameters: [],
            bodyHttpCalls: [httpCall],
            calledFunctions: [],
          },
        ],
      ]),
      assertions: [{ assertionType: 'status-code', subjectVariable: 'res' }],
    });

    const table = makeTable({
      models: new Map([['/test/fixtures.ts', fixtureModel]]),
    });

    const result = resolveFixtureInjection('setupDatabase', table);

    expect(result.assertionSource).toBe('fixture');
    expect(result.resolution).toBe('full');
    expect(result.resolvedHttpCalls).toHaveLength(1);
    expect(result.resolvedAssertions).toHaveLength(1);
    expect(result.traversalDepth).toBe(1);
    expect(result.cycleDetected).toBe(false);
  });

  // ─── Fixture not found ────────────────────────────────────────────────────

  it('should return partial resolution when the fixture is not found', () => {
    const table = makeTable();

    const result = resolveFixtureInjection('nonexistentFixture', table);

    expect(result.assertionSource).toBe('unresolved');
    expect(result.resolution).toBe('partial');
    expect(result.unresolvedChain).toBeDefined();
    expect(result.unresolvedChain!.some((s) => s.includes('fixture not found'))).toBe(true);
    expect(result.cycleDetected).toBe(false);
  });
});
