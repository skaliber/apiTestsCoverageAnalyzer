/**
 * Deep Code Analysis — Public API
 *
 * Re-exports the public interface of the deep-endpoint-analysis feature.
 */

export type {
  ResolvedHttpCall,
  ResolutionType,
  ConfidenceLevel,
  SymbolEntry,
  SymbolTable,
  SymbolKind,
  DeepAnalysisConfig,
  ClientMethodMapping,
  CallGraphNode,
  CallGraph,
} from './types';

export { DEFAULT_DEEP_ANALYSIS_CONFIG } from './types';

export { deepResolveFile } from './deepEndpointResolver';

export {
  buildSymbolTable,
  buildSymbolTableFromJs,
  buildSymbolTableFromJava,
  buildSymbolTableFromKotlin,
  buildSymbolTableFromPython,
  resolveSymbol,
} from './symbolTable';

export {
  resolveToken,
  resolveFragments,
  extractStringConstants,
} from './resolveConstants';

export {
  resolveEnumToken,
  extractTsEnumValues,
  extractJavaEnumValues,
  extractKotlinEnumValues,
  extractPythonEnumValues,
} from './resolveEnums';

export {
  normalizePathToTemplate,
  resolveTemplateLiteral,
  resolveStringConcatenation,
  resolveJavaConcatenation,
  resolvePythonFString,
  resolveRubyInterpolation,
  extractTemplateLiterals,
  extractPythonFStrings,
  stripUrlBase,
} from './resolvePaths';

export {
  buildJsCallGraph,
  buildJavaCallGraph,
  buildPythonCallGraph,
  extractJsFunctions,
  extractJavaKotlinFunctions,
  extractPythonFunctions,
  extractBalancedBraces,
} from './callGraph';

export {
  resolveWrapperCall,
  resolveHelperReturnPath,
  extractJsHelperCallsInHttpArgs,
  extractJavaHelperCallsInHttpArgs,
  extractPythonHelperCallsInHttpArgs,
} from './resolveMethodChains';

export {
  extractRequestBuilders,
  extractJsRequestBuilders,
  extractJavaRequestBuilders,
  extractKotlinRequestBuilders,
  extractPythonRequestBuilders,
} from './resolveRequestWrappers';

export {
  isAssertionLinked,
  extractResponseVariables,
  buildAssertionMap,
} from './resolveAssertions';
