/**
 * graphql-coverage.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Sample plugin that analyses GraphQL schema coverage.
 *
 * It reads a `schema.graphql` file (or an introspection JSON) to discover
 * all types and fields, then scans test files for GraphQL query strings to
 * determine which fields are exercised by tests.
 *
 * Usage
 * ─────
 * Add the plugin to your `coverage.config.json`:
 *
 *   {
 *     "plugins": ["./plugins/graphql-coverage.js"]
 *   }
 *
 * Place a `schema.graphql` file in your project root (or set the path via
 * the `graphqlSchemaPath` property in your config).
 *
 * Plugin context (from the analyser):
 *   context.spec         – parsed OpenAPI spec (not used by this plugin)
 *   context.testPatterns – glob patterns for test files
 *   context.results      – built-in coverage results
 *   context.config       – full resolved config
 *
 * Returned result type: "graphql"
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');
const glob = require('fast-glob');

// ─── Schema parsing ───────────────────────────────────────────────────────────

/**
 * Extract a flat list of "TypeName.fieldName" strings from a GraphQL SDL string.
 * This is a lightweight parser that does NOT depend on a GraphQL library,
 * making the plugin zero-dependency beyond fast-glob.
 */
function parseSchemaFields(sdl) {
  const fields = [];
  // Match type / input / interface blocks
  const typeRegex = /(?:type|input|interface)\s+(\w+)\s*(?:implements\s+[^{]+)?\{([^}]*)\}/g;
  let typeMatch;
  while ((typeMatch = typeRegex.exec(sdl)) !== null) {
    const typeName = typeMatch[1];
    // Skip built-in scalar/introspection types
    if (typeName.startsWith('__') || ['Query', 'Mutation', 'Subscription'].includes(typeName)) {
      // Still include Query/Mutation/Subscription fields – they are the API surface
    }
    const body = typeMatch[2];
    // Match field names (word chars before colon or open-paren)
    const fieldRegex = /^\s*(\w+)\s*(?:\([^)]*\))?\s*:/gm;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(body)) !== null) {
      fields.push(`${typeName}.${fieldMatch[1]}`);
    }
  }
  return fields;
}

/**
 * Scan test file contents for GraphQL field references.
 * Looks for field names used inside query/mutation strings or `gql` template literals.
 */
function extractQueriedFields(testContents) {
  const queried = new Set();

  // Match gql`…` template literals and plain graphql strings (between backticks or quotes)
  const gqlBlockRegex = /(?:gql`|`\s*(?:query|mutation|subscription|fragment))[^`]*`/gs;

  for (const content of testContents) {
    let blockMatch;
    // Collect text from gql blocks
    const blocks = [];
    const blockRe = /(?:gql`|`\s*(?:query|mutation|subscription|fragment))[^`]*`/gs;
    while ((blockMatch = blockRe.exec(content)) !== null) {
      blocks.push(blockMatch[0]);
    }
    // Also look for plain string literals that look like GraphQL
    const plainRe = /["'`]([\s\S]*?(?:query|mutation|subscription)\s+\w+[\s\S]*?)["'`]/g;
    while ((blockMatch = plainRe.exec(content)) !== null) {
      blocks.push(blockMatch[1]);
    }

    for (const block of blocks) {
      // Extract field names from the query block (word chars followed by optional args / braces)
      const fieldRe = /\b(\w+)\s*(?:\([^)]*\))?\s*\{/g;
      let m;
      while ((m = fieldRe.exec(block)) !== null) {
        // Skip GraphQL keywords
        const name = m[1];
        if (!['query', 'mutation', 'subscription', 'fragment', 'on'].includes(name)) {
          queried.add(name);
        }
      }
      // Also capture leaf fields (word chars not followed by braces)
      const leafRe = /\b(\w+)\b(?!\s*[:{(])/g;
      while ((m = leafRe.exec(block)) !== null) {
        const name = m[1];
        if (!['query', 'mutation', 'subscription', 'fragment', 'on', 'true', 'false', 'null'].includes(name)) {
          queried.add(name);
        }
      }
    }
  }

  return queried;
}

// ─── Plugin entry-point ───────────────────────────────────────────────────────

/**
 * Analyse GraphQL schema coverage.
 *
 * @param {object} context
 * @param {string[]} context.testPatterns - Glob patterns used to locate test files
 * @param {object}  context.config        - Resolved configuration
 * @returns {Promise<object>} CoverageResult with type "graphql"
 */
async function analyze({ testPatterns, config }) {
  const cwd = process.cwd();

  // ── Locate schema ──────────────────────────────────────────────────────────
  const schemaPath = path.resolve(cwd, 'schema.graphql');
  let allFields = [];

  if (fs.existsSync(schemaPath)) {
    const sdl = fs.readFileSync(schemaPath, 'utf-8');
    allFields = parseSchemaFields(sdl);
  } else {
    // No schema found – return a zero-coverage result
    return {
      type: 'graphql',
      totalItems: 0,
      coveredItems: 0,
      coveragePercent: 0,
      details: {
        message: `No schema.graphql found at ${schemaPath}. Create one to enable GraphQL coverage analysis.`,
        fields: [],
      },
    };
  }

  // ── Load test files ────────────────────────────────────────────────────────
  const patterns = (testPatterns && testPatterns.length > 0)
    ? testPatterns
    : ['tests/**/*.ts', 'tests/**/*.js', 'sample/tests/**/*.ts'];

  const testFiles = await glob(patterns, { cwd, absolute: true });

  const testContents = testFiles.map((f) => {
    try { return fs.readFileSync(f, 'utf-8'); } catch { return ''; }
  });

  // ── Compute coverage ───────────────────────────────────────────────────────
  const queriedFields = extractQueriedFields(testContents);

  const coveredFields = allFields.filter((f) => {
    const fieldName = f.split('.')[1];
    return queriedFields.has(fieldName);
  });

  const uncoveredFields = allFields.filter((f) => {
    const fieldName = f.split('.')[1];
    return !queriedFields.has(fieldName);
  });

  const totalItems = allFields.length;
  const coveredItems = coveredFields.length;
  const coveragePercent =
    totalItems > 0 ? parseFloat(((coveredItems / totalItems) * 100).toFixed(2)) : 0;

  return {
    type: 'graphql',
    totalItems,
    coveredItems,
    coveragePercent,
    details: {
      fields: allFields.map((f) => ({
        field: f,
        covered: coveredFields.includes(f),
      })),
      uncoveredFields,
    },
  };
}

module.exports = { analyze };
