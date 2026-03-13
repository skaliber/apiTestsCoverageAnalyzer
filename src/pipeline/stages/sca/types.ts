/**
 * SCA (Software Composition Analysis) stage output types.
 *
 * The SCA stage is the first stage in the pipeline. It formalizes the existing
 * discovery engine output and adds dependency classification, version extraction,
 * and CI platform detection.
 */

/**
 * Category for a classified dependency.
 */
export type DependencyCategory =
  | 'httpClient'
  | 'testFramework'
  | 'assertionLibrary'
  | 'mockingLibrary'
  | 'securityLibrary'
  | 'performanceTool'
  | 'e2eFramework'
  | 'framework'
  | 'database'
  | 'logging'
  | 'utility'
  | 'unknown';

/**
 * CI platform detected from project structure.
 */
export type CiPlatform =
  | 'github-actions'
  | 'gitlab-ci'
  | 'jenkins'
  | 'azure-devops'
  | 'circleci'
  | 'travis-ci'
  | 'none';

/**
 * Output produced by the SCA stage.
 * Downstream stages (especially AST and TIA) reference this to select
 * correct analysis heuristics.
 */
export interface ScaOutput {
  /** Detected programming languages (e.g. ["java", "typescript"]) */
  languages: string[];
  /** Detected frameworks (e.g. ["spring-boot", "express", "nestjs"]) */
  frameworks: string[];
  /** Detected HTTP client libraries (e.g. ["axios", "retrofit", "okhttp"]) */
  httpClients: string[];
  /** Detected test frameworks (e.g. ["jest", "junit5", "pytest"]) */
  testFrameworks: string[];
  /** Detected assertion libraries (e.g. ["assertj", "chai", "hamcrest"]) */
  assertionLibraries: string[];
  /** Detected security libraries (e.g. ["spring-security", "passport"]) */
  securityLibraries: string[];
  /** Detected performance testing tools (e.g. ["k6", "gatling", "locust"]) */
  performanceTools: string[];
  /** Detected mocking libraries (e.g. ["mockito", "mockk", "jest.mock", "sinon"]) */
  mockingLibraries: string[];
  /** Detected E2E testing frameworks (e.g. ["cypress", "playwright", "selenium"]) */
  e2eFrameworks: string[];
  /** All detected dependency names → version strings */
  dependencyVersions: Record<string, string>;
  /** Detected CI platform */
  ciPlatform: CiPlatform;
}

/**
 * A single parsed dependency entry from a manifest file.
 */
export interface ParsedDependency {
  name: string;
  version: string;
  scope: 'production' | 'development' | 'test' | 'build' | 'unknown';
  sourceFile: string;
}

/**
 * Result of parsing all manifest files in a project.
 */
export interface DependencyParseResult {
  dependencies: ParsedDependency[];
  manifestFiles: string[];
}
