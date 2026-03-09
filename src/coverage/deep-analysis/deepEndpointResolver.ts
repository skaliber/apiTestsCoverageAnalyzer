/**
 * Deep Code Analysis — Deep Endpoint Resolver
 *
 * Orchestrates all deep-analysis sub-modules to extract HTTP calls from a
 * single source file, resolving constants, enums, string templates, wrapper
 * methods, request builders, and assertion linkage.
 *
 * The main entry point is `deepResolveFile()`.
 */

import type { DeepAnalysisConfig, ResolvedHttpCall, SymbolTable, ConfidenceLevel } from './types';
import { DEFAULT_DEEP_ANALYSIS_CONFIG } from './types';
import { buildSymbolTable } from './symbolTable';
import { resolveToken } from './resolveConstants';
import { resolveEnumToken } from './resolveEnums';
import {
  resolveTemplateLiteral,
  resolveStringConcatenation,
  resolveJavaConcatenation,
  resolvePythonFString,
  normalizePathToTemplate,
} from './resolvePaths';
import {
  buildJsCallGraph,
  buildJavaCallGraph,
  buildPythonCallGraph,
} from './callGraph';
import {
  resolveWrapperCall,
  resolveHelperReturnPath,
  extractJsHelperCallsInHttpArgs,
  extractJavaHelperCallsInHttpArgs,
  extractPythonHelperCallsInHttpArgs,
} from './resolveMethodChains';
import { extractRequestBuilders } from './resolveRequestWrappers';
import { buildAssertionMap, extractResponseVariables } from './resolveAssertions';

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run deep endpoint analysis on a single source file.
 *
 * @param content       Raw file content
 * @param filePath      Absolute path (used in output metadata)
 * @param language      Detected language
 * @param config        Deep analysis feature configuration
 * @returns Array of resolved HTTP calls with resolution metadata
 */
export function deepResolveFile(
  content: string,
  filePath: string,
  language: 'typescript' | 'javascript' | 'java' | 'kotlin' | 'python' | 'ruby' | 'cucumber' | 'auto',
  config: DeepAnalysisConfig = DEFAULT_DEEP_ANALYSIS_CONFIG,
): ResolvedHttpCall[] {
  if (!config.enabled) return [];

  const results: ResolvedHttpCall[] = [];
  const seen = new Set<string>();

  // ── 1. Build symbol table ────────────────────────────────────────────────
  const table = buildSymbolTable(content, language);

  // ── 2. Build call graph ──────────────────────────────────────────────────
  const graph =
    language === 'java' || language === 'kotlin'
      ? buildJavaCallGraph(content)
      : language === 'python'
      ? buildPythonCallGraph(content)
      : buildJsCallGraph(content);

  // ── 3. Build assertion map ───────────────────────────────────────────────
  const assertionMap = config.assertionAware ? buildAssertionMap(content) : new Map<string, boolean>();

  // ── 4. Resolve constant-backed HTTP calls ────────────────────────────────
  if (config.resolveConstants || config.resolveEnums) {
    const calls = extractHttpCallsWithVariableArgs(content, language);
    for (const call of calls) {
      const resolved = resolveCallArg(call.rawArg, table, config);
      if (resolved) {
        const path = stripUrlBase(resolved);
        const normalized = normalizePathToTemplate(path);
        const assertionLinked = lookupAssertionLinked(call.responseVar, assertionMap);
        addUnique(results, seen, {
          method: call.method,
          path,
          normalizedPath: normalized !== path ? normalized : undefined,
          sourceFile: filePath,
          sourceLanguage: language,
          resolutionType: call.resolutionType,
          confidence: call.confidence,
          assertionLinked,
          rawCall: call.rawCall,
        });
      }
    }
  }

  // ── 5. Resolve template literal paths ────────────────────────────────────
  if (config.resolveStringTemplates) {
    const templateCalls = extractTemplateArgHttpCalls(content, language);
    for (const call of templateCalls) {
      let resolved: string;
      if (language === 'python') {
        resolved = resolvePythonFString(call.rawPath, table);
      } else if (language === 'java' || language === 'kotlin') {
        resolved = resolveJavaConcatenation(call.rawPath, table);
      } else {
        // Check for template literal
        if (call.rawPath.includes('${')) {
          resolved = resolveTemplateLiteral(call.rawPath, table);
        } else {
          resolved = resolveStringConcatenation(call.rawPath, table);
        }
      }
      if (resolved && resolved.includes('/')) {
        const path = stripUrlBase(resolved);
        const normalized = normalizePathToTemplate(path);
        const assertionLinked = lookupAssertionLinked(call.responseVar, assertionMap);
        addUnique(results, seen, {
          method: call.method,
          path,
          normalizedPath: normalized !== path ? normalized : undefined,
          sourceFile: filePath,
          sourceLanguage: language,
          resolutionType: 'string-template',
          confidence: resolved.includes('{') ? 'medium' : 'high',
          assertionLinked,
          rawCall: call.rawCall,
        });
      }
    }
  }

  // ── 6. Resolve request builder / object patterns ─────────────────────────
  if (config.resolveRequestBuilders) {
    const builderCalls = extractRequestBuilders(content, language, table);
    for (const call of builderCalls) {
      const assertionLinked = false; // Cannot easily trace for builders without var tracking
      addUnique(results, seen, {
        method: call.method,
        path: call.path,
        normalizedPath: call.normalizedPath,
        sourceFile: filePath,
        sourceLanguage: language,
        resolutionType: 'request-builder',
        confidence: call.confidence,
        assertionLinked,
      });
    }
  }

  // ── 7. Resolve wrapper/helper method calls ────────────────────────────────
  if (config.resolveWrappers) {
    // Find top-level calls that reference local functions
    const helperCalls =
      language === 'java' || language === 'kotlin'
        ? extractJavaHelperCallsInHttpArgs(content)
        : language === 'python'
        ? extractPythonHelperCallsInHttpArgs(content)
        : extractJsHelperCallsInHttpArgs(content);

    for (const { method, helperName } of helperCalls) {
      // First, try to get a return path from the helper
      const returnPath = resolveHelperReturnPath(helperName, graph, table, config.maxCallDepth);
      if (returnPath) {
        const resolved = language === 'python'
          ? resolvePythonFString(returnPath, table)
          : resolveTemplateLiteral(returnPath, table);
        const path = stripUrlBase(resolved);
        const normalized = normalizePathToTemplate(path);
        addUnique(results, seen, {
          method,
          path,
          normalizedPath: normalized !== path ? normalized : undefined,
          sourceFile: filePath,
          sourceLanguage: language,
          resolutionType: 'wrapper-method',
          confidence: 'high',
        });
      } else {
        // Try resolving the entire wrapper body for HTTP calls
        const wrapperResults = resolveWrapperCall(
          helperName,
          graph,
          table,
          filePath,
          language,
          config.maxCallDepth,
        );
        for (const r of wrapperResults) {
          addUnique(results, seen, r);
        }
      }
    }

    // Also scan all call graph nodes for direct HTTP calls inside them
    // (catches helpers called from wrapper functions)
    for (const [fnName, node] of graph.entries()) {
      for (const { method, path } of node.directHttpCalls) {
        // Only include if the function is called from the top-level content
        const calledFromTopLevel = new RegExp(`\\b${escapeRegex(fnName)}\\s*\\(`).test(content);
        if (calledFromTopLevel) {
          const normalized = normalizePathToTemplate(path);
          addUnique(results, seen, {
            method,
            path,
            normalizedPath: normalized !== path ? normalized : undefined,
            sourceFile: filePath,
            sourceLanguage: language,
            resolutionType: 'wrapper-method',
            confidence: 'medium',
          });
        }
      }
    }
  }

  // ── 8. Client mapping resolution ─────────────────────────────────────────
  if (config.resolveClientMappings && config.clientMappings && config.clientMappings.length > 0) {
    for (const mapping of config.clientMappings) {
      const callPattern = new RegExp(
        `\\b${escapeRegex(mapping.classOrObject)}\\.${escapeRegex(mapping.method)}\\s*\\(`,
        'g',
      );
      if (callPattern.test(content)) {
        addUnique(results, seen, {
          method: mapping.httpMethod.toUpperCase(),
          path: mapping.pathTemplate,
          sourceFile: filePath,
          sourceLanguage: language,
          resolutionType: 'client-mapping',
          confidence: 'high',
        });
      }
    }
  }

  // ── 9. Enrich with assertion linkage for response variable calls ──────────
  if (config.assertionAware) {
    const responseVarCalls = extractResponseVariables(content);
    for (const { varName, method, path } of responseVarCalls) {
      const assertionLinked = isAssertionLinked_local(varName, content);
      if (assertionLinked) {
        const normalized = normalizePathToTemplate(path);
        addUnique(results, seen, {
          method,
          path,
          normalizedPath: normalized !== path ? normalized : undefined,
          sourceFile: filePath,
          sourceLanguage: language,
          resolutionType: 'direct',
          confidence: 'high',
          assertionLinked: true,
        });
      }
    }
  }

  return results;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Call site with a non-literal (variable/constant) argument */
interface VariableArgCall {
  method: string;
  rawArg: string;
  rawCall: string;
  responseVar?: string;
  resolutionType: 'constant' | 'enum';
  confidence: ConfidenceLevel;
}

/**
 * Extract HTTP call sites where the path argument is a variable (not a literal).
 *
 * Example:
 *   client.get(USERS_PATH)   → rawArg = USERS_PATH
 *   api.post(Routes.USERS)   → rawArg = Routes.USERS
 */
function extractHttpCallsWithVariableArgs(content: string, language: string): VariableArgCall[] {
  const calls: VariableArgCall[] = [];
  let m: RegExpExecArray | null;

  if (language === 'java' || language === 'kotlin') {
    // .get(IDENTIFIER) or .get(Enum.MEMBER)
    const javaVarPattern =
      /\.(get|post|put|patch|delete|head|options)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*(?:\.[a-z]+\(\))?)\s*\)/gi;
    while ((m = javaVarPattern.exec(content)) !== null) {
      const arg = m[2];
      if (!arg.includes('"') && !arg.startsWith('/')) {
        const isEnum = arg.includes('.') && /^[A-Z]/.test(arg.split('.')[0]!);
        calls.push({
          method: m[1].toUpperCase(),
          rawArg: arg,
          rawCall: m[0],
          resolutionType: isEnum ? 'enum' : 'constant',
          confidence: 'high',
        });
      }
    }
  } else if (language === 'python') {
    // .get(IDENTIFIER) or requests.get(IDENTIFIER)
    const pyVarPattern =
      /\.(get|post|put|patch|delete|head|options)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*(?:[,)])/gi;
    while ((m = pyVarPattern.exec(content)) !== null) {
      const arg = m[2];
      if (!arg.startsWith('/') && !arg.startsWith('"') && !arg.startsWith("'")) {
        const isEnum = arg.includes('.') && /^[A-Z]/.test(arg.split('.')[0]!);
        calls.push({
          method: m[1].toUpperCase(),
          rawArg: arg,
          rawCall: m[0],
          resolutionType: isEnum ? 'enum' : 'constant',
          confidence: 'high',
        });
      }
    }
  } else {
    // TypeScript/JavaScript
    const jsVarPattern =
      /\.(get|post|put|patch|delete|head|options)\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\s*[),]/gi;
    while ((m = jsVarPattern.exec(content)) !== null) {
      const arg = m[2];
      // Skip if it looks like a function call (.get(someCall()) already handled)
      if (arg.endsWith(')') || arg.startsWith('/')) continue;
      const isEnum = arg.includes('.') && /^[A-Z]/.test(arg.split('.')[0]!);
      calls.push({
        method: m[1].toUpperCase(),
        rawArg: arg,
        rawCall: m[0],
        resolutionType: isEnum ? 'enum' : 'constant',
        confidence: 'high',
      });
    }
  }

  return calls;
}

/** Template or concatenation path call */
interface TemplateCalls {
  method: string;
  rawPath: string;
  rawCall: string;
  responseVar?: string;
}

/**
 * Extract HTTP call sites where the path argument is a template literal or
 * string concatenation.
 */
function extractTemplateArgHttpCalls(content: string, language: string): TemplateCalls[] {
  const calls: TemplateCalls[] = [];
  let m: RegExpExecArray | null;

  if (language === 'java' || language === 'kotlin') {
    // .get(BASE + "/users/" + id)
    const javaConcat =
      /\.(get|post|put|patch|delete|head|options)\s*\(\s*([A-Za-z_$][A-Za-z0-9_$"' +.]*)\s*\)/gi;
    while ((m = javaConcat.exec(content)) !== null) {
      const arg = m[2];
      if (arg.includes('+') && (arg.includes('"') || /[A-Z_]/.test(arg))) {
        calls.push({ method: m[1].toUpperCase(), rawPath: arg, rawCall: m[0] });
      }
    }
  } else if (language === 'python') {
    // .get(f"{BASE}/users/{id}")
    const pyFString =
      /\.(get|post|put|patch|delete|head|options)\s*\(\s*f['"]([^'"]+)['"]/gi;
    while ((m = pyFString.exec(content)) !== null) {
      calls.push({ method: m[1].toUpperCase(), rawPath: m[2], rawCall: m[0] });
    }
    // .get(BASE + "/users/" + str(id))
    const pyConcat =
      /\.(get|post|put|patch|delete|head|options)\s*\(\s*([^'")\n]*\+[^'")\n]*)[^)\n]*\)/gi;
    while ((m = pyConcat.exec(content)) !== null) {
      if (m[2].includes('/')) {
        calls.push({ method: m[1].toUpperCase(), rawPath: m[2].trim(), rawCall: m[0] });
      }
    }
  } else {
    // TypeScript/JS: .get(`${BASE}/users/${id}`)
    const tsTemplate =
      /\.(get|post|put|patch|delete|head|options)\s*\(\s*`([^`]+)`/gi;
    while ((m = tsTemplate.exec(content)) !== null) {
      if (m[2].includes('/')) {
        calls.push({ method: m[1].toUpperCase(), rawPath: m[2], rawCall: m[0] });
      }
    }
    // .get(BASE + '/users/' + id)
    const jsConcat =
      /\.(get|post|put|patch|delete|head|options)\s*\(\s*([A-Za-z_$][^'"()\n]*\+[^'"`()\n]+)/gi;
    while ((m = jsConcat.exec(content)) !== null) {
      if (m[2].includes('/')) {
        calls.push({ method: m[1].toUpperCase(), rawPath: m[2].trim(), rawCall: m[0] });
      }
    }
  }

  return calls;
}

/**
 * Resolve a call argument using symbol table (constants + enums).
 */
function resolveCallArg(
  rawArg: string,
  table: SymbolTable,
  config: DeepAnalysisConfig,
): string | undefined {
  // Try enum resolution first (dotted access looks like enum)
  if (config.resolveEnums && rawArg.includes('.')) {
    const r = resolveEnumToken(rawArg, table);
    if (r !== undefined) return r;
  }

  if (config.resolveConstants) {
    const r = resolveToken(rawArg, table);
    if (r !== undefined) return r;
  }

  return undefined;
}

/** Deduplicate results using a method:path key */
function addUnique(
  results: ResolvedHttpCall[],
  seen: Set<string>,
  call: ResolvedHttpCall,
): void {
  const key = `${call.method}:${call.path}:${call.resolutionType}`;
  if (!seen.has(key)) {
    seen.add(key);
    results.push(call);
  }
}

/** Look up assertion linkage for a response variable name */
function lookupAssertionLinked(
  responseVar: string | undefined,
  assertionMap: Map<string, boolean>,
): boolean | undefined {
  if (!responseVar) return undefined;
  const linked = assertionMap.get(responseVar);
  return linked !== undefined ? linked : undefined;
}

/** Inline assertion check (used inside deepResolveFile without importing) */
function isAssertionLinked_local(varName: string, content: string): boolean {
  if (!varName) return false;
  const jsExpect = new RegExp(`\\bexpect\\s*\\(\\s*${escapeRegex(varName)}\\b`);
  if (jsExpect.test(content)) return true;
  const javaAssert = new RegExp(
    `\\b(?:assertEquals|assertNotNull|assertThat)\\s*\\([^)]*\\b${escapeRegex(varName)}\\b`,
  );
  if (javaAssert.test(content)) return true;
  const pyAssert = new RegExp(`\\bassert\\s+${escapeRegex(varName)}\\b`);
  if (pyAssert.test(content)) return true;
  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripUrlBase(value: string): string {
  if (value.startsWith('/') || value.startsWith('{')) return value;
  try {
    const url = new URL(value);
    return url.pathname;
  } catch {
    return value;
  }
}

// Export the response-variable extractor so callers can enrich assertions
export { extractResponseVariables };
