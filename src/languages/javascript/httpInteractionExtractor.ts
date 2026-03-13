/**
 * JavaScript/TypeScript HTTP interaction extractor.
 *
 * Walks an AST node looking for HTTP client call patterns:
 *   - axios.METHOD(url, ...)
 *   - request.METHOD(url) / supertest(app).METHOD(url)
 *   - got.METHOD(url)
 *   - fetch(url, { method: 'POST' })
 *   - agent.METHOD(url)
 *   - http.METHOD(url) / https.METHOD(url)
 *
 * For each detected call, resolves the URL argument to a static string where
 * possible (via constant lookup and template literal evaluation).
 */

import type { SemanticHttpCall, SemanticSymbol } from '../../ast/astTypes';
import { evaluateStringNode, memberKey } from './callResolver';
import { normalizePathToTemplate } from '../../coverage/deep-analysis/resolvePaths';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AstNode = any;

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

/**
 * HTTP client object names/prefixes that follow the pattern client.METHOD(url).
 */
const HTTP_CLIENT_OBJECTS = new Set([
  'axios',
  'request',
  'supertest',
  'agent',
  'got',
  'client',
  'api',
  'http',
  'https',
  'instance',
  'app',
  'server',
  'testClient',
  'apiClient',
  'httpClient',
]);

/**
 * Extract all HTTP call sites from an AST subtree.
 * Appends results to `out`. Recursively walks the full subtree.
 */
export function extractHttpCallsFromNode(
  node: AstNode,
  constants: Map<string, SemanticSymbol>,
  out: SemanticHttpCall[],
  localVars?: Map<string, SemanticSymbol>,
): void {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'CallExpression') {
    const call = tryExtractHttpCall(node, constants, localVars);
    if (call) {
      out.push(call);
      return; // Don't recurse into the args of a matched call
    }
  }

  // Recurse
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'tokens' || key === 'comments') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) {
        if (c && typeof c === 'object' && c.type) {
          extractHttpCallsFromNode(c, constants, out, localVars);
        }
      }
    } else if (child && typeof child === 'object' && child.type) {
      extractHttpCallsFromNode(child, constants, out, localVars);
    }
  }
}

function tryExtractHttpCall(
  callNode: AstNode,
  constants: Map<string, SemanticSymbol>,
  localVars?: Map<string, SemanticSymbol>,
): SemanticHttpCall | null {
  const callee = callNode.callee;
  if (!callee) return null;

  // Pattern 1: axios.get(url), client.post(url), etc.
  if (callee.type === 'MemberExpression') {
    const methodName = callee.property?.name?.toLowerCase();
    if (!methodName || !HTTP_METHODS.has(methodName)) return null;

    const objName = getObjectName(callee.object);

    // Check if object is a known HTTP client
    if (!isHttpClientObject(objName, callee.object)) return null;

    const urlArg = callNode.arguments?.[0];
    if (!urlArg) return null;

    const rawPath = urlArg.type === 'Literal' ? urlArg.value : undefined;
    const resolvedPath = evaluateStringNode(urlArg, constants, localVars);
    const path = resolvedPath ?? rawPath ?? '';

    // Detect response variable: const resp = client.get(...)
    const responseVariable = extractResponseVariable(callNode);

    return buildHttpCall(
      methodName.toUpperCase(),
      rawPath ?? argSource(urlArg),
      path,
      rawPath !== undefined,
      responseVariable,
      callNode.loc?.start?.line,
    );
  }

  // Pattern 2: fetch(url, { method: 'POST' })
  if (callee.type === 'Identifier' && callee.name === 'fetch') {
    const urlArg = callNode.arguments?.[0];
    const optionsArg = callNode.arguments?.[1];

    const method = extractMethodFromOptions(optionsArg) ?? 'GET';
    if (!urlArg) return null;

    const rawPath = urlArg.type === 'Literal' ? urlArg.value : undefined;
    const resolvedPath = evaluateStringNode(urlArg, constants, localVars);
    const path = resolvedPath ?? rawPath ?? '';

    return buildHttpCall(
      method.toUpperCase(),
      rawPath ?? argSource(urlArg),
      path,
      rawPath !== undefined,
      extractResponseVariable(callNode),
      callNode.loc?.start?.line,
    );
  }

  return null;
}

function isHttpClientObject(objName: string | undefined, objectNode: AstNode): boolean {
  if (!objName) return false;

  // Direct match: axios.get, client.post, etc.
  if (HTTP_CLIENT_OBJECTS.has(objName.toLowerCase())) return true;

  // Chained call: supertest(app).get('/path') — the object is a CallExpression
  if (objectNode?.type === 'CallExpression') {
    const chainedCallee = objectNode.callee?.name ?? objectNode.callee?.property?.name ?? '';
    const chainedLower = chainedCallee.toLowerCase();
    if (HTTP_CLIENT_OBJECTS.has(chainedLower) || chainedLower === 'supertest') return true;
  }

  // Member chains: this.client.get, app.agent().get, etc.
  if (objectNode?.type === 'MemberExpression') {
    const innerProp = objectNode.property?.name?.toLowerCase() ?? '';
    if (
      HTTP_CLIENT_OBJECTS.has(innerProp) ||
      innerProp.includes('client') ||
      innerProp.includes('agent') ||
      innerProp.includes('api')
    ) {
      return true;
    }
  }

  // Ends with 'Client', 'Api', 'Agent'
  const lower = objName.toLowerCase();
  if (lower.endsWith('client') || lower.endsWith('api') || lower.endsWith('agent')) return true;

  return false;
}

function getObjectName(objectNode: AstNode): string | undefined {
  if (!objectNode) return undefined;
  if (objectNode.type === 'Identifier') return objectNode.name;
  if (objectNode.type === 'MemberExpression') {
    return memberKey(objectNode) ?? objectNode.property?.name;
  }
  if (objectNode.type === 'CallExpression') {
    return objectNode.callee?.name ?? objectNode.callee?.property?.name;
  }
  if (objectNode.type === 'ThisExpression') return 'this';
  return undefined;
}

function extractMethodFromOptions(optionsNode: AstNode): string | undefined {
  if (!optionsNode || optionsNode.type !== 'ObjectExpression') return undefined;
  for (const prop of optionsNode.properties ?? []) {
    const keyName = prop.key?.name ?? prop.key?.value;
    if (keyName === 'method' && prop.value?.type === 'Literal') {
      return String(prop.value.value);
    }
  }
  return undefined;
}

function extractResponseVariable(callNode: AstNode): string | undefined {
  // Walk up to find assignment pattern: const response = client.get(...)
  const parent: AstNode | undefined =
    // Prefer the stable `parent` property when available
    (callNode && (callNode.parent as AstNode | undefined)) ??
    // Best-effort fallback for parsers that still expose a private `_parent` field.
    // This is intentionally isolated so that future AST changes only affect this spot.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    ((callNode as any)['_parent'] as AstNode | undefined);
  if (!parent) return undefined;

  if (parent.type === 'VariableDeclarator' && parent.id?.name) {
    return parent.id.name;
  }
  if (parent.type === 'AssignmentExpression' && parent.left?.name) {
    return parent.left.name;
  }

  return undefined;
}

function argSource(node: AstNode): string {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') return memberKey(node) ?? '';
  return '';
}

function buildHttpCall(
  method: string,
  rawPathArg: string,
  resolvedPath: string,
  isDirect: boolean,
  responseVariable: string | undefined,
  line: number | undefined,
): SemanticHttpCall {
  const hasResolution = resolvedPath && resolvedPath.startsWith('/');
  const normalizedPath = hasResolution ? normalizePathToTemplate(resolvedPath) : undefined;

  return {
    method,
    rawPathArg,
    resolvedPath: hasResolution ? resolvedPath : undefined,
    normalizedPath,
    resolutionType: isDirect ? 'direct' : resolvedPath !== rawPathArg ? 'constant' : 'heuristic',
    confidence: isDirect ? 'high' : resolvedPath ? 'medium' : 'low',
    responseVariable,
    line,
  };
}
