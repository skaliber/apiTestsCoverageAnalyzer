/**
 * Abstract layer traversal — resolves inherited assertions, imported helpers,
 * fixture injections, and page objects across the inheritance chain.
 *
 * Implements the spec's abstract layer resolution with a configurable depth cap
 * (default 5, RULE-05). When the cap is reached, resolution is marked as 'partial'.
 * Cycles are detected and broken (RULE-15).
 */

import type { SemanticAssertion, SemanticHttpCall, SemanticFunction } from '../../../ast/astTypes';
import type { CrossFileSymbolTable } from './types';
import type { TraversalResult } from './types';
import type { AssertionSource } from '../../types';

/**
 * Traverse the inheritance chain starting from a test class to resolve
 * assertions, HTTP calls, and helper references from base classes.
 *
 * @param className - The test class/suite to start from
 * @param table - The cross-file symbol table
 * @param depthCap - Maximum traversal depth (RULE-05: default 5)
 */
export function traverseInheritanceChain(
  className: string,
  table: CrossFileSymbolTable,
  depthCap: number = 5,
): TraversalResult {
  const visited = new Set<string>();
  const resolvedAssertions: SemanticAssertion[] = [];
  const resolvedHttpCalls: SemanticHttpCall[] = [];
  const unresolvedChain: string[] = [];
  let maxDepth = 0;
  let cycleDetected = false;

  function traverse(name: string, depth: number): void {
    if (depth > depthCap) {
      unresolvedChain.push(`${name} (depth cap ${depthCap} reached)`);
      return;
    }

    if (visited.has(name)) {
      cycleDetected = true;
      unresolvedChain.push(`${name} (cycle detected)`);
      return;
    }

    visited.add(name);
    maxDepth = Math.max(maxDepth, depth);

    // Find the class declaration
    const classDecl = table.classes.get(name);
    if (!classDecl) {
      if (depth > 0) {
        unresolvedChain.push(`${name} (class not found)`);
      }
      return;
    }

    // Get the semantic model for this class's file
    const model = table.models.get(classDecl.filePath);
    if (!model) {
      unresolvedChain.push(`${name} (model not found for ${classDecl.filePath})`);
      return;
    }

    // Collect assertions from this class's model
    for (const assertion of model.assertions) {
      resolvedAssertions.push(assertion);
    }

    // Collect HTTP calls from this class's functions
    for (const methodName of classDecl.methods) {
      const func = model.functions.get(methodName) ?? model.functions.get(`${name}.${methodName}`);
      if (func) {
        resolvedHttpCalls.push(...func.bodyHttpCalls);
      }
    }

    // Recurse into base class
    if (classDecl.extendsClass) {
      traverse(classDecl.extendsClass, depth + 1);
    }
  }

  traverse(className, 0);

  const resolution = unresolvedChain.length > 0 ? 'partial' : 'full';
  const assertionSource: AssertionSource = maxDepth === 0
    ? 'direct'
    : resolvedAssertions.length > 0
    ? 'inherited'
    : 'unresolved';

  return {
    resolvedAssertions,
    resolvedHttpCalls,
    assertionSource,
    traversalDepth: maxDepth,
    resolution,
    unresolvedChain: unresolvedChain.length > 0 ? unresolvedChain : undefined,
    cycleDetected,
  };
}

/**
 * Resolve an imported helper function by following the import chain.
 *
 * @param functionName - The helper function to resolve
 * @param fromFile - The file importing the helper
 * @param table - The cross-file symbol table
 * @param depthCap - Maximum traversal depth
 */
export function resolveImportedHelper(
  functionName: string,
  fromFile: string,
  table: CrossFileSymbolTable,
  depthCap: number = 5,
): TraversalResult {
  const visited = new Set<string>();
  const resolvedAssertions: SemanticAssertion[] = [];
  const resolvedHttpCalls: SemanticHttpCall[] = [];
  const unresolvedChain: string[] = [];
  let maxDepth = 0;
  let cycleDetected = false;

  function resolve(funcName: string, file: string, depth: number): void {
    if (depth > depthCap) {
      unresolvedChain.push(`${funcName} in ${file} (depth cap reached)`);
      return;
    }

    const key = `${file}::${funcName}`;
    if (visited.has(key)) {
      cycleDetected = true;
      unresolvedChain.push(`${funcName} in ${file} (cycle detected)`);
      return;
    }

    visited.add(key);
    maxDepth = Math.max(maxDepth, depth);

    const model = table.models.get(file);
    if (!model) {
      unresolvedChain.push(`${funcName} (model not found for ${file})`);
      return;
    }

    // Find the function in the model
    const func = model.functions.get(funcName);
    if (!func) {
      // Try imported files
      const importedFiles = table.importGraph.get(file) ?? [];
      for (const importedFile of importedFiles) {
        const importedModel = table.models.get(importedFile);
        if (importedModel?.functions.has(funcName)) {
          resolve(funcName, importedFile, depth + 1);
          return;
        }
      }
      unresolvedChain.push(`${funcName} (function not found in ${file})`);
      return;
    }

    // Collect HTTP calls from this function
    resolvedHttpCalls.push(...func.bodyHttpCalls);

    // Collect any assertions from the model that relate to this function
    for (const assertion of model.assertions) {
      resolvedAssertions.push(assertion);
    }

    // Follow called functions recursively
    for (const calledFunc of func.calledFunctions) {
      resolve(calledFunc, file, depth + 1);
    }
  }

  resolve(functionName, fromFile, 0);

  const resolution = unresolvedChain.length > 0 ? 'partial' : 'full';
  const assertionSource: AssertionSource =
    resolvedAssertions.length > 0 ? 'helper' : 'unresolved';

  return {
    resolvedAssertions,
    resolvedHttpCalls,
    assertionSource,
    traversalDepth: maxDepth,
    resolution,
    unresolvedChain: unresolvedChain.length > 0 ? unresolvedChain : undefined,
    cycleDetected,
  };
}

/**
 * Resolve fixture-injected assertions and HTTP calls.
 * Traces @BeforeEach/beforeEach/pytest fixtures/@Autowired patterns.
 *
 * @param fixtureName - The fixture function name
 * @param table - The cross-file symbol table
 * @param depthCap - Maximum traversal depth
 */
export function resolveFixtureInjection(
  fixtureName: string,
  table: CrossFileSymbolTable,
  depthCap: number = 5,
): TraversalResult {
  const resolvedAssertions: SemanticAssertion[] = [];
  const resolvedHttpCalls: SemanticHttpCall[] = [];
  const unresolvedChain: string[] = [];
  let maxDepth = 0;
  let found = false;

  // Search all models for the fixture function
  for (const [filePath, model] of table.models) {
    const func = model.functions.get(fixtureName);
    if (!func) continue;

    found = true;
    maxDepth = 1;

    // Collect HTTP calls from the fixture
    resolvedHttpCalls.push(...func.bodyHttpCalls);

    // Check if fixture has assertions
    for (const assertion of model.assertions) {
      resolvedAssertions.push(assertion);
    }

    break; // Use first match
  }

  if (!found) {
    unresolvedChain.push(`${fixtureName} (fixture not found)`);
  }

  return {
    resolvedAssertions,
    resolvedHttpCalls,
    assertionSource: found ? 'fixture' : 'unresolved',
    traversalDepth: maxDepth,
    resolution: found ? 'full' : 'partial',
    unresolvedChain: unresolvedChain.length > 0 ? unresolvedChain : undefined,
    cycleDetected: false,
  };
}
