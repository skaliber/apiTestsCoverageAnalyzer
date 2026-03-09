/**
 * ruby-analyzer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Plugin that analyses API endpoint coverage for Ruby test suites.
 *
 * Detects HTTP calls made through:
 *   - Rails request specs / integration tests: get '/path', post '/path'
 *   - RSpec request specs (describe / context / it blocks)
 *   - HTTParty: HTTParty.get('/path')
 *   - Faraday: conn.get('/path'), connection.post('/path')
 *   - Generic quoted strings: "GET /path"
 *
 * Recognised frameworks: RSpec, Minitest, Rails integration tests.
 *
 * Usage
 * ─────
 * Add to `coverage.config.json`:
 *   {
 *     "plugins": ["./plugins/ruby-analyzer.js"]
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const glob = require('fast-glob');

// ─── HTTP call extraction ─────────────────────────────────────────────────────

function extractPath(urlOrPath) {
  if (urlOrPath.startsWith('/')) return urlOrPath;
  try {
    return new URL(urlOrPath).pathname;
  } catch {
    return urlOrPath;
  }
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

/**
 * Extract HTTP {method, path} pairs from Ruby test source code.
 *
 * @param {string} content
 * @returns {{ method: string, path: string }[]}
 */
function extractRubyHttpCalls(content) {
  const calls = [];
  let m;

  // Rails request specs: get '/path', post '/path', delete '/users/1'
  const railsPat = /\b(get|post|put|patch|delete|head|options)\s+['"]([^'"]+)['"]/gi;
  while ((m = railsPat.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: extractPath(m[2]) });
  }

  // HTTParty: HTTParty.get('/path'), HTTParty.post('http://host/path')
  const httpartyPat = /HTTParty\.(get|post|put|patch|delete|head|options)\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((m = httpartyPat.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: extractPath(m[2]) });
  }

  // Faraday: conn.get('/path'), connection.post('/path')
  const faradayPat = /(?:conn|connection|faraday)\.(get|post|put|patch|delete|head|options)\s*(?:\([^)]*\))?\s*(?:do\s*\|[^|]*\|)?\s*['"]([^'"]+)['"]/gi;
  while ((m = faradayPat.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: extractPath(m[2]) });
  }

  // Generic "GET /path" or 'POST /users'
  const generic = /["'](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(\/[^"'\s]+)["']/gi;
  while ((m = generic.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: m[2] });
  }

  return deduplicate(calls);
}

// ─── Spec helpers ─────────────────────────────────────────────────────────────

function pathToRegex(apiPath) {
  const pattern = apiPath
    .split(/\{[^}]+\}/)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^\\/]+');
  return new RegExp(`^${pattern}$`);
}

// ─── Plugin entry-point ───────────────────────────────────────────────────────

/**
 * Analyse Ruby API test coverage.
 *
 * @param {object} context
 * @param {string[]} context.testPatterns
 * @param {object}  context.spec
 * @param {object}  context.config
 * @returns {Promise<object>} CoverageResult with type "endpoint-ruby"
 */
async function analyze({ testPatterns, spec }) {
  const cwd = process.cwd();

  const defaultPatterns = [
    '**/*_spec.rb',
    '**/spec/**/*.rb',
    '**/test/**/*.rb',
    'sample/tests/ruby/**/*.rb',
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

    const calls = extractRubyHttpCalls(content);

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
    type: 'endpoint-ruby',
    totalItems,
    coveredItems,
    coveragePercent,
    details: {
      language: 'ruby',
      endpoints: endpoints.map((ep, i) => ({
        method: ep.method,
        path: ep.path,
        covered: coveredEndpoints.has(i),
        languages: coveredEndpoints.has(i) ? ['ruby'] : [],
      })),
      testFilesScanned: testFiles.length,
    },
  };
}

module.exports = { analyze };
