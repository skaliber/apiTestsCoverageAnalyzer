/**
 * JavaScript/TypeScript AST parser.
 *
 * Uses @typescript-eslint/typescript-estree which handles both JS and TS
 * files using the TypeScript compiler's parser in tolerant mode.
 */

import type { ParsedSourceFile, SupportedLanguage } from '../../ast/astTypes';

/**
 * Parse a JS or TS source file using @typescript-eslint/typescript-estree.
 *
 * Never throws. Sets `parseError` if parsing fails so the caller can fall back.
 */
export function parseJsTs(
  filePath: string,
  content: string,
  language: SupportedLanguage = 'typescript',
): ParsedSourceFile {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parse } = require('@typescript-eslint/typescript-estree');
    const ast = parse(content, {
      jsx: filePath.endsWith('.jsx') || filePath.endsWith('.tsx'),
      range: true,
      loc: true,
      // tolerant: do not throw on recoverable syntax errors in test files
      errorOnUnknownASTType: false,
      allowInvalidAST: true,
    });
    return { filePath, language, ast, content };
  } catch (err) {
    return {
      filePath,
      language,
      ast: null,
      content,
      parseError: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
