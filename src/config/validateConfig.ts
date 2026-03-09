/**
 * Central config — schema validation.
 *
 * Validates a parsed YAML object against the AnalyzerConfig schema.
 * On failure, throws with a field-level error message that includes
 * the received value and an example of a valid value.
 *
 * Unknown top-level keys produce a warning in default mode and a hard
 * error in strict mode (qualityGate.mode === 'strict').
 */

import type { AnalyzerConfig } from './types';
import {
  SUPPORTED_VERSIONS,
  VALID_ANALYSIS_MODES,
  VALID_COVERAGE_TYPES,
  VALID_INTELLIGENCE_TYPES,
  VALID_QUALITY_GATE_MODES,
  VALID_REPORT_FORMATS,
  VALID_SECURITY_SCANNERS,
} from './schema';

// ─── Known top-level keys ─────────────────────────────────────────────────────

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'version',
  'project',
  'analysis',
  'scans',
  'mcp',
  'thresholds',
  'qualityGate',
  'reports',
  'publishing',
  'dashboard',
]);

// ─── Error helpers ────────────────────────────────────────────────────────────

function configError(field: string, received: unknown, expected: string, example: string): Error {
  return new Error(
    [
      `Config error: ${field}`,
      `  Received: ${JSON.stringify(received)}`,
      `  Expected: ${expected}`,
      `  Example:  ${example}`,
    ].join('\n'),
  );
}

// ─── Validator ────────────────────────────────────────────────────────────────

/**
 * Validate a raw parsed-YAML object.
 *
 * Returns the cast `AnalyzerConfig` on success.
 * Throws with a field-level error message on validation failure.
 *
 * @param raw         Parsed YAML value (must be a plain object)
 * @param strictMode  When true, unknown top-level keys are errors not warnings
 */
export function validateConfig(raw: unknown, strictMode = false): Partial<AnalyzerConfig> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Config error: config.yaml must contain a YAML mapping (object), not a scalar or list');
  }

  const obj = raw as Record<string, unknown>;

  // ── version ────────────────────────────────────────────────────────────────
  if ('version' in obj) {
    const ver = obj['version'];
    if (!SUPPORTED_VERSIONS.includes(ver as 1)) {
      throw configError(
        'version',
        ver,
        `one of: ${SUPPORTED_VERSIONS.join(', ')}`,
        'version: 1',
      );
    }
  }

  // ── analysis ───────────────────────────────────────────────────────────────
  if ('analysis' in obj && obj['analysis'] !== null && obj['analysis'] !== undefined) {
    const analysis = obj['analysis'] as Record<string, unknown>;
    if ('defaultMode' in analysis) {
      const mode = analysis['defaultMode'];
      if (!VALID_ANALYSIS_MODES.includes(mode as 'full' | 'custom')) {
        throw configError(
          'analysis.defaultMode',
          mode,
          `one of: ${VALID_ANALYSIS_MODES.join(', ')}`,
          'analysis:\n    defaultMode: full',
        );
      }
    }
  }

  // ── scans.coverage.types ─────────────────────────────────────────────────
  if ('scans' in obj && obj['scans'] !== null && obj['scans'] !== undefined) {
    const scans = obj['scans'] as Record<string, unknown>;

    if ('coverage' in scans && scans['coverage'] !== null && scans['coverage'] !== undefined) {
      const coverage = scans['coverage'] as Record<string, unknown>;
      if ('types' in coverage && Array.isArray(coverage['types'])) {
        for (const t of coverage['types']) {
          if (!VALID_COVERAGE_TYPES.includes(t as typeof VALID_COVERAGE_TYPES[number])) {
            throw configError(
              'scans.coverage.types',
              t,
              `one of: ${VALID_COVERAGE_TYPES.join(', ')}`,
              'scans:\n    coverage:\n      types:\n        - endpoint\n        - parameter',
            );
          }
        }
      }
    }

    if ('security' in scans && scans['security'] !== null && scans['security'] !== undefined) {
      const security = scans['security'] as Record<string, unknown>;
      if ('scanners' in security && Array.isArray(security['scanners'])) {
        for (const s of security['scanners']) {
          if (!VALID_SECURITY_SCANNERS.includes(s as typeof VALID_SECURITY_SCANNERS[number])) {
            throw configError(
              'scans.security.scanners',
              s,
              `one of: ${VALID_SECURITY_SCANNERS.join(', ')}`,
              'scans:\n    security:\n      scanners:\n        - semgrep\n        - trivy',
            );
          }
        }
      }
    }

    if ('intelligence' in scans && scans['intelligence'] !== null && scans['intelligence'] !== undefined) {
      const intelligence = scans['intelligence'] as Record<string, unknown>;
      if ('types' in intelligence && Array.isArray(intelligence['types'])) {
        for (const t of intelligence['types']) {
          if (!VALID_INTELLIGENCE_TYPES.includes(t as typeof VALID_INTELLIGENCE_TYPES[number])) {
            throw configError(
              'scans.intelligence.types',
              t,
              `one of: ${VALID_INTELLIGENCE_TYPES.join(', ')}`,
              'scans:\n    intelligence:\n      types:\n        - ai-summary\n        - recommendations',
            );
          }
        }
      }
    }
  }

  // ── thresholds ────────────────────────────────────────────────────────────
  if ('thresholds' in obj && obj['thresholds'] !== null && obj['thresholds'] !== undefined) {
    const thresholds = obj['thresholds'] as Record<string, unknown>;
    for (const [key, value] of Object.entries(thresholds)) {
      if (typeof value !== 'number' || value < 0 || value > 100) {
        throw configError(
          `thresholds.${key}`,
          value,
          'a number between 0 and 100 (inclusive)',
          `thresholds:\n    ${key}: 80`,
        );
      }
    }
  }

  // ── qualityGate.mode ───────────────────────────────────────────────────────
  if ('qualityGate' in obj && obj['qualityGate'] !== null && obj['qualityGate'] !== undefined) {
    const qg = obj['qualityGate'] as Record<string, unknown>;
    if ('mode' in qg) {
      const mode = qg['mode'];
      if (!VALID_QUALITY_GATE_MODES.includes(mode as typeof VALID_QUALITY_GATE_MODES[number])) {
        throw configError(
          'qualityGate.mode',
          mode,
          `one of: ${VALID_QUALITY_GATE_MODES.join(', ')}`,
          'qualityGate:\n    mode: warn',
        );
      }
    }
  }

  // ── reports.formats ───────────────────────────────────────────────────────
  if ('reports' in obj && obj['reports'] !== null && obj['reports'] !== undefined) {
    const reports = obj['reports'] as Record<string, unknown>;
    if ('formats' in reports && Array.isArray(reports['formats'])) {
      for (const f of reports['formats']) {
        if (!VALID_REPORT_FORMATS.includes(f as typeof VALID_REPORT_FORMATS[number])) {
          throw configError(
            'reports.formats',
            f,
            `one of: ${VALID_REPORT_FORMATS.join(', ')}`,
            'reports:\n    formats:\n      - json\n      - html',
          );
        }
      }
    }
  }

  // ── mcp server validation ──────────────────────────────────────────────────
  if ('mcp' in obj && obj['mcp'] !== null && obj['mcp'] !== undefined) {
    const mcp = obj['mcp'] as Record<string, unknown>;
    if ('servers' in mcp && mcp['servers'] !== null && mcp['servers'] !== undefined) {
      const servers = mcp['servers'] as Record<string, unknown>;
      for (const [serverId, serverCfg] of Object.entries(servers)) {
        if (serverCfg === null || typeof serverCfg !== 'object') continue;
        const server = serverCfg as Record<string, unknown>;
        const transport = server['transport'];
        if (transport === 'stdio' && !server['command']) {
          throw new Error(
            [
              `Config error: mcp.servers.${serverId}.command is required when transport is "stdio".`,
              `  Example: command: node, args: ["./mcp-servers/coverage-summary.js"]`,
            ].join('\n'),
          );
        }
        if ((transport === 'http' || transport === 'sse') && !server['url']) {
          throw new Error(
            [
              `Config error: mcp.servers.${serverId}.url is required when transport is "http" or "sse".`,
              `  Example: url: http://localhost:3100/mcp`,
            ].join('\n'),
          );
        }
      }
    }
  }

  // ── unknown top-level keys ─────────────────────────────────────────────────
  for (const key of Object.keys(obj)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      const msg = `[WARNING] config.yaml contains unknown top-level key: "${key}". This key will be ignored.`;
      if (strictMode) {
        throw new Error(`Config error: unknown top-level key "${key}".\n  Remove or correct this key before running in strict mode.`);
      } else {
        process.stderr.write(msg + '\n');
      }
    }
  }

  return obj as Partial<AnalyzerConfig>;
}
