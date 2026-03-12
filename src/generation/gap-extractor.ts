/**
 * Feature 28 — GapExtractor
 * Reads coverage-summary.json (or coverage reports) and extracts DetectedGap objects.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { DetectedGap, GapType, GapPriority, HttpMethod } from './types';

// ─── Priority logic ───────────────────────────────────────────────────────────

function computePriority(type: GapType, authRequired: boolean, riskScore: number): GapPriority {
  if (type === 'security' || (type === 'auth' && authRequired)) return 'P0';
  if (type === 'endpoint') return 'P1';
  if (type === 'error') return 'P2';
  if (type === 'business') return 'P3';
  if (type === 'parameter') return 'P4';
  if (type === 'integration') return 'P5';
  return 'P3';
}

function buildGapId(type: string, method: string, apiPath: string, condition: string): string {
  return `${type}:${method.toUpperCase()}:${apiPath}:${condition}`;
}

// ─── Summary JSON reader ──────────────────────────────────────────────────────

function readJson(filePath: string): unknown {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

interface SummaryEndpoint {
  method?: string;
  path?: string;
  covered?: boolean;
  authRequired?: boolean;
  authOptional?: boolean;
  missingScenarios?: string[];
  operationId?: string;
  tags?: string[];
}

interface CoverageSummary {
  discoveryInfo?: {
    language?: string;
    framework?: string;
    testFramework?: string;
    projectName?: string;
    appImportPath?: string;
  };
  details?: {
    endpoint?: { items?: SummaryEndpoint[] };
    security?: { items?: Array<{ controlType?: string; endpoint?: string; covered?: boolean }> };
    error?: { items?: Array<{ endpoint?: string; statusCode?: number; covered?: boolean }> };
    business?: { items?: Array<{ ruleId?: string; description?: string; covered?: boolean; endpoint?: string }> };
    integration?: { items?: Array<{ flowId?: string; name?: string; covered?: boolean; missingStepIndex?: number; steps?: Array<{ method: string; path: string; description: string }> }> };
    parameter?: { items?: Array<{ endpoint?: string; parameter?: string; missingCases?: string[] }> };
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function extractGapsFromReports(reportsDir: string): DetectedGap[] {
  const gaps: DetectedGap[] = [];

  // Try coverage-summary.json first
  const summaryPath = path.join(reportsDir, 'coverage-summary.json');
  const summary = readJson(summaryPath) as CoverageSummary | null;

  if (!summary) {
    // Return synthetic sample gaps for smoke-test / dry-run mode
    return buildSampleGaps();
  }

  // ── Endpoint gaps ─────────────────────────────────────────────────────────
  const endpointItems = summary.details?.endpoint?.items ?? [];
  for (const item of endpointItems) {
    if (item.covered) continue;
    const method = (item.method ?? 'GET').toUpperCase() as HttpMethod;
    const apiPath = item.path ?? '/unknown';
    const authRequired = item.authRequired ?? false;
    const authOptional = item.authOptional ?? false;
    const riskScore = authRequired ? 85 : 60;

    gaps.push({
      id: buildGapId('endpoint', method, apiPath, 'uncovered'),
      type: 'endpoint',
      priority: computePriority('endpoint', authRequired, riskScore),
      riskScore,
      endpoint: {
        method,
        path: apiPath,
        operationId: item.operationId,
        tags: item.tags,
        auth: {
          required: authRequired,
          optional: authOptional,
          type: authRequired ? 'jwt' : undefined,
          headerName: authRequired ? 'Authorization' : undefined,
          scheme: authRequired ? 'Bearer' : undefined,
        },
      },
      responses: [
        { statusCode: 200, description: 'Success' },
        ...(authRequired ? [{ statusCode: 401, description: 'Unauthorized' }] : []),
        { statusCode: 422, description: 'Unprocessable Entity' },
      ],
    });
  }

  // ── Security gaps ─────────────────────────────────────────────────────────
  const securityItems = summary.details?.security?.items ?? [];
  for (const item of securityItems) {
    if (item.covered) continue;
    const parts = (item.endpoint ?? 'GET /unknown').split(' ');
    const method = (parts[0] ?? 'GET').toUpperCase() as HttpMethod;
    const apiPath = parts[1] ?? '/unknown';

    gaps.push({
      id: buildGapId('security', method, apiPath, item.controlType ?? 'auth-bypass'),
      type: 'security',
      priority: 'P0',
      riskScore: 95,
      endpoint: {
        method,
        path: apiPath,
        auth: { required: true, optional: false, type: 'jwt', headerName: 'Authorization', scheme: 'Bearer' },
      },
      securityControl: {
        type: (item.controlType as 'auth-bypass') ?? 'auth-bypass',
        description: `Security control not tested for ${item.endpoint}`,
        attackVector: 'Missing auth validation test',
        expectedStatusCode: 401,
      },
    });
  }

  // ── Error gaps ────────────────────────────────────────────────────────────
  const errorItems = summary.details?.error?.items ?? [];
  for (const item of errorItems) {
    if (item.covered) continue;
    const parts = (item.endpoint ?? 'GET /unknown').split(' ');
    const method = (parts[0] ?? 'GET').toUpperCase() as HttpMethod;
    const apiPath = parts[1] ?? '/unknown';
    const statusCode = item.statusCode ?? 500;

    gaps.push({
      id: buildGapId('error', method, apiPath, String(statusCode)),
      type: 'error',
      priority: 'P2',
      riskScore: 65,
      endpoint: {
        method,
        path: apiPath,
        auth: { required: false, optional: false },
      },
      responses: [{ statusCode, description: `Error ${statusCode} not tested` }],
    });
  }

  // ── Business rule gaps ────────────────────────────────────────────────────
  const businessItems = summary.details?.business?.items ?? [];
  for (const item of businessItems) {
    if (item.covered) continue;
    const parts = (item.endpoint ?? 'GET /unknown').split(' ');
    const method = (parts[0] ?? 'GET').toUpperCase() as HttpMethod;
    const apiPath = parts[1] ?? '/unknown';

    gaps.push({
      id: buildGapId('business', method, apiPath, item.ruleId ?? 'business-rule'),
      type: 'business',
      priority: 'P3',
      riskScore: 55,
      endpoint: {
        method,
        path: apiPath,
        auth: { required: false, optional: false },
      },
      businessRule: {
        id: item.ruleId ?? 'rule-1',
        description: item.description ?? 'Business rule not covered',
        condition: 'When condition is met',
        acceptanceCriteria: ['Expected behavior is verified'],
      },
    });
  }

  // ── Integration flow gaps ─────────────────────────────────────────────────
  const integrationItems = summary.details?.integration?.items ?? [];
  for (const item of integrationItems) {
    if (item.covered) continue;
    gaps.push({
      id: `integration:${item.flowId ?? 'flow'}:step-${item.missingStepIndex ?? 0}-missing`,
      type: 'integration',
      priority: 'P5',
      riskScore: 45,
      endpoint: {
        method: 'GET',
        path: '/unknown',
        auth: { required: false, optional: false },
      },
      flow: {
        id: item.flowId ?? 'flow-1',
        name: item.name ?? 'Integration Flow',
        steps: item.steps ?? [],
        missingStepIndex: item.missingStepIndex ?? 0,
      },
    });
  }

  // ── Parameter gaps ────────────────────────────────────────────────────────
  const parameterItems = summary.details?.parameter?.items ?? [];
  for (const item of parameterItems) {
    const parts = (item.endpoint ?? 'GET /unknown').split(' ');
    const method = (parts[0] ?? 'GET').toUpperCase() as HttpMethod;
    const apiPath = parts[1] ?? '/unknown';
    const paramName = item.parameter ?? 'param';
    const missingCases = (item.missingCases ?? ['boundary-min']) as Array<'boundary-min' | 'boundary-max' | 'invalid-type' | 'missing-required' | 'sql-injection' | 'xss'>;
    const condition = missingCases[0] ?? 'boundary';

    gaps.push({
      id: buildGapId('parameter', method, apiPath, `${paramName}:${condition}`),
      type: 'parameter',
      priority: 'P4',
      riskScore: 40,
      endpoint: {
        method,
        path: apiPath,
        auth: { required: false, optional: false },
      },
      parameters: [{
        name: paramName,
        in: 'query',
        required: false,
        schema: { type: 'string' },
        missingCases,
      }],
    });
  }

  return gaps;
}

/** Build a minimal set of synthetic gaps for smoke-test / dry-run mode */
function buildSampleGaps(): DetectedGap[] {
  return [
    {
      id: 'endpoint:POST:/api/articles:uncovered',
      type: 'endpoint',
      priority: 'P1',
      riskScore: 85,
      endpoint: {
        method: 'POST',
        path: '/api/articles',
        operationId: 'createArticle',
        summary: 'Create Article',
        auth: { required: true, optional: false, type: 'jwt', headerName: 'Authorization', scheme: 'Bearer' },
      },
      parameters: [
        {
          name: 'title',
          in: 'body',
          required: true,
          schema: { type: 'string', minLength: 1 },
          missingCases: ['missing-required'],
        },
        {
          name: 'body',
          in: 'body',
          required: true,
          schema: { type: 'string' },
          missingCases: ['missing-required'],
        },
        {
          name: 'description',
          in: 'body',
          required: true,
          schema: { type: 'string' },
          missingCases: ['missing-required'],
        },
      ],
      responses: [
        { statusCode: 201, description: 'Created' },
        { statusCode: 401, description: 'Unauthorized' },
        { statusCode: 422, description: 'Unprocessable Entity' },
      ],
    },
  ];
}
