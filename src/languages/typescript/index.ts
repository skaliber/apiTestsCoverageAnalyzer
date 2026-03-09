/**
 * TypeScript language analyzer.
 *
 * TypeScript analysis is identical to JavaScript but registered under the
 * 'typescript' language key. Both use @typescript-eslint/typescript-estree
 * which natively handles TS syntax (generics, enums, decorators, etc.).
 */

import { JavaScriptAnalyzer } from '../javascript/index';
import { registerAnalyzer } from '../../ast/parserRegistry';
import type { SupportedLanguage, ParsedSourceFile } from '../../ast/astTypes';
import { parseJsTs } from '../javascript/parser';

export class TypeScriptAnalyzer extends JavaScriptAnalyzer {
  override readonly language: SupportedLanguage = 'typescript';

  override parse(filePath: string, content: string): ParsedSourceFile {
    return parseJsTs(filePath, content, 'typescript');
  }
}

// Register for 'typescript'
registerAnalyzer('typescript', () => new TypeScriptAnalyzer());
