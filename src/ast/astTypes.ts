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
