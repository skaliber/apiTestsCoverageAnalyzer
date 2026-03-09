/**
 * Shared tree-sitter utilities.
 *
 * Wraps the tree-sitter native module with lazy loading and graceful
 * fallback. Every tree-sitter language module calls `createParser()` and
 * treats a null return as "fall back to regex analysis".
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TsNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TsTree = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TsParser = any;

/**
 * Create a tree-sitter parser for the given language grammar.
 *
 * @param grammarModule The `require()`-resolved grammar object from tree-sitter-*
 * @returns A configured Parser instance, or null if native loading fails.
 */
export function createParser(grammarModule: unknown): TsParser | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Parser = require('tree-sitter');
    const parser = new Parser();
    parser.setLanguage(grammarModule);
    return parser;
  } catch {
    return null;
  }
}

/**
 * Recursively walk a tree-sitter node tree, calling `visitor` on each node.
 * Pass `nodeTypes` to filter — visitor is only called when node.type matches.
 */
export function walkTree(
  node: TsNode,
  visitor: (n: TsNode) => void,
  nodeTypes?: Set<string>,
): void {
  if (!node) return;
  if (!nodeTypes || nodeTypes.has(node.type)) {
    visitor(node);
  }
  for (let i = 0; i < (node.childCount ?? 0); i++) {
    walkTree(node.child(i), visitor, nodeTypes);
  }
}

/**
 * Collect all descendant nodes whose type is in `nodeTypes`.
 */
export function findNodes(root: TsNode, nodeTypes: string[]): TsNode[] {
  const types = new Set(nodeTypes);
  const results: TsNode[] = [];
  walkTree(root, (n) => results.push(n), types);
  return results;
}

/**
 * Get the text of a named child field, or undefined.
 */
export function fieldText(node: TsNode, fieldName: string): string | undefined {
  const child = node?.childForFieldName?.(fieldName);
  return child ? child.text : undefined;
}

/**
 * Get the first child of a given type.
 */
export function firstChildOfType(node: TsNode, type: string): TsNode | undefined {
  for (let i = 0; i < (node?.childCount ?? 0); i++) {
    const child = node.child(i);
    if (child?.type === type) return child;
  }
  return undefined;
}

/**
 * Check if a node has a child of the given type.
 */
export function hasChildOfType(node: TsNode, type: string): boolean {
  return firstChildOfType(node, type) !== undefined;
}

/**
 * Extract an unquoted string value from a string_literal / string node.
 */
export function extractStringValue(node: TsNode): string | undefined {
  if (!node) return undefined;
  const raw = node.text ?? '';
  // Remove surrounding quotes
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'")) ||
    (raw.startsWith('`') && raw.endsWith('`'))
  ) {
    return raw.slice(1, -1);
  }
  return raw;
}
