/**
 * Cross-file resolver — builds a multi-file symbol table from all parsed semantic models.
 *
 * Aggregates per-file symbol tables, export declarations, class declarations,
 * and import graphs into a unified `CrossFileSymbolTable` that enables
 * cross-file constant resolution, inheritance chain traversal, and
 * import-based helper resolution.
 */

import type { SemanticModel, SemanticFunction, SupportedLanguage } from '../../../ast/astTypes';
import type { CrossFileSymbolTable, ClassDeclaration, ImportDeclaration } from './types';
import { resolveImportPath } from './importResolver';

/**
 * Build a cross-file symbol table from all parsed semantic models.
 *
 * @param models - Map of filePath → SemanticModel
 * @param projectRoot - The project root directory
 */
export function buildCrossFileSymbolTable(
  models: Map<string, SemanticModel>,
  projectRoot: string,
): CrossFileSymbolTable {
  const exportedSymbols = new Map<string, { filePath: string; value: string }>();
  const classes = new Map<string, ClassDeclaration>();
  const importGraph = new Map<string, string[]>();

  // Pass 1: Collect all exported symbols and class declarations
  for (const [filePath, model] of models) {
    // Collect constants as exported symbols
    for (const [name, symbol] of model.constants) {
      if (symbol.value !== undefined) {
        exportedSymbols.set(`${filePath}::${name}`, { filePath, value: symbol.value });
        // Also register as global name for simple lookups
        if (!exportedSymbols.has(name)) {
          exportedSymbols.set(name, { filePath, value: symbol.value });
        }
      }
    }

    // Collect local variables that are const-like with string values
    for (const [name, symbol] of model.localVariables) {
      if (symbol.kind === 'const' && symbol.value !== undefined) {
        exportedSymbols.set(`${filePath}::${name}`, { filePath, value: symbol.value });
      }
    }

    // Collect enum members as exported symbols
    for (const [enumName, members] of model.enums) {
      for (const [memberName, value] of members) {
        const qualifiedName = `${enumName}.${memberName}`;
        exportedSymbols.set(`${filePath}::${qualifiedName}`, { filePath, value });
        if (!exportedSymbols.has(qualifiedName)) {
          exportedSymbols.set(qualifiedName, { filePath, value });
        }
      }
    }

    // Extract class declarations from functions (heuristic: capitalize name + has methods)
    extractClassDeclarations(filePath, model, classes);
  }

  // Pass 2: Build import graph
  for (const [filePath, model] of models) {
    const imports = extractImportsFromModel(filePath, model, projectRoot);
    const resolvedPaths: string[] = [];

    for (const imp of imports) {
      if (imp.resolvedPath) {
        resolvedPaths.push(imp.resolvedPath);
      }
    }

    importGraph.set(filePath, resolvedPaths);
  }

  return {
    models,
    exportedSymbols,
    classes,
    importGraph,
    routerMounts: new Map(),
    injectionChains: new Map(),
    interfaceImplementations: new Map(),
    middlewareInheritance: new Map(),
  };
}

/**
 * Resolve a symbol name using the cross-file symbol table.
 * Tries: direct lookup, qualified lookup (filePath::name), and import-chain following.
 */
export function resolveSymbolCrossFile(
  symbolName: string,
  fromFile: string,
  table: CrossFileSymbolTable,
): string | undefined {
  // Try qualified lookup for the current file
  const qualified = table.exportedSymbols.get(`${fromFile}::${symbolName}`);
  if (qualified) return qualified.value;

  // Try global lookup
  const global = table.exportedSymbols.get(symbolName);
  if (global) return global.value;

  // Try following imports from the current file
  const importedFiles = table.importGraph.get(fromFile) ?? [];
  for (const importedFile of importedFiles) {
    const fromImported = table.exportedSymbols.get(`${importedFile}::${symbolName}`);
    if (fromImported) return fromImported.value;
  }

  // Try dotted name resolution (e.g. "Config.BASE_URL")
  const dotParts = symbolName.split('.');
  if (dotParts.length >= 2) {
    // Try each possible combination
    for (const [key, entry] of table.exportedSymbols) {
      if (key.endsWith(`::${symbolName}`) || key === symbolName) {
        return entry.value;
      }
    }
  }

  return undefined;
}

/**
 * Extract import declarations from a semantic model.
 * This is a heuristic extraction — real import extraction would come from the AST.
 */
function extractImportsFromModel(
  filePath: string,
  model: SemanticModel,
  projectRoot: string,
): ImportDeclaration[] {
  const imports: ImportDeclaration[] = [];

  // Use functions' calledFunctions to infer cross-file references
  for (const [, func] of model.functions) {
    for (const calledName of func.calledFunctions) {
      // If the function name contains a dot, it might be an import reference
      const dotIndex = calledName.indexOf('.');
      if (dotIndex > 0) {
        const modulePart = calledName.substring(0, dotIndex);
        const resolvedPath = resolveImportPath(
          `./${modulePart}`,
          filePath,
          projectRoot,
          model.language,
        );
        if (resolvedPath) {
          imports.push({
            source: modulePart,
            resolvedPath,
            importedNames: [calledName.substring(dotIndex + 1)],
            isDefault: false,
          });
        }
      }
    }
  }

  return imports;
}

/**
 * Extract class declarations from a semantic model (heuristic).
 *
 * Looks for functions that follow class patterns:
 * - Capitalized names
 * - Constructor patterns
 * - Extends/implements annotations
 */
function extractClassDeclarations(
  filePath: string,
  model: SemanticModel,
  classes: Map<string, ClassDeclaration>,
): void {
  const classMethods = new Map<string, string[]>();

  for (const [name, func] of model.functions) {
    // Look for constructor patterns to detect class names
    if (name === 'constructor' || name.startsWith('__init__')) continue;

    // Methods prefixed with "ClassName." or "ClassName#"
    const dotIndex = name.indexOf('.');
    const hashIndex = name.indexOf('#');
    const separator = dotIndex >= 0 ? dotIndex : hashIndex;

    if (separator > 0) {
      const className = name.substring(0, separator);
      const methodName = name.substring(separator + 1);

      if (!classMethods.has(className)) {
        classMethods.set(className, []);
      }
      classMethods.get(className)!.push(methodName);
    }

    // Check annotations for class membership
    if (func.annotations) {
      for (const ann of func.annotations) {
        // Spring/Java annotations like @Controller, @Service, @RestController
        if (ann.match(/^@(Controller|Service|Repository|Component|RestController|SpringBootTest)/)) {
          const className = extractClassNameFromAnnotation(name, func);
          if (className && !classMethods.has(className)) {
            classMethods.set(className, []);
          }
        }
      }
    }
  }

  // Convert to ClassDeclaration objects
  for (const [className, methods] of classMethods) {
    if (!classes.has(className)) {
      classes.set(className, {
        name: className,
        methods,
        filePath,
      });
    }
  }
}

function extractClassNameFromAnnotation(
  functionName: string,
  _func: SemanticFunction,
): string | undefined {
  const dotIndex = functionName.indexOf('.');
  if (dotIndex > 0) return functionName.substring(0, dotIndex);
  return undefined;
}
