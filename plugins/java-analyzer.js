/**
 * java-analyzer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Plugin that analyses API endpoint coverage for Java and Kotlin test suites.
 *
 * Detects HTTP calls made through:
 *   - RestAssured (given().when().get("/path"))
 *   - Spring MockMvc (perform(get("/path")))
 *   - Spring WebTestClient (webTestClient.get().uri("/path"))
 *   - OkHttp / Ktor client (client.get("/path"))
 *   - Generic quoted strings ("GET /path")
 *
 * Recognised frameworks: JUnit 4/5, TestNG, Kotest.
 *
 * Usage
 * ─────
 * Add to `coverage.config.json`:
 *   {
 *     "plugins": ["./plugins/java-analyzer.js"]
 *   }
 *
 * Optionally set a custom glob in the config's `testPatterns`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');
const glob = require('fast-glob');

// ─── HTTP call extraction ─────────────────────────────────────────────────────

/**
 * Extract HTTP {method, path} pairs from Java/Kotlin test source code.
 *
 * @param {string} content - source file content
 * @returns {{ method: string, path: string }[]}
 */
function extractJavaHttpCalls(content) {
  const calls = [];

  // RestAssured: .when().get("/path")
  const raWhen = /\.when\(\)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
  let m;
  while ((m = raWhen.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: m[2] });
  }

  // RestAssured / RestAssured shorthand: given().get("/path")
  const raGiven = /(?:given\(\)|RestAssured)[^;.(]*\.(get|post|put|patch|delete|head|options)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
  while ((m = raGiven.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: m[2] });
  }

  // Spring MockMvc: perform(get("/path"))
  const mockMvc = /perform\s*\(\s*(?:\w+\s*\.\s*)?(get|post|put|patch|delete|head|options)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
  while ((m = mockMvc.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: m[2] });
  }

  // Spring WebTestClient: webTestClient.get().uri("/path")
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

  return deduplicate(calls);
}

function deduplicate(calls) {
  const seen = new Set();
  return calls.filter((c) => {
    const key = `${c.method}:${c.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Spec parsing ─────────────────────────────────────────────────────────────

/**
 * Very lightweight OpenAPI path + method extractor (no external dependencies).
 * Reads the raw YAML/JSON spec text and extracts {method, path} pairs using
 * simple pattern matching.  For accurate parsing the main tool uses
 * @apidevtools/swagger-parser; this is only used to provide self-contained
 * coverage when the plugin is run standalone.
 */
function extractEndpointsFromSpec(specText) {
  const endpoints = [];
  const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);
  const lines = specText.split('\n');
  let currentPath = null;

  for (const line of lines) {
    const pathLine = /^\s{2}(\/[^\s:]+)\s*:/.exec(line);
    if (pathLine) {
      currentPath = pathLine[1];
      continue;
    }
    if (currentPath) {
      const methodLine = /^\s{4}(get|post|put|patch|delete|head|options|trace)\s*:/i.exec(line);
      if (methodLine && httpMethods.has(methodLine[1].toLowerCase())) {
        endpoints.push({ method: methodLine[1].toUpperCase(), path: currentPath });
      }
    }
  }
  return endpoints;
}

/**
 * Convert an OpenAPI path template to a RegExp.
 * /users/{id}/orders → /users/[^/]+/orders
 */
function pathToRegex(apiPath) {
  const pattern = apiPath
    .split(/\{[^}]+\}/)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^\\/]+');
  return new RegExp(`^${pattern}$`);
}

// ─── Plugin entry-point ───────────────────────────────────────────────────────

/**
 * Analyse Java / Kotlin API test coverage.
 *
 * @param {object} context
 * @param {string[]} context.testPatterns - Glob patterns used to locate test files
 * @param {object}  context.spec          - Parsed OpenAPI spec (may be null)
 * @param {object}  context.config        - Resolved configuration
 * @returns {Promise<object>} CoverageResult with type "endpoint-java"
 */
async function analyze({ testPatterns, spec, config }) {
  const cwd = process.cwd();

  // ── Locate test files ─────────────────────────────────────────────────────
  const defaultPatterns = [
    '**/src/test/**/*.java',
    '**/*Test.java',
    '**/*Tests.java',
    '**/*Spec.kt',
    '**/*Test.kt',
    '**/tests/**/*.java',
    '**/tests/**/*.kt',
    'sample/tests/java/**/*.java',
    'sample/tests/kotlin/**/*.kt',
  ];
  const patterns =
    testPatterns && testPatterns.length > 0 ? testPatterns : defaultPatterns;

  const testFiles = await glob(patterns, { cwd, absolute: true });

  // ── Discover endpoints ────────────────────────────────────────────────────
  let endpoints = [];
  if (spec && spec.paths) {
    const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
    for (const [apiPath, pathItem] of Object.entries(spec.paths)) {
      for (const method of httpMethods) {
        if (method in pathItem) {
          endpoints.push({ method: method.toUpperCase(), path: apiPath, regex: pathToRegex(apiPath) });
        }
      }
    }
  }

  // ── Scan test files ───────────────────────────────────────────────────────
  const coveredEndpoints = new Set();
  const endpointLanguages = {};

  for (const filePath of testFiles) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const calls = extractJavaHttpCalls(content);
    const lang = filePath.endsWith('.kt') || filePath.endsWith('.kts') ? 'kotlin' : 'java';

    for (const call of calls) {
      if (endpoints.length === 0) {
        // No spec provided – just record covered paths
        coveredEndpoints.add(`${call.method}:${call.path}`);
        continue;
      }

      for (let i = 0; i < endpoints.length; i++) {
        const ep = endpoints[i];
        if (ep.method === call.method && ep.regex.test(call.path)) {
          coveredEndpoints.add(i);
          if (!endpointLanguages[i]) endpointLanguages[i] = [];
          if (!endpointLanguages[i].includes(lang)) endpointLanguages[i].push(lang);
        }
      }
    }
  }

  const totalItems = endpoints.length;
  const coveredItems = endpoints.length > 0
    ? [...coveredEndpoints].filter((v) => typeof v === 'number').length
    : coveredEndpoints.size;
  const coveragePercent =
    totalItems > 0 ? parseFloat(((coveredItems / totalItems) * 100).toFixed(2)) : 0;

  return {
    type: 'endpoint-java',
    totalItems,
    coveredItems,
    coveragePercent,
    details: {
      language: 'java/kotlin',
      endpoints: endpoints.map((ep, i) => ({
        method: ep.method,
        path: ep.path,
        covered: coveredEndpoints.has(i),
        languages: endpointLanguages[i] || [],
      })),
      testFilesScanned: testFiles.length,
    },
  };
}

module.exports = { analyze };
