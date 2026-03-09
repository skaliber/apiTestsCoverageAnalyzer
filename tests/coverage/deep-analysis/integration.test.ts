/**
 * Integration tests for the deep code analysis feature.
 *
 * Tests verify that deepResolveFile correctly resolves HTTP calls from
 * TypeScript, Python, and Java fixture files using the following resolution
 * strategies: constant, enum, string-template, and wrapper-method. Assertion
 * linkage and the enabled=false early-exit path are also verified.
 *
 * Run: npx jest tests/coverage/deep-analysis/integration.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { deepResolveFile, DEFAULT_DEEP_ANALYSIS_CONFIG } from '../../../src/coverage/deep-analysis/index';
import type { ResolvedHttpCall } from '../../../src/coverage/deep-analysis/index';

// ─── Fixture paths ─────────────────────────────────────────────────────────────

const FIXTURES_ROOT = path.join(__dirname, '../../fixtures/deep-analysis');

const TS_CONSTANTS_FILE = path.join(FIXTURES_ROOT, 'typescript/tests/constants.test.ts');
const TS_TEMPLATES_FILE = path.join(FIXTURES_ROOT, 'typescript/tests/templates.test.ts');
const TS_WRAPPERS_FILE  = path.join(FIXTURES_ROOT, 'typescript/tests/wrappers.test.ts');
const PY_CONSTANTS_FILE = path.join(FIXTURES_ROOT, 'python/tests/test_constants.py');
const JAVA_TEST_FILE    = path.join(FIXTURES_ROOT, 'java/tests/UserApiTest.java');

// ─── Fixture content (loaded once) ────────────────────────────────────────────

let tsConstantsContent: string;
let tsTemplatesContent: string;
let tsWrappersContent: string;
let pyConstantsContent: string;
let javaTestContent: string;

beforeAll(() => {
  tsConstantsContent = fs.readFileSync(TS_CONSTANTS_FILE, 'utf-8');
  tsTemplatesContent = fs.readFileSync(TS_TEMPLATES_FILE, 'utf-8');
  tsWrappersContent  = fs.readFileSync(TS_WRAPPERS_FILE,  'utf-8');
  pyConstantsContent = fs.readFileSync(PY_CONSTANTS_FILE, 'utf-8');
  javaTestContent    = fs.readFileSync(JAVA_TEST_FILE,    'utf-8');
});

// ─── 1. TypeScript — constant resolution ──────────────────────────────────────

describe('deepResolveFile – TypeScript constant resolution', () => {
  let results: ResolvedHttpCall[];

  beforeAll(() => {
    results = deepResolveFile(tsConstantsContent, TS_CONSTANTS_FILE, 'typescript');
  });

  it('resolves USERS_PATH constant to GET /users', () => {
    const call = results.find(
      (r) => r.resolutionType === 'constant' && r.method === 'GET' && r.path === '/users',
    );
    expect(call).toBeDefined();
  });

  it('resolution type is constant for USERS_PATH call', () => {
    const call = results.find(
      (r) => r.resolutionType === 'constant' && r.method === 'GET',
    );
    expect(call?.resolutionType).toBe('constant');
  });

  it('confidence is high for a fully resolved constant path', () => {
    const call = results.find(
      (r) => r.resolutionType === 'constant' && r.method === 'GET' && r.path === '/users',
    );
    expect(call?.confidence).toBe('high');
  });

  it('sourceFile is set to the provided file path', () => {
    const call = results.find((r) => r.resolutionType === 'constant');
    expect(call?.sourceFile).toBe(TS_CONSTANTS_FILE);
  });

  it('sourceLanguage reflects the typescript language argument', () => {
    const call = results.find((r) => r.resolutionType === 'constant');
    expect(call?.sourceLanguage).toBe('typescript');
  });
});

// ─── 2. TypeScript — enum resolution ──────────────────────────────────────────

describe('deepResolveFile – TypeScript enum resolution', () => {
  let results: ResolvedHttpCall[];

  beforeAll(() => {
    results = deepResolveFile(tsConstantsContent, TS_CONSTANTS_FILE, 'typescript');
  });

  it('resolves Routes.USER_BY_ID enum to GET /users/{id}', () => {
    const call = results.find(
      (r) => r.resolutionType === 'enum' && r.method === 'GET',
    );
    expect(call).toBeDefined();
    expect(call?.path).toBe('/users/{id}');
  });

  it('enum resolution type is enum', () => {
    const call = results.find((r) => r.resolutionType === 'enum');
    expect(call?.resolutionType).toBe('enum');
  });

  it('enum resolved path matches the OpenAPI path template', () => {
    const call = results.find(
      (r) => r.resolutionType === 'enum' && r.path === '/users/{id}',
    );
    expect(call).toBeDefined();
  });

  it('both constant and enum results appear in the same file analysis', () => {
    const hasConstant = results.some((r) => r.resolutionType === 'constant');
    const hasEnum     = results.some((r) => r.resolutionType === 'enum');
    expect(hasConstant).toBe(true);
    expect(hasEnum).toBe(true);
  });
});

// ─── 3. TypeScript — string-template resolution ────────────────────────────────

describe('deepResolveFile – TypeScript string-template resolution', () => {
  let results: ResolvedHttpCall[];

  beforeAll(() => {
    results = deepResolveFile(tsTemplatesContent, TS_TEMPLATES_FILE, 'typescript');
  });

  it('resolves inline template literal to a GET call containing /users/', () => {
    const call = results.find(
      (r) => r.resolutionType === 'string-template' && r.method === 'GET',
    );
    expect(call).toBeDefined();
    expect(call?.path).toContain('/users/');
  });

  it('resolution type is string-template for inline template literal call', () => {
    const call = results.find((r) => r.resolutionType === 'string-template');
    expect(call?.resolutionType).toBe('string-template');
  });

  it('resolved template path contains a numeric ID that normalizes to {id}', () => {
    const call = results.find((r) => r.resolutionType === 'string-template');
    // BASE resolves to '', userId resolves to '123', so path is /users/123
    // normalizePathToTemplate converts /users/123 → /users/{id}
    expect(call?.normalizedPath).toBe('/users/{id}');
  });

  it('confidence is high when the template fully resolves to a concrete path', () => {
    const call = results.find((r) => r.resolutionType === 'string-template');
    // BASE='' + /users/ + userId='123' fully resolves; no unresolved {vars} remain
    expect(call?.confidence).toBe('high');
  });
});

// ─── 4. TypeScript — wrapper-method resolution ────────────────────────────────

describe('deepResolveFile – TypeScript wrapper-method resolution', () => {
  let results: ResolvedHttpCall[];

  beforeAll(() => {
    results = deepResolveFile(tsWrappersContent, TS_WRAPPERS_FILE, 'typescript');
  });

  it('resolves the getUser helper wrapper to a GET call', () => {
    const call = results.find((r) => r.resolutionType === 'wrapper-method');
    expect(call).toBeDefined();
    expect(call?.method).toBe('GET');
  });

  it('resolution type is wrapper-method for helper function call', () => {
    const call = results.find((r) => r.resolutionType === 'wrapper-method');
    expect(call?.resolutionType).toBe('wrapper-method');
  });

  it('wrapper-resolved path contains the expected /users/ segment', () => {
    const call = results.find((r) => r.resolutionType === 'wrapper-method');
    expect(call?.path).toContain('/users/');
  });
});

// ─── 5. Python — constant resolution ──────────────────────────────────────────

describe('deepResolveFile – Python constant resolution', () => {
  let results: ResolvedHttpCall[];

  beforeAll(() => {
    results = deepResolveFile(pyConstantsContent, PY_CONSTANTS_FILE, 'python');
  });

  it('resolves USERS_PATH constant to GET /users in Python', () => {
    const call = results.find(
      (r) => r.resolutionType === 'constant' && r.method === 'GET' && r.path === '/users',
    );
    expect(call).toBeDefined();
  });

  it('Python constant resolution confidence is high', () => {
    const call = results.find(
      (r) => r.resolutionType === 'constant' && r.method === 'GET',
    );
    expect(call?.confidence).toBe('high');
  });

  it('Python source language is tagged on resolved calls', () => {
    const call = results.find((r) => r.resolutionType === 'constant');
    expect(call?.sourceLanguage).toBe('python');
  });
});

// ─── 6. Python — f-string template resolution ─────────────────────────────────

describe('deepResolveFile – Python f-string template resolution', () => {
  // Inline Python content with an f-string directly inside the HTTP call
  const pyFstringContent = `
BASE_URL = ""
USER_ID = "42"

def test_get_user(client):
    response = client.get(f"/users/{USER_ID}")
    assert response.status_code == 200
`;

  it('resolves an inline Python f-string call to a GET endpoint', () => {
    const results = deepResolveFile(pyFstringContent, '/fixtures/test_fstring.py', 'python');
    const call = results.find(
      (r) => r.resolutionType === 'string-template' && r.method === 'GET',
    );
    expect(call).toBeDefined();
    expect(call?.path).toContain('/users/');
  });

  it('Python f-string resolution type is string-template', () => {
    const results = deepResolveFile(pyFstringContent, '/fixtures/test_fstring.py', 'python');
    const call = results.find((r) => r.resolutionType === 'string-template');
    expect(call?.resolutionType).toBe('string-template');
  });
});

// ─── 7. Java — static constant resolution ────────────────────────────────────

describe('deepResolveFile – Java static constant resolution', () => {
  let results: ResolvedHttpCall[];

  beforeAll(() => {
    results = deepResolveFile(javaTestContent, JAVA_TEST_FILE, 'java');
  });

  it('resolves USERS_PATH static final constant to GET /users', () => {
    const call = results.find(
      (r) => r.resolutionType === 'constant' && r.method === 'GET' && r.path === '/users',
    );
    expect(call).toBeDefined();
  });

  it('Java constant resolution confidence is high', () => {
    const call = results.find(
      (r) => r.resolutionType === 'constant' && r.method === 'GET',
    );
    expect(call?.confidence).toBe('high');
  });

  it('Java source language is tagged on resolved calls', () => {
    const call = results.find((r) => r.resolutionType === 'constant');
    expect(call?.sourceLanguage).toBe('java');
  });
});

// ─── 8. Assertion linkage ─────────────────────────────────────────────────────

describe('deepResolveFile – assertion linkage', () => {
  // Use a content string where the literal path + expect() on response are visible
  // Avoid the `await` keyword so that extractResponseVariables can match the pattern
  const linkedContent = `
const response = client.get('/users');
expect(response.status).toBe(200);
`;

  it('assertionLinked is true when expect() on the response variable follows the call', () => {
    const results = deepResolveFile(linkedContent, '/test/linked.test.ts', 'typescript');
    const call = results.find((r) => r.assertionLinked === true);
    expect(call).toBeDefined();
  });

  it('the assertion-linked call has the correct HTTP method and path', () => {
    const results = deepResolveFile(linkedContent, '/test/linked.test.ts', 'typescript');
    const call = results.find((r) => r.assertionLinked === true);
    expect(call?.method).toBe('GET');
    expect(call?.path).toBe('/users');
  });

  it('Python assert statement links assertion to the response variable', () => {
    const pyLinked = `
response = client.get('/users')
assert response.status_code == 200
`;
    const results = deepResolveFile(pyLinked, '/test/test_linked.py', 'python');
    const call = results.find((r) => r.assertionLinked === true);
    expect(call).toBeDefined();
  });
});

// ─── 9. enabled=false disables analysis ───────────────────────────────────────

describe('deepResolveFile – deepAnalysis enabled=false', () => {
  it('returns an empty array when enabled is false for TypeScript content', () => {
    const results = deepResolveFile(
      tsConstantsContent,
      TS_CONSTANTS_FILE,
      'typescript',
      { ...DEFAULT_DEEP_ANALYSIS_CONFIG, enabled: false },
    );
    expect(results).toEqual([]);
  });

  it('returns an empty array when enabled is false for Python content', () => {
    const results = deepResolveFile(
      pyConstantsContent,
      PY_CONSTANTS_FILE,
      'python',
      { ...DEFAULT_DEEP_ANALYSIS_CONFIG, enabled: false },
    );
    expect(results).toEqual([]);
  });

  it('returns an empty array when enabled is false for Java content', () => {
    const results = deepResolveFile(
      javaTestContent,
      JAVA_TEST_FILE,
      'java',
      { ...DEFAULT_DEEP_ANALYSIS_CONFIG, enabled: false },
    );
    expect(results).toEqual([]);
  });
});

// ─── 10. Confidence level assertions ─────────────────────────────────────────

describe('deepResolveFile – confidence levels', () => {
  it('all constant-resolved TypeScript calls have high confidence', () => {
    const results = deepResolveFile(tsConstantsContent, TS_CONSTANTS_FILE, 'typescript');
    const constantCalls = results.filter((r) => r.resolutionType === 'constant');
    expect(constantCalls.length).toBeGreaterThan(0);
    for (const call of constantCalls) {
      expect(call.confidence).toBe('high');
    }
  });

  it('all constant-resolved Python calls have high confidence', () => {
    const results = deepResolveFile(pyConstantsContent, PY_CONSTANTS_FILE, 'python');
    const constantCalls = results.filter((r) => r.resolutionType === 'constant');
    expect(constantCalls.length).toBeGreaterThan(0);
    for (const call of constantCalls) {
      expect(call.confidence).toBe('high');
    }
  });

  it('all constant-resolved Java calls have high confidence', () => {
    const results = deepResolveFile(javaTestContent, JAVA_TEST_FILE, 'java');
    const constantCalls = results.filter((r) => r.resolutionType === 'constant');
    expect(constantCalls.length).toBeGreaterThan(0);
    for (const call of constantCalls) {
      expect(call.confidence).toBe('high');
    }
  });
});

// ─── 11. Result structure sanity ──────────────────────────────────────────────

describe('deepResolveFile – result structure', () => {
  it('every resolved call has the required fields: method, path, resolutionType, confidence, sourceFile, sourceLanguage', () => {
    const results = deepResolveFile(tsConstantsContent, TS_CONSTANTS_FILE, 'typescript');
    expect(results.length).toBeGreaterThan(0);
    for (const call of results) {
      expect(typeof call.method).toBe('string');
      expect(call.method).toMatch(/^[A-Z]+$/);
      expect(typeof call.path).toBe('string');
      expect(call.path).toContain('/');
      expect(call.resolutionType).toBeDefined();
      expect(call.confidence).toMatch(/^(high|medium|low)$/);
      expect(call.sourceFile).toBe(TS_CONSTANTS_FILE);
      expect(call.sourceLanguage).toBe('typescript');
    }
  });

  it('returns no duplicate method:path:resolutionType combinations for the same file', () => {
    const results = deepResolveFile(tsConstantsContent, TS_CONSTANTS_FILE, 'typescript');
    const keys = results.map((r) => `${r.method}:${r.path}:${r.resolutionType}`);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });
});
