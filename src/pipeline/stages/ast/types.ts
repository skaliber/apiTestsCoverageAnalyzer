/**
 * AST stage types — cross-file analysis, import resolution, and abstract layer traversal.
 */

import type { SemanticModel, SemanticHttpCall, SemanticAssertion, SemanticFunction, SupportedLanguage } from '../../../ast/astTypes';
import type { AssertionSource, UrlResolution } from '../../types';

/**
 * An import declaration extracted from a source file.
 */
export interface ImportDeclaration {
  /** The import source specifier (e.g. './utils', 'express', '@nestjs/common') */
  source: string;
  /** The resolved absolute file path (undefined if unresolvable) */
  resolvedPath?: string;
  /** Names imported (e.g. ['Router', 'Response'] or ['default']) */
  importedNames: string[];
  /** Whether this is a default import */
  isDefault: boolean;
  /** Line number in source file */
  line?: number;
}

/**
 * A class declaration extracted from a source file.
 */
export interface ClassDeclaration {
  name: string;
  extendsClass?: string;
  implementsInterfaces?: string[];
  methods: string[];
  filePath: string;
  line?: number;
}

/**
 * Multi-file symbol table aggregating all parsed file models.
 */
export interface CrossFileSymbolTable {
  /** All parsed semantic models keyed by file path */
  models: Map<string, SemanticModel>;
  /** Exported symbols: symbolName → { filePath, value } */
  exportedSymbols: Map<string, { filePath: string; value: string }>;
  /** All classes: className → declaration */
  classes: Map<string, ClassDeclaration>;
  /** Import graph: filePath → array of resolved import file paths */
  importGraph: Map<string, string[]>;
}

/**
 * Result of abstract layer traversal (inheritance, helpers, fixtures).
 */
export interface TraversalResult {
  /** Assertions resolved from base classes, helpers, or fixtures */
  resolvedAssertions: SemanticAssertion[];
  /** HTTP calls resolved from abstract layers */
  resolvedHttpCalls: SemanticHttpCall[];
  /** How the assertion was sourced */
  assertionSource: AssertionSource;
  /** How deep the traversal went */
  traversalDepth: number;
  /** Whether resolution is full or partial */
  resolution: 'full' | 'partial';
  /** Chain of unresolved references (for diagnostics) */
  unresolvedChain?: string[];
  /** Whether a cycle was detected during traversal */
  cycleDetected: boolean;
}

/**
 * Output of the AST pipeline stage.
 */
export interface AstStageOutput {
  /** All parsed semantic models */
  models: Map<string, SemanticModel>;
  /** Cross-file symbol table */
  crossFileTable: CrossFileSymbolTable;
  /** Traversal results per test file */
  traversalResults: Map<string, TraversalResult>;
  /** Files that were successfully analyzed */
  analyzedFiles: string[];
  /** Files that failed or were skipped */
  skippedFiles: Array<{ file: string; reason: string }>;
}
