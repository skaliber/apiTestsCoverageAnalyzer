/**
 * MCP integration – response normalizer.
 *
 * Converts raw MCP server responses into the deterministic NormalizedAiAnalysis
 * schema.  The analyzer NEVER renders raw MCP output directly.
 *
 * Handles:
 *  - Well-formed JSON responses
 *  - Partial/malformed JSON (graceful degradation)
 *  - Non-JSON plain text
 *  - Empty / error responses
 */

import type { McpRawResponse, NormalizedAiAnalysis, AiConfidence } from './types';

// ─── Main normalizer ──────────────────────────────────────────────────────────

/**
 * Normalize a raw MCP response into a NormalizedAiAnalysis object.
 *
 * When the response cannot be parsed the function returns a best-effort object
 * rather than throwing, so callers can always render something useful.
 */
export function normalizeMcpResponse(
  raw: McpRawResponse,
  category: string,
): NormalizedAiAnalysis {
  if (!raw.ok || !raw.content) {
    return errorFallback(category, raw.error ?? 'MCP server returned no content');
  }

  const parsed = tryParseJson(raw.content.trim());
  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return normalizeObject(parsed as Record<string, unknown>, category);
  }

  // Plain-text response – wrap into a minimal schema
  return {
    summary: raw.content.slice(0, 500),
    keyFindings: [],
    topRisks: [],
    recommendedActions: [],
    confidence: 'low',
    category,
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function normalizeObject(
  obj: Record<string, unknown>,
  category: string,
): NormalizedAiAnalysis {
  return {
    summary: asString(obj['summary'], 'No summary provided.'),
    keyFindings: asStringArray(obj['keyFindings'] ?? obj['key_findings']),
    topRisks: asStringArray(obj['topRisks'] ?? obj['top_risks']),
    recommendedActions: asStringArray(
      obj['recommendedActions'] ?? obj['recommended_actions'] ?? obj['actions'],
    ),
    missingCoverageAreas: asStringArray(
      obj['missingCoverageAreas'] ?? obj['missing_coverage_areas'],
      true,
    ),
    likelyRootCauses: asStringArray(
      obj['likelyRootCauses'] ?? obj['likely_root_causes'],
      true,
    ),
    confidence: asConfidence(obj['confidence']),
    category,
  };
}

function errorFallback(category: string, errorMsg: string): NormalizedAiAnalysis {
  return {
    summary: `MCP analysis unavailable: ${errorMsg}`,
    keyFindings: [],
    topRisks: [],
    recommendedActions: [],
    confidence: 'low',
    category,
  };
}

function tryParseJson(text: string): unknown {
  // Strip markdown code fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const source = fenced ? fenced[1].trim() : text;

  // Find the first JSON object or array in the text
  const jsonStart = source.search(/[{[]/);
  if (jsonStart === -1) return null;

  try {
    return JSON.parse(source.slice(jsonStart));
  } catch {
    return null;
  }
}

function asString(val: unknown, fallback: string): string {
  if (typeof val === 'string' && val.length > 0) return val;
  return fallback;
}

function asStringArray(val: unknown, allowUndefined?: boolean): string[] {
  if (allowUndefined && (val === undefined || val === null)) return [];
  if (!Array.isArray(val)) return [];
  return val
    .filter((v) => typeof v === 'string' && v.length > 0)
    .map((v) => v as string);
}

function asConfidence(val: unknown): AiConfidence {
  if (val === 'low' || val === 'medium' || val === 'high') return val;
  return 'medium';
}
