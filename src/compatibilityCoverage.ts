import SwaggerParser from '@apidevtools/swagger-parser';
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import { OpenAPIV3 } from 'openapi-types';

// ─── Data structures ──────────────────────────────────────────────────────────

export type ChangeType =
  | 'added'
  | 'removed'
  | 'changed-response-codes'
  | 'changed-parameter'
  | 'changed-schema';

export interface EndpointChange {
  method: string;
  path: string;
  changeType: ChangeType;
  breaking: boolean;
  description: string;
}

/** A single interaction parsed from a consumer contract (Pact) file. */
export interface ContractInteraction {
  description: string;
  method: string;
  path: string;
  requestBody?: unknown;
  expectedStatus: number;
  expectedBody?: unknown;
}

/** A parsed consumer contract (Pact JSON) file. */
export interface ConsumerContract {
  consumer: string;
  provider: string;
  interactions: ContractInteraction[];
  filePath: string;
}

export interface ContractVerificationResult {
  contract: ConsumerContract;
  interactionResults: InteractionVerificationResult[];
  passed: boolean;
}

export interface InteractionVerificationResult {
  interaction: ContractInteraction;
  passed: boolean;
  reason?: string;
}

export interface CompatibilityReport {
  generatedAt: string;
  oldSpecPath: string;
  newSpecPath: string;
  totalOldEndpoints: number;
  breakingChanges: EndpointChange[];
  nonBreakingChanges: EndpointChange[];
  compatibilityPercent: number;
  contractVerificationResults: ContractVerificationResult[];
  totalNewEndpoints: number;
  contractCoveredEndpoints: number;
  contractCoveragePercent: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

interface EndpointDef {
  method: string;
  path: string;
  operation: OpenAPIV3.OperationObject;
}

function extractEndpoints(api: OpenAPIV3.Document): EndpointDef[] {
  const results: EndpointDef[] = [];
  const paths = api.paths ?? {};
  for (const [p, pathItem] of Object.entries(paths)) {
    if (!pathItem) continue;
    for (const method of HTTP_METHODS) {
      const op = (pathItem as Record<string, unknown>)[method];
      if (op && typeof op === 'object') {
        results.push({ method, path: p, operation: op as OpenAPIV3.OperationObject });
      }
    }
  }
  return results;
}

function getResponseCodes(op: OpenAPIV3.OperationObject): string[] {
  return Object.keys(op.responses ?? {});
}

function getParameters(op: OpenAPIV3.OperationObject): OpenAPIV3.ParameterObject[] {
  return (op.parameters ?? []) as OpenAPIV3.ParameterObject[];
}

function paramKey(p: OpenAPIV3.ParameterObject): string {
  return `${p.in}:${p.name}`;
}

// ─── Spec comparison ──────────────────────────────────────────────────────────

/**
 * Load and dereference an OpenAPI/Swagger spec from a file path.
 */
export async function loadSpec(specPath: string): Promise<OpenAPIV3.Document> {
  const api = await SwaggerParser.dereference(specPath);
  return api as OpenAPIV3.Document;
}

/**
 * Compare two API specs and return a list of detected changes.
 */
export function compareSpecs(
  oldApi: OpenAPIV3.Document,
  newApi: OpenAPIV3.Document,
): EndpointChange[] {
  const changes: EndpointChange[] = [];

  const oldEndpoints = extractEndpoints(oldApi);
  const newEndpoints = extractEndpoints(newApi);

  const oldMap = new Map<string, EndpointDef>();
  for (const ep of oldEndpoints) {
    oldMap.set(`${ep.method}:${ep.path}`, ep);
  }

  const newMap = new Map<string, EndpointDef>();
  for (const ep of newEndpoints) {
    newMap.set(`${ep.method}:${ep.path}`, ep);
  }

  // Removed endpoints (breaking)
  for (const [key, oldEp] of oldMap) {
    if (!newMap.has(key)) {
      changes.push({
        method: oldEp.method,
        path: oldEp.path,
        changeType: 'removed',
        breaking: true,
        description: `Endpoint removed: ${oldEp.method.toUpperCase()} ${oldEp.path}`,
      });
    }
  }

  // Added endpoints (non-breaking)
  for (const [key, newEp] of newMap) {
    if (!oldMap.has(key)) {
      changes.push({
        method: newEp.method,
        path: newEp.path,
        changeType: 'added',
        breaking: false,
        description: `Endpoint added: ${newEp.method.toUpperCase()} ${newEp.path}`,
      });
    }
  }

  // Changed endpoints
  for (const [key, oldEp] of oldMap) {
    const newEp = newMap.get(key);
    if (!newEp) continue;

    // Check response codes
    const oldCodes = new Set(getResponseCodes(oldEp.operation));
    const newCodes = new Set(getResponseCodes(newEp.operation));
    const removedCodes = [...oldCodes].filter((c) => !newCodes.has(c));
    if (removedCodes.length > 0) {
      changes.push({
        method: oldEp.method,
        path: oldEp.path,
        changeType: 'changed-response-codes',
        breaking: true,
        description: `Response codes removed from ${oldEp.method.toUpperCase()} ${oldEp.path}: ${removedCodes.join(', ')}`,
      });
    }

    // Check parameters
    const oldParams = getParameters(oldEp.operation);
    const newParams = getParameters(newEp.operation);
    const newParamMap = new Map(newParams.map((p) => [paramKey(p), p]));

    for (const oldParam of oldParams) {
      const newParam = newParamMap.get(paramKey(oldParam));
      if (!newParam) {
        // Parameter removed — breaking if it was required
        changes.push({
          method: oldEp.method,
          path: oldEp.path,
          changeType: 'changed-parameter',
          breaking: oldParam.required === true,
          description: `Parameter removed from ${oldEp.method.toUpperCase()} ${oldEp.path}: ${oldParam.in} '${oldParam.name}'${oldParam.required ? ' (required)' : ''}`,
        });
        continue;
      }

      // Parameter type/format changed — breaking
      const oldSchema = (oldParam.schema ?? {}) as Record<string, unknown>;
      const newSchema = (newParam.schema ?? {}) as Record<string, unknown>;
      if (oldSchema['type'] !== newSchema['type'] || oldSchema['format'] !== newSchema['format']) {
        changes.push({
          method: oldEp.method,
          path: oldEp.path,
          changeType: 'changed-parameter',
          breaking: true,
          description: `Parameter type/format changed for ${oldEp.method.toUpperCase()} ${oldEp.path}: '${oldParam.name}' (${oldSchema['type']}/${oldSchema['format']} → ${newSchema['type']}/${newSchema['format']})`,
        });
      }

      // Required flag changed from optional to required — breaking
      if (!oldParam.required && newParam.required) {
        changes.push({
          method: oldEp.method,
          path: oldEp.path,
          changeType: 'changed-parameter',
          breaking: true,
          description: `Parameter '${oldParam.name}' became required in ${oldEp.method.toUpperCase()} ${oldEp.path}`,
        });
      }
    }

    // New required parameters added — breaking
    const oldParamMap = new Map(oldParams.map((p) => [paramKey(p), p]));
    for (const newParam of newParams) {
      if (!oldParamMap.has(paramKey(newParam)) && newParam.required) {
        changes.push({
          method: newEp.method,
          path: newEp.path,
          changeType: 'changed-parameter',
          breaking: true,
          description: `Required parameter added to ${newEp.method.toUpperCase()} ${newEp.path}: ${newParam.in} '${newParam.name}'`,
        });
      }
    }
  }

  return changes;
}

// ─── Contract parsing ─────────────────────────────────────────────────────────

/**
 * Parse Pact-format JSON contract files matching the given glob pattern or directory.
 */
export async function parseContractFiles(contractsGlob: string): Promise<ConsumerContract[]> {
  let pattern = contractsGlob;

  // If the provided path is a directory, search recursively for JSON files inside it
  if (fs.existsSync(contractsGlob) && fs.statSync(contractsGlob).isDirectory()) {
    pattern = path.join(contractsGlob, '**/*.json').replace(/\\/g, '/');
  }

  const files = await fg(pattern, { absolute: true });
  const contracts: ConsumerContract[] = [];

  for (const filePath of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const contract = parsePactContract(raw, filePath);
      if (contract) contracts.push(contract);
    } catch {
      // Skip invalid files
    }
  }

  return contracts;
}

function parsePactContract(raw: unknown, filePath: string): ConsumerContract | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (!obj['interactions'] || !Array.isArray(obj['interactions'])) return null;

  const consumer =
    typeof obj['consumer'] === 'object' && obj['consumer'] !== null
      ? ((obj['consumer'] as Record<string, unknown>)['name'] as string) ?? 'unknown'
      : 'unknown';

  const provider =
    typeof obj['provider'] === 'object' && obj['provider'] !== null
      ? ((obj['provider'] as Record<string, unknown>)['name'] as string) ?? 'unknown'
      : 'unknown';

  const interactions: ContractInteraction[] = [];

  for (const item of obj['interactions'] as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const interaction = item as Record<string, unknown>;
    const request = interaction['request'] as Record<string, unknown> | undefined;
    const response = interaction['response'] as Record<string, unknown> | undefined;
    if (!request) continue;

    const method = typeof request['method'] === 'string' ? request['method'].toLowerCase() : '';
    const interactionPath = typeof request['path'] === 'string' ? request['path'] : '';
    if (!method || !interactionPath) continue;

    const expectedStatus =
      typeof response?.['status'] === 'number' ? response['status'] : 200;

    interactions.push({
      description: typeof interaction['description'] === 'string' ? interaction['description'] : '',
      method,
      path: interactionPath,
      requestBody: request['body'],
      expectedStatus,
      expectedBody: response?.['body'],
    });
  }

  return { consumer, provider, interactions, filePath };
}

// ─── Contract verification ────────────────────────────────────────────────────

/**
 * Normalise a path template by replacing Pact-style `:param` segments with
 * OpenAPI-style `{param}` segments so the two formats can be compared.
 */
function normalisePath(p: string): string {
  return p.replace(/:([^/]+)/g, '{$1}');
}

/**
 * Check whether a path from a contract matches an OpenAPI spec path,
 * accounting for path parameter placeholders in different styles.
 */
function pathMatchesSpec(contractPath: string, specPath: string): boolean {
  const normalised = normalisePath(contractPath);
  if (normalised === specPath) return true;

  // Build a regex from the spec path template and test the contract path
  const regexStr = '^' + specPath.replace(/\{[^}]+\}/g, '[^/]+') + '$';
  return new RegExp(regexStr).test(contractPath);
}

/**
 * Verify consumer contracts against a new API spec.
 */
export function verifyContracts(
  contracts: ConsumerContract[],
  newApi: OpenAPIV3.Document,
): ContractVerificationResult[] {
  const endpoints = extractEndpoints(newApi);

  return contracts.map((contract) => {
    const interactionResults = contract.interactions.map((interaction) => {
      // Find matching endpoint in spec
      const match = endpoints.find(
        (ep) =>
          ep.method === interaction.method && pathMatchesSpec(interaction.path, ep.path),
      );

      if (!match) {
        return {
          interaction,
          passed: false,
          reason: `Endpoint not found in new spec: ${interaction.method.toUpperCase()} ${interaction.path}`,
        };
      }

      // Check expected response status code is present in spec
      const responseCodes = getResponseCodes(match.operation);
      const statusStr = String(interaction.expectedStatus);
      if (
        !responseCodes.includes(statusStr) &&
        !responseCodes.includes('default')
      ) {
        return {
          interaction,
          passed: false,
          reason: `Expected response status ${interaction.expectedStatus} not defined for ${interaction.method.toUpperCase()} ${interaction.path} in new spec`,
        };
      }

      return { interaction, passed: true };
    });

    const passed = interactionResults.every((r) => r.passed);
    return { contract, interactionResults, passed };
  });
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

/**
 * Compute compatibility percentage based on detected breaking changes.
 */
export function computeCompatibilityPercent(
  totalOldEndpoints: number,
  breakingChanges: EndpointChange[],
): number {
  if (totalOldEndpoints === 0) return 100;
  // Count uniquely affected old endpoints (by method+path)
  const affectedKeys = new Set(
    breakingChanges
      .filter((c) => c.changeType !== 'added')
      .map((c) => `${c.method}:${c.path}`),
  );
  const unaffected = Math.max(0, totalOldEndpoints - affectedKeys.size);
  return parseFloat(((unaffected / totalOldEndpoints) * 100).toFixed(2));
}

/**
 * Compute what fraction of new spec endpoints are covered by at least one
 * contract interaction.
 */
export function computeContractCoveragePercent(
  contracts: ConsumerContract[],
  newApi: OpenAPIV3.Document,
): { coveredEndpoints: number; totalEndpoints: number; coveragePercent: number } {
  const endpoints = extractEndpoints(newApi);
  const coveredKeys = new Set<string>();

  for (const contract of contracts) {
    for (const interaction of contract.interactions) {
      const match = endpoints.find(
        (ep) =>
          ep.method === interaction.method && pathMatchesSpec(interaction.path, ep.path),
      );
      if (match) coveredKeys.add(`${match.method}:${match.path}`);
    }
  }

  const total = endpoints.length;
  const covered = coveredKeys.size;
  const coveragePercent = total === 0 ? 100 : parseFloat(((covered / total) * 100).toFixed(2));
  return { coveredEndpoints: covered, totalEndpoints: total, coveragePercent };
}

// ─── Report builder ───────────────────────────────────────────────────────────

export function buildCompatibilityReport(
  oldApi: OpenAPIV3.Document,
  newApi: OpenAPIV3.Document,
  changes: EndpointChange[],
  verificationResults: ContractVerificationResult[],
  oldSpecPath: string,
  newSpecPath: string,
): CompatibilityReport {
  const oldEndpoints = extractEndpoints(oldApi);
  const breakingChanges = changes.filter((c) => c.breaking);
  const nonBreakingChanges = changes.filter((c) => !c.breaking);
  const compatibilityPercent = computeCompatibilityPercent(oldEndpoints.length, breakingChanges);
  const coverageMetrics = computeContractCoveragePercent(
    verificationResults.map((r) => r.contract),
    newApi,
  );

  return {
    generatedAt: new Date().toISOString(),
    oldSpecPath,
    newSpecPath,
    totalOldEndpoints: oldEndpoints.length,
    breakingChanges,
    nonBreakingChanges,
    compatibilityPercent,
    contractVerificationResults: verificationResults,
    totalNewEndpoints: coverageMetrics.totalEndpoints,
    contractCoveredEndpoints: coverageMetrics.coveredEndpoints,
    contractCoveragePercent: coverageMetrics.coveragePercent,
  };
}

// ─── Report writers ───────────────────────────────────────────────────────────

function writeCompatibilityJson(report: CompatibilityReport, reportsDir: string): void {
  const outPath = path.join(reportsDir, 'compatibility-contracts.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
}

function writeCompatibilityHtml(report: CompatibilityReport, reportsDir: string): void {
  const breakingRows = report.breakingChanges
    .map(
      (c) =>
        `    <tr class="breaking">
      <td>${c.method.toUpperCase()}</td>
      <td>${c.path}</td>
      <td>${c.changeType}</td>
      <td>${c.description}</td>
    </tr>`,
    )
    .join('\n');

  const nonBreakingRows = report.nonBreakingChanges
    .map(
      (c) =>
        `    <tr class="non-breaking">
      <td>${c.method.toUpperCase()}</td>
      <td>${c.path}</td>
      <td>${c.changeType}</td>
      <td>${c.description}</td>
    </tr>`,
    )
    .join('\n');

  const contractRows = report.contractVerificationResults
    .flatMap((r) =>
      r.interactionResults.map(
        (ir) =>
          `    <tr class="${ir.passed ? 'pass' : 'fail'}">
      <td>${r.contract.consumer}</td>
      <td>${r.contract.provider}</td>
      <td>${ir.interaction.description}</td>
      <td>${ir.interaction.method.toUpperCase()} ${ir.interaction.path}</td>
      <td>${ir.passed ? '✅ Pass' : '❌ Fail'}</td>
      <td>${ir.reason ?? ''}</td>
    </tr>`,
      ),
    )
    .join('\n');

  const compatColor =
    report.compatibilityPercent >= 80
      ? '#e6ffe6'
      : report.compatibilityPercent >= 50
        ? '#fff9e6'
        : '#ffe6e6';
  const coverageColor =
    report.contractCoveragePercent >= 80
      ? '#e6ffe6'
      : report.contractCoveragePercent >= 50
        ? '#fff9e6'
        : '#ffe6e6';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Compatibility &amp; Contract Report</title>
  <style>
    body { font-family: sans-serif; padding: 2rem; background: #fafafa; }
    h1 { margin-bottom: 0.25rem; }
    h2 { margin-top: 2rem; }
    .meta { color: #666; font-size: 0.9rem; margin-bottom: 1.5rem; }
    table { border-collapse: collapse; width: 100%; max-width: 1000px; margin-bottom: 1.5rem; }
    th, td { border: 1px solid #ccc; padding: 0.5rem 1rem; text-align: left; }
    th { background: #f0f0f0; }
    tr.breaking { background: #ffe6e6; }
    tr.non-breaking { background: #e6ffe6; }
    tr.pass { background: #e6ffe6; }
    tr.fail { background: #ffe6e6; }
    .summary-box { display: inline-block; padding: 1rem 2rem; border-radius: 6px; margin-right: 1rem; font-size: 1.2rem; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Compatibility &amp; Contract Report</h1>
  <p class="meta">Generated: ${report.generatedAt} | Old: ${report.oldSpecPath} | New: ${report.newSpecPath}</p>

  <div>
    <div class="summary-box" style="background:${compatColor}">
      Compatibility: ${report.compatibilityPercent}%
      (${report.breakingChanges.length} breaking change${report.breakingChanges.length !== 1 ? 's' : ''})
    </div>
    <div class="summary-box" style="background:${coverageColor}">
      Contract Coverage: ${report.contractCoveragePercent}%
      (${report.contractCoveredEndpoints}/${report.totalNewEndpoints} endpoints)
    </div>
  </div>

  <h2>Breaking Changes</h2>
  ${
    report.breakingChanges.length === 0
      ? '<p>No breaking changes detected. ✅</p>'
      : `<table>
    <thead>
      <tr><th>Method</th><th>Path</th><th>Change Type</th><th>Description</th></tr>
    </thead>
    <tbody>
${breakingRows}
    </tbody>
  </table>`
  }

  <h2>Non-Breaking Changes</h2>
  ${
    report.nonBreakingChanges.length === 0
      ? '<p>No non-breaking changes detected.</p>'
      : `<table>
    <thead>
      <tr><th>Method</th><th>Path</th><th>Change Type</th><th>Description</th></tr>
    </thead>
    <tbody>
${nonBreakingRows}
    </tbody>
  </table>`
  }

  <h2>Contract Verification</h2>
  ${
    report.contractVerificationResults.length === 0
      ? '<p>No consumer contracts provided.</p>'
      : `<table>
    <thead>
      <tr><th>Consumer</th><th>Provider</th><th>Interaction</th><th>Endpoint</th><th>Result</th><th>Reason</th></tr>
    </thead>
    <tbody>
${contractRows}
    </tbody>
  </table>`
  }
</body>
</html>`;

  const outPath = path.join(reportsDir, 'compatibility-contracts.html');
  fs.writeFileSync(outPath, html, 'utf-8');
}

/**
 * Generate JSON and HTML compatibility reports.
 */
export function generateCompatibilityReports(
  report: CompatibilityReport,
  reportsDir: string,
): void {
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  writeCompatibilityJson(report, reportsDir);
  writeCompatibilityHtml(report, reportsDir);
}
