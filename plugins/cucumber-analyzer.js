/**
 * cucumber-analyzer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Plugin that analyses API endpoint coverage for Cucumber / Gherkin test suites.
 *
 * Processes two kinds of files:
 *   1. `.feature` files – Gherkin scenarios describing API calls in plain text
 *      step sentences such as:
 *        "When I send a GET request to /users"
 *        "When I call "GET /users""
 *   2. Step-definition files (`.java`, `.kt`, `.py`, `.rb`, `.js`, `.ts`) –
 *      the code behind the steps, detected with language-appropriate patterns.
 *
 * Usage
 * ─────
 * Add to `coverage.config.json`:
 *   {
 *     "plugins": ["./plugins/cucumber-analyzer.js"]
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

/** Extract calls from a Gherkin .feature file. */
function extractFromFeature(content) {
  const calls = [];
  let m;

  // "When I send a GET request to /path" or "When I make a POST request to /path"
  const gherkin1 = /\b(?:When|Given|Then|And)\s+I\s+(?:send|make|perform)\s+(?:an?\s+)?["']?(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)["']?\s+request\s+to\s+["']?(\/[^"'\s]+)["']?/gi;
  while ((m = gherkin1.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: m[2] });
  }

  // 'When I call "GET /users"'
  const gherkin2 = /\b(?:When|Given|Then|And)[^"']*["'](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(\/[^"'\s]+)["']/gi;
  while ((m = gherkin2.exec(content)) !== null) {
    calls.push({ method: m[1].toUpperCase(), path: m[2] });
  }

  // Bare "METHOD /path" strings in step text
  const bare = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(\/[^\s"']+)/gi;
  while ((m = bare.exec(content)) !== null) {
    if (!m[2].includes('{')) {
      calls.push({ method: m[1].toUpperCase(), path: m[2] });
    }
  }

  return deduplicate(calls);
}

/** Extract calls from a Java/Kotlin step definition file. */
function extractFromJava(content) {
  const calls = [];
  let m;

  const raWhen = /\.when\(\)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
  while ((m = raWhen.exec(content)) !== null) calls.push({ method: m[1].toUpperCase(), path: m[2] });

  const mockMvc = /perform\s*\(\s*(?:\w+\s*\.\s*)?(get|post|put|patch|delete|head|options)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
  while ((m = mockMvc.exec(content)) !== null) calls.push({ method: m[1].toUpperCase(), path: m[2] });

  const generic = /["'`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(\/[^"'`\s]+)["'`]/gi;
  while ((m = generic.exec(content)) !== null) calls.push({ method: m[1].toUpperCase(), path: m[2] });

  return deduplicate(calls);
}

/** Extract calls from a Python step definition file. */
function extractFromPython(content) {
  const calls = [];
  let m;

  const reqPat = /\brequests\.(get|post|put|patch|delete|head|options)\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((m = reqPat.exec(content)) !== null) calls.push({ method: m[1].toUpperCase(), path: extractPath(m[2]) });

  const clientPat = /(?:self\.)?\bclient\.(get|post|put|patch|delete|head|options)\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((m = clientPat.exec(content)) !== null) calls.push({ method: m[1].toUpperCase(), path: extractPath(m[2]) });

  const generic = /['"]?(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(\/[^'")\s]+)['"]?/gi;
  while ((m = generic.exec(content)) !== null) calls.push({ method: m[1].toUpperCase(), path: m[2] });

  return deduplicate(calls);
}

/** Extract calls from a Ruby step definition file. */
function extractFromRuby(content) {
  const calls = [];
  let m;

  const railsPat = /\b(get|post|put|patch|delete|head|options)\s+['"]([^'"]+)['"]/gi;
  while ((m = railsPat.exec(content)) !== null) calls.push({ method: m[1].toUpperCase(), path: extractPath(m[2]) });

  const generic = /["'](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(\/[^"'\s]+)["']/gi;
  while ((m = generic.exec(content)) !== null) calls.push({ method: m[1].toUpperCase(), path: m[2] });

  return deduplicate(calls);
}

/** Dispatch extraction to the correct language extractor based on file extension. */
function extractFromStepDef(content, filePath) {
  if (filePath.endsWith('.java') || filePath.endsWith('.kt') || filePath.endsWith('.kts')) {
    return extractFromJava(content);
  }
  if (filePath.endsWith('.py')) return extractFromPython(content);
  if (filePath.endsWith('.rb')) return extractFromRuby(content);
  // JS / TS: generic "METHOD /path"
  const calls = [];
  let m;
  const bare = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\s+(\/[^\s"'`,)]+)/gi;
  while ((m = bare.exec(content)) !== null) {
    if (!m[2].includes('{')) calls.push({ method: m[1].toUpperCase(), path: m[2] });
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
 * Analyse Cucumber/Gherkin API test coverage.
 *
 * @param {object} context
 * @param {string[]} context.testPatterns
 * @param {object}  context.spec
 * @param {object}  context.config
 * @returns {Promise<object>} CoverageResult with type "endpoint-cucumber"
 */
async function analyze({ testPatterns, spec }) {
  const cwd = process.cwd();

  const defaultFeaturePatterns = ['**/*.feature', 'sample/tests/cucumber/**/*.feature'];
  const defaultStepPatterns = [
    '**/step_definitions/**/*.java',
    '**/step_definitions/**/*.kt',
    '**/step_definitions/**/*.py',
    '**/step_definitions/**/*.rb',
    '**/step_definitions/**/*.js',
    '**/step_definitions/**/*.ts',
    '**/steps/**/*.java',
    '**/steps/**/*.py',
    '**/steps/**/*.rb',
    'sample/tests/cucumber/**/*.rb',
    'sample/tests/cucumber/**/*.py',
    'sample/tests/cucumber/**/*.java',
  ];

  const featurePatterns = testPatterns && testPatterns.length > 0
    ? testPatterns.filter((p) => p.endsWith('.feature'))
    : defaultFeaturePatterns;
  const stepPatterns = testPatterns && testPatterns.length > 0
    ? testPatterns.filter((p) => !p.endsWith('.feature'))
    : defaultStepPatterns;

  const featureFiles = await glob(featurePatterns, { cwd, absolute: true });
  const stepFiles = await glob(stepPatterns, { cwd, absolute: true });

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

  // ── Scan files ────────────────────────────────────────────────────────────
  const coveredEndpoints = new Set();

  const processFile = (filePath, extractFn) => {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      return;
    }
    const calls = extractFn(content, filePath);
    for (const call of calls) {
      if (endpoints.length === 0) {
        coveredEndpoints.add(`${call.method}:${call.path}`);
      } else {
        for (let i = 0; i < endpoints.length; i++) {
          const ep = endpoints[i];
          if (ep.method === call.method && ep.regex.test(call.path)) {
            coveredEndpoints.add(i);
          }
        }
      }
    }
  };

  for (const f of featureFiles) processFile(f, extractFromFeature);
  for (const f of stepFiles) processFile(f, extractFromStepDef);

  const totalItems = endpoints.length;
  const coveredItems = endpoints.length > 0
    ? [...coveredEndpoints].filter((v) => typeof v === 'number').length
    : coveredEndpoints.size;
  const coveragePercent =
    totalItems > 0 ? parseFloat(((coveredItems / totalItems) * 100).toFixed(2)) : 0;

  return {
    type: 'endpoint-cucumber',
    totalItems,
    coveredItems,
    coveragePercent,
    details: {
      language: 'cucumber',
      endpoints: endpoints.map((ep, i) => ({
        method: ep.method,
        path: ep.path,
        covered: coveredEndpoints.has(i),
        languages: coveredEndpoints.has(i) ? ['cucumber'] : [],
      })),
      featureFilesScanned: featureFiles.length,
      stepFilesScanned: stepFiles.length,
    },
  };
}

module.exports = { analyze };
