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
});
