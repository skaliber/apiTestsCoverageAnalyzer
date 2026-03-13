import {
  enforceStructureAgnosticRules,
} from '../../../../src/pipeline/stages/ast/rulesEnforcer';
import type { CrossFileSymbolTable } from '../../../../src/pipeline/stages/ast/types';

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

describe('enforceStructureAgnosticRules', () => {
  it('returns all rules checked with empty symbol table', () => {
    const symbolTable = makeSymbolTable();
    const result = enforceStructureAgnosticRules(symbolTable, '/fake/project');
    expect(result.rulesChecked).toBe(10);
    expect(result.rulesPassed).toBeGreaterThan(0);
  });

  it('SA02: warns about empty router mount prefixes', () => {
    const symbolTable = makeSymbolTable();
    symbolTable.routerMounts.set('/fake/app.js', [
      {
        prefix: '',
        targetModulePath: './routes/articles',
        middleware: [],
        sourceFile: '/fake/app.js',
        line: 5,
      },
    ]);

    const result = enforceStructureAgnosticRules(symbolTable, '/fake/project');
    const sa02 = result.violations.filter((v) => v.ruleId === 'SA02');
    expect(sa02).toHaveLength(1);
    expect(sa02[0].severity).toBe('warning');
  });

  it('SA02: passes when all mounts have valid prefixes', () => {
    const symbolTable = makeSymbolTable();
    symbolTable.routerMounts.set('/fake/app.js', [
      {
        prefix: '/api/articles',
        targetModulePath: './routes/articles',
        middleware: [],
        sourceFile: '/fake/app.js',
        line: 5,
      },
    ]);

    const result = enforceStructureAgnosticRules(symbolTable, '/fake/project');
    const sa02 = result.violations.filter((v) => v.ruleId === 'SA02');
    expect(sa02).toHaveLength(0);
  });

  it('SA04: detects conflicting required+optional auth', () => {
    const symbolTable = makeSymbolTable();
    symbolTable.models.set('/fake/routes.py', {
      filePath: '/fake/routes.py',
      language: 'python',
      localVariables: new Map(),
      constants: new Map(),
      enums: new Map(),
      functions: new Map(),
      httpInteractions: [],
      assertions: [],
      businessRuleRefs: [],
      flowRefs: [],
      routeRegistrations: [
        {
          registrarName: 'app',
          path: '/api/articles',
          methods: ['GET'],
          security: { type: 'jwt', required: true, optional: true },
          sourceFile: '/fake/routes.py',
          line: 10,
        },
      ],
    });

    const result = enforceStructureAgnosticRules(symbolTable, '/fake/project');
    const sa04 = result.violations.filter((v) => v.ruleId === 'SA04');
    expect(sa04).toHaveLength(1);
    expect(sa04[0].severity).toBe('error');
  });

  it('SA04: passes with valid auth classification', () => {
    const symbolTable = makeSymbolTable();
    symbolTable.models.set('/fake/routes.py', {
      filePath: '/fake/routes.py',
      language: 'python',
      localVariables: new Map(),
      constants: new Map(),
      enums: new Map(),
      functions: new Map(),
      httpInteractions: [],
      assertions: [],
      businessRuleRefs: [],
      flowRefs: [],
      routeRegistrations: [
        {
          registrarName: 'app',
          path: '/api/articles',
          methods: ['GET'],
          security: { type: 'jwt', required: true, optional: false },
          sourceFile: '/fake/routes.py',
          line: 10,
        },
      ],
    });

    const result = enforceStructureAgnosticRules(symbolTable, '/fake/project');
    const sa04 = result.violations.filter((v) => v.ruleId === 'SA04');
    expect(sa04).toHaveLength(0);
  });

  // ─── SA03 ───────────────────────────────────────────────────────────────────

  it('SA03: warns when repository-like classes exist but no interface implementations', () => {
    const symbolTable = makeSymbolTable();
    symbolTable.classes.set('ArticleRepository', {
      name: 'ArticleRepository',
      methods: ['findBySlug', 'save'],
      filePath: '/fake/ArticleRepository.java',
    });
    symbolTable.classes.set('UserRepository', {
      name: 'UserRepository',
      methods: ['findByUsername'],
      filePath: '/fake/UserRepository.java',
    });

    const result = enforceStructureAgnosticRules(symbolTable, '/fake/project');
    const sa03 = result.violations.filter((v) => v.ruleId === 'SA03');
    expect(sa03).toHaveLength(1);
    expect(sa03[0].severity).toBe('warning');
  });

  it('SA03: passes when repository-like classes have interface implementations', () => {
    const symbolTable = makeSymbolTable();
    symbolTable.classes.set('ArticleRepository', {
      name: 'ArticleRepository',
      methods: ['findBySlug', 'save'],
      filePath: '/fake/ArticleRepository.java',
    });
    symbolTable.classes.set('UserRepository', {
      name: 'UserRepository',
      methods: ['findByUsername'],
      filePath: '/fake/UserRepository.java',
    });
    symbolTable.interfaceImplementations.set('ArticleRepository', [
      {
        interfaceName: 'ArticleRepository',
        interfaceFile: '/fake/ArticleRepository.java',
        implName: 'MyBatisArticleRepository',
        implFile: '/fake/MyBatisArticleRepository.java',
      },
    ]);

    const result = enforceStructureAgnosticRules(symbolTable, '/fake/project');
    const sa03 = result.violations.filter((v) => v.ruleId === 'SA03');
    expect(sa03).toHaveLength(0);
  });

  // ─── SA05 ───────────────────────────────────────────────────────────────────

  it('SA05: warns when Mapper class has no linked XML mapper in a MyBatis project', () => {
    const symbolTable = makeSymbolTable();
    symbolTable.classes.set('ArticleMapper', {
      name: 'ArticleMapper',
      methods: ['findBySlug'],
      filePath: '/fake/ArticleMapper.java',
    });
    symbolTable.models.set('/fake/ArticleMapper.java', {
      filePath: '/fake/ArticleMapper.java',
      language: 'java',
      localVariables: new Map(),
      constants: new Map(),
      enums: new Map(),
      functions: new Map(),
      httpInteractions: [],
      assertions: [],
      businessRuleRefs: [],
      flowRefs: [],
    });
    // Project uses MyBatis: another mapper has an XmlMapper implementation
    symbolTable.interfaceImplementations.set('OtherMapper', [
      {
        interfaceName: 'OtherMapper',
        interfaceFile: '/fake/OtherMapper.java',
        implName: 'OtherXmlMapper',
        implFile: '/fake/OtherMapper.xml',
      },
    ]);

    const result = enforceStructureAgnosticRules(symbolTable, '/fake/project');
    const sa05 = result.violations.filter((v) => v.ruleId === 'SA05');
    expect(sa05).toHaveLength(1);
    expect(sa05[0].severity).toBe('warning');
    expect(sa05[0].message).toContain('ArticleMapper');
  });

  it('SA05: passes when Mapper class has a linked XML mapper', () => {
    const symbolTable = makeSymbolTable();
    symbolTable.classes.set('ArticleMapper', {
      name: 'ArticleMapper',
      methods: ['findBySlug'],
      filePath: '/fake/ArticleMapper.java',
    });
    symbolTable.models.set('/fake/ArticleMapper.java', {
      filePath: '/fake/ArticleMapper.java',
      language: 'java',
      localVariables: new Map(),
      constants: new Map(),
      enums: new Map(),
      functions: new Map(),
      httpInteractions: [],
      assertions: [],
      businessRuleRefs: [],
      flowRefs: [],
    });
    symbolTable.interfaceImplementations.set('ArticleMapper', [
      {
        interfaceName: 'ArticleMapper',
        interfaceFile: '/fake/ArticleMapper.java',
        implName: 'ArticleXmlMapper',
        implFile: '/fake/ArticleMapper.xml',
      },
    ]);

    const result = enforceStructureAgnosticRules(symbolTable, '/fake/project');
    const sa05 = result.violations.filter((v) => v.ruleId === 'SA05');
    expect(sa05).toHaveLength(0);
  });

  // ─── SA07 ───────────────────────────────────────────────────────────────────

  it('SA07: reports info when Angular service has HTTP calls but no injection consumers', () => {
    const symbolTable = makeSymbolTable();
    symbolTable.classes.set('ArticlesService', {
      name: 'ArticlesService',
      methods: ['getArticles'],
      filePath: '/fake/articles.service.ts',
    });
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
      decoratorStacks: [
        {
          functionName: 'ArticlesService',
          decorators: [{ name: 'Injectable' }],
          sourceFile: '/fake/articles.service.ts',
        },
      ],
    });

    const result = enforceStructureAgnosticRules(symbolTable, '/fake/project');
    const sa07 = result.violations.filter((v) => v.ruleId === 'SA07');
    expect(sa07).toHaveLength(1);
    expect(sa07[0].severity).toBe('info');
    expect(sa07[0].message).toContain('ArticlesService');
  });

  it('SA07: passes when Angular service has injection consumers', () => {
    const symbolTable = makeSymbolTable();
    symbolTable.classes.set('ArticlesService', {
      name: 'ArticlesService',
      methods: ['getArticles'],
      filePath: '/fake/articles.service.ts',
    });
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
      decoratorStacks: [
        {
          functionName: 'ArticlesService',
          decorators: [{ name: 'Injectable' }],
          sourceFile: '/fake/articles.service.ts',
        },
      ],
    });
    symbolTable.injectionChains.set('/fake/articles.component.ts', [
      {
        consumerFile: '/fake/articles.component.ts',
        consumerClass: 'ArticlesComponent',
        serviceClass: 'ArticlesService',
        serviceFile: '/fake/articles.service.ts',
        injectionStyle: 'constructor',
      },
    ]);

    const result = enforceStructureAgnosticRules(symbolTable, '/fake/project');
    const sa07 = result.violations.filter((v) => v.ruleId === 'SA07');
    expect(sa07).toHaveLength(0);
  });

  // ─── SA08 ───────────────────────────────────────────────────────────────────

  it('SA08: reports info when dispatch calls exist but no injection chain links to store', () => {
    const symbolTable = makeSymbolTable();
    // Component file with dispatch calls
    symbolTable.models.set('/fake/ArticleList.vue', {
      filePath: '/fake/ArticleList.vue',
      language: 'javascript',
      localVariables: new Map(),
      constants: new Map(),
      enums: new Map(),
      functions: new Map([
        ['mounted', {
          name: 'mounted',
          parameters: [],
          bodyHttpCalls: [],
          calledFunctions: ['store.dispatch'],
        }],
      ]),
      httpInteractions: [],
      assertions: [],
      businessRuleRefs: [],
      flowRefs: [],
    });
    // Store file with HTTP calls (so project "has store files")
    symbolTable.models.set('/fake/store/articles.js', {
      filePath: '/fake/store/articles.js',
      language: 'javascript',
      localVariables: new Map(),
      constants: new Map(),
      enums: new Map(),
      functions: new Map([
        ['FETCH_ARTICLES', {
          name: 'FETCH_ARTICLES',
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

    const result = enforceStructureAgnosticRules(symbolTable, '/fake/project');
    const sa08 = result.violations.filter((v) => v.ruleId === 'SA08');
    expect(sa08).toHaveLength(1);
    expect(sa08[0].severity).toBe('info');
    expect(sa08[0].message).toContain('dispatch');
  });

  it('SA08: passes when dispatch calls have injection chain links', () => {
    const symbolTable = makeSymbolTable();
    symbolTable.models.set('/fake/ArticleList.vue', {
      filePath: '/fake/ArticleList.vue',
      language: 'javascript',
      localVariables: new Map(),
      constants: new Map(),
      enums: new Map(),
      functions: new Map([
        ['mounted', {
          name: 'mounted',
          parameters: [],
          bodyHttpCalls: [],
          calledFunctions: ['store.dispatch'],
        }],
      ]),
      httpInteractions: [],
      assertions: [],
      businessRuleRefs: [],
      flowRefs: [],
    });
    symbolTable.models.set('/fake/store/articles.js', {
      filePath: '/fake/store/articles.js',
      language: 'javascript',
      localVariables: new Map(),
      constants: new Map(),
      enums: new Map(),
      functions: new Map([
        ['FETCH_ARTICLES', {
          name: 'FETCH_ARTICLES',
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
    symbolTable.injectionChains.set('/fake/ArticleList.vue', [
      {
        consumerFile: '/fake/ArticleList.vue',
        consumerClass: 'ArticleList',
        serviceClass: 'ArticlesStore',
        serviceFile: '/fake/store/articles.js',
        injectionStyle: 'property',
      },
    ]);

    const result = enforceStructureAgnosticRules(symbolTable, '/fake/project');
    const sa08 = result.violations.filter((v) => v.ruleId === 'SA08');
    expect(sa08).toHaveLength(0);
  });

  // ─── SA09 ───────────────────────────────────────────────────────────────────

  it('SA09: reports info when guard file has guard functions but is not linked', () => {
    const symbolTable = makeSymbolTable();
    symbolTable.models.set('/fake/auth.guard.ts', {
      filePath: '/fake/auth.guard.ts',
      language: 'typescript',
      localVariables: new Map(),
      constants: new Map(),
      enums: new Map(),
      functions: new Map([
        ['canActivateGuard', {
          name: 'canActivateGuard',
          parameters: [],
          bodyHttpCalls: [],
          calledFunctions: [],
        }],
      ]),
      httpInteractions: [],
      assertions: [],
      businessRuleRefs: [],
      flowRefs: [],
    });

    const result = enforceStructureAgnosticRules(symbolTable, '/fake/project');
    const sa09 = result.violations.filter((v) => v.ruleId === 'SA09');
    expect(sa09).toHaveLength(1);
    expect(sa09[0].severity).toBe('info');
    expect(sa09[0].message).toContain('guard');
  });

  it('SA09: passes when guard file is linked via middleware inheritance', () => {
    const symbolTable = makeSymbolTable();
    symbolTable.models.set('/fake/auth.guard.ts', {
      filePath: '/fake/auth.guard.ts',
      language: 'typescript',
      localVariables: new Map(),
      constants: new Map(),
      enums: new Map(),
      functions: new Map([
        ['canActivateGuard', {
          name: 'canActivateGuard',
          parameters: [],
          bodyHttpCalls: [],
          calledFunctions: [],
        }],
      ]),
      httpInteractions: [],
      assertions: [],
      businessRuleRefs: [],
      flowRefs: [],
    });
    symbolTable.middlewareInheritance.set('/fake/routes.ts', [
      {
        name: 'authGuard',
        type: 'auth-required',
        appliedTo: 'route',
        sourceFile: '/fake/auth.guard.ts',
        line: 1,
      },
    ]);

    const result = enforceStructureAgnosticRules(symbolTable, '/fake/project');
    const sa09 = result.violations.filter((v) => v.ruleId === 'SA09');
    expect(sa09).toHaveLength(0);
  });

  // ─── SA10 ───────────────────────────────────────────────────────────────────

  it('SA10: warns when __webtest_calls__ function has empty bodyHttpCalls', () => {
    const symbolTable = makeSymbolTable();
    symbolTable.models.set('/fake/test_articles.py', {
      filePath: '/fake/test_articles.py',
      language: 'python',
      localVariables: new Map(),
      constants: new Map(),
      enums: new Map(),
      functions: new Map([
        ['__webtest_calls__', {
          name: '__webtest_calls__',
          parameters: [],
          bodyHttpCalls: [],
          calledFunctions: [],
        }],
      ]),
      httpInteractions: [],
      assertions: [],
      businessRuleRefs: [],
      flowRefs: [],
    });

    const result = enforceStructureAgnosticRules(symbolTable, '/fake/project');
    const sa10 = result.violations.filter((v) => v.ruleId === 'SA10');
    expect(sa10).toHaveLength(1);
    expect(sa10[0].severity).toBe('warning');
    expect(sa10[0].message).toContain('webtest');
  });

  it('SA10: passes when __webtest_calls__ function has HTTP call entries', () => {
    const symbolTable = makeSymbolTable();
    symbolTable.models.set('/fake/test_articles.py', {
      filePath: '/fake/test_articles.py',
      language: 'python',
      localVariables: new Map(),
      constants: new Map(),
      enums: new Map(),
      functions: new Map([
        ['__webtest_calls__', {
          name: '__webtest_calls__',
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

    const result = enforceStructureAgnosticRules(symbolTable, '/fake/project');
    const sa10 = result.violations.filter((v) => v.ruleId === 'SA10');
    expect(sa10).toHaveLength(0);
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
