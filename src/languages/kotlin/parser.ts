/**
 * Kotlin AST parser.
 *
 * Three-tier fallback:
 *   1. tree-sitter-kotlin (if available on npm)
 *   2. tree-sitter-java (approximate — syntax is close enough for basic detection)
 *   3. parse error → orchestrator uses regex fallback
 */

import type { ParsedSourceFile } from '../../ast/astTypes';
import { createParser } from '../shared/treeSitterUtils';

let cachedParser: unknown = undefined;
let parserLoaded = false;

function getKotlinParser(): { parser: unknown; approximate: boolean } | null {
  if (!parserLoaded) {
    parserLoaded = true;
    // Tier 1: tree-sitter-kotlin
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const grammar = require('tree-sitter-kotlin');
      const parser = createParser(grammar);
      if (parser) {
        cachedParser = { parser, approximate: false };
        return cachedParser as { parser: unknown; approximate: boolean };
      }
    } catch { /* not available */ }

    // Tier 2: tree-sitter-java as approximation
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const grammar = require('tree-sitter-java');
      const parser = createParser(grammar);
      if (parser) {
        cachedParser = { parser, approximate: true };
        return cachedParser as { parser: unknown; approximate: boolean };
      }
    } catch { /* not available */ }

    cachedParser = null;
  }
  return cachedParser as { parser: unknown; approximate: boolean } | null;
}

export function parseKotlin(filePath: string, content: string): ParsedSourceFile {
  const result = getKotlinParser();
  if (!result) {
    return {
      filePath,
      language: 'kotlin',
      ast: null,
      content,
      parseError: new Error('No Kotlin parser available'),
    };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tree = (result.parser as any).parse(content);
    return {
      filePath,
      language: 'kotlin',
      ast: { tree, approximate: result.approximate },
      content,
    };
  } catch (err) {
    return {
      filePath,
      language: 'kotlin',
      ast: null,
      content,
      parseError: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
