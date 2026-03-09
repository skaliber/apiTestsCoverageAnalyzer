/**
 * tests/integration/examples.integration.test.ts
 *
 * Integration / smoke tests for the multi-language example projects (spec 20).
 *
 * Each test verifies:
 *  - The example directory exists
 *  - Required structural files are present (openapi.yaml, config.yaml,
 *    business-rules.yaml, integration-flows.yaml, README.md, Jenkinsfile,
 *    GitHub Actions workflow)
 *  - The analyzer can parse the OpenAPI spec and produce a report
 *
 * Tests that actually run the analyzer use the built dist/index.js so they
 * require `make build` to have run first. They are tagged `@integration` and
 * excluded from the fast unit-test run.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const EXAMPLES_ROOT = path.join(REPO_ROOT, 'examples');
const ANALYZER_BIN = path.join(REPO_ROOT, 'dist', 'src', 'index.js');

function examplePath(...segments: string[]): string {
  return path.join(EXAMPLES_ROOT, ...segments);
}

function exampleExists(name: string): boolean {
  return fs.existsSync(examplePath(name));
}

function fileExists(...segments: string[]): boolean {
  return fs.existsSync(examplePath(...segments));
}

function analyzerAvailable(): boolean {
  return fs.existsSync(ANALYZER_BIN);
}

function runAnalyzer(spec: string, tests: string, language: string, outDir: string): string {
  const cmd = [
    `node "${ANALYZER_BIN}"`,
    'endpoint-coverage',
    `--spec "${spec}"`,
    `--tests "${tests}"`,
    `--language ${language}`,
    '--format json',
  ].join(' ');
  // The CLI always writes to `reports/` relative to CWD.
  // By setting cwd=outDir the report lands at <outDir>/reports/endpoint-coverage.json.
  return execSync(cmd, { encoding: 'utf-8', timeout: 30_000, cwd: outDir });
}

// ─── Required example list ────────────────────────────────────────────────────

const REQUIRED_EXAMPLES = [
  'typescript',
  'java-spring-complex',
  'python-fastapi-complex',
  'ruby-rails-complex',
  'cucumber-ruby-complex',
  'cucumber-java-complex',
  'kotlin-ktor-complex',
  'javascript-node-express-complex',
];

// ─── Required files per example ───────────────────────────────────────────────

const REQUIRED_FILES: Record<string, string[]> = {
  typescript: [
    'openapi.yaml',
    'business-rules.yaml',
    'integration-flows.yaml',
    'README.md',
    'ci/jenkins/Jenkinsfile',
    '.github/workflows/ci.yml',
  ],
  'java-spring-complex': [
    'openapi.yaml',
    'config.yaml',
    'business-rules.yaml',
    'integration-flows.yaml',
    'README.md',
    'Jenkinsfile',
    '.github/workflows/analyze.yml',
  ],
  'python-fastapi-complex': [
    'openapi.yaml',
    'config.yaml',
    'business-rules.yaml',
    'integration-flows.yaml',
    'README.md',
    'Jenkinsfile',
    '.github/workflows/analyze.yml',
  ],
  'ruby-rails-complex': [
    'openapi.yaml',
    'config.yaml',
    'business-rules.yaml',
    'integration-flows.yaml',
    'README.md',
    'Jenkinsfile',
    '.github/workflows/analyze.yml',
  ],
  'cucumber-ruby-complex': [
    'openapi.yaml',
    'config.yaml',
    'business-rules.yaml',
    'integration-flows.yaml',
    'README.md',
    'Jenkinsfile',
    '.github/workflows/analyze.yml',
  ],
  'cucumber-java-complex': [
    'openapi.yaml',
    'config.yaml',
    'business-rules.yaml',
    'integration-flows.yaml',
    'README.md',
    'Jenkinsfile',
    '.github/workflows/analyze.yml',
  ],
  'kotlin-ktor-complex': [
    'openapi.yaml',
    'config.yaml',
    'business-rules.yaml',
    'integration-flows.yaml',
    'README.md',
    'Jenkinsfile',
    '.github/workflows/analyze.yml',
  ],
  'javascript-node-express-complex': [
    'openapi.yaml',
    'config.yaml',
    'business-rules.yaml',
    'integration-flows.yaml',
    'README.md',
    'Jenkinsfile',
    '.github/workflows/analyze.yml',
  ],
};

// ─── Analyzer config per example ─────────────────────────────────────────────

interface ExampleAnalysisConfig {
  /** Path to openapi spec, relative to example root */
  spec: string;
  /** Glob or path to test files, relative to example root */
  testsComplete: string;
  /** Language flag for analyzer */
  language: string;
}

const ANALYSIS_CONFIGS: Partial<Record<string, ExampleAnalysisConfig>> = {
  typescript: {
    spec: 'openapi.yaml',
    testsComplete: 'tests/**/*.ts',
    language: 'typescript',
  },
  'java-spring-complex': {
    spec: 'openapi.yaml',
    testsComplete: 'src/test/java/com/example/orders/tests-complete/**/*.java',
    language: 'java',
  },
  'python-fastapi-complex': {
    spec: 'openapi.yaml',
    testsComplete: 'tests/tests-complete/**/*.py',
    language: 'python',
  },
  'ruby-rails-complex': {
    spec: 'openapi.yaml',
    testsComplete: 'spec/requests/spec-complete/**/*_spec.rb',
    language: 'ruby',
  },
  'cucumber-ruby-complex': {
    spec: 'openapi.yaml',
    testsComplete: 'features/**/*.feature',
    language: 'ruby',
  },
  'cucumber-java-complex': {
    spec: 'openapi.yaml',
    testsComplete: 'src/test/resources/features/**/*.feature',
    language: 'java',
  },
  'kotlin-ktor-complex': {
    spec: 'openapi.yaml',
    testsComplete: 'src/test/kotlin/com/example/healthcare/tests-complete/**/*.kt',
    language: 'kotlin',
  },
  'javascript-node-express-complex': {
    spec: 'openapi.yaml',
    testsComplete: 'tests/tests-complete/**/*.test.js',
    language: 'javascript',
  },
};

// ─── Structure tests ──────────────────────────────────────────────────────────

describe('example projects — structural completeness', () => {
  it('examples/ root directory exists', () => {
    expect(fs.existsSync(EXAMPLES_ROOT)).toBe(true);
  });

  for (const name of REQUIRED_EXAMPLES) {
    it(`${name}/ directory exists`, () => {
      expect(exampleExists(name)).toBe(true);
    });
  }
});

describe('example projects — required files present', () => {
  for (const [name, files] of Object.entries(REQUIRED_FILES)) {
    describe(name, () => {
      for (const file of files) {
        it(`contains ${file}`, () => {
          const exists = fileExists(name, ...file.split('/'));
          if (!exampleExists(name)) {
            // Skip gracefully if the example dir was not created by the agent yet
            console.warn(`  SKIP: example directory ${name} does not exist yet`);
            return;
          }
          expect(exists).toBe(true);
        });
      }
    });
  }
});

// ─── OpenAPI spec validity tests ──────────────────────────────────────────────

describe('example projects — openapi.yaml is a valid YAML file', () => {
  for (const name of REQUIRED_EXAMPLES) {
    it(`${name}/openapi.yaml is parseable YAML`, () => {
      if (!exampleExists(name)) {
        console.warn(`  SKIP: ${name} directory does not exist`);
        return;
      }
      const specPath = examplePath(name, 'openapi.yaml');
      if (!fs.existsSync(specPath)) {
        // If the file doesn't exist yet, mark it as a failure with a clear message
        throw new Error(`${name}/openapi.yaml does not exist`);
      }
      const content = fs.readFileSync(specPath, 'utf-8');
      expect(content).toContain('openapi:');
      expect(content).toContain('paths:');
      expect(content.trim().length).toBeGreaterThan(200);
    });
  }
});

// ─── Business rules validity tests ────────────────────────────────────────────

describe('example projects — business-rules.yaml is non-empty', () => {
  for (const name of REQUIRED_EXAMPLES) {
    it(`${name}/business-rules.yaml has meaningful content`, () => {
      if (!exampleExists(name)) {
        console.warn(`  SKIP: ${name} directory does not exist`);
        return;
      }
      // TypeScript uses coverage.config.json instead of a standalone business-rules.yaml at root
      const rulesPath = examplePath(name, 'business-rules.yaml');
      if (!fs.existsSync(rulesPath)) {
        if (name === 'typescript') {
          // Acceptable — TypeScript example embeds rules in coverage.config.json
          return;
        }
        throw new Error(`${name}/business-rules.yaml does not exist`);
      }
      const content = fs.readFileSync(rulesPath, 'utf-8');
      expect(content.trim().length).toBeGreaterThan(100);
      // Should reference at least one rule ID or description
      expect(content).toMatch(/id:|description:|rule/i);
    });
  }
});

// ─── Integration flows validity tests ─────────────────────────────────────────

describe('example projects — integration-flows.yaml is non-empty', () => {
  for (const name of REQUIRED_EXAMPLES) {
    it(`${name}/integration-flows.yaml has meaningful content`, () => {
      if (!exampleExists(name)) {
        console.warn(`  SKIP: ${name} directory does not exist`);
        return;
      }
      const flowsPath = examplePath(name, 'integration-flows.yaml');
      if (!fs.existsSync(flowsPath)) {
        if (name === 'typescript') {
          // TypeScript example has integration-flows.yaml; still require it
        } else {
          throw new Error(`${name}/integration-flows.yaml does not exist`);
        }
      }
      const content = fs.readFileSync(flowsPath, 'utf-8');
      expect(content.trim().length).toBeGreaterThan(100);
      expect(content).toMatch(/flows:|FLOW|steps:/i);
    });
  }
});

// ─── README validity tests ─────────────────────────────────────────────────────

describe('example projects — README.md contains required sections', () => {
  const REQUIRED_SECTIONS = ['endpoint', 'analyzer', 'ci', 'coverage'];

  for (const name of REQUIRED_EXAMPLES) {
    it(`${name}/README.md covers key topics`, () => {
      if (!exampleExists(name)) {
        console.warn(`  SKIP: ${name} directory does not exist`);
        return;
      }
      const readmePath = examplePath(name, 'README.md');
      if (!fs.existsSync(readmePath)) {
        throw new Error(`${name}/README.md does not exist`);
      }
      const content = fs.readFileSync(readmePath, 'utf-8').toLowerCase();
      for (const section of REQUIRED_SECTIONS) {
        expect(content).toContain(section);
      }
    });
  }
});

// ─── CI config validity tests ─────────────────────────────────────────────────

describe('example projects — GitHub Actions workflow touches the analyzer', () => {
  for (const name of REQUIRED_EXAMPLES) {
    it(`${name} GitHub Actions workflow references analyze step`, () => {
      if (!exampleExists(name)) {
        console.warn(`  SKIP: ${name} directory does not exist`);
        return;
      }
      // TypeScript uses ci.yml, others use analyze.yml
      const candidates = [
        examplePath(name, '.github', 'workflows', 'analyze.yml'),
        examplePath(name, '.github', 'workflows', 'ci.yml'),
      ];
      const workflowPath = candidates.find((p) => fs.existsSync(p));
      if (!workflowPath) {
        throw new Error(`${name}: no GitHub Actions workflow found`);
      }
      const content = fs.readFileSync(workflowPath, 'utf-8').toLowerCase();
      expect(content).toMatch(/analyz|coverage|api-coverage/i);
    });
  }
});

describe('example projects — Jenkinsfile exists and references test/analyze stages', () => {
  for (const name of REQUIRED_EXAMPLES) {
    it(`${name} Jenkinsfile has Test and Analyze stages`, () => {
      if (!exampleExists(name)) {
        console.warn(`  SKIP: ${name} directory does not exist`);
        return;
      }
      // TypeScript uses ci/jenkins/Jenkinsfile, others use Jenkinsfile at root
      const candidates = [
        examplePath(name, 'Jenkinsfile'),
        examplePath(name, 'ci', 'jenkins', 'Jenkinsfile'),
      ];
      const jenkinspath = candidates.find((p) => fs.existsSync(p));
      if (!jenkinspath) {
        throw new Error(`${name}: no Jenkinsfile found`);
      }
      const content = fs.readFileSync(jenkinspath, 'utf-8');
      expect(content).toMatch(/[Tt]est|stage.*[Tt]est/);
      expect(content).toMatch(/[Aa]nalyz|coverage/i);
    });
  }
});

// ─── Analyzer smoke tests (requires built dist) ───────────────────────────────

describe('example projects — analyzer produces endpoint-coverage report @integration', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aca-examples-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Run the analyzer against each example that has a complete test suite
  for (const [exampleName, cfg] of Object.entries(ANALYSIS_CONFIGS)) {
    it(`${exampleName}: analyzer runs and produces a report`, () => {
      if (!cfg) return; // narrow: ANALYSIS_CONFIGS is Partial, cfg can be undefined
      if (!analyzerAvailable()) {
        console.warn('  SKIP: dist/src/index.js not available — run make build first');
        return;
      }
      if (!exampleExists(exampleName)) {
        console.warn(`  SKIP: ${exampleName} directory does not exist`);
        return;
      }

      const exampleRoot = examplePath(exampleName);
      const specAbsolute = path.join(exampleRoot, cfg.spec);
      if (!fs.existsSync(specAbsolute)) {
        console.warn(`  SKIP: ${exampleName}/openapi.yaml does not exist`);
        return;
      }

      const exampleOutDir = path.join(tmpDir, exampleName);
      fs.mkdirSync(exampleOutDir, { recursive: true });

      const testsAbsolute = path.join(exampleRoot, cfg.testsComplete);

      // Run analyzer — allow non-zero exit (coverage < threshold is OK in this smoke test)
      try {
        runAnalyzer(specAbsolute, testsAbsolute, cfg.language, exampleOutDir);
      } catch {
        // Non-zero exit is acceptable for coverage threshold misses;
        // we only care that a report was produced.
      }

      // The CLI writes to <cwd>/reports/endpoint-coverage.json
      const reportPath = path.join(exampleOutDir, 'reports', 'endpoint-coverage.json');
      expect(fs.existsSync(reportPath)).toBe(true);

      if (fs.existsSync(reportPath)) {
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
        expect(report).toHaveProperty('total');
        expect(typeof report.total).toBe('number');
        expect(report.total).toBeGreaterThan(0);
      }
    });
  }
});

// ─── Coverage journey tests ───────────────────────────────────────────────────

describe('example projects — coverage journey: initial vs complete test suites', () => {
  const JOURNEY_EXAMPLES: Array<{ name: string; initialGlob: string; completeGlob: string; language: string }> = [
    {
      name: 'java-spring-complex',
      initialGlob: 'src/test/java/com/example/orders/tests-initial/**/*.java',
      completeGlob: 'src/test/java/com/example/orders/tests-complete/**/*.java',
      language: 'java',
    },
    {
      name: 'python-fastapi-complex',
      initialGlob: 'tests/tests-initial/**/*.py',
      completeGlob: 'tests/tests-complete/**/*.py',
      language: 'python',
    },
    {
      name: 'ruby-rails-complex',
      initialGlob: 'spec/requests/spec-initial/**/*_spec.rb',
      completeGlob: 'spec/requests/spec-complete/**/*_spec.rb',
      language: 'ruby',
    },
    {
      name: 'kotlin-ktor-complex',
      initialGlob: 'src/test/kotlin/com/example/healthcare/tests-initial/**/*.kt',
      completeGlob: 'src/test/kotlin/com/example/healthcare/tests-complete/**/*.kt',
      language: 'kotlin',
    },
    {
      name: 'javascript-node-express-complex',
      initialGlob: 'tests/tests-initial/**/*.test.js',
      completeGlob: 'tests/tests-complete/**/*.test.js',
      language: 'javascript',
    },
  ];

  for (const ex of JOURNEY_EXAMPLES) {
    it(`${ex.name}: tests-complete dir has MORE test files than tests-initial dir`, () => {
      if (!exampleExists(ex.name)) {
        console.warn(`  SKIP: ${ex.name} does not exist`);
        return;
      }
      const exRoot = examplePath(ex.name);
      const initialPath = path.join(exRoot, ex.initialGlob.split('/**')[0]);
      const completePath = path.join(exRoot, ex.completeGlob.split('/**')[0]);

      if (!fs.existsSync(initialPath) || !fs.existsSync(completePath)) {
        console.warn(`  SKIP: ${ex.name} initial/complete test directories not yet in place`);
        return;
      }

      function countFiles(dir: string): number {
        if (!fs.existsSync(dir)) return 0;
        let count = 0;
        for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true } as any) as any[]) {
          if (entry.isFile && !entry.isDirectory()) count++;
          else if (typeof entry === 'string') count++;
        }
        return count;
      }

      // Use a simple recursive glob count
      function countFilesDeep(dir: string): number {
        if (!fs.existsSync(dir)) return 0;
        let count = 0;
        const stack = [dir];
        while (stack.length) {
          const current = stack.pop()!;
          const entries = fs.readdirSync(current, { withFileTypes: true });
          for (const e of entries) {
            if (e.isDirectory()) stack.push(path.join(current, e.name));
            else count++;
          }
        }
        return count;
      }

      const initialCount = countFilesDeep(initialPath);
      const completeCount = countFilesDeep(completePath);
      expect(completeCount).toBeGreaterThan(initialCount);
    });
  }
});
