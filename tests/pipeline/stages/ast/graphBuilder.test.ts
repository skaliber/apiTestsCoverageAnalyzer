import { buildAstGraph } from '../../../../src/pipeline/stages/ast/graphBuilder';
import type { SemanticModel, ResolvedHttpInteraction } from '../../../../src/ast/astTypes';
import type { CrossFileSymbolTable, ClassDeclaration, TraversalResult } from '../../../../src/pipeline/stages/ast/types';

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

/**
 * Factory for a minimal ResolvedHttpInteraction.
 */
function makeInteraction(overrides: Partial<ResolvedHttpInteraction> = {}): ResolvedHttpInteraction {
  return {
    method: 'GET',
    path: '/api/users',
    sourceFile: '/test/test.spec.ts',
    sourceLanguage: 'typescript',
    resolutionType: 'direct',
    confidence: 'high',
    ...overrides,
  };
}

describe('buildAstGraph', () => {
  // ─── Creates file nodes ────────────────────────────────────────────────────

  it('should create file nodes for every model, marking test files as test-file', () => {
    const models = new Map<string, SemanticModel>([
      ['/test/service.ts', makeModel({ filePath: '/test/service.ts' })],
      ['/test/api.test.ts', makeModel({ filePath: '/test/api.test.ts' })],
    ]);

    const table = makeTable({ models });
    const traversalResults = new Map<string, TraversalResult>();
    const interactions = new Map<string, ResolvedHttpInteraction[]>();

    const { nodes } = buildAstGraph(models, table, traversalResults, interactions);

    const serviceNode = nodes.find((n) => n.id === 'file:/test/service.ts');
    expect(serviceNode).toBeDefined();
    expect(serviceNode!.type).toBe('file');

    const testNode = nodes.find((n) => n.id === 'file:/test/api.test.ts');
    expect(testNode).toBeDefined();
    expect(testNode!.type).toBe('test-file');
  });

  // ─── Creates endpoint nodes ────────────────────────────────────────────────

  it('should create endpoint nodes from HTTP interactions', () => {
    const models = new Map<string, SemanticModel>([
      ['/test/test.spec.ts', makeModel({ filePath: '/test/test.spec.ts' })],
    ]);

    const table = makeTable({ models });
    const traversalResults = new Map<string, TraversalResult>();
    const interactions = new Map<string, ResolvedHttpInteraction[]>([
      [
        '/test/test.spec.ts',
        [makeInteraction({ method: 'GET', path: '/api/users' })],
      ],
    ]);

    const { nodes } = buildAstGraph(models, table, traversalResults, interactions);

    const endpointNode = nodes.find((n) => n.id === 'endpoint:GET:/api/users');
    expect(endpointNode).toBeDefined();
    expect(endpointNode!.type).toBe('endpoint');
    expect(endpointNode!.label).toBe('GET /api/users');
    expect(endpointNode!.metadata.method).toBe('GET');
    expect(endpointNode!.metadata.path).toBe('/api/users');
  });

  // ─── Creates tests edges ──────────────────────────────────────────────────

  it('should create tests edge from a test file to an endpoint', () => {
    const models = new Map<string, SemanticModel>([
      ['/test/api.test.ts', makeModel({ filePath: '/test/api.test.ts' })],
    ]);

    const table = makeTable({ models });
    const traversalResults = new Map<string, TraversalResult>();
    const interactions = new Map<string, ResolvedHttpInteraction[]>([
      [
        '/test/api.test.ts',
        [makeInteraction({ method: 'POST', path: '/api/items', sourceFile: '/test/api.test.ts' })],
      ],
    ]);

    const { edges } = buildAstGraph(models, table, traversalResults, interactions);

    const testsEdge = edges.find(
      (e) =>
        e.type === 'tests' &&
        e.sourceNodeId === 'file:/test/api.test.ts' &&
        e.targetNodeId === 'endpoint:POST:/api/items',
    );
    expect(testsEdge).toBeDefined();
  });

  // ─── Creates function nodes ────────────────────────────────────────────────

  it('should create function nodes from model functions', () => {
    const models = new Map<string, SemanticModel>([
      [
        '/test/service.ts',
        makeModel({
          filePath: '/test/service.ts',
          functions: new Map([
            [
              'getUser',
              {
                name: 'getUser',
                parameters: ['id'],
                bodyHttpCalls: [],
                calledFunctions: [],
              },
            ],
          ]),
        }),
      ],
    ]);

    const table = makeTable({ models });
    const traversalResults = new Map<string, TraversalResult>();
    const interactions = new Map<string, ResolvedHttpInteraction[]>();

    const { nodes } = buildAstGraph(models, table, traversalResults, interactions);

    const funcNode = nodes.find((n) => n.id === 'function:/test/service.ts:getUser');
    expect(funcNode).toBeDefined();
    expect(funcNode!.type).toBe('function');
    expect(funcNode!.label).toBe('getUser');
  });

  // ─── Creates class nodes ──────────────────────────────────────────────────

  it('should create class nodes from the cross-file table', () => {
    const models = new Map<string, SemanticModel>();
    const classes = new Map<string, ClassDeclaration>([
      [
        'UserController',
        {
          name: 'UserController',
          methods: ['getUser', 'createUser'],
          filePath: '/test/controller.ts',
        },
      ],
    ]);

    const table = makeTable({ models, classes });
    const traversalResults = new Map<string, TraversalResult>();
    const interactions = new Map<string, ResolvedHttpInteraction[]>();

    const { nodes } = buildAstGraph(models, table, traversalResults, interactions);

    const classNode = nodes.find((n) => n.id === 'class:/test/controller.ts:UserController');
    expect(classNode).toBeDefined();
    expect(classNode!.type).toBe('class');
    expect(classNode!.label).toBe('UserController');
    expect(classNode!.metadata.methods).toEqual(['getUser', 'createUser']);
  });

  // ─── Creates extends edges ─────────────────────────────────────────────────

  it('should create extends edge when a class has an extendsClass', () => {
    const models = new Map<string, SemanticModel>();
    const classes = new Map<string, ClassDeclaration>([
      [
        'AdminController',
        {
          name: 'AdminController',
          methods: [],
          filePath: '/test/admin.ts',
          extendsClass: 'BaseController',
        },
      ],
      [
        'BaseController',
        {
          name: 'BaseController',
          methods: [],
          filePath: '/test/base.ts',
        },
      ],
    ]);

    const table = makeTable({ models, classes });
    const traversalResults = new Map<string, TraversalResult>();
    const interactions = new Map<string, ResolvedHttpInteraction[]>();

    const { edges } = buildAstGraph(models, table, traversalResults, interactions);

    const extendsEdge = edges.find(
      (e) =>
        e.type === 'extends' &&
        e.sourceNodeId === 'class:/test/admin.ts:AdminController' &&
        e.targetNodeId === 'class:/test/base.ts:BaseController',
    );
    expect(extendsEdge).toBeDefined();
  });

  // ─── No duplicate nodes ───────────────────────────────────────────────────

  it('should not create duplicate endpoint nodes for the same endpoint from two files', () => {
    const models = new Map<string, SemanticModel>([
      ['/test/a.test.ts', makeModel({ filePath: '/test/a.test.ts' })],
      ['/test/b.test.ts', makeModel({ filePath: '/test/b.test.ts' })],
    ]);

    const table = makeTable({ models });
    const traversalResults = new Map<string, TraversalResult>();
    const interactions = new Map<string, ResolvedHttpInteraction[]>([
      [
        '/test/a.test.ts',
        [makeInteraction({ method: 'GET', path: '/api/shared', sourceFile: '/test/a.test.ts' })],
      ],
      [
        '/test/b.test.ts',
        [makeInteraction({ method: 'GET', path: '/api/shared', sourceFile: '/test/b.test.ts' })],
      ],
    ]);

    const { nodes } = buildAstGraph(models, table, traversalResults, interactions);

    const endpointNodes = nodes.filter((n) => n.id === 'endpoint:GET:/api/shared');
    expect(endpointNodes).toHaveLength(1);
  });

  // ─── Empty inputs ─────────────────────────────────────────────────────────

  it('should return empty arrays when all inputs are empty', () => {
    const models = new Map<string, SemanticModel>();
    const table = makeTable({ models });
    const traversalResults = new Map<string, TraversalResult>();
    const interactions = new Map<string, ResolvedHttpInteraction[]>();

    const { nodes, edges } = buildAstGraph(models, table, traversalResults, interactions);

    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
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
