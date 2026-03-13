import SwaggerParser from '@apidevtools/swagger-parser';
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import { OpenAPIV3 } from 'openapi-types';
import type { AstAnalysisConfig, DeepAnalysisCoverageConfig } from './config/types';
import {
  analyzeFile as astAnalyzeFile,
  buildAnalysisContext,
  registerAllAnalyzers,
} from './ast/astAnalysisOrchestrator';
import type { ResolvedHttpInteraction, SupportedLanguage } from './ast/astTypes';

// ─── Data structures ─────────────────────────────────────────────────────────

export interface SchemaConstraints {
  type?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: unknown[];
}

export interface ParameterInfo {
  /** e.g. "POST /users" */
  endpoint: string;
  method: string;
  path: string;
  name: string;
  location: 'path' | 'query' | 'header' | 'body';
  required: boolean;
  schema: SchemaConstraints;
}

export interface ParameterCoverage {
  parameter: ParameterInfo;
  validValue: boolean;
  boundaryValue: boolean;
  missing: boolean;
  invalidValue: boolean;
  /** Fraction of the four categories that are covered (0–1). */
  ratio: number;
  /**
   * AST metadata when at least one coverage category was informed by semantic
   * analysis rather than text scanning alone.
   */
  astMetadata?: {
    sourceLanguage?: string;
    resolutionType?: string;
    confidence?: string;
  };
}

/**
 * Options to enable AST-augmented parameter coverage analysis.
 * When provided, the AST layer supplements text-scan detection with
 * semantic parameter scenario signals from language analyzers.
 */
export interface AstParameterAnalysisOptions {
  astConfig: AstAnalysisConfig;
  deepConfig?: DeepAnalysisCoverageConfig;
}

export interface ParameterCoverageReport {
  totalParameters: number;
  averageCoverage: number;
  fullyCoveredPercentage: number;
  uncoveredParameters: ParameterInfo[];
  parameters: ParameterCoverage[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSchemaConstraints(schema: OpenAPIV3.SchemaObject | undefined): SchemaConstraints {
  if (!schema) return {};
  return {
    type: schema.type,
    format: schema.format,
    minimum: (schema as OpenAPIV3.NonArraySchemaObject).minimum,
    maximum: (schema as OpenAPIV3.NonArraySchemaObject).maximum,
    minLength: (schema as OpenAPIV3.NonArraySchemaObject).minLength,
    maxLength: (schema as OpenAPIV3.NonArraySchemaObject).maxLength,
    pattern: (schema as OpenAPIV3.NonArraySchemaObject).pattern,
    enum: schema.enum,
  };
}

// ─── Parameter parsing ───────────────────────────────────────────────────────

/**
 * Parse an OpenAPI 3 spec file and return a flat list of all parameters,
 * including request-body properties treated as body parameters.
 */
export async function parseParameters(specPath: string): Promise<ParameterInfo[]> {
  const api = (await SwaggerParser.dereference(specPath)) as OpenAPIV3.Document;
  const params: ParameterInfo[] = [];

  if (!api.paths) return params;

  for (const [apiPath, pathItem] of Object.entries(api.paths)) {
    if (!pathItem) continue;

    // Path-level parameters (shared across all operations in this path)
    const pathLevelParams = ((pathItem as OpenAPIV3.PathItemObject).parameters ?? []) as OpenAPIV3.ParameterObject[];

    for (const method of HTTP_METHODS) {
      const operation = (pathItem as Record<string, unknown>)[method] as OpenAPIV3.OperationObject | undefined;
      if (!operation) continue;

      const endpoint = `${method.toUpperCase()} ${apiPath}`;

      // Merge path-level and operation-level parameters; operation-level wins
      const mergedParams = new Map<string, OpenAPIV3.ParameterObject>();
      for (const p of pathLevelParams) {
        mergedParams.set(`${p.in}:${p.name}`, p);
      }
      const operationParams = (operation.parameters ?? []) as OpenAPIV3.ParameterObject[];
      for (const p of operationParams) {
        mergedParams.set(`${p.in}:${p.name}`, p);
      }

      for (const p of mergedParams.values()) {
        params.push({
          endpoint,
          method: method.toUpperCase(),
          path: apiPath,
          name: p.name,
          location: p.in as 'path' | 'query' | 'header',
          required: p.required === true || p.in === 'path',
          schema: extractSchemaConstraints(p.schema as OpenAPIV3.SchemaObject | undefined),
        });
      }

      // Request body – treat each top-level JSON schema property as a parameter
      if (operation.requestBody) {
        const rb = operation.requestBody as OpenAPIV3.RequestBodyObject;
        const jsonContent = rb.content?.['application/json'];
        if (jsonContent?.schema) {
          const schema = jsonContent.schema as OpenAPIV3.SchemaObject;
          if (schema.type === 'object' && schema.properties) {
            const required: string[] = (schema as OpenAPIV3.NonArraySchemaObject).required ?? [];
            for (const [propName, propSchema] of Object.entries(schema.properties)) {
              params.push({
                endpoint,
                method: method.toUpperCase(),
                path: apiPath,
                name: propName,
                location: 'body',
                required: required.includes(propName),
                schema: extractSchemaConstraints(propSchema as OpenAPIV3.SchemaObject | undefined),
              });
            }
          }
        }
      }
    }
  }

  return params;
}

// ─── AST augmentation ─────────────────────────────────────────────────────────

/**
 * Infer coverage category flags from a `parameterScenarios` string array (as
 * populated by language analyzers) or from the interaction's semantic context.
 */
function scenariosToFlags(
  scenarios: string[],
): { validValue: boolean; boundaryValue: boolean; missing: boolean; invalidValue: boolean } {
  const s = scenarios.map((x) => x.toLowerCase());
  return {
    validValue:
      s.includes('valid') ||
      s.includes('happy-path') ||
      s.includes('success') ||
      s.includes('positive'),
    boundaryValue:
      s.includes('boundary') ||
      s.includes('min') ||
      s.includes('max') ||
      s.includes('edge') ||
      s.includes('zero') ||
      s.includes('empty') ||
      s.includes('oversized'),
    missing:
      s.includes('missing') ||
      s.includes('missing-required') ||
      s.includes('absent') ||
      s.includes('omitted'),
    invalidValue:
      s.includes('invalid') ||
      s.includes('invalid-value') ||
      s.includes('bad-value') ||
      s.includes('wrong-type') ||
      s.includes('malformed') ||
      s.includes('null') ||
      s.includes('invalid-enum'),
  };
}

/**
 * Detect the language of a file from its extension for AST analysis.
 */
function detectLanguage(filePath: string): SupportedLanguage {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
    case '.jsx':
      return 'javascript';
    case '.java':
      return 'java';
    case '.kt':
    case '.kts':
      return 'kotlin';
    case '.py':
      return 'python';
    case '.rb':
      return 'ruby';
    case '.feature':
      return 'cucumber';
    default:
      return 'auto';
  }
}

/**
 * Normalize an endpoint path (possibly with {param} placeholders) so that it
 * can be compared against an OpenAPI path template.
 * e.g. '/users/123' → '/users/{id}' won't match — but '/users/{id}' → '/users/{id}' will.
 * We strip the query string and trailing slash for a loose match.
 */
function normalizePath(p: string): string {
  return p.split('?')[0].replace(/\/$/, '').toLowerCase();
}

/**
 * Return true when the interaction's resolved path loosely matches the
 * OpenAPI path template (e.g. /users/{id} ≈ /users/).
 */
function pathMatches(interaction: ResolvedHttpInteraction, apiPath: string): boolean {
  const iPath = normalizePath(interaction.normalizedPath ?? interaction.path);
  const aPath = normalizePath(apiPath);
  // Exact match
  if (iPath === aPath) return true;
  // OpenAPI template prefix match: /users/{id} starts with /users
  const templateBase = aPath.split('{')[0].replace(/\/$/, '');
  if (templateBase && iPath.startsWith(templateBase)) return true;
  return false;
}

type AstInteractionMap = Map<string, ResolvedHttpInteraction[]>;

/**
 * Run AST analysis over all files matching `testGlob` and build a map of
 * endpoint path → interactions for quick lookup during parameter coverage.
 */
function buildAstInteractionMap(
  testFiles: string[],
  astOptions: AstParameterAnalysisOptions,
): AstInteractionMap {
  registerAllAnalyzers();
  const context = buildAnalysisContext(astOptions.astConfig, astOptions.deepConfig);
  const map: AstInteractionMap = new Map();

  for (const filePath of testFiles) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }
    const lang = detectLanguage(filePath);
    const interactions = astAnalyzeFile(content, filePath, lang, context);
    for (const interaction of interactions) {
      const key = normalizePath(interaction.normalizedPath ?? interaction.path);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(interaction);
    }
  }

  return map;
}

/**
 * Given all AST interactions that match a parameter's endpoint path, compute
 * AST-derived coverage flags and metadata.
 */
function deriveAstCoverage(
  matchingInteractions: ResolvedHttpInteraction[],
): {
  validValue: boolean;
  boundaryValue: boolean;
  missing: boolean;
  invalidValue: boolean;
  astMetadata?: ParameterCoverage['astMetadata'];
} {
  let validValue = false;
  let boundaryValue = false;
  let missing = false;
  let invalidValue = false;
  let bestInteraction: ResolvedHttpInteraction | undefined;

  for (const interaction of matchingInteractions) {
    // Use parameterScenarios if populated
    if (interaction.parameterScenarios && interaction.parameterScenarios.length > 0) {
      const flags = scenariosToFlags(interaction.parameterScenarios);
      validValue = validValue || flags.validValue;
      boundaryValue = boundaryValue || flags.boundaryValue;
      missing = missing || flags.missing;
      invalidValue = invalidValue || flags.invalidValue;
    }
    // Pick the highest-confidence interaction for metadata
    if (
      !bestInteraction ||
      (interaction.confidence === 'high' && bestInteraction.confidence !== 'high') ||
      (interaction.confidence === 'medium' && bestInteraction.confidence === 'low')
    ) {
      bestInteraction = interaction;
    }
  }

  const astMetadata: ParameterCoverage['astMetadata'] = bestInteraction
    ? {
        sourceLanguage: bestInteraction.sourceLanguage,
        resolutionType: bestInteraction.resolutionType,
        confidence: bestInteraction.confidence,
      }
    : undefined;

  return { validValue, boundaryValue, missing, invalidValue, astMetadata };
}

// ─── Coverage detection ───────────────────────────────────────────────────────

interface TestSegment {
  description: string;
  content: string;
}

/**
 * Split a test file into individual test blocks (test / it declarations).
 * Each block includes its description and the code up to the next test.
 */
function extractTestSegments(fileContents: string): TestSegment[] {
  const segments: TestSegment[] = [];
  // Match `test('...', ` or `it('...', ` with any quote style
  const declPattern = /\b(?:test|it)\s*\(\s*(['"`])([\s\S]*?)\1/g;
  const positions: Array<{ start: number; desc: string }> = [];

  let m: RegExpExecArray | null;
  while ((m = declPattern.exec(fileContents)) !== null) {
    positions.push({ start: m.index, desc: m[2] });
  }

  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].start;
    const end = i + 1 < positions.length ? positions[i + 1].start : fileContents.length;
    segments.push({ description: positions[i].desc, content: fileContents.slice(start, end) });
  }

  return segments;
}

/**
 * Determine which coverage categories a single test segment addresses
 * for the given parameter.
 */
function classifySegment(
  segment: TestSegment,
  param: ParameterInfo,
): { validValue: boolean; boundaryValue: boolean; missing: boolean; invalidValue: boolean } {
  const descLower = segment.description.toLowerCase();
  const contentLower = segment.content.toLowerCase();
  const paramNameLower = param.name.toLowerCase();

  // A segment is relevant if it mentions the base path (before any '{') OR the parameter name
  const pathBase = param.path.split('{')[0].toLowerCase();
  const mentionsPath = contentLower.includes(pathBase);
  const mentionsParam = contentLower.includes(paramNameLower);

  if (!mentionsPath && !mentionsParam) {
    return { validValue: false, boundaryValue: false, missing: false, invalidValue: false };
  }

  // ── Invalid ──────────────────────────────────────────────────────────────
  let invalidValue = false;
  if (descLower.includes('invalid') || descLower.includes('wrong type') || descLower.includes('bad type')) {
    invalidValue = true;
  }
  // null/undefined assigned to the param in object literal
  const nullPattern = new RegExp(`['"]?${escapeRegex(param.name)}['"]?\\s*:\\s*(null|undefined)`, 'i');
  if (nullPattern.test(segment.content)) {
    invalidValue = true;
  }
  // Wrong type: string value for an integer param
  if (param.schema.type === 'integer' || param.schema.type === 'number') {
    const wrongTypePattern = new RegExp(
      `['"]?${escapeRegex(param.name)}['"]?\\s*:\\s*['"][^'"]+['"]`,
      'i',
    );
    if (wrongTypePattern.test(segment.content)) {
      invalidValue = true;
    }
  }

  // ── Missing ───────────────────────────────────────────────────────────────
  let missing = false;
  if (descLower.includes('missing') || descLower.includes('without') || descLower.includes('omit')) {
    missing = true;
  }
  // Required body param absent from an object literal in the test
  if (param.required && param.location === 'body') {
    const bodyLiteralPattern = /\{[^{}]*\}/g;
    let bm: RegExpExecArray | null;
    while ((bm = bodyLiteralPattern.exec(segment.content)) !== null) {
      const obj = bm[0];
      // Only consider non-empty object literals that have at least one key
      if (/['"]?\w+['"]?\s*:/.test(obj) && !obj.toLowerCase().includes(paramNameLower)) {
        missing = true;
      }
    }
  }

  // ── Boundary ──────────────────────────────────────────────────────────────
  let boundaryValue = false;
  if (
    descLower.includes('boundary') ||
    descLower.includes('edge') ||
    descLower.includes('min ') ||
    descLower.includes('max ') ||
    descLower.includes('minimum') ||
    descLower.includes('maximum') ||
    descLower.includes('zero') ||
    descLower.includes('empty') ||
    descLower.includes('limit')
  ) {
    boundaryValue = true;
  }
  if (param.schema.type === 'integer' || param.schema.type === 'number') {
    // 0 or 1 are common boundary values; also check schema min/max explicitly
    const zeroOrOnePattern = new RegExp(
      `['"]?${escapeRegex(param.name)}['"]?\\s*:\\s*(?:0|1)\\b`,
      'i',
    );
    if (zeroOrOnePattern.test(segment.content)) {
      boundaryValue = true;
    }
    if (param.schema.minimum !== undefined) {
      const minValPattern = new RegExp(
        `['"]?${escapeRegex(param.name)}['"]?\\s*:\\s*${param.schema.minimum}\\b`,
        'i',
      );
      if (minValPattern.test(segment.content)) {
        boundaryValue = true;
      }
    }
    if (param.schema.maximum !== undefined) {
      const maxValPattern = new RegExp(
        `['"]?${escapeRegex(param.name)}['"]?\\s*:\\s*${param.schema.maximum}\\b`,
        'i',
      );
      if (maxValPattern.test(segment.content)) {
        boundaryValue = true;
      }
    }
    // Boundary integer in URL (e.g. /users/1 or /users/0)
    if (param.location === 'path') {
      const urlBoundaryPattern = new RegExp(`${escapeRegex(pathBase)}(?:0|1)(?:[/?#]|$)`, 'i');
      if (urlBoundaryPattern.test(segment.content)) {
        boundaryValue = true;
      }
    }
    // Boundary query param value (e.g. limit=1, limit=0)
    if (param.location === 'query') {
      const queryBoundaryPattern = new RegExp(`[?&]${escapeRegex(param.name)}=(?:0|1)(?:[&# ]|$)`, 'i');
      if (queryBoundaryPattern.test(segment.content)) {
        boundaryValue = true;
      }
    }
  } else if (param.schema.type === 'string') {
    // Empty string in object literal
    const emptyPattern = new RegExp(`['"]?${escapeRegex(param.name)}['"]?\\s*:\\s*['"]\\s*['"]`, 'i');
    if (emptyPattern.test(segment.content)) {
      boundaryValue = true;
    }
    // Single-character string value (covers minLength: 1 boundary)
    const singleCharPattern = new RegExp(`['"]?${escapeRegex(param.name)}['"]?\\s*:\\s*['"][^'"]{1}['"]`, 'i');
    if (singleCharPattern.test(segment.content)) {
      boundaryValue = true;
    }
    // Query / header single char (e.g. ?q=a or X-Api-Key: k)
    if (param.location === 'query') {
      const querySingleCharPattern = new RegExp(`[?&]${escapeRegex(param.name)}=[^&# ]{1}(?:[&# ]|$)`, 'i');
      if (querySingleCharPattern.test(segment.content)) {
        boundaryValue = true;
      }
      // Empty query value
      const queryEmptyPattern = new RegExp(`[?&]${escapeRegex(param.name)}=(?:[&# ]|$)`, 'i');
      if (queryEmptyPattern.test(segment.content)) {
        boundaryValue = true;
      }
    }
    if (param.location === 'header') {
      // Header with single-char value
      const headerSingleCharPattern = new RegExp(`['"]?${escapeRegex(param.name)}['"]?\\s*:\\s*['"][^'"]{1}['"]`, 'i');
      if (headerSingleCharPattern.test(segment.content)) {
        boundaryValue = true;
      }
      // Header with empty value
      const headerEmptyPattern = new RegExp(`['"]?${escapeRegex(param.name)}['"]?\\s*:\\s*['"]\\s*['"]`, 'i');
      if (headerEmptyPattern.test(segment.content)) {
        boundaryValue = true;
      }
    }
  }

  // ── Valid ─────────────────────────────────────────────────────────────────
  let validValue = false;
  if (descLower.includes('valid') && !descLower.includes('invalid')) {
    validValue = true;
  }
  if (descLower.includes('success') || descLower.includes('creates') || /returns? 2\d{2}/.test(descLower)) {
    validValue = true;
  }
  // If the segment mentions the param and is not categorized as boundary/invalid/missing, treat as valid
  if (!validValue && !boundaryValue && !invalidValue && !missing && mentionsParam && mentionsPath) {
    validValue = true;
  }

  return { validValue, boundaryValue, missing, invalidValue };
}

/**
 * For each parameter, scan test files and determine which coverage
 * categories are satisfied. Optionally augments text-scan results with
 * AST-derived semantic signals when `astOptions` is provided.
 */
export async function analyzeParameterCoverage(
  params: ParameterInfo[],
  testGlob: string,
  astOptions?: AstParameterAnalysisOptions,
): Promise<ParameterCoverage[]> {
  const testFiles = await fg(testGlob, { onlyFiles: true });

  // Pre-read all test files and extract test segments
  const allSegments: TestSegment[] = [];
  for (const filePath of testFiles) {
    const contents = fs.readFileSync(filePath, 'utf-8');
    allSegments.push(...extractTestSegments(contents));
  }

  // Build AST interaction map if AST options provided
  const astMap: AstInteractionMap | null = astOptions
    ? buildAstInteractionMap(testFiles, astOptions)
    : null;

  return params.map((param) => {
    // ── Text-scan pass ──────────────────────────────────────────────────────
    let validValue = false;
    let boundaryValue = false;
    let missing = false;
    let invalidValue = false;

    for (const segment of allSegments) {
      const result = classifySegment(segment, param);
      validValue = validValue || result.validValue;
      boundaryValue = boundaryValue || result.boundaryValue;
      missing = missing || result.missing;
      invalidValue = invalidValue || result.invalidValue;
    }

    // ── AST augmentation pass ───────────────────────────────────────────────
    let astMetadata: ParameterCoverage['astMetadata'] | undefined;

    if (astMap !== null) {
      // Collect all interactions that match this parameter's endpoint path
      const matchingInteractions: ResolvedHttpInteraction[] = [];
      for (const [, interactions] of astMap) {
        for (const interaction of interactions) {
          if (
            pathMatches(interaction, param.path) &&
            interaction.method.toUpperCase() === param.method.toUpperCase()
          ) {
            matchingInteractions.push(interaction);
          }
        }
      }

      if (matchingInteractions.length > 0) {
        const astResult = deriveAstCoverage(matchingInteractions);
        // Merge: OR semantics — AST supplements but never removes text-scan coverage
        validValue = validValue || astResult.validValue;
        boundaryValue = boundaryValue || astResult.boundaryValue;
        missing = missing || astResult.missing;
        invalidValue = invalidValue || astResult.invalidValue;
        astMetadata = astResult.astMetadata;
      }
    }

    const categoriesCovered = [validValue, boundaryValue, missing, invalidValue].filter(Boolean).length;
    const ratio = categoriesCovered / 4;

    return { parameter: param, validValue, boundaryValue, missing, invalidValue, ratio, astMetadata };
  });
}

// ─── Report building ──────────────────────────────────────────────────────────

/**
 * Aggregate individual parameter coverages into a summary report.
 */
export function buildParameterCoverageReport(coverages: ParameterCoverage[]): ParameterCoverageReport {
  const total = coverages.length;
  if (total === 0) {
    return {
      totalParameters: 0,
      averageCoverage: 0,
      fullyCoveredPercentage: 0,
      uncoveredParameters: [],
      parameters: [],
    };
  }

  const totalRatio = coverages.reduce((sum, c) => sum + c.ratio, 0);
  const averageCoverage = Math.round((totalRatio / total) * 10000) / 100;

  const fullyCovered = coverages.filter((c) => c.ratio === 1).length;
  const fullyCoveredPercentage = Math.round((fullyCovered / total) * 10000) / 100;

  const uncoveredParameters = coverages
    .filter((c) => c.ratio === 0)
    .map((c) => c.parameter);

  return { totalParameters: total, averageCoverage, fullyCoveredPercentage, uncoveredParameters, parameters: coverages };
}

// ─── Report generation ────────────────────────────────────────────────────────

/**
 * Write JSON and HTML parameter-coverage reports to the given directory.
 */
export function generateParameterReports(report: ParameterCoverageReport, reportsDir: string): void {
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // ── JSON ─────────────────────────────────────────────────────────────────
  const jsonPath = path.join(reportsDir, 'parameter-coverage.json');
  const jsonReport = {
    totalParameters: report.totalParameters,
    averageCoverage: report.averageCoverage,
    fullyCoveredPercentage: report.fullyCoveredPercentage,
    uncoveredParameters: report.uncoveredParameters.map(({ endpoint, name, location, required }) => ({
      endpoint,
      name,
      location,
      required,
    })),
    parameters: report.parameters.map(
      ({ parameter: p, validValue, boundaryValue, missing, invalidValue, ratio }) => ({
        endpoint: p.endpoint,
        name: p.name,
        location: p.location,
        required: p.required,
        validValue,
        boundaryValue,
        missing,
        invalidValue,
        coveragePercent: Math.round(ratio * 100),
      }),
    ),
  };
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf-8');

  // ── HTML ─────────────────────────────────────────────────────────────────
  const htmlPath = path.join(reportsDir, 'parameter-coverage.html');

  const rows = report.parameters
    .map(({ parameter: p, validValue, boundaryValue, missing, invalidValue, ratio }) => {
      const pct = Math.round(ratio * 100);
      const rowClass = ratio === 1 ? 'full' : ratio === 0 ? 'none' : 'partial';
      const cell = (covered: boolean) =>
        covered ? '<td class="yes">✅</td>' : '<td class="no">❌</td>';
      return `    <tr class="${rowClass}">
      <td>${p.endpoint}</td>
      <td>${p.name}</td>
      <td>${p.location}</td>
      <td>${p.required ? 'Yes' : 'No'}</td>
      ${cell(validValue)}
      ${cell(boundaryValue)}
      ${cell(missing)}
      ${cell(invalidValue)}
      <td>${pct}%</td>
    </tr>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Parameter Coverage Report</title>
  <style>
    body { font-family: sans-serif; padding: 2rem; }
    h1 { margin-bottom: 0.5rem; }
    .summary { margin-bottom: 1.5rem; font-size: 1.1rem; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 0.5rem 1rem; text-align: left; }
    th { background: #f0f0f0; }
    tr.full { background: #e6ffe6; }
    tr.partial { background: #fffde6; }
    tr.none { background: #ffe6e6; }
    td.yes { color: #2a7a2a; font-weight: bold; }
    td.no  { color: #aa2222; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Parameter Coverage Report</h1>
  <div class="summary">
    <strong>${report.totalParameters}</strong> parameters analyzed &mdash;
    average coverage <strong>${report.averageCoverage}%</strong> &mdash;
    fully covered <strong>${report.fullyCoveredPercentage}%</strong>
  </div>
  <table>
    <thead>
      <tr>
        <th>Endpoint</th>
        <th>Parameter</th>
        <th>Location</th>
        <th>Required</th>
        <th>Valid</th>
        <th>Boundary</th>
        <th>Missing</th>
        <th>Invalid</th>
        <th>Coverage %</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
</body>
</html>`;

  fs.writeFileSync(htmlPath, html, 'utf-8');
}
