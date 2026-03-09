/**
 * Deep Code Analysis — Call Graph Construction
 *
 * Builds a lightweight per-file call graph that maps function/method names to
 * their bodies and the other local functions they call.
 *
 * This call graph is used by wrapper-method and helper-method resolution to
 * follow call chains up to a configurable depth.
 */

import type { CallGraph, CallGraphNode } from './types';

// ─── Function body extraction ─────────────────────────────────────────────────

/**
 * Extract top-level function definitions and their bodies from
 * TypeScript/JavaScript source.
 *
 * Handles:
 *   function foo() { ... }
 *   const foo = () => { ... }
 *   const foo = (params) => { ... }
 *   const foo = function() { ... }
 */
export function extractJsFunctions(content: string): Array<{ name: string; body: string }> {
  const functions: Array<{ name: string; body: string }> = [];

  // Named function declarations: function foo(...) { body }
  extractBracedFunctions(content, /\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{/, functions);

  // Arrow functions: const foo = (...) => { body }
  extractBracedFunctions(content, /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>\s*\{/, functions);

  // Function expressions: const foo = function(...) { body }
  extractBracedFunctions(content, /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*function\s*\([^)]*\)\s*\{/, functions);

  return functions;
}

/**
 * Extract method definitions from Java / Kotlin source.
 *
 * Handles:
 *   [modifiers] returnType methodName([params]) { body }
 *   fun methodName([params]): ReturnType { body }
 */
export function extractJavaKotlinFunctions(content: string): Array<{ name: string; body: string }> {
  const functions: Array<{ name: string; body: string }> = [];

  // Java-style: ... MethodName(...) { body }
  extractBracedFunctions(
    content,
    /\b([a-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*(?:throws\s+\w+(?:\s*,\s*\w+)*)?\s*\{/,
    functions,
  );

  // Kotlin fun: fun methodName(...) { body }
  extractBracedFunctions(content, /\bfun\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)/s, functions);

  return functions;
}

/**
 * Extract Python function definitions.
 *
 * Handles:
 *   def function_name(params):
 *       body (indented block)
 */
export function extractPythonFunctions(content: string): Array<{ name: string; body: string }> {
  const functions: Array<{ name: string; body: string }> = [];
  const defPattern = /^( *)def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*:/gm;
  let m: RegExpExecArray | null;

  while ((m = defPattern.exec(content)) !== null) {
    const indent = m[1];
    const name = m[2];
    const startIdx = m.index + m[0].length;

    // Find the end of the function body by looking for a line at the same or
    // lesser indentation after the definition
    const bodyLines: string[] = [];
    const remaining = content.slice(startIdx);
    const lines = remaining.split('\n');

    // Determine body indentation (first non-empty line after def)
    let bodyIndent = '';
    for (const line of lines) {
      if (line.trim() === '') continue;
      const lineIndentMatch = line.match(/^(\s+)/);
      bodyIndent = lineIndentMatch ? lineIndentMatch[1] : '';
      break;
    }

    if (!bodyIndent || bodyIndent.length <= indent.length) {
      // No body or inline expression — skip
      continue;
    }

    for (const line of lines) {
      if (line.trim() === '') {
        bodyLines.push(line);
        continue;
      }
      const li = line.match(/^(\s*)/)?.[1] ?? '';
      if (li.length < bodyIndent.length && line.trim() !== '') break;
      bodyLines.push(line);
    }

    functions.push({ name, body: bodyLines.join('\n') });
  }

  return functions;
}

// ─── Call graph construction ──────────────────────────────────────────────────

/**
 * Build a call graph from JavaScript/TypeScript source.
 */
export function buildJsCallGraph(content: string): CallGraph {
  const graph: CallGraph = new Map();
  const funcs = extractJsFunctions(content);

  for (const { name, body } of funcs) {
    const node: CallGraphNode = {
      name,
      body,
      calls: extractLocalCallsFromBody(body, funcs.map((f) => f.name)),
      directHttpCalls: extractDirectHttpCallsFromBody(body),
      returnValue: extractReturnStringLiteral(body),
    };
    graph.set(name, node);
  }

  return graph;
}

/**
 * Build a call graph from Java/Kotlin source.
 */
export function buildJavaCallGraph(content: string): CallGraph {
  const graph: CallGraph = new Map();
  const funcs = extractJavaKotlinFunctions(content);

  for (const { name, body } of funcs) {
    const node: CallGraphNode = {
      name,
      body,
      calls: extractLocalCallsFromBody(body, funcs.map((f) => f.name)),
      directHttpCalls: extractDirectHttpCallsFromBody(body),
      returnValue: extractReturnStringLiteralJava(body),
    };
    graph.set(name, node);
  }

  return graph;
}

/**
 * Build a call graph from Python source.
 */
export function buildPythonCallGraph(content: string): CallGraph {
  const graph: CallGraph = new Map();
  const funcs = extractPythonFunctions(content);

  for (const { name, body } of funcs) {
    const node: CallGraphNode = {
      name,
      body,
      calls: extractLocalCallsFromBody(body, funcs.map((f) => f.name)),
      directHttpCalls: extractDirectHttpCallsFromBody(body),
      returnValue: extractReturnStringLiteralPython(body),
    };
    graph.set(name, node);
  }

  return graph;
}

// ─── HTTP call extraction from body ──────────────────────────────────────────

/**
 * Find simple direct HTTP calls in a function body.
 * Returns method+path pairs for string-literal calls only.
 */
function extractDirectHttpCallsFromBody(body: string): Array<{ method: string; path: string }> {
  const calls: Array<{ method: string; path: string }> = [];

  // client.get('/path'), api.post('/path'), etc.
  const httpPattern =
    /\.(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]\s*[),]/gi;
  let m: RegExpExecArray | null;
  while ((m = httpPattern.exec(body)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: m[2] });
  }

  // return client.get('/path')
  const returnHttpPattern =
    /return\s+\w+\.(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  while ((m = returnHttpPattern.exec(body)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: m[2] });
  }

  return calls;
}

/**
 * Find calls to other local functions in a body.
 */
function extractLocalCallsFromBody(body: string, localFunctionNames: string[]): string[] {
  const called: string[] = [];
  for (const name of localFunctionNames) {
    // name(...) appears in the body
    const pattern = new RegExp(`\\b${escapeRegex(name)}\\s*\\(`, 'g');
    if (pattern.test(body)) {
      called.push(name);
    }
  }
  return called;
}

// ─── Return value extraction ──────────────────────────────────────────────────

/** Extract the string literal returned by a JS/TS function body, if any. */
function extractReturnStringLiteral(body: string): string | undefined {
  const m = /\breturn\s+['"`]([^'"`\n]+)['"`]/.exec(body);
  return m ? m[1] : undefined;
}

/** Extract the string literal returned by a Java/Kotlin method body. */
function extractReturnStringLiteralJava(body: string): string | undefined {
  const m = /\breturn\s+"([^"\n]+)"/.exec(body);
  return m ? m[1] : undefined;
}

/** Extract the string literal returned by a Python function body. */
function extractReturnStringLiteralPython(body: string): string | undefined {
  const m = /\breturn\s+['"]([^'"\n]+)['"]/.exec(body);
  return m ? m[1] : undefined;
}

// ─── Brace-balanced function body extraction ─────────────────────────────────

/**
 * Find all functions matching a pattern that starts a brace-delimited body
 * and extract the body text (balanced braces).
 */
function extractBracedFunctions(
  content: string,
  headerPattern: RegExp,
  results: Array<{ name: string; body: string }>,
): void {
  const gPattern = new RegExp(headerPattern.source, 'g');
  let m: RegExpExecArray | null;

  while ((m = gPattern.exec(content)) !== null) {
    const name = m[1];
    if (!name) continue;

    // Find the opening brace
    const openBrace = content.indexOf('{', m.index + m[0].length - 1);
    if (openBrace === -1) continue;

    // Extract balanced brace body
    const body = extractBalancedBraces(content, openBrace);
    if (body !== undefined) {
      results.push({ name, body });
    }
  }
}

/**
 * Extract the content of a brace-delimited block starting at `startIndex`
 * (which must point at the opening `{`). Returns the inner body without
 * the surrounding braces.
 *
 * Returns undefined if braces are not balanced.
 */
export function extractBalancedBraces(content: string, startIndex: number): string | undefined {
  if (content[startIndex] !== '{') return undefined;

  let depth = 0;
  let inString: string | null = null;
  let i = startIndex;

  while (i < content.length) {
    const ch = content[i];

    if (inString) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === inString) inString = null;
    } else {
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = ch;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return content.slice(startIndex + 1, i);
        }
      }
    }
    i++;
  }

  return undefined;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
