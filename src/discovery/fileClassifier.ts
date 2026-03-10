/**
 * File Classification Engine
 *
 * Determines the role of each file in the project. Only files classified as
 * `test_code` or `bdd_scenarios` may contribute to coverage evidence.
 *
 * Specification files, metadata files (business rules, integration flows),
 * and configuration files are explicitly excluded from coverage calculations.
 */

import * as path from 'path';

// ─── Public types ─────────────────────────────────────────────────────────────

export type FileCategory =
  | 'specification'    // OpenAPI / Swagger definitions
  | 'service_code'     // Application source code
  | 'test_code'        // Unit / integration / E2E test files
  | 'bdd_scenarios'    // Cucumber / Gherkin feature files
  | 'contracts'        // Contract testing artifacts (Pact, etc.)
  | 'performance'      // Load testing artifacts (JMeter, k6, etc.)
  | 'security_reports' // Security scanning outputs (ZAP, Trivy, etc.)
  | 'configuration'    // Analyzer or project configuration files
  | 'metadata'         // Business rule / integration flow definitions
  | 'unknown';

export interface ClassifiedFile {
  filePath: string;
  category: FileCategory;
  /** True only when category is test_code or bdd_scenarios */
  isCoverageEvidence: boolean;
}

/** Files that must NEVER contribute to coverage evidence */
export const COVERAGE_EVIDENCE_CATEGORIES: ReadonlySet<FileCategory> = new Set([
  'test_code',
  'bdd_scenarios',
]);

// ─── Classification rules ────────────────────────────────────────────────────

/** Basename/path patterns for specification files */
const SPEC_BASENAMES = new Set([
  'openapi.yaml',
  'openapi.yml',
  'openapi.json',
  'swagger.yaml',
  'swagger.yml',
  'swagger.json',
]);

/** Basename patterns that match when the file name includes one of these */
const SPEC_INCLUDES = ['openapi', 'swagger'];

/** Basename patterns for metadata files (rules / flows / contracts) */
const METADATA_BASENAMES = new Set([
  'business-rules.yaml',
  'business-rules.yml',
  'business-rules.json',
  'integration-flows.yaml',
  'integration-flows.yml',
  'integration-flows.json',
]);

/** Basename patterns for analyzer / project configuration */
const CONFIG_BASENAMES = new Set([
  'qintel-analyzer.yaml',
  'qintel-analyzer.yml',
  'config.yaml',
  'config.yml',
  'coverage.config.json',
  'package.json',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'requirements.txt',
  'Gemfile',
  'Gemfile.lock',
  'tsconfig.json',
  'jest.config.js',
  'jest.config.ts',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.yaml',
  '.eslintrc.yml',
]);

/** Extensions mapped directly to a category */
const EXTENSION_MAP: Record<string, FileCategory> = {
  '.feature': 'bdd_scenarios',
};

/** Glob-style path-segment patterns for security reports */
const SECURITY_REPORT_DIRS = ['zap', 'trivy', 'semgrep'];

/** Glob-style path-segment patterns for performance artifacts */
const PERFORMANCE_DIRS = ['jmeter', 'k6', 'gatling', 'locust'];

/** Extensions for contract files */
const CONTRACT_EXTENSIONS = new Set(['.pact.json']);

// ─── Core classifier ─────────────────────────────────────────────────────────

/**
 * Classify a single file path into a `FileCategory`.
 *
 * Classification priority (first match wins):
 *  1. Known specification basenames / includes
 *  2. Known metadata basenames
 *  3. Known configuration basenames
 *  4. `.feature` extension → bdd_scenarios
 *  5. Contract path patterns
 *  6. Security report directory patterns
 *  7. Performance artifact directory patterns
 *  8. Test file name patterns (*.test.*, *.spec.*, *Test.*, *Tests.*, *Spec.*)
 *  9. Remaining source extensions → service_code
 * 10. Fallback → unknown
 */
export function classifyFile(filePath: string): ClassifiedFile {
  const basename = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
  const segments = normalizedPath.split('/');

  // 1. Specification
  if (SPEC_BASENAMES.has(basename)) {
    return make(filePath, 'specification');
  }
  for (const inc of SPEC_INCLUDES) {
    if (basename.includes(inc) && (ext === '.yaml' || ext === '.yml' || ext === '.json')) {
      return make(filePath, 'specification');
    }
  }

  // 2. Metadata (business rules / integration flows)
  if (METADATA_BASENAMES.has(basename)) {
    return make(filePath, 'metadata');
  }

  // 3. Configuration
  if (CONFIG_BASENAMES.has(basename) || ext === '.env' || basename.endsWith('.config.json') || basename.endsWith('.config.js') || basename.endsWith('.config.ts')) {
    return make(filePath, 'configuration');
  }

  // 4. BDD feature files
  if (ext === '.feature') {
    return make(filePath, 'bdd_scenarios');
  }

  // 5. Contract files (*.pact.json, contracts/**/*.json)
  if (basename.endsWith('.pact.json')) {
    return make(filePath, 'contracts');
  }
  if (segments.includes('contracts') && ext === '.json') {
    return make(filePath, 'contracts');
  }

  // 6. Security reports
  for (const dir of SECURITY_REPORT_DIRS) {
    if (segments.includes(dir) && ext === '.json') {
      return make(filePath, 'security_reports');
    }
  }

  // 7. Performance artifacts
  for (const dir of PERFORMANCE_DIRS) {
    if (segments.includes(dir) && (ext === '.jtl' || ext === '.json' || ext === '.csv')) {
      return make(filePath, 'performance');
    }
  }

  // 8. Test code — matches *.test.*, *.spec.*, *Test.*, *Tests.*, *Spec.*
  const basenameOriginal = path.basename(filePath);
  if (isTestFile(basenameOriginal)) {
    return make(filePath, 'test_code');
  }

  // 9. Service code by extension
  const SERVICE_CODE_EXTS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.java', '.kt', '.kts',
    '.py',
    '.rb',
    '.go',
    '.cs',
    '.cpp', '.cc', '.h',
    '.rs',
  ]);
  if (SERVICE_CODE_EXTS.has(ext)) {
    return make(filePath, 'service_code');
  }

  // 10. Unknown
  return make(filePath, 'unknown');
}

/**
 * Classify multiple file paths at once.
 */
export function classifyFiles(filePaths: string[]): ClassifiedFile[] {
  return filePaths.map(classifyFile);
}

/**
 * Filter a list of classified files to only those that may contribute to
 * coverage evidence (test_code and bdd_scenarios).
 */
export function filterCoverageEvidence(files: ClassifiedFile[]): ClassifiedFile[] {
  return files.filter((f) => COVERAGE_EVIDENCE_CATEGORIES.has(f.category));
}

/**
 * Return true if this file basename looks like a test file.
 * Supports patterns: *.test.*, *.spec.*, *Test.java, *Tests.java, *Spec.*,
 * test_*.py, *_test.py, *_spec.rb, spec/**
 */
export function isTestFile(basename: string): boolean {
  // Exact extension-based patterns
  if (/\.(test|spec)\.[a-zA-Z]+$/.test(basename)) return true;
  // Java / Kotlin test class conventions
  if (/Test\.(java|kt|kts)$/.test(basename)) return true;
  if (/Tests\.(java|kt|kts)$/.test(basename)) return true;
  if (/Spec\.(java|kt|kts|rb|ts|js)$/.test(basename)) return true;
  // Python conventions
  if (/^test_/.test(basename)) return true;
  if (/_test\.py$/.test(basename)) return true;
  // Ruby conventions
  if (/_spec\.rb$/.test(basename)) return true;
  return false;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function make(filePath: string, category: FileCategory): ClassifiedFile {
  return {
    filePath,
    category,
    isCoverageEvidence: COVERAGE_EVIDENCE_CATEGORIES.has(category),
  };
}
