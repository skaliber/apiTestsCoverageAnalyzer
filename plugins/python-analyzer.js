/**
 * python-analyzer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Plugin that analyses API endpoint coverage for Python test suites.
 *
 * Detects HTTP calls made through:
 *   - requests library:  requests.get('/path'), requests.post('/path')
 *   - httpx library:     httpx.get('/path')
 *   - Flask/Django test client: client.get('/path'), self.client.post('/path')
 *   - Generic quoted strings: "GET /path"
 *
 * Recognised frameworks: pytest, unittest.
 *
 * Usage
 * ─────
 * Add to `coverage.config.json`:
 *   {
 *     "plugins": ["./plugins/python-analyzer.js"]
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const glob = require('fast-glob');

// ─── HTTP call extraction ─────────────────────────────────────────────────────

/**
 * Extract path component from a URL or plain path string.
 *
 * @param {string} urlOrPath
 * @returns {string}
 */
function extractPath(urlOrPath) {
  if (urlOrPath.startsWith('/')) return urlOrPath;
  try {
    return new URL(urlOrPath).pathname;
  } catch {
    return urlOrPath;
  }
}

/**
 * Remove duplicate {method, path} entries.
 */
function deduplicate(calls) {
  const seen = new Set();
  return calls.filter((c) => {
    const key = `${c.method}:${c.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Extract HTTP {method, path} pairs from Python test source code.
 *
 * @param {string} content
 * @returns {{ method: string, path: string }[]}
 */
function extractPythonHttpCalls(content) {
  const calls = [];
  let m;

  // requests.METHOD('/path') or requests.METHOD("http://host/path")
  const reqPat = /\brequests\.(get|post|put|patch|delete|head|options)\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((m = reqPat.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: extractPath(m[2]) });
  }

  // httpx.METHOD('/path')
  const httpxPat = /\bhttpx\.(get|post|put|patch|delete|head|options)\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((m = httpxPat.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: extractPath(m[2]) });
  }

  // client.METHOD('/path'), self.client.METHOD('/path'), app.test_client().METHOD(...)
  const clientPat = /(?:self\.)?\bclient\.(get|post|put|patch|delete|head|options)\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((m = clientPat.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: extractPath(m[2]) });
  }

  // Generic "GET /path" or 'POST /users/123'
  const generic = /['"]?(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(\/[^'")\s]+)['"]?/gi;
  while ((m = generic.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: m[2] });
  }

  return deduplicate(calls);
}

// ─── Spec helpers (same as java-analyzer, kept self-contained) ────────────────

function pathToRegex(apiPath) {
  const pattern = apiPath
    .split(/\{[^}]+\}/)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^\\/]+');
  return new RegExp(`^${pattern}$`);
}

// ─── Plugin entry-point ───────────────────────────────────────────────────────

/**
 * Analyse Python API test coverage.
 *
 * @param {object} context
 * @param {string[]} context.testPatterns
 * @param {object}  context.spec
 * @param {object}  context.config
 * @returns {Promise<object>} CoverageResult with type "endpoint-python"
 */
async function analyze({ testPatterns, spec }) {
  const cwd = process.cwd();

  const defaultPatterns = [
    '**/test_*.py',
    '**/*_test.py',
    '**/tests/**/*.py',
    '**/test/**/*.py',
    'sample/tests/python/**/*.py',
  ];
  const patterns =
    testPatterns && testPatterns.length > 0 ? testPatterns : defaultPatterns;

  const testFiles = await glob(patterns, { cwd, absolute: true });

  // ── Discover endpoints ────────────────────────────────────────────────────
  const endpoints = [];
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

  for (const filePath of testFiles) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const calls = extractPythonHttpCalls(content);

    for (const call of calls) {
      if (endpoints.length === 0) {
        coveredEndpoints.add(`${call.method}:${call.path}`);
        continue;
      }
      for (let i = 0; i < endpoints.length; i++) {
        const ep = endpoints[i];
        if (ep.method === call.method && ep.regex.test(call.path)) {
          coveredEndpoints.add(i);
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
    type: 'endpoint-python',
    totalItems,
    coveredItems,
    coveragePercent,
    details: {
      language: 'python',
      endpoints: endpoints.map((ep, i) => ({
        method: ep.method,
        path: ep.path,
        covered: coveredEndpoints.has(i),
        languages: coveredEndpoints.has(i) ? ['python'] : [],
      })),
      testFilesScanned: testFiles.length,
    },
  };
}

module.exports = { analyze };
