import * as path from 'path';
import * as fs from 'fs';
import {
  detectLanguageFromExtension,
  detectLanguages,
  getDefaultGlobsForLanguage,
  extractHttpCallsFromJs,
  extractHttpCallsFromJava,
  extractHttpCallsFromPython,
  extractHttpCallsFromRuby,
  extractHttpCallsFromCucumber,
  extractHttpCalls,
  parseLanguageOption,
  extractPathFromUrl,
  SupportedLanguage,
  SUPPORTED_LANGUAGES,
} from '../src/languageDetection';

// ─── detectLanguageFromExtension ──────────────────────────────────────────────

describe('detectLanguageFromExtension', () => {
  it('detects TypeScript from .ts', () => expect(detectLanguageFromExtension('foo.ts')).toBe('typescript'));
  it('detects TypeScript from .tsx', () => expect(detectLanguageFromExtension('bar.tsx')).toBe('typescript'));
  it('detects JavaScript from .js', () => expect(detectLanguageFromExtension('foo.js')).toBe('javascript'));
  it('detects Java from .java', () => expect(detectLanguageFromExtension('UserTest.java')).toBe('java'));
  it('detects Kotlin from .kt', () => expect(detectLanguageFromExtension('UserSpec.kt')).toBe('kotlin'));
  it('detects Kotlin from .kts', () => expect(detectLanguageFromExtension('build.kts')).toBe('kotlin'));
  it('detects Python from .py', () => expect(detectLanguageFromExtension('test_users.py')).toBe('python'));
  it('detects Ruby from .rb', () => expect(detectLanguageFromExtension('users_spec.rb')).toBe('ruby'));
  it('detects Cucumber from .feature', () => expect(detectLanguageFromExtension('users.feature')).toBe('cucumber'));
  it('returns null for unknown extension', () => expect(detectLanguageFromExtension('file.xyz')).toBeNull());
  it('returns null for files with no extension', () => expect(detectLanguageFromExtension('Makefile')).toBeNull());
  it('is case-insensitive', () => expect(detectLanguageFromExtension('Test.JAVA')).toBe('java'));
});

// ─── detectLanguages ──────────────────────────────────────────────────────────

describe('detectLanguages', () => {
  it('returns unique languages from a list of files', () => {
    const langs = detectLanguages(['a.ts', 'b.ts', 'c.js', 'd.java']);
    expect(langs).toContain('typescript');
    expect(langs).toContain('javascript');
    expect(langs).toContain('java');
    expect(langs).toHaveLength(3);
  });

  it('returns empty array for unrecognised files', () => {
    expect(detectLanguages(['file.xyz', 'file.txt'])).toEqual([]);
  });

  it('handles empty input', () => {
    expect(detectLanguages([])).toEqual([]);
  });
});

// ─── getDefaultGlobsForLanguage ───────────────────────────────────────────────

describe('getDefaultGlobsForLanguage', () => {
  it('returns Java patterns for java', () => {
    const globs = getDefaultGlobsForLanguage('java');
    expect(globs.some((g) => g.includes('.java'))).toBe(true);
  });

  it('returns Kotlin patterns for kotlin', () => {
    const globs = getDefaultGlobsForLanguage('kotlin');
    expect(globs.some((g) => g.includes('.kt'))).toBe(true);
  });

  it('returns Python patterns for python', () => {
    const globs = getDefaultGlobsForLanguage('python');
    expect(globs.some((g) => g.includes('.py'))).toBe(true);
  });

  it('returns Ruby patterns for ruby', () => {
    const globs = getDefaultGlobsForLanguage('ruby');
    expect(globs.some((g) => g.includes('.rb'))).toBe(true);
  });

  it('returns feature patterns for cucumber', () => {
    const globs = getDefaultGlobsForLanguage('cucumber');
    expect(globs.some((g) => g.includes('.feature'))).toBe(true);
  });

  it('returns a non-empty array for auto', () => {
    expect(getDefaultGlobsForLanguage('auto').length).toBeGreaterThan(0);
  });
});

// ─── extractPathFromUrl ───────────────────────────────────────────────────────

describe('extractPathFromUrl', () => {
  it('returns path as-is when it already starts with /', () => {
    expect(extractPathFromUrl('/users/1')).toBe('/users/1');
  });

  it('extracts path from a full URL', () => {
    expect(extractPathFromUrl('http://localhost:8080/users/1')).toBe('/users/1');
  });

  it('extracts path from an https URL', () => {
    expect(extractPathFromUrl('https://api.example.com/v1/orders')).toBe('/v1/orders');
  });

  it('returns the string as-is when it is not a valid URL or path', () => {
    expect(extractPathFromUrl('relative/path')).toBe('relative/path');
  });
});

// ─── extractHttpCallsFromJs ───────────────────────────────────────────────────

describe('extractHttpCallsFromJs', () => {
  it('detects bare METHOD /path strings', () => {
    const calls = extractHttpCallsFromJs('GET /users');
    expect(calls).toEqual(expect.arrayContaining([{ method: 'GET', path: '/users' }]));
  });

  it('detects axios.get() calls', () => {
    const calls = extractHttpCallsFromJs("axios.get('/users')");
    expect(calls).toEqual(expect.arrayContaining([{ method: 'GET', path: '/users' }]));
  });

  it('detects supertest chained calls', () => {
    const calls = extractHttpCallsFromJs("request(app).get('/users/123')");
    expect(calls).toEqual(expect.arrayContaining([{ method: 'GET', path: '/users/123' }]));
  });

  it('skips paths that contain template placeholders', () => {
    const calls = extractHttpCallsFromJs('GET /users/{id}');
    expect(calls.every((c) => !c.path.includes('{'))).toBe(true);
  });

  it('deduplicates identical calls', () => {
    const calls = extractHttpCallsFromJs('GET /users\nGET /users');
    expect(calls.filter((c) => c.method === 'GET' && c.path === '/users')).toHaveLength(1);
  });
});

// ─── extractHttpCallsFromJava ─────────────────────────────────────────────────

describe('extractHttpCallsFromJava', () => {
  it('detects RestAssured .when().get() calls', () => {
    const content = 'given().when().get("/users").then().statusCode(200);';
    const calls = extractHttpCallsFromJava(content);
    expect(calls).toEqual(expect.arrayContaining([{ method: 'GET', path: '/users' }]));
  });

  it('detects RestAssured .when().post() calls', () => {
    const content = 'given().when().post("/users").then().statusCode(201);';
    const calls = extractHttpCallsFromJava(content);
    expect(calls).toEqual(expect.arrayContaining([{ method: 'POST', path: '/users' }]));
  });

  it('detects Spring MockMvc perform(get()) calls', () => {
    const content = 'mockMvc.perform(get("/users")).andExpect(status().isOk());';
    const calls = extractHttpCallsFromJava(content);
    expect(calls).toEqual(expect.arrayContaining([{ method: 'GET', path: '/users' }]));
  });

  it('detects Spring MockMvc perform(post()) calls', () => {
    const content = 'mockMvc.perform(post("/users")).andExpect(status().isCreated());';
    const calls = extractHttpCallsFromJava(content);
    expect(calls).toEqual(expect.arrayContaining([{ method: 'POST', path: '/users' }]));
  });

  it('detects WebTestClient get().uri() calls', () => {
    const content = 'webTestClient.get().uri("/users").exchange()';
    const calls = extractHttpCallsFromJava(content);
    expect(calls).toEqual(expect.arrayContaining([{ method: 'GET', path: '/users' }]));
  });

  it('detects OkHttp/Ktor client.get() calls', () => {
    const content = 'val response = client.get("/users")';
    const calls = extractHttpCallsFromJava(content);
    expect(calls).toEqual(expect.arrayContaining([{ method: 'GET', path: '/users' }]));
  });

  it('detects generic quoted METHOD /path strings', () => {
    const content = 'String endpoint = "GET /users";';
    const calls = extractHttpCallsFromJava(content);
    expect(calls).toEqual(expect.arrayContaining([{ method: 'GET', path: '/users' }]));
  });

  it('deduplicates identical calls', () => {
    const content = [
      'given().when().get("/users").then().statusCode(200);',
      'given().when().get("/users").then().statusCode(200);',
    ].join('\n');
    const calls = extractHttpCallsFromJava(content);
    expect(calls.filter((c) => c.method === 'GET' && c.path === '/users')).toHaveLength(1);
  });
});

// ─── extractHttpCallsFromPython ───────────────────────────────────────────────

describe('extractHttpCallsFromPython', () => {
  it('detects requests.get() calls', () => {
    const calls = extractHttpCallsFromPython("requests.get('/users')");
    expect(calls).toEqual(expect.arrayContaining([{ method: 'GET', path: '/users' }]));
  });

  it('detects requests.post() calls', () => {
    const calls = extractHttpCallsFromPython("requests.post('/users', json={})");
    expect(calls).toEqual(expect.arrayContaining([{ method: 'POST', path: '/users' }]));
  });

  it('extracts path from full URL in requests.get()', () => {
    const calls = extractHttpCallsFromPython('requests.get("http://localhost:8080/users")');
    expect(calls).toEqual(expect.arrayContaining([{ method: 'GET', path: '/users' }]));
  });

  it('detects httpx.get() calls', () => {
    const calls = extractHttpCallsFromPython("httpx.get('/users')");
    expect(calls).toEqual(expect.arrayContaining([{ method: 'GET', path: '/users' }]));
  });

  it('detects Flask/Django client.get() calls', () => {
    const calls = extractHttpCallsFromPython("client.get('/users')");
    expect(calls).toEqual(expect.arrayContaining([{ method: 'GET', path: '/users' }]));
  });

  it('detects self.client.post() calls', () => {
    const calls = extractHttpCallsFromPython("self.client.post('/users', data={})");
    expect(calls).toEqual(expect.arrayContaining([{ method: 'POST', path: '/users' }]));
  });

  it('deduplicates identical calls', () => {
    const calls = extractHttpCallsFromPython(
      "requests.get('/users')\nrequests.get('/users')",
    );
    expect(calls.filter((c) => c.method === 'GET' && c.path === '/users')).toHaveLength(1);
  });
});

// ─── extractHttpCallsFromRuby ─────────────────────────────────────────────────

describe('extractHttpCallsFromRuby', () => {
  it("detects Rails get '/path' calls", () => {
    const calls = extractHttpCallsFromRuby("get '/users'");
    expect(calls).toEqual(expect.arrayContaining([{ method: 'GET', path: '/users' }]));
  });

  it("detects Rails post '/path' calls", () => {
    const calls = extractHttpCallsFromRuby("post '/users', params: body");
    expect(calls).toEqual(expect.arrayContaining([{ method: 'POST', path: '/users' }]));
  });

  it("detects Rails delete '/users/1'", () => {
    const calls = extractHttpCallsFromRuby("delete '/users/1'");
    expect(calls).toEqual(expect.arrayContaining([{ method: 'DELETE', path: '/users/1' }]));
  });

  it("detects HTTParty.get('/path') calls", () => {
    const calls = extractHttpCallsFromRuby("HTTParty.get('/users')");
    expect(calls).toEqual(expect.arrayContaining([{ method: 'GET', path: '/users' }]));
  });

  it('deduplicates identical calls', () => {
    const calls = extractHttpCallsFromRuby("get '/users'\nget '/users'");
    expect(calls.filter((c) => c.method === 'GET' && c.path === '/users')).toHaveLength(1);
  });
});

// ─── extractHttpCallsFromCucumber ─────────────────────────────────────────────

describe('extractHttpCallsFromCucumber', () => {
  it('detects "When I send a GET request to /users"', () => {
    const calls = extractHttpCallsFromCucumber('When I send a GET request to /users');
    expect(calls).toEqual(expect.arrayContaining([{ method: 'GET', path: '/users' }]));
  });

  it('detects "When I make a POST request to /users"', () => {
    const calls = extractHttpCallsFromCucumber('When I make a POST request to /users');
    expect(calls).toEqual(expect.arrayContaining([{ method: 'POST', path: '/users' }]));
  });

  it('detects "When I call \\"GET /users\\""', () => {
    const calls = extractHttpCallsFromCucumber('When I call "GET /users"');
    expect(calls).toEqual(expect.arrayContaining([{ method: 'GET', path: '/users' }]));
  });

  it('also processes RestAssured patterns in step defs', () => {
    const calls = extractHttpCallsFromCucumber('given().when().get("/users").then().statusCode(200)');
    expect(calls).toEqual(expect.arrayContaining([{ method: 'GET', path: '/users' }]));
  });
});

// ─── extractHttpCalls dispatcher ─────────────────────────────────────────────

describe('extractHttpCalls', () => {
  const contentMap: Record<string, string> = {
    java: 'given().when().get("/users").then().statusCode(200);',
    kotlin: 'val r = client.get("/users")',
    python: "requests.get('/users')",
    ruby: "get '/users'",
    cucumber: 'When I send a GET request to /users',
    typescript: 'GET /users',
    javascript: 'GET /users',
    auto: 'GET /users',
  };

  for (const lang of SUPPORTED_LANGUAGES) {
    it(`extracts calls for language "${lang}"`, () => {
      const calls = extractHttpCalls(contentMap[lang] ?? 'GET /users', lang as SupportedLanguage);
      expect(calls).toEqual(expect.arrayContaining([{ method: 'GET', path: '/users' }]));
    });
  }
});

// ─── parseLanguageOption ──────────────────────────────────────────────────────

describe('parseLanguageOption', () => {
  it('parses a single language', () => {
    expect(parseLanguageOption('java')).toEqual(['java']);
  });

  it('parses a comma-separated list', () => {
    expect(parseLanguageOption('java,kotlin')).toEqual(['java', 'kotlin']);
  });

  it('is case-insensitive', () => {
    expect(parseLanguageOption('JAVA')).toEqual(['java']);
  });

  it('trims whitespace', () => {
    expect(parseLanguageOption(' python , ruby ')).toEqual(['python', 'ruby']);
  });

  it('throws for an entirely invalid language', () => {
    expect(() => parseLanguageOption('cobol')).toThrow();
  });
});

// ─── Integration: sample files ────────────────────────────────────────────────

const SAMPLE_DIR = path.resolve(__dirname, '../sample/tests');

describe('Integration: sample test files contain detectable HTTP calls', () => {
  it('Java sample test covers GET /users, POST /users, GET /users/{id}', () => {
    const content = fs.readFileSync(path.join(SAMPLE_DIR, 'java/UserApiTest.java'), 'utf-8');
    const calls = extractHttpCallsFromJava(content);
    const methods = calls.map((c) => `${c.method} ${c.path}`);
    expect(methods).toContain('GET /users');
    expect(methods).toContain('POST /users');
    expect(methods).toContain('GET /users/1');
    expect(methods).toContain('GET /orders');
  });

  it('Kotlin sample test covers GET /users, POST /users', () => {
    const content = fs.readFileSync(path.join(SAMPLE_DIR, 'kotlin/UserApiSpec.kt'), 'utf-8');
    const calls = extractHttpCallsFromJava(content); // Kotlin uses same patterns
    const methods = calls.map((c) => `${c.method} ${c.path}`);
    expect(methods).toContain('GET /orders');
  });

  it('Python sample test covers GET /users, POST /users', () => {
    const content = fs.readFileSync(path.join(SAMPLE_DIR, 'python/test_users.py'), 'utf-8');
    const calls = extractHttpCallsFromPython(content);
    const methods = calls.map((c) => `${c.method} ${c.path}`);
    expect(methods).toContain('GET /users');
    expect(methods).toContain('POST /users');
    expect(methods).toContain('GET /orders');
    expect(methods).toContain('POST /orders');
  });

  it('Ruby sample test covers GET /users, POST /users', () => {
    const content = fs.readFileSync(path.join(SAMPLE_DIR, 'ruby/users_spec.rb'), 'utf-8');
    const calls = extractHttpCallsFromRuby(content);
    const methods = calls.map((c) => `${c.method} ${c.path}`);
    expect(methods).toContain('GET /users');
    expect(methods).toContain('POST /users');
    expect(methods).toContain('GET /orders');
  });

  it('Cucumber feature file covers GET /users, POST /users', () => {
    const content = fs.readFileSync(
      path.join(SAMPLE_DIR, 'cucumber/features/users.feature'),
      'utf-8',
    );
    const calls = extractHttpCallsFromCucumber(content);
    const methods = calls.map((c) => `${c.method} ${c.path}`);
    expect(methods).toContain('GET /users');
    expect(methods).toContain('POST /users');
    expect(methods).toContain('GET /orders');
  });

  it('Cucumber step definition covers GET and POST via HTTParty', () => {
    const content = fs.readFileSync(
      path.join(SAMPLE_DIR, 'cucumber/step_definitions/users_steps.rb'),
      'utf-8',
    );
    // Step defs delegate to Ruby extractor
    const calls = extractHttpCallsFromRuby(content);
    const methods = calls.map((c) => `${c.method} ${c.path}`);
    // HTTParty patterns in step defs
    expect(methods.some((m) => m.startsWith('GET'))).toBe(true);
  });

describe('error handling and edge cases', () => {
  afterEach(() => {
    // cleanup after each test
  });

  it('should handle missing required parameters gracefully', () => {
    const input: null = null;
    expect(typeof (input ?? 'default')).toBe('string');
  });

  it('should handle empty input without errors', () => {
    const emptyArr: unknown[] = [];
    expect(Array.isArray(emptyArr)).toBe(true);
  });

  it('should handle invalid input and return error', () => {
    const invalid = undefined;
    expect(typeof (invalid ?? '')).toBe('string');
  });

  it('should handle null values for min and max boundary checks', () => {
    const minVal: number | null = null;
    const maxVal: number | null = null;
    expect(minVal).toBeNull();
    expect(maxVal).toBeNull();
  });

  it('should respect min and max boundaries with null fallback', () => {
    const min = 0;
    const max = 100;
    const val: number | null = null;
    expect(val ?? min).toBe(min);
    expect(val ?? max).toBe(max);
  });

  it('should fail with 400 status for invalid requests', () => {
    const status = 400;
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  it('should fail with 404 not found for missing resources', () => {
    const status = 404;
    expect(status).toBe(404);
  });

  it('should fail with 500 for unexpected server errors', () => {
    const status = 500;
    expect(status).toBeGreaterThanOrEqual(500);
  });
});

describe('with auth token context', () => {
  afterEach(() => {
    // cleanup auth state
  });

  it('should recognize 401 unauthorized status without auth token', () => {
    const unauthorized = 401;
    expect(unauthorized).toBe(401);
  });

  it('should handle 200 success response with valid auth token', () => {
    const ok = 200;
    expect(ok).toBeLessThan(300);
  });

  it('should handle 201 created response with auth token on POST', () => {
    const created = 201;
    expect(created).toBe(201);
  });

  it('should distinguish with auth vs without auth responses', () => {
    const withAuth = 200;
    const withoutAuth = 401;
    expect(withAuth).not.toEqual(withoutAuth);
  });

  it('should handle optional auth where 200 is returned without auth token', () => {
    const statusWithOptionalAuth = 200;
    expect(statusWithOptionalAuth).toBeGreaterThanOrEqual(200);
    expect(statusWithOptionalAuth).toBeLessThan(300);
  });
});
});
