/**
 * AST stage types — cross-file analysis, import resolution, and abstract layer traversal.
 */

import type { SemanticModel, SemanticHttpCall, SemanticAssertion, SemanticFunction, SupportedLanguage, SecurityClassification } from '../../../ast/astTypes';
import type { AssertionSource, UrlResolution } from '../../types';
import type { DetectedApiFramework } from '../../../discovery/frameworkDetector';

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

// ─── Cross-file resolution types (Feature 27) ────────────────────────────────

/**
 * A router mount point: app.use('/prefix', router) or register_blueprint(bp, url_prefix=...)
 */
export interface RouterMount {
  /** URL prefix being mounted */
  prefix: string;
  /** Path to the target module/file being mounted */
  targetModulePath: string;
  /** Middleware applied at this mount point */
  middleware: MiddlewareEntry[];
  sourceFile: string;
  line?: number;
}

/**
 * An Angular/Vue/React injection chain: component → service → HTTP call
 */
export interface InjectionChain {
  /** File containing the consumer (component) */
  consumerFile: string;
  /** Class name of the consumer */
  consumerClass: string;
  /** Class name of the injected service */
  serviceClass: string;
  /** File containing the service */
  serviceFile: string;
  /** How injection was detected */
  injectionStyle: 'constructor' | 'inject-fn' | 'decorator' | 'property';
}

/**
 * A middleware entry in a chain (auth, validation, error handling)
 */
export interface MiddlewareEntry {
  /** Middleware name or identifier */
  name: string;
  /** Classified type */
  type: 'auth-required' | 'auth-optional' | 'validation' | 'error-handler' | 'custom';
  /** Whether this applies to an entire router or a single route */
  appliedTo: 'router' | 'route';
  /** Security classification if this is an auth middleware */
  security?: SecurityClassification;
  sourceFile: string;
  line?: number;
}

/**
 * A domain interface → infrastructure implementation mapping (DDD)
 */
export interface InterfaceImpl {
  /** Fully qualified interface name */
  interfaceName: string;
  /** File containing the interface */
  interfaceFile: string;
  /** Fully qualified implementation class name */
  implName: string;
  /** File containing the implementation */
  implFile: string;
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
  /** Router/blueprint mounts: sourceFile → mounts (Feature 27) */
  routerMounts: Map<string, RouterMount[]>;
  /** Injection chains: consumerFile → chains (Feature 27) */
  injectionChains: Map<string, InjectionChain[]>;
  /** Interface → implementations: interfaceName → implNames (Feature 27) */
  interfaceImplementations: Map<string, InterfaceImpl[]>;
  /** Middleware applied to routers: routerFile → middleware (Feature 27) */
  middlewareInheritance: Map<string, MiddlewareEntry[]>;
}

// ─── Cross-file resolution pass types (Feature 27) ───────────────────────────

/**
 * Context threaded through all cross-file resolvers.
 */
export interface CrossFileResolutionContext {
  /** The cross-file symbol table to enrich */
  symbolTable: CrossFileSymbolTable;
  /** Project root directory */
  projectRoot: string;
  /** Detected API frameworks */
  apiFrameworks: DetectedApiFramework[];
  /** All source file paths */
  allSourceFiles: string[];
}

/**
 * Result from a single cross-file resolver.
 */
export interface CrossFileResolutionResult {
  /** Number of new entries added to the symbol table */
  entriesAdded: number;
  /** Diagnostic messages from resolution */
  diagnostics: string[];
  /** Unresolved references that could not be completed */
  unresolvedRefs: Array<{ ref: string; reason: string }>;
}

/**
 * Interface that each framework-specific cross-file resolver must implement.
 */
export interface CrossFileResolver {
  /** Human-readable resolver name */
  name: string;
  /** Returns true if this resolver should run given the detected frameworks */
  appliesTo(frameworks: DetectedApiFramework[]): boolean;
  /** Perform cross-file resolution, mutating the symbol table */
  resolve(ctx: CrossFileResolutionContext): CrossFileResolutionResult;
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
  /** Cross-file resolution diagnostics (Feature 27) */
  crossFileResolutionDiagnostics?: Array<{
    resolverName: string;
    entriesAdded: number;
    diagnostics: string[];
    unresolvedRefs: Array<{ ref: string; reason: string }>;
  }>;
}
