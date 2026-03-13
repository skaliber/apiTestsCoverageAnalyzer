/**
 * Agnostic Project Discovery Engine
 *
 * Scans the repository tree, classifies files, detects languages and test
 * frameworks, and groups artifacts by function so each analysis pipeline
 * receives the right inputs — even when no configuration file exists.
 *
 * Discovery pipeline:
 *   project root → file system scan → file classification →
 *   artifact grouping → language detection → framework detection
 */

import * as fs from 'fs';
import * as path from 'path';
import { classifyFile, ClassifiedFile, FileCategory } from './fileClassifier';
import { detectApiFrameworks, DetectedApiFramework, ApiFrameworkName } from './frameworkDetector';

export type { DetectedApiFramework, ApiFrameworkName } from './frameworkDetector';

// ─── Public types ─────────────────────────────────────────────────────────────

export type DetectedLanguage =
  | 'java'
  | 'kotlin'
  | 'python'
  | 'ruby'
  | 'javascript'
  | 'typescript'
  | 'go'
  | 'csharp';

export type DetectedFramework =
  // Java
  | 'junit'
  | 'testng'
  | 'restassured'
  // Python
  | 'pytest'
  | 'unittest'
  // Ruby
  | 'rspec'
  | 'minitest'
  // JavaScript / TypeScript
  | 'jest'
  | 'mocha'
  | 'cypress'
  | 'playwright'
  // BDD
  | 'cucumber'
  | 'gherkin';

export interface DiscoveredArtifacts {
  /** Detected project root */
  projectRoot: string;
  /** All classified files found under the root */
  allFiles: ClassifiedFile[];
  /** OpenAPI / Swagger definition files */
  specs: string[];
  /** Test source files (test_code + bdd_scenarios) */
  testFiles: string[];
  /** BDD feature files specifically */
  featureFiles: string[];
  /** Contract files (Pact, etc.) */
  contractFiles: string[];
  /** Performance test result files (JMeter, k6, etc.) */
  performanceFiles: string[];
  /** Security scan report files */
  securityReportFiles: string[];
  /** Service source code files */
  serviceFiles: string[];
  /** Detected programming languages */
  languages: DetectedLanguage[];
  /** Detected test frameworks */
  frameworks: DetectedFramework[];
  /** Detected API frameworks (Feature 27 — structure-agnostic detection) */
  apiFrameworks: DetectedApiFramework[];
  /** Whether each artifact type was explicitly configured vs auto-discovered */
  discoverySource: Record<keyof Omit<DiscoveredArtifacts, 'allFiles' | 'projectRoot' | 'discoverySource' | 'languages' | 'frameworks' | 'apiFrameworks'>, 'explicit' | 'discovered'>;
}

export interface DiscoveryOptions {
  /** Root directory to scan. Defaults to process.cwd() */
  rootDir?: string;
  /**
   * Directories to exclude from the scan.
   * Defaults to node_modules, .git, dist, build, target, .cache, coverage
   */
  excludeDirs?: string[];
  /** Maximum depth for recursive scan. Defaults to 20 */
  maxDepth?: number;
  /** If provided, these paths override the auto-discovered spec files */
  explicitSpecs?: string[];
  /** If provided, these paths override the auto-discovered test files */
  explicitTests?: string[];
  /** If provided, these paths override the auto-discovered contract files */
  explicitContracts?: string[];
}

// ─── Default exclude list ─────────────────────────────────────────────────────

const DEFAULT_EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  '.cache',
  'coverage',
  '.nyc_output',
  '__pycache__',
  '.pytest_cache',
  '.tox',
  'vendor',
  '.bundle',
  '.gradle',
]);

// ─── Language detection ───────────────────────────────────────────────────────

/** Map build-file basenames to language */
const BUILD_FILE_LANGUAGE_MAP: Record<string, DetectedLanguage[]> = {
  'pom.xml':          ['java'],
  'build.gradle':     ['java', 'kotlin'],
  'build.gradle.kts': ['kotlin'],
  'settings.gradle':  ['java', 'kotlin'],
  'gradlew':          ['java', 'kotlin'],
  'package.json':     ['javascript', 'typescript'],
  'requirements.txt': ['python'],
  'setup.py':         ['python'],
  'setup.cfg':        ['python'],
  'pyproject.toml':   ['python'],
  'Gemfile':          ['ruby'],
  'go.mod':           ['go'],
  '*.csproj':         ['csharp'],
};

const EXTENSION_LANGUAGE_MAP: Record<string, DetectedLanguage> = {
  '.java': 'java',
  '.kt':   'kotlin',
  '.kts':  'kotlin',
  '.py':   'python',
  '.rb':   'ruby',
  '.js':   'javascript',
  '.jsx':  'javascript',
  '.mjs':  'javascript',
  '.ts':   'typescript',
  '.tsx':  'typescript',
  '.go':   'go',
  '.cs':   'csharp',
};

// ─── Framework detection ──────────────────────────────────────────────────────

/**
 * Detect test frameworks from test file contents (first 4 KB).
 * This is a deliberate regex-based heuristic — fast for CI usage.
 */
function detectFrameworksFromContent(content: string): DetectedFramework[] {
  const found: DetectedFramework[] = [];
  if (/import\s+.*JUnit|@Test\b|@RunWith/.test(content))  found.push('junit');
  if (/testng|@Test.*groups/.test(content))                found.push('testng');
  if (/RestAssured|given\(\)|when\(\)|then\(\)/.test(content)) found.push('restassured');
  if (/import\s+pytest|def\s+test_/.test(content))        found.push('pytest');
  if (/import\s+unittest|class\s+\w+\(.*TestCase\)/.test(content)) found.push('unittest');
  if (/RSpec\.describe|describe\s+['"]/.test(content))    found.push('rspec');
  if (/Minitest::Test|test\s+"/.test(content))            found.push('minitest');
  if (/describe\(|it\(|expect\(|jest\./.test(content))   found.push('jest');
  if (/require\('mocha'\)|describe\(.*done\)|it\(.*done/.test(content)) found.push('mocha');
  if (/cy\.|Cypress\./.test(content))                     found.push('cypress');
  if (/test\.goto|page\.click|playwright/.test(content))  found.push('playwright');
  if (/Given|When|Then|Scenario:/.test(content))          found.push('cucumber');
  return found;
}

// ─── File system scanner ─────────────────────────────────────────────────────

/**
 * Recursively collect all file paths under `dir`, respecting excludes and depth.
 */
function scanDirectory(
  dir: string,
  excludeDirs: Set<string>,
  maxDepth: number,
  currentDepth = 0,
): string[] {
  if (currentDepth > maxDepth) return [];
  let results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!excludeDirs.has(entry.name)) {
        results = results.concat(scanDirectory(fullPath, excludeDirs, maxDepth, currentDepth + 1));
      }
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── Discovery engine ─────────────────────────────────────────────────────────

/**
 * Discover all project artifacts from `rootDir`.
 *
 * When explicit inputs are provided (e.g. from config.yaml), they are used
 * directly and the corresponding discovery step is skipped. This ensures
 * "always discovers" behaviour while respecting explicit configuration.
 */
export function discoverProject(options: DiscoveryOptions = {}): DiscoveredArtifacts {
  const rootDir  = options.rootDir ?? process.cwd();
  const excludeDirs: Set<string> = new Set([
    ...DEFAULT_EXCLUDE_DIRS,
    ...(options.excludeDirs ?? []),
  ]);
  const maxDepth = options.maxDepth ?? 20;

  // ── Scan + classify ────────────────────────────────────────────────────────
  const rawPaths    = scanDirectory(rootDir, excludeDirs, maxDepth);
  const allFiles    = rawPaths.map(classifyFile);

  const byCategory  = groupByCategory(allFiles);

  // ── Artifact resolution ────────────────────────────────────────────────────
  const discoverySource: DiscoveredArtifacts['discoverySource'] = {
    specs:               'discovered',
    testFiles:           'discovered',
    featureFiles:        'discovered',
    contractFiles:       'discovered',
    performanceFiles:    'discovered',
    securityReportFiles: 'discovered',
    serviceFiles:        'discovered',
  };

  let specs = paths(byCategory.specification ?? []);
  if (options.explicitSpecs && options.explicitSpecs.length > 0) {
    specs = options.explicitSpecs;
    discoverySource.specs = 'explicit';
  }

  const featureFiles = paths(byCategory.bdd_scenarios ?? []);

  let testFiles = [
    ...paths(byCategory.test_code ?? []),
    ...featureFiles,
  ];
  if (options.explicitTests && options.explicitTests.length > 0) {
    testFiles = options.explicitTests;
    discoverySource.testFiles    = 'explicit';
    discoverySource.featureFiles = 'explicit';
  }

  let contractFiles = paths(byCategory.contracts ?? []);
  if (options.explicitContracts && options.explicitContracts.length > 0) {
    contractFiles = options.explicitContracts;
    discoverySource.contractFiles = 'explicit';
  }

  const performanceFiles    = paths(byCategory.performance      ?? []);
  const securityReportFiles = paths(byCategory.security_reports ?? []);
  const serviceFiles        = paths(byCategory.service_code     ?? []);

  // ── Language detection ─────────────────────────────────────────────────────
  const languages = detectLanguages(rawPaths);

  // ── Framework detection ────────────────────────────────────────────────────
  const frameworks = detectFrameworks(testFiles);

  // Add 'cucumber' when feature files are present
  if (featureFiles.length > 0 && !frameworks.includes('cucumber')) {
    frameworks.push('cucumber');
  }

  // ── API framework detection (Feature 27) ─────────────────────────────────
  const apiFrameworks = detectApiFrameworks([...serviceFiles, ...testFiles]);

  return {
    projectRoot:         rootDir,
    allFiles,
    specs,
    testFiles,
    featureFiles,
    contractFiles,
    performanceFiles,
    securityReportFiles,
    serviceFiles,
    languages:           [...new Set(languages)],
    frameworks:          [...new Set(frameworks)],
    apiFrameworks,
    discoverySource,
  };
}

// ─── Language detection helpers ───────────────────────────────────────────────

function detectLanguages(filePaths: string[]): DetectedLanguage[] {
  const found = new Set<DetectedLanguage>();

  for (const fp of filePaths) {
    const basename = path.basename(fp);
    const ext      = path.extname(fp);

    // Check build file mapping
    const byBuild = BUILD_FILE_LANGUAGE_MAP[basename];
    if (byBuild) {
      byBuild.forEach((lang) => found.add(lang));
    }

    // Check extension mapping
    const byExt = EXTENSION_LANGUAGE_MAP[ext];
    if (byExt) {
      found.add(byExt);
    }
  }

  return [...found];
}

// ─── Framework detection helpers ──────────────────────────────────────────────

function detectFrameworks(testFilePaths: string[]): DetectedFramework[] {
  const found = new Set<DetectedFramework>();
  // Sample up to 50 test files to limit I/O
  const sample = testFilePaths.slice(0, 50);
  for (const fp of sample) {
    try {
      const content = fs.readFileSync(fp, 'utf-8').slice(0, 4096);
      for (const fw of detectFrameworksFromContent(content)) {
        found.add(fw);
      }
    } catch {
      // skip unreadable files
    }
  }
  return [...found];
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function groupByCategory(files: ClassifiedFile[]): Partial<Record<FileCategory, ClassifiedFile[]>> {
  const groups: Partial<Record<FileCategory, ClassifiedFile[]>> = {};
  for (const f of files) {
    if (!groups[f.category]) groups[f.category] = [];
    groups[f.category]!.push(f);
  }
  return groups;
}

function paths(files: ClassifiedFile[]): string[] {
  return files.map((f) => f.filePath);
}
