/**
 * Language detection and language-specific HTTP call extraction for the
 * API test coverage analyzer.
 *
 * Supports: JavaScript, TypeScript, Java, Kotlin, Python, Ruby, Cucumber.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export type SupportedLanguage =
  | 'javascript'
  | 'typescript'
  | 'java'
  | 'kotlin'
  | 'python'
  | 'ruby'
  | 'cucumber'
  | 'auto';

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  'javascript',
  'typescript',
  'java',
  'kotlin',
  'python',
  'ruby',
  'cucumber',
  'auto',
];

export interface HttpCall {
  method: string;
  path: string;
}

// ─── Extension → language mapping ─────────────────────────────────────────────

const EXTENSION_TO_LANGUAGE: Record<string, SupportedLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.py': 'python',
  '.rb': 'ruby',
  '.feature': 'cucumber',
};

/**
 * Detect the language of a single file from its extension.
 * Returns `null` if the extension is not recognised.
 */
export function detectLanguageFromExtension(filePath: string): SupportedLanguage | null {
  const dotIndex = filePath.lastIndexOf('.');
  if (dotIndex === -1) return null;
  const ext = filePath.slice(dotIndex).toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext] ?? null;
}

/**
 * Detect all languages present in a list of file paths.
 */
export function detectLanguages(filePaths: string[]): SupportedLanguage[] {
  const langs = new Set<SupportedLanguage>();
  for (const fp of filePaths) {
    const lang = detectLanguageFromExtension(fp);
    if (lang) langs.add(lang);
  }
  return Array.from(langs);
}

// ─── Default glob patterns per language ───────────────────────────────────────

/**
 * Return the default glob patterns used to locate test files for a given language.
 */
export function getDefaultGlobsForLanguage(language: SupportedLanguage): string[] {
  switch (language) {
    case 'java':
      return ['**/*Test.java', '**/*Tests.java', '**/*Spec.java', '**/test/**/*.java', '**/tests/**/*.java'];
    case 'kotlin':
      return ['**/*Test.kt', '**/*Tests.kt', '**/*Spec.kt', '**/test/**/*.kt', '**/tests/**/*.kt'];
    case 'python':
      return ['**/test_*.py', '**/*_test.py', '**/tests/**/*.py', '**/test/**/*.py'];
    case 'ruby':
      return ['**/*_spec.rb', '**/spec/**/*.rb', '**/test/**/*.rb'];
    case 'cucumber':
      return ['**/*.feature', '**/step_definitions/**/*.rb', '**/step_definitions/**/*.java', '**/step_definitions/**/*.py', '**/step_definitions/**/*.kt'];
    case 'typescript':
      return ['**/*.test.ts', '**/*.spec.ts', '**/tests/**/*.ts'];
    case 'javascript':
      return ['**/*.test.js', '**/*.spec.js', '**/tests/**/*.js'];
    case 'auto':
    default:
      return [
        '**/*.test.ts', '**/*.spec.ts', '**/tests/**/*.ts',
        '**/*.test.js', '**/*.spec.js', '**/tests/**/*.js',
        '**/*Test.java', '**/*Tests.java', '**/test/**/*.java',
        '**/*Test.kt', '**/*Spec.kt', '**/test/**/*.kt',
        '**/test_*.py', '**/*_test.py', '**/tests/**/*.py',
        '**/*_spec.rb', '**/spec/**/*.rb',
        '**/*.feature',
      ];
  }
}

// ─── HTTP call extraction ─────────────────────────────────────────────────────

/**
 * Extract HTTP calls from JavaScript/TypeScript test content.
 *
 * Detects patterns like:
 *   - `GET /users` (string literals)
 *   - `fetch('/users', { method: 'GET' })`
 *   - `supertest(app).get('/users')`
 *   - `axios.get('/users')`
 */
export function extractHttpCallsFromJs(content: string): HttpCall[] {
  const calls: HttpCall[] = [];

  // Bare "METHOD /path" string (e.g. in test descriptions or request helpers)
  const bare = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(\/[^\s'"`,)]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = bare.exec(content)) !== null) {
    const p = m[2];
    if (!p.includes('{')) {
      calls.push({ method: m[1].toUpperCase(), path: p });
    }
  }

  // axios / superagent / got: axios.get('/path'), axios.post('/path')
  const axiosLike = /\b(?:axios|request|supertest|got|agent)\.(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  while ((m = axiosLike.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: extractPathFromUrl(m[2]) });
  }

  // supertest(app).get('/path')
  const supertestChain = /\)\s*\.(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  while ((m = supertestChain.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: extractPathFromUrl(m[2]) });
  }

  return deduplicateCalls(calls);
}

/**
 * Extract HTTP calls from Java/Kotlin test content.
 *
 * Detects:
 *   - RestAssured: `given().when().get("/path")`, `.when().post("/path")`
 *   - Spring MockMvc: `perform(get("/path"))`, `perform(MockMvcRequestBuilders.get(...))`
 *   - WebTestClient: `webTestClient.get().uri("/path")`
 *   - OkHttp / Ktor: `client.get("/path")`
 *   - Generic strings: `"GET /path"`
 */
export function extractHttpCallsFromJava(content: string): HttpCall[] {
  const calls: HttpCall[] = [];
  let m: RegExpExecArray | null;

  // RestAssured: .when().get("/path")
  const raWhen = /\.when\(\)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
  while ((m = raWhen.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: m[2] });
  }

  // RestAssured shorthand: given().get("/path") or RestAssured.get("/path")
  const raGiven = /(?:given\(\)|RestAssured)[^;.(]*\.(get|post|put|patch|delete|head|options)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
  while ((m = raGiven.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: m[2] });
  }

  // Spring MockMvc / WebMvcTest: perform(get("/path"))
  const mockMvc = /perform\s*\(\s*(?:\w+\s*\.\s*)?(get|post|put|patch|delete|head|options)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
  while ((m = mockMvc.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: m[2] });
  }

  // WebTestClient: webTestClient.get().uri("/path")
  const webTest = /webTestClient\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*\)\s*\.uri\s*\(\s*["'`]([^"'`]+)["'`]/gi;
  while ((m = webTest.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: m[2] });
  }

  // OkHttp / Ktor client: client.get("/path")
  const okHttp = /\bclient\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
  while ((m = okHttp.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: m[2] });
  }

  // Generic quoted "METHOD /path"
  const generic = /["'`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(\/[^"'`\s]+)["'`]/gi;
  while ((m = generic.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: m[2] });
  }

  return deduplicateCalls(calls);
}

/**
 * Extract HTTP calls from Python test content.
 *
 * Detects:
 *   - `requests.get('/path')`, `requests.post('/path')`, etc.
 *   - `httpx.get('/path')`
 *   - `client.get('/path')` (Flask/Django test client)
 *   - `self.client.get('/path')`
 *   - `response = client.get('/api/users')`
 */
export function extractHttpCallsFromPython(content: string): HttpCall[] {
  const calls: HttpCall[] = [];
  let m: RegExpExecArray | null;

  // requests.METHOD('/path')
  const reqPattern = /\brequests\.(get|post|put|patch|delete|head|options)\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((m = reqPattern.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: extractPathFromUrl(m[2]) });
  }

  // httpx.METHOD('/path')
  const httpxPattern = /\bhttpx\.(get|post|put|patch|delete|head|options)\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((m = httpxPattern.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: extractPathFromUrl(m[2]) });
  }

  // client.METHOD('/path'), self.client.METHOD('/path')
  const clientPattern = /(?:self\.)?\bclient\.(get|post|put|patch|delete|head|options)\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((m = clientPattern.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: extractPathFromUrl(m[2]) });
  }

  // Generic "METHOD /path"
  const generic = /['"]?(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(\/[^'")\s]+)['"]?/gi;
  while ((m = generic.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: m[2] });
  }

  return deduplicateCalls(calls);
}

/**
 * Extract HTTP calls from Ruby test content.
 *
 * Detects:
 *   - Rails request specs / integration tests: `get '/path'`, `post '/path'`
 *   - HTTParty: `HTTParty.get('/path')`
 *   - Faraday: `conn.get('/path')`
 *   - Net::HTTP (generic patterns)
 *   - Generic "METHOD /path" strings
 */
export function extractHttpCallsFromRuby(content: string): HttpCall[] {
  const calls: HttpCall[] = [];
  let m: RegExpExecArray | null;

  // Rails request specs: get '/path', post '/path', etc.
  const railsPattern = /\b(get|post|put|patch|delete|head|options)\s+['"]([^'"]+)['"]/gi;
  while ((m = railsPattern.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: extractPathFromUrl(m[2]) });
  }

  // HTTParty: HTTParty.get('/path')
  const httpartyPattern = /HTTParty\.(get|post|put|patch|delete|head|options)\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((m = httpartyPattern.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: extractPathFromUrl(m[2]) });
  }

  // Faraday: conn.get('/path'), connection.post('/path')
  const faradaySimple = /(?:conn|connection|faraday)\.(get|post|put|patch|delete|head|options)\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((m = faradaySimple.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: extractPathFromUrl(m[2]) });
  }

  // Generic "METHOD /path"
  const generic = /["'](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(\/[^"'\s]+)["']/gi;
  while ((m = generic.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: m[2] });
  }

  return deduplicateCalls(calls);
}

/**
 * Extract HTTP calls from Cucumber feature files and step definition files.
 *
 * Detects:
 *   - Gherkin steps: `When I send a GET request to "/users"`
 *   - Gherkin steps: `When I call "GET /users"`
 *   - Step definition files in any supported language (falls through to respective extractor)
 */
export function extractHttpCallsFromCucumber(content: string): HttpCall[] {
  const calls: HttpCall[] = [];
  let m: RegExpExecArray | null;

  // "When I send a GET request to /users" or "When I make a POST request to /users"
  const gherkin1 = /\b(?:When|Given|Then|And)\s+I\s+(?:send|make|perform)\s+(?:an?\s+)?["']?(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)["']?\s+request\s+to\s+["']?(\/[^"'\s]+)["']?/gi;
  while ((m = gherkin1.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: m[2] });
  }

  // 'When I call "GET /users"'
  const gherkin2 = /\b(?:When|Given|Then|And)[^"']*["'](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(\/[^"'\s]+)["']/gi;
  while ((m = gherkin2.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: m[2] });
  }

  // Also apply language-specific extractors (for step definition files)
  calls.push(...extractHttpCallsFromJava(content));
  calls.push(...extractHttpCallsFromPython(content));
  calls.push(...extractHttpCallsFromRuby(content));

  return deduplicateCalls(calls);
}

/**
 * Extract HTTP calls from file content using the most appropriate strategy
 * for the detected or specified language.
 */
export function extractHttpCalls(content: string, language: SupportedLanguage): HttpCall[] {
  switch (language) {
    case 'java':
    case 'kotlin':
      return extractHttpCallsFromJava(content);
    case 'python':
      return extractHttpCallsFromPython(content);
    case 'ruby':
      return extractHttpCallsFromRuby(content);
    case 'cucumber':
      return extractHttpCallsFromCucumber(content);
    case 'typescript':
    case 'javascript':
    case 'auto':
    default:
      // For 'auto', use JS patterns (good for TS/JS) as the baseline
      return extractHttpCallsFromJs(content);
  }
}

// ─── CLI option parsing ────────────────────────────────────────────────────────

/**
 * Parse a `--language` CLI option value into an array of `SupportedLanguage` values.
 *
 * Accepts:
 *   - A single value: `java`
 *   - A comma-separated list: `java,kotlin`
 *   - Multiple invocations are handled by Commander's `.collect()` middleware
 *
 * @throws if no valid languages are found in the input.
 */
export function parseLanguageOption(value: string): SupportedLanguage[] {
  const parts = value
    .split(',')
    .map((s) => s.trim().toLowerCase() as SupportedLanguage)
    .filter(Boolean);

  const valid = parts.filter((p) => (SUPPORTED_LANGUAGES as string[]).includes(p));
  if (valid.length === 0) {
    throw new Error(
      `Invalid language value: "${value}". Supported values: ${SUPPORTED_LANGUAGES.join(', ')}`,
    );
  }
  return valid;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the path portion from a URL string.
 * If the string is already a path (starts with `/`), it is returned as-is.
 * Full URLs like `http://localhost:8080/api/users` → `/api/users`.
 */
export function extractPathFromUrl(urlOrPath: string): string {
  if (urlOrPath.startsWith('/')) return urlOrPath;
  try {
    return new URL(urlOrPath).pathname;
  } catch {
    return urlOrPath;
  }
}

/**
 * Remove duplicate HTTP calls (same method + path).
 */
function deduplicateCalls(calls: HttpCall[]): HttpCall[] {
  const seen = new Set<string>();
  return calls.filter((c) => {
    const key = `${c.method}:${c.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
