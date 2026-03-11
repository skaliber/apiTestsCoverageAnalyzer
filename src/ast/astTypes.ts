/**
 * AST-layer canonical types.
 *
 * These types define the normalized representation produced by language-specific
 * parsers and consumed by the coverage engine. They are a strict superset of the
 * deep-analysis layer types so all existing consumers continue to work unmodified.
 */

import type {
  ResolutionType,
  ConfidenceLevel,
  ResolvedHttpCall,
  DeepAnalysisConfig,
} from '../coverage/deep-analysis/types';
import type { AstAnalysisConfig } from '../config/types';

export type { ResolutionType, ConfidenceLevel };

// ─── Supported languages ──────────────────────────────────────────────────────

export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'java'
  | 'kotlin'
  | 'python'
  | 'ruby'
  | 'cucumber'
  | 'auto';

// ─── Structure-agnostic types (Feature 27) ──────────────────────────────────

/** How an endpoint is served — REST, GraphQL, gRPC, etc. */
export type EndpointProtocol = 'rest' | 'graphql' | 'grpc' | 'websocket';

/** Current state of cross-file node resolution */
export type NodeResolution = 'resolved' | 'cross-file-unresolved' | 'partial';

/** Unified security classification for any framework's auth pattern */
export interface SecurityClassification {
  /** Auth mechanism type */
  type: 'jwt' | 'oauth' | 'apikey' | 'session' | 'basic' | 'custom';
  /** True when auth is mandatory (401 on missing credentials) */
  required: boolean;
  /** True when auth is optional (request proceeds with or without credentials) */
  optional: boolean;
  /** Framework-specific source pattern, e.g. '@jwt_required', 'auth.required' */
  sourcePattern?: string;
}

/** A decorator or annotation associated with a function/method */
export interface DecoratorInfo {
  name: string;
  /** Full text of the decorator including arguments */
  fullText?: string;
  /** Parsed arguments (key-value) when detectable */
  args?: Record<string, string>;
  line?: number;
}

/** A decorator stack: all decorators on a single function/method */
export interface DecoratorStack {
  /** The function/method name these decorators are applied to */
  functionName: string;
  decorators: DecoratorInfo[];
  sourceFile: string;
  line?: number;
}

/** A route registration detected in source code */
export interface RouteRegistration {
  /** The variable or object that routes are being registered on */
  registrarName: string;
  /** The URL path or prefix being registered */
  path: string;
  /** HTTP methods if specified at registration */
  methods?: string[];
  /** Security classification if auth middleware is attached at registration */
  security?: SecurityClassification;
  /** The target module/file being mounted (for router.use(path, require('./target'))) */
  targetModule?: string;
  sourceFile: string;
  line?: number;
}

/** A middleware entry detected in the middleware chain */
export interface MiddlewareInfo {
  name: string;
  /** Classified type of middleware */
  type: 'auth-required' | 'auth-optional' | 'validation' | 'error-handler' | 'custom';
  /** Whether this middleware applies to an entire router or a single route */
  appliedTo: 'router' | 'route';
  sourceFile: string;
  line?: number;
}

/** Base type for all structure-agnostic discovered nodes */
export interface StructureAgnosticNode {
  /** Current state of cross-file resolution */
  resolution: NodeResolution;
  /** Confidence level from deep analysis */
  confidence: ConfidenceLevel;
  /** File where this node was found */
  sourceFile: string;
  /** Line number in the source file */
  lineNumber?: number;
  /** Protocol for endpoint nodes */
  protocol?: EndpointProtocol;
  /** Security classification if detected */
  security?: SecurityClassification;
  /** Diagnostic message when resolution is incomplete */
  diagnosticMessage?: string;
}

// ─── Assertion type ───────────────────────────────────────────────────────────

export type AssertionType =
  | 'status-code'
  | 'body-field'
  | 'fluent-chain'
  | 'exception-catch'
  | 'none';

// ─── Business / flow references ───────────────────────────────────────────────

export interface BusinessRuleRef {
  ruleId: string;
  source: 'annotation' | 'decorator' | 'comment' | 'tag';
  line?: number;
}

export interface FlowRef {
  flowId: string;
  source: 'tag' | 'comment' | 'annotation';
  line?: number;
}

// ─── Semantic model elements ──────────────────────────────────────────────────

export interface SemanticSymbol {
  name: string;
  kind: 'const' | 'let' | 'var' | 'parameter' | 'field' | 'enum-member';
  /** Value as written in source (may reference another symbol) */
  value?: string;
  /** Value after constant propagation */
  resolvedValue?: string;
  line?: number;
}

export interface SemanticHttpCall {
  method: string;
  /** Path argument as written in source — may be a variable name */
  rawPathArg: string;
  /** After constant/template resolution */
  resolvedPath?: string;
  /** After normalization to OpenAPI template form */
  normalizedPath?: string;
  resolutionType: ResolutionType;
  confidence: ConfidenceLevel;
  /** Variable name the response is assigned to, for assertion linking */
  responseVariable?: string;
  line?: number;
  /** Security classification if auth is associated with this call */
  security?: SecurityClassification;
  /** Protocol (REST, GraphQL, etc.) — defaults to 'rest' */
  protocol?: EndpointProtocol;
  /** Source of the base URL (e.g., 'environment.ts', 'axios.defaults.baseURL') */
  baseUrlSource?: string;
}

export interface SemanticAssertion {
  assertionType: AssertionType;
  /** Subject variable e.g. "response" in expect(response) */
  subjectVariable?: string;
  line?: number;
}

export interface SemanticFunction {
  name: string;
  parameters: string[];
  bodyHttpCalls: SemanticHttpCall[];
  calledFunctions: string[];
  returnValue?: string;
  /** Java/Python/TS/Kotlin decorator or annotation names */
  annotations?: string[];
  /** For Cucumber step definitions — the Gherkin pattern string */
  cucumberPattern?: string;
}

// ─── Parsed source file ───────────────────────────────────────────────────────

export interface ParsedSourceFile {
  filePath: string;
  language: SupportedLanguage;
  /** Raw AST node from the parser — shape differs per backend */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ast: any;
  content: string;
  parseError?: Error;
}

// ─── Semantic model ───────────────────────────────────────────────────────────

export interface SemanticModel {
  filePath: string;
  language: SupportedLanguage;
  /** Per-file constants and variables keyed by their identifier name */
  localVariables: Map<string, SemanticSymbol>;
  constants: Map<string, SemanticSymbol>;
  /** enumName → (memberName → value) */
  enums: Map<string, Map<string, string>>;
  /** functionName → definition */
  functions: Map<string, SemanticFunction>;
  /** HTTP interactions found directly in the file body (outside functions) */
  httpInteractions: SemanticHttpCall[];
  assertions: SemanticAssertion[];
  businessRuleRefs: BusinessRuleRef[];
  flowRefs: FlowRef[];
  /** Decorator stacks grouped by function (Feature 27) */
  decoratorStacks?: DecoratorStack[];
  /** Route registrations detected in this file (Feature 27) */
  routeRegistrations?: RouteRegistration[];
  /** Middleware chains detected in this file (Feature 27) */
  middlewareChains?: MiddlewareInfo[];
}

// ─── Resolved HTTP interaction (superset of ResolvedHttpCall) ─────────────────

export interface ResolvedHttpInteraction extends ResolvedHttpCall {
  assertionType?: AssertionType;
  businessRuleRefs?: BusinessRuleRef[];
  flowRefs?: FlowRef[];
  /** Semantic parameter-test scenarios detected from builder patterns, etc. */
  parameterScenarios?: string[];
  /** Feature file path when resolutionType is 'cucumber-step' */
  cucumberFeatureFile?: string;
  /** Scenario name when resolutionType is 'cucumber-step' */
  cucumberScenario?: string;
  /** Response variable name for assertion linking (internal — not serialized to reports) */
  responseVariable?: string;
}

// ─── Analysis context ─────────────────────────────────────────────────────────

export interface AnalysisContext {
  deepConfig: DeepAnalysisConfig;
  astConfig: AstAnalysisConfig;
  projectRoot?: string;
}
