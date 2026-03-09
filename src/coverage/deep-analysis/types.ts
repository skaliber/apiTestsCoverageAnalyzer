/**
 * Deep Code Analysis — Shared Types
 *
 * Types used across all deep-analysis sub-modules.
 */

// ─── Resolution type ──────────────────────────────────────────────────────────

/**
 * How the HTTP call was resolved. 'direct' means a literal string was found
 * in the call site; all other types represent an indirection that was resolved.
 */
export type ResolutionType =
  | 'direct'
  | 'constant'
  | 'enum'
  | 'string-template'
  | 'wrapper-method'
  | 'request-builder'
  | 'client-mapping'
  | 'heuristic';

// ─── Confidence ───────────────────────────────────────────────────────────────

export type ConfidenceLevel = 'high' | 'medium' | 'low';

// ─── Resolved HTTP call ───────────────────────────────────────────────────────

/**
 * A fully or partially resolved HTTP call produced by the deep-analysis layer.
 */
export interface ResolvedHttpCall {
  /** HTTP method in upper-case (GET, POST, …) */
  method: string;
  /** Raw path as resolved (may contain variables like /users/123) */
  path: string;
  /**
   * Path normalized to an OpenAPI path template.
   * e.g. /users/123 → /users/{id}
   */
  normalizedPath?: string;
  /** Absolute path of the source file where the call was found */
  sourceFile: string;
  /** Language the call was found in */
  sourceLanguage: string;
  /** How the endpoint was resolved */
  resolutionType: ResolutionType;
  /** Confidence level of the resolution */
  confidence: ConfidenceLevel;
  /** Whether the call was followed by an assertion on the response */
  assertionLinked?: boolean;
  /** The raw call text as it appeared in the source for debugging */
  rawCall?: string;
}

// ─── Symbol table ─────────────────────────────────────────────────────────────

export type SymbolKind = 'const' | 'let' | 'var' | 'enum' | 'parameter' | 'property' | 'function';

/** A single symbol entry extracted from a source file */
export interface SymbolEntry {
  /** Symbol identifier name */
  name: string;
  /** Symbol declaration kind */
  kind: SymbolKind;
  /** Statically known string value, if any */
  value?: string;
  /** Guard against circular resolution */
  resolving?: boolean;
  /** Line number where the symbol is declared (1-based, if known) */
  line?: number;
}

/** Per-file symbol lookup map */
export type SymbolTable = Map<string, SymbolEntry>;

// ─── Deep analysis config ─────────────────────────────────────────────────────

/**
 * A user-defined mapping from a domain-level client method call to an HTTP
 * method + path template. Used to resolve calls like userClient.getById(id).
 */
export interface ClientMethodMapping {
  /** The class or object name (e.g. 'userClient', 'PaymentsApi') */
  classOrObject: string;
  /** The method name (e.g. 'getById', 'createRefund') */
  method: string;
  /** HTTP method in upper-case (e.g. 'GET') */
  httpMethod: string;
  /** OpenAPI-style path template (e.g. '/users/{id}') */
  pathTemplate: string;
}

/**
 * Configuration for the deep-endpoint-analysis feature.
 */
export interface DeepAnalysisConfig {
  /** Master switch. When false the engine falls back to direct regex only. */
  enabled: boolean;
  /** Maximum number of method-call levels to follow when tracing wrappers. */
  maxCallDepth: number;
  /** Resolve named constant/variable references to their literal values. */
  resolveConstants: boolean;
  /** Resolve enum member references to their literal path values. */
  resolveEnums: boolean;
  /** Resolve template literals and string concatenation. */
  resolveStringTemplates: boolean;
  /** Trace helper/wrapper methods one or more levels to find HTTP calls. */
  resolveWrappers: boolean;
  /** Detect request-builder / request-object patterns. */
  resolveRequestBuilders: boolean;
  /** Apply explicit or inferred client-to-HTTP-method mapping. */
  resolveClientMappings: boolean;
  /** Associate HTTP calls with downstream response assertions. */
  assertionAware: boolean;
  /** Explicit client-method → HTTP mappings (optional, user-supplied). */
  clientMappings?: ClientMethodMapping[];
}

/** Default deep-analysis configuration (enabled, all features on). */
export const DEFAULT_DEEP_ANALYSIS_CONFIG: DeepAnalysisConfig = {
  enabled: true,
  maxCallDepth: 4,
  resolveConstants: true,
  resolveEnums: true,
  resolveStringTemplates: true,
  resolveWrappers: true,
  resolveRequestBuilders: true,
  resolveClientMappings: true,
  assertionAware: true,
  clientMappings: [],
};

// ─── Call graph ───────────────────────────────────────────────────────────────

/**
 * A node in the per-file call graph.
 * Represents one function/method defined in the same file.
 */
export interface CallGraphNode {
  /** Function/method name */
  name: string;
  /** Raw body text of the function */
  body: string;
  /** Names of other local functions this one calls */
  calls: string[];
  /** HTTP calls found directly in this function body (before wrapper resolution) */
  directHttpCalls: Array<{ method: string; path: string }>;
  /** The static return value if the function just returns a string literal */
  returnValue?: string;
}

/** Per-file call graph */
export type CallGraph = Map<string, CallGraphNode>;
