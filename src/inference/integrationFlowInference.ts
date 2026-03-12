/**
 * Integration Flow Inference Engine
 *
 * When no `integration-flows.yaml` file is present, this engine constructs
 * integration flows automatically by analyzing:
 *
 *  - Sequences of HTTP calls within a single test function / scenario
 *  - Cucumber scenario steps (Given / When / Then)
 *  - Chained request helper calls (createUser → login → createPayment)
 *
 * Inferred flows are labeled and include source traceability.
 *
 * Generated artifact: reports/inferred-integration-flows.json
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Public types ─────────────────────────────────────────────────────────────

export type FlowSource = 'inferred' | 'explicit';

export interface FlowStep {
  /** HTTP method */
  method: string;
  /** URL path (may contain path params) */
  path: string;
  /** Step description */
  description?: string;
}

export interface InferredIntegrationFlow {
  /** Stable identifier */
  id: string;
  /** Human-readable flow name */
  name: string;
  flow_source: FlowSource;
  /** Steps in execution order */
  steps: FlowStep[];
  /** File and line where the sequence was found */
  source_location: string;
  /** Test function / scenario name (if detectable) */
  test_name?: string;
}

export interface IntegrationFlowInferenceResult {
  flows: InferredIntegrationFlow[];
  filesAnalyzed: number;
  inferred: boolean;
  warnings: string[];
}

// ─── HTTP call detection patterns ────────────────────────────────────────────

interface HttpCallPattern {
  pattern: RegExp;
  methodGroup: number;
  pathGroup: number;
}

const HTTP_CALL_PATTERNS: HttpCallPattern[] = [
  // Axios / fetch / supertest: axios.get('/path'), .post('/path'), request.get('/path')
  { pattern: /(?:axios|request|client|api|http|supertest)\.(get|post|put|patch|delete|head)\s*\(\s*['"`]([^'"`]+)['"`]/i, methodGroup: 1, pathGroup: 2 },
  // RestAssured / Spring MockMvc: given().when().get("/path")
  { pattern: /\.(?:when\(\)\.)?(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/i, methodGroup: 1, pathGroup: 2 },
  // Python requests: requests.get('http://...', ...) / client.post('/path')
  { pattern: /(?:requests|client|self\.client|self\.app\.test_client\(\))\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`\s]+)['"`]/i, methodGroup: 1, pathGroup: 2 },
  // Ruby HTTParty / Rails: get '/path', post '/path'
  { pattern: /\b(get|post|put|patch|delete)\s+['"`]([^'"`\s]+)['"`]/i, methodGroup: 1, pathGroup: 2 },
  // fetch('/path', { method: 'POST' })
  { pattern: /fetch\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*\{[^}]*method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE|HEAD)['"`]/i, methodGroup: 2, pathGroup: 1 },
  // WebTest TestApp: testapp.post_json(url_for('endpoint'), data)
  // Also handles: testapp.get(url_for('endpoint')), testapp.delete_json(...)
  { pattern: /(?:testapp|self\.testapp)\.(get_json|post_json|put_json|patch_json|delete_json|get|post|put|patch|delete)\s*\(\s*url_for\s*\(\s*['"]([^'"]+)['"]/i, methodGroup: 1, pathGroup: 2 },
  // WebTest without url_for: testapp.get('/path')
  { pattern: /(?:testapp|self\.testapp)\.(get_json|post_json|put_json|patch_json|delete_json|get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/i, methodGroup: 1, pathGroup: 2 },
];

/** Patterns for test function / scenario boundaries */
const TEST_FUNCTION_PATTERNS = [
  // Jest / Mocha / RSpec: it('name', ...) / test('name', ...)
  /(?:^|\s)(?:it|test|describe)\s*\(\s*['"`]([^'"`]+)['"`]/,
  // JUnit: @Test ... void testSomething()
  /@Test[\s\S]{0,200}void\s+(\w+)/,
  // Python pytest: def test_something():
  /def\s+(test_\w+)\s*\(/,
  // Ruby RSpec: it "name do"
  /it\s+['"]([^'"]+)['"]\s+do/,
  // Cucumber scenario
  /Scenario(?:\s+Outline)?:\s*(.+)/,
];

// ─── HTTP call extractor ─────────────────────────────────────────────────────

interface ExtractedCall {
  method: string;
  path: string;
  lineIdx: number;
}

function extractHttpCallsFromLines(lines: string[]): ExtractedCall[] {
  const calls: ExtractedCall[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const p of HTTP_CALL_PATTERNS) {
      const m = line.match(p.pattern);
      if (m) {
        const method = m[p.methodGroup].toUpperCase();
        // Normalize WebTest _json suffix: POST_JSON → POST, GET_JSON → GET
        const normalizedMethod = method.replace(/_JSON$/, '') as string;
        const rawPath = m[p.pathGroup];
        // Skip unlikely paths (full URLs with domain, non-path values)
        if (rawPath.startsWith('http') && !rawPath.includes('/api')) continue;
        const cleanPath = extractPathFromUrl(rawPath);
        if (!cleanPath) continue;
        calls.push({ method: normalizedMethod, path: cleanPath, lineIdx: i });
        break; // only first pattern match per line
      }
    }
  }
  return calls;
}

function extractPathFromUrl(raw: string): string | undefined {
  if (raw.startsWith('/')) return raw;
  // url_for endpoint name: 'blueprint.function' — treat as pseudo-path
  if (/^\w+\.\w+$/.test(raw)) return `/${raw.replace('.', '/')}`;
  try {
    const u = new URL(raw);
    return u.pathname || undefined;
  } catch {
    // not a full URL — check plain path-like
    if (/^[\w/{}._-]+$/.test(raw) && raw.includes('/')) return raw;
    return undefined;
  }
}

// ─── Test boundary detection ──────────────────────────────────────────────────

function detectTestName(lines: string[], lineIdx: number): string | undefined {
  // Look up to 20 lines above for a test function boundary
  const window = lines.slice(Math.max(0, lineIdx - 20), lineIdx + 1);
  for (let i = window.length - 1; i >= 0; i--) {
    for (const p of TEST_FUNCTION_PATTERNS) {
      const m = window[i].match(p);
      if (m) return m[1].trim();
    }
  }
  return undefined;
}

// ─── Flow grouping ────────────────────────────────────────────────────────────

/**
 * Group extracted HTTP calls into flows.
 *
 * Strategy: calls within the same test function (± 50 lines) form a flow.
 * Calls with no shared context become single-step "isolated" flows.
 */
function groupCallsIntoFlows(
  calls: ExtractedCall[],
  filePath: string,
  lines: string[],
): InferredIntegrationFlow[] {
  if (calls.length === 0) return [];

  const flows: InferredIntegrationFlow[] = [];
  let currentGroup: ExtractedCall[] = [];
  let currentTestName: string | undefined;

  for (let i = 0; i < calls.length; i++) {
    const call   = calls[i];
    const tName  = detectTestName(lines, call.lineIdx);

    if (i === 0) {
      currentTestName = tName;
      currentGroup    = [call];
    } else {
      const prev = calls[i - 1];
      // Same test or within 50 lines → same flow
      if (
        (tName && tName === currentTestName) ||
        (!tName && call.lineIdx - prev.lineIdx <= 50)
      ) {
        currentGroup.push(call);
      } else {
        // Flush current group as a flow
        if (currentGroup.length >= 2) {
          flows.push(buildFlow(currentGroup, currentTestName, filePath));
        }
        currentTestName = tName;
        currentGroup    = [call];
      }
    }
  }

  // Flush last group
  if (currentGroup.length >= 2) {
    flows.push(buildFlow(currentGroup, currentTestName, filePath));
  }

  return flows;
}

function buildFlow(
  calls: ExtractedCall[],
  testName: string | undefined,
  filePath: string,
): InferredIntegrationFlow {
  const steps: FlowStep[] = calls.map((c) => ({
    method: c.method,
    path: c.path,
  }));

  const firstLine = calls[0].lineIdx + 1;
  const baseName  = path.basename(filePath, path.extname(filePath));
  const flowLabel = testName ?? `flow_at_line_${firstLine}`;
  const id        = `${toSnakeCase(baseName)}_${toSnakeCase(flowLabel)}`;

  return {
    id,
    name: testName ? humanize(testName) : `Flow in ${path.basename(filePath)}:${firstLine}`,
    flow_source: 'inferred',
    steps,
    source_location: `${filePath}:${firstLine}`,
    test_name: testName,
  };
}

// ─── Core inference function ──────────────────────────────────────────────────

/**
 * Infer integration flows from a single test file.
 */
export function inferFlowsFromFile(filePath: string): InferredIntegrationFlow[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const lines = content.split('\n');
  const calls = extractHttpCallsFromLines(lines);
  return groupCallsIntoFlows(calls, filePath, lines);
}

/**
 * Infer integration flows from service source files (not test files).
 *
 * Used as a fallback when no test files are present (e.g. frontend-only projects).
 * Only produces flows for source files that contain 2+ HTTP calls in the same function.
 */
export function inferFlowsFromSourceFiles(serviceFiles: string[]): InferredIntegrationFlow[] {
  const allFlows: InferredIntegrationFlow[] = [];
  for (const fp of serviceFiles) {
    let content: string;
    try {
      content = fs.readFileSync(fp, 'utf-8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    const calls = extractHttpCallsFromLines(lines);
    if (calls.length < 2) continue;
    const flows = groupCallsIntoFlows(calls, fp, lines);
    allFlows.push(...flows);
  }
  return allFlows;
}

/**
 * Run flow inference across all provided test files.
 *
 * When `testFiles` is empty and `serviceFiles` is provided, flows are inferred
 * from the service source code instead and tagged accordingly.
 */
export function inferIntegrationFlows(
  testFiles: string[],
  warnings: string[] = [],
  serviceFiles?: string[],
): IntegrationFlowInferenceResult {
  if (testFiles.length === 0 && serviceFiles && serviceFiles.length > 0) {
    warnings.push('No test files found; integration flows inferred from service source code.');
    const flows = inferFlowsFromSourceFiles(serviceFiles);
    if (flows.length === 0) {
      warnings.push('No multi-step HTTP call sequences detected in service source files; integration flow inference produced no results.');
    }
    return { flows, filesAnalyzed: serviceFiles.length, inferred: true, warnings };
  }

  if (testFiles.length === 0) {
    warnings.push('No test files provided; integration flow inference skipped.');
    return { flows: [], filesAnalyzed: 0, inferred: true, warnings };
  }

  const allFlows: InferredIntegrationFlow[] = [];
  let filesAnalyzed = 0;

  for (const fp of testFiles) {
    const fileFlows = inferFlowsFromFile(fp);
    if (fileFlows.length > 0) {
      allFlows.push(...fileFlows);
    }
    filesAnalyzed++;
  }

  if (allFlows.length === 0) {
    warnings.push('No multi-step HTTP call sequences detected in test files; integration flow inference produced no results.');
  }

  return {
    flows: allFlows,
    filesAnalyzed,
    inferred: true,
    warnings,
  };
}

/**
 * Write inferred integration flows to the reports directory.
 * Returns the path of the written file.
 */
export function writeInferredIntegrationFlows(
  result: IntegrationFlowInferenceResult,
  reportsDir: string,
): string {
  fs.mkdirSync(reportsDir, { recursive: true });
  const outputPath = path.join(reportsDir, 'inferred-integration-flows.json');
  const output = {
    generated_at: new Date().toISOString(),
    flow_source: 'inferred',
    files_analyzed: result.filesAnalyzed,
    flow_count: result.flows.length,
    flows: result.flows,
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  return outputPath;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/__+/g, '_');
}

function humanize(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}
