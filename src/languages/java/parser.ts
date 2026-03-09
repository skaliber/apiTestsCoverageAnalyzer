/**
 * Java AST parser.
 * Uses tree-sitter-java with lazy loading; sets parseError on failure.
 */

import type { ParsedSourceFile } from '../../ast/astTypes';
import { createParser } from '../shared/treeSitterUtils';

let cachedParser: unknown = undefined;
let parserLoaded = false;

function getJavaParser(): unknown {
  if (!parserLoaded) {
    parserLoaded = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const grammar = require('tree-sitter-java');
      cachedParser = createParser(grammar);
    } catch {
      cachedParser = null;
    }
  }
  return cachedParser;
}

export function parseJava(filePath: string, content: string): ParsedSourceFile {
  const parser = getJavaParser();
  if (!parser) {
    return {
      filePath,
      language: 'java',
      ast: null,
      content,
      parseError: new Error('tree-sitter-java not available'),
    };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tree = (parser as any).parse(content);
    return { filePath, language: 'java', ast: tree, content };
  } catch (err) {
    return {
      filePath,
      language: 'java',
      ast: null,
      content,
      parseError: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
