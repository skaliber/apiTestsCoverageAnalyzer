/**
 * Deep Code Analysis — Assertion Awareness
 *
 * Associates HTTP response variables with their downstream assertions to
 * determine whether a request is "meaningfully" tested (i.e. the response
 * is actually checked) rather than just called incidentally.
 *
 * Supported patterns:
 *
 * TypeScript (Jest / Supertest):
 *   const response = api.get('/users');
 *   expect(response.status).toBe(200);
 *   expect(response.body).toEqual({ ... });
 *
 * Java (JUnit / RestAssured):
 *   Response response = api.get("/users");
 *   assertEquals(200, response.getStatusCode());
 *   assertThat(response.getBody(), ...).isNotEmpty();
 *
 * Python (pytest / unittest):
 *   response = client.get('/users')
 *   assert response.status_code == 200
 *   self.assertEqual(response.status_code, 200)
 *
 * Kotlin:
 *   val response = client.get("/users")
 *   assertEquals(200, response.status)
 *   assertThat(response.body).isNotNull()
 */

// ─── Assertion detection ──────────────────────────────────────────────────────

/**
 * Detect whether a response variable is followed by at least one assertion.
 *
 * This is a lightweight heuristic: we check whether the response variable
 * name appears inside an expect(), assert, assertEquals, assertThat, or
 * similar assertion call within the same file.
 *
 * Returns true when at least one assertion is found.
 */
export function isAssertionLinked(responseVar: string, content: string): boolean {
  if (!responseVar) return false;

  // TypeScript/JS: expect(responseName.xxx)
  const jsExpect = new RegExp(`\\bexpect\\s*\\(\\s*${escapeRegex(responseVar)}\\b`, 'g');
  if (jsExpect.test(content)) return true;

  // Java/Kotlin: assertEquals(xxx, responseName.getXxx())
  //              assertThat(responseName.xxx)
  const javaAssert = new RegExp(
    `\\b(?:assertEquals|assertNotNull|assertThat|assertFalse|assertTrue|assertNull)\\s*\\([^)]*\\b${escapeRegex(responseVar)}\\b`,
    'g',
  );
  if (javaAssert.test(content)) return true;

  // Python: assert responseName.status_code
  const pyAssert = new RegExp(`\\bassert\\s+${escapeRegex(responseVar)}\\b`, 'g');
  if (pyAssert.test(content)) return true;

  // Python unittest: self.assertEqual(xxx, responseName.xxx)
  const pyUnitAssert = new RegExp(
    `\\bself\\.assert(?:Equal|NotEqual|In|NotIn|True|False)\\s*\\([^)]*\\b${escapeRegex(responseVar)}\\b`,
    'g',
  );
  if (pyUnitAssert.test(content)) return true;

  // Kotlin / Java: response.status shouldBe 200 (Kotest)
  const kotestAssert = new RegExp(`\\b${escapeRegex(responseVar)}\\b[^\\n]*\\bshould`, 'g');
  if (kotestAssert.test(content)) return true;

  // RestAssured: .then().statusCode(200) chained on the same variable
  const raAssert = new RegExp(`\\b${escapeRegex(responseVar)}\\b[^\\n]*\\.then\\(\\)`, 'g');
  if (raAssert.test(content)) return true;

  return false;
}

/**
 * Extract all response variable names from HTTP call sites in a file.
 *
 * Returns a map of varName → { method, path } for all assignments like:
 *   const resp = client.get('/users')
 *   Response res = api.post("/users")
 *   response = client.get('/path')
 */
export function extractResponseVariables(
  content: string,
): Array<{ varName: string; method: string; path: string }> {
  const results: Array<{ varName: string; method: string; path: string }> = [];

  // TypeScript/JavaScript: const|let|var response = ....(get|post|...)(path)
  const jsPattern =
    /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:\w+\.)+?(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  let m: RegExpExecArray | null;
  while ((m = jsPattern.exec(content)) !== null) {
    results.push({ varName: m[1], method: m[2].toUpperCase(), path: m[3] });
  }

  // Java/Kotlin: Type varName = ....(get|post|...)(path)
  const javaPattern =
    /\b(?:Response|HttpResponse|MockHttpServletResponse|ResponseEntity|ValidatableResponse|ExtractableResponse)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:\w+[.\s]+)*(get|post|put|patch|delete|head|options)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
  while ((m = javaPattern.exec(content)) !== null) {
    results.push({ varName: m[1], method: m[2].toUpperCase(), path: m[3] });
  }

  // Python: response = client.get('/path')  or  res = requests.post('/path')
  const pyPattern =
    /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:self\.)?(?:client|requests?|httpx)\.(get|post|put|patch|delete|head|options)\s*\(\s*['"]([^'"]+)['"]/gm;
  while ((m = pyPattern.exec(content)) !== null) {
    results.push({ varName: m[2], method: m[3].toUpperCase(), path: m[4] });
  }

  return results;
}

/**
 * For each response variable in the content, determine if it has an
 * associated assertion.
 *
 * Returns a map: varName → assertionLinked (boolean)
 */
export function buildAssertionMap(content: string): Map<string, boolean> {
  const responseVars = extractResponseVariables(content);
  const map = new Map<string, boolean>();

  for (const { varName } of responseVars) {
    map.set(varName, isAssertionLinked(varName, content));
  }

  return map;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
