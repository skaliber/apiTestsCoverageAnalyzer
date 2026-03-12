/**
 * Structure-agnostic rules enforcer (Feature 27, Sub-PR 9)
 *
 * Validates the 10 behavioral rules (SA01-SA10) after all resolution completes.
 * Emits diagnostics for violations.
 */

import type { CrossFileSymbolTable } from './types';
import type { SecurityClassification } from '../../../ast/astTypes';

export interface RuleViolation {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  filePath?: string;
  line?: number;
}

export interface RulesEnforcementResult {
  violations: RuleViolation[];
  rulesChecked: number;
  rulesPassed: number;
}

/**
 * Run all SA rules against the resolved symbol table.
 */
export function enforceStructureAgnosticRules(
  symbolTable: CrossFileSymbolTable,
  projectRoot: string,
): RulesEnforcementResult {
  const violations: RuleViolation[] = [];
  let rulesChecked = 0;
  let rulesPassed = 0;

  const checks: Array<{ id: string; fn: () => RuleViolation[] }> = [
    { id: 'SA01', fn: () => checkRuleSA01(symbolTable, projectRoot) },
    { id: 'SA02', fn: () => checkRuleSA02(symbolTable) },
    { id: 'SA03', fn: () => checkRuleSA03(symbolTable) },
    { id: 'SA04', fn: () => checkRuleSA04(symbolTable) },
    { id: 'SA05', fn: () => checkRuleSA05(symbolTable) },
    { id: 'SA06', fn: () => checkRuleSA06(symbolTable) },
    { id: 'SA07', fn: () => checkRuleSA07(symbolTable) },
    { id: 'SA08', fn: () => checkRuleSA08(symbolTable) },
    { id: 'SA09', fn: () => checkRuleSA09(symbolTable) },
    { id: 'SA10', fn: () => checkRuleSA10(symbolTable) },
  ];

  for (const check of checks) {
    rulesChecked++;
    const ruleViolations = check.fn();
    violations.push(...ruleViolations);
    if (ruleViolations.length === 0) rulesPassed++;
  }

  return { violations, rulesChecked, rulesPassed };
}

/**
 * RULE-SA01: No endpoint nodes should be classified based on directory name alone.
 * Checks that route registrations have content-based evidence, not just path-based.
 */
function checkRuleSA01(symbolTable: CrossFileSymbolTable, projectRoot: string): RuleViolation[] {
  const violations: RuleViolation[] = [];

  // Check route registrations for directory-only evidence
  for (const [filePath, model] of symbolTable.models) {
    if (!model.routeRegistrations) continue;
    for (const reg of model.routeRegistrations) {
      // A route with no registrar (no decorator, no app.route, no router.METHOD)
      // that was classified solely from its directory path is a violation
      if (!reg.registrarName && !reg.methods && !reg.security) {
        violations.push({
          ruleId: 'SA01',
          severity: 'error',
          message: `Route '${reg.path}' in ${filePath} appears to lack content-based evidence`,
          filePath,
          line: reg.line,
        });
      }
    }
  }

  return violations;
}

/**
 * RULE-SA02: All endpoint nodes must have fully resolved URLs.
 * Checks for router mounts with empty or partial prefixes.
 */
function checkRuleSA02(symbolTable: CrossFileSymbolTable): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const [filePath, mounts] of symbolTable.routerMounts) {
    for (const mount of mounts) {
      if (!mount.prefix || mount.prefix === '/') {
        // Empty or root prefix is only a warning if there's a target module
        if (mount.targetModulePath) {
          violations.push({
            ruleId: 'SA02',
            severity: 'warning',
            message: `Router mount in ${filePath} has empty prefix for target '${mount.targetModulePath}'`,
            filePath,
            line: mount.line,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * RULE-SA03: Service/repository nodes must be detected without requiring framework annotations.
 * Checks that interface implementations exist in the symbol table for projects that have
 * classes following DDD patterns (Repository, Store, Gateway naming or method patterns).
 */
function checkRuleSA03(symbolTable: CrossFileSymbolTable): RuleViolation[] {
  const violations: RuleViolation[] = [];

  // Find classes that look like repositories by naming convention
  const repoLikeClasses: string[] = [];
  for (const [className, classDecl] of symbolTable.classes) {
    if (/(?:Repository|Repo|Store|Gateway)$/i.test(className)) {
      repoLikeClasses.push(className);
    }
  }

  // If there are repository-like classes, check that at least some have interface implementations resolved
  if (repoLikeClasses.length > 0) {
    let hasAnyImpl = false;
    for (const [, impls] of symbolTable.interfaceImplementations) {
      if (impls.length > 0) {
        hasAnyImpl = true;
        break;
      }
    }
    if (!hasAnyImpl && repoLikeClasses.length >= 2) {
      violations.push({
        ruleId: 'SA03',
        severity: 'warning',
        message: `Found ${repoLikeClasses.length} repository-like class(es) but no interface→implementation mappings resolved`,
      });
    }
  }

  return violations;
}

/**
 * RULE-SA04: Optional auth must be distinguished from public.
 * Checks that models with route registrations having security classifications
 * properly distinguish between required, optional, and public.
 */
function checkRuleSA04(symbolTable: CrossFileSymbolTable): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const [filePath, model] of symbolTable.models) {
    if (!model.routeRegistrations) continue;

    for (const reg of model.routeRegistrations) {
      if (reg.security) {
        // Validate that optional and required are mutually exclusive
        if (reg.security.required && reg.security.optional) {
          violations.push({
            ruleId: 'SA04',
            severity: 'error',
            message: `Route '${reg.path}' in ${filePath} has both required=true and optional=true`,
            filePath,
            line: reg.line,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * RULE-SA05: @Mapper interfaces must be linked to their XML mapper files.
 * Checks that all interface implementations with MyBatis naming have corresponding XML bindings.
 */
function checkRuleSA05(symbolTable: CrossFileSymbolTable): RuleViolation[] {
  const violations: RuleViolation[] = [];

  // Find @Mapper-like classes (by naming convention or annotations)
  for (const [className, classDecl] of symbolTable.classes) {
    if (!className.endsWith('Mapper')) continue;

    // Check if this mapper has a corresponding interface implementation (XML binding)
    let hasBinding = false;
    for (const [, impls] of symbolTable.interfaceImplementations) {
      if (impls.some((impl) => impl.interfaceName === className || impl.implName.includes(className))) {
        hasBinding = true;
        break;
      }
    }

    // Check if there are any models with MyBatis-related content
    const model = symbolTable.models.get(classDecl.filePath);
    if (model && !hasBinding) {
      // Only warn if the project appears to use MyBatis (has XML-linked implementations)
      let projectUsesMyBatis = false;
      for (const [, impls] of symbolTable.interfaceImplementations) {
        if (impls.some((impl) => impl.implName.includes('XmlMapper'))) {
          projectUsesMyBatis = true;
          break;
        }
      }
      if (projectUsesMyBatis) {
        violations.push({
          ruleId: 'SA05',
          severity: 'warning',
          message: `@Mapper interface '${className}' in ${classDecl.filePath} has no linked XML mapper`,
          filePath: classDecl.filePath,
          line: classDecl.line,
        });
      }
    }
  }

  return violations;
}

/**
 * RULE-SA06: .graphqls schema files must be parsed as first-class endpoint definitions.
 * Checks that GraphQL schemas produce endpoint nodes when present.
 */
function checkRuleSA06(symbolTable: CrossFileSymbolTable): RuleViolation[] {
  const violations: RuleViolation[] = [];

  // Check if there are any .graphqls or .graphql files in the models that lack route registrations
  for (const [filePath, model] of symbolTable.models) {
    if (!filePath.endsWith('.graphqls') && !filePath.endsWith('.graphql')) continue;

    // GraphQL schema files should produce route registrations
    if (!model.routeRegistrations || model.routeRegistrations.length === 0) {
      violations.push({
        ruleId: 'SA06',
        severity: 'warning',
        message: `GraphQL schema file '${filePath}' was not parsed into endpoint definitions`,
        filePath,
      });
    }
  }

  return violations;
}

/**
 * RULE-SA07: Angular HttpClient calls in @Injectable services must be followed through injection.
 * Checks that services with HTTP calls have injection chains linking them to consumers.
 */
function checkRuleSA07(symbolTable: CrossFileSymbolTable): RuleViolation[] {
  const violations: RuleViolation[] = [];

  // Find services with HTTP calls that have no injection chain consumers
  for (const [className, classDecl] of symbolTable.classes) {
    const model = symbolTable.models.get(classDecl.filePath);
    if (!model) continue;

    // Check if this class has methods with HTTP calls
    let hasHttpCalls = false;
    for (const [, func] of model.functions) {
      if (func.bodyHttpCalls.length > 0) {
        hasHttpCalls = true;
        break;
      }
    }
    if (!hasHttpCalls) continue;

    // Content-based check: is this an Angular @Injectable service?
    // (RULE-SA01 compliant — no filename convention used)
    const hasInjectableMarker =
      (model.decoratorStacks?.some((ds) =>
        ds.decorators.some((d) => d.name === 'Injectable' || d.name.includes('Injectable')),
      ) ?? false) ||
      Array.from(model.functions.values()).some((f) =>
        f.annotations?.some((a) => a === 'Injectable' || a === '@Injectable'),
      );
    if (!hasInjectableMarker) continue;

    // Check if any injection chains reference this service
    let hasConsumer = false;
    for (const [, chains] of symbolTable.injectionChains) {
      if (chains.some((c) => c.serviceClass === className)) {
        hasConsumer = true;
        break;
      }
    }

    if (!hasConsumer) {
      violations.push({
        ruleId: 'SA07',
        severity: 'info',
        message: `Angular service '${className}' in ${classDecl.filePath} has HTTP calls but no resolved injection consumers`,
        filePath: classDecl.filePath,
        line: classDecl.line,
      });
    }
  }

  return violations;
}

/**
 * RULE-SA08: Vuex dispatch calls must be linked to store action definitions.
 * Checks that dispatch calls have corresponding injection chain entries.
 */
function checkRuleSA08(symbolTable: CrossFileSymbolTable): RuleViolation[] {
  const violations: RuleViolation[] = [];

  // Find models with dispatch calls that have no injection chain linking
  for (const [filePath, model] of symbolTable.models) {
    let hasDispatch = false;
    for (const [, func] of model.functions) {
      if (func.calledFunctions.some((f) => f.includes('dispatch'))) {
        hasDispatch = true;
        break;
      }
    }
    if (!hasDispatch) continue;

    // Check if there's an injection chain linking this file to a store
    const chains = symbolTable.injectionChains.get(filePath);
    if (!chains || chains.length === 0) {
      // Only warn if the project has Vuex store files (files with both actions and HTTP calls)
      let hasStoreFiles = false;
      for (const [otherFile, otherModel] of symbolTable.models) {
        if (otherFile === filePath) continue;
        for (const [, func] of otherModel.functions) {
          if (func.bodyHttpCalls.length > 0) {
            hasStoreFiles = true;
            break;
          }
        }
        if (hasStoreFiles) break;
      }

      if (hasStoreFiles) {
        violations.push({
          ruleId: 'SA08',
          severity: 'info',
          message: `File '${filePath}' dispatches Vuex actions but no dispatch→action links were resolved`,
          filePath,
        });
      }
    }
  }

  return violations;
}

/**
 * RULE-SA09: Functional Angular guards (CanActivateFn) must be detected.
 * Checks that guard files are recognized and linked to routes.
 */
function checkRuleSA09(symbolTable: CrossFileSymbolTable): RuleViolation[] {
  const violations: RuleViolation[] = [];

  // Find files with Angular guard-related content (content-based, not filename-based)
  for (const [filePath, model] of symbolTable.models) {
    // Content-based check: does this file have guard-related types or implementations?
    // (RULE-SA01 compliant — no filename convention used)
    let hasGuardContent = false;

    // Check function annotations for guard type markers (CanActivateFn, etc.)
    const guardTypeAnnotations = [
      'CanActivateFn',
      'CanActivateChildFn',
      'CanDeactivateFn',
      'ResolveFn',
      'CanMatchFn',
    ];
    for (const [, func] of model.functions) {
      if (func.annotations?.some((a) => guardTypeAnnotations.includes(a))) {
        hasGuardContent = true;
        break;
      }
    }

    // Check if any class in this file implements guard interfaces
    if (!hasGuardContent) {
      const guardInterfaces = [
        'CanActivate',
        'CanActivateChild',
        'CanDeactivate',
        'Resolve',
        'CanMatch',
      ];
      for (const [, classDecl] of symbolTable.classes) {
        if (
          classDecl.filePath === filePath &&
          classDecl.implementsInterfaces?.some((i) => guardInterfaces.includes(i))
        ) {
          hasGuardContent = true;
          break;
        }
      }
    }

    // Check function names for guard-related patterns as content heuristic
    if (!hasGuardContent) {
      for (const [funcName] of model.functions) {
        if (/guard|canActivate|canDeactivate|canMatch/i.test(funcName)) {
          hasGuardContent = true;
          break;
        }
      }
    }

    if (!hasGuardContent) continue;

    // Check if this guard has any route registrations or middleware entries
    let isLinked = false;
    for (const [, middleware] of symbolTable.middlewareInheritance) {
      if (middleware.some((m) => m.sourceFile === filePath || m.name.includes('guard'))) {
        isLinked = true;
        break;
      }
    }

    if (!isLinked) {
      // Check if there's at least a function export that looks like a guard
      let hasGuardFunction = false;
      for (const [funcName] of model.functions) {
        if (/guard|canActivate|canDeactivate|canMatch/i.test(funcName)) {
          hasGuardFunction = true;
          break;
        }
      }

      if (hasGuardFunction) {
        violations.push({
          ruleId: 'SA09',
          severity: 'info',
          message: `Angular guard in '${filePath}' has guard functions but is not linked to any route`,
          filePath,
        });
      }
    }
  }

  return violations;
}

/**
 * RULE-SA10: webtest/TestApp must be detected as API test evidence.
 * Checks that files using webtest patterns have their HTTP calls extracted.
 */
function checkRuleSA10(symbolTable: CrossFileSymbolTable): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const [filePath, model] of symbolTable.models) {
    // Check if this model has webtest-detected calls (via the __webtest_calls__ synthetic function)
    const webtestFunc = model.functions.get('__webtest_calls__');
    if (!webtestFunc) continue;

    // Verify the webtest calls actually produced HTTP call entries
    if (webtestFunc.bodyHttpCalls.length === 0) {
      violations.push({
        ruleId: 'SA10',
        severity: 'warning',
        message: `File '${filePath}' has webtest detection but produced no HTTP call entries`,
        filePath,
      });
    }
  }

  return violations;
}
