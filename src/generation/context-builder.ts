/**
 * Feature 28 — ContextBuilder
 * Assembles a GenerationContext from a DetectedGap and project discovery info.
 */

import * as path from 'path';
import type {
  DetectedGap,
  GenerationContext,
  ParameterInfo,
  ResponseInfo,
} from './types';

// ─── Path normalisation ───────────────────────────────────────────────────────

/**
 * Convert an OpenAPI-style path (/api/articles/{slug}) to framework-native
 * Express/supertest style (/api/articles/:slug).
 */
function normalizePathParam(p: string): string {
  return p.replace(/\{([^}]+)\}/g, ':$1');
}

// ─── Fixture generation ───────────────────────────────────────────────────────

function buildValidPayload(params: ParameterInfo[]): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const p of params) {
    if (p.in !== 'body') continue;
    const { name, schema } = p;
    payload[name] = generateExampleValue(schema);
  }
  return payload;
}

function buildInvalidPayload(params: ParameterInfo[]): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const p of params) {
    if (p.in !== 'body' || !p.required) continue;
    // Omit required fields to create invalid payload
  }
  return payload;
}

function buildPathParams(pathTemplate: string): Record<string, string> {
  const params: Record<string, string> = {};
  const matches = pathTemplate.match(/\{([^}]+)\}/g) ?? [];
  for (const m of matches) {
    const name = m.slice(1, -1);
    if (name.toLowerCase().includes('id')) {
      params[name] = '1';
    } else if (name.toLowerCase().includes('slug')) {
      params[name] = 'test-slug';
    } else {
      params[name] = 'test-value';
    }
  }
  return params;
}

function generateExampleValue(schema: { type: string; format?: string; minimum?: number; maximum?: number; minLength?: number; maxLength?: number; enum?: unknown[]; pattern?: string }): unknown {
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];
  switch (schema.type) {
    case 'string':
      if (schema.format === 'email') return 'test@example.com';
      if (schema.format === 'date') return '2026-01-01';
      if (schema.format === 'date-time') return '2026-01-01T00:00:00Z';
      if (schema.format === 'uri') return 'https://example.com';
      if (schema.minLength && schema.minLength > 0) return 'a'.repeat(schema.minLength);
      return 'test-value';
    case 'number':
    case 'integer':
      if (schema.minimum !== undefined) return schema.minimum;
      return 1;
    case 'boolean':
      return true;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return 'test-value';
  }
}

// ─── Import prefix computation ────────────────────────────────────────────────

function computeImportPrefix(outputFilePath: string, projectRoot: string): string {
  const outDir = path.dirname(outputFilePath);
  const rel = path.relative(outDir, path.join(projectRoot, 'src'));
  return rel.startsWith('.') ? rel : `./${rel}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ProjectDiscoveryInfo {
  name: string;
  language: string;
  framework: string;
  testFramework: string;
  baseUrl: string;
  projectRoot: string;
  appImportPath?: string;
}

export function buildContext(
  gap: DetectedGap,
  outputFilePath: string,
  discovery: ProjectDiscoveryInfo,
): GenerationContext {
  const importPrefix = computeImportPrefix(outputFilePath, discovery.projectRoot);

  const params: ParameterInfo[] = gap.parameters ?? [];
  const responses: ResponseInfo[] = gap.responses ?? [
    { statusCode: 200, description: 'Success' },
    { statusCode: 401, description: 'Unauthorized' },
    { statusCode: 422, description: 'Unprocessable Entity' },
  ];

  return {
    gap: {
      id: gap.id,
      type: gap.type,
      priority: gap.priority,
      riskScore: gap.riskScore,
    },
    endpoint: {
      method: gap.endpoint.method,
      path: gap.endpoint.path,
      pathNormalized: normalizePathParam(gap.endpoint.path),
      operationId: gap.endpoint.operationId,
      summary: gap.endpoint.summary,
      tags: gap.endpoint.tags,
      auth: gap.endpoint.auth,
    },
    parameters: params,
    responses,
    fixtures: {
      validPayload: buildValidPayload(params),
      invalidPayload: buildInvalidPayload(params),
      authToken: 'Bearer <your-test-token>',
      pathParams: buildPathParams(gap.endpoint.path),
    },
    project: {
      name: discovery.name,
      language: discovery.language,
      framework: discovery.framework,
      testFramework: discovery.testFramework,
      baseUrl: discovery.baseUrl,
      importPrefix,
    },
    businessRule: gap.businessRule,
    securityControl: gap.securityControl,
    flow: gap.flow,
  };
}
