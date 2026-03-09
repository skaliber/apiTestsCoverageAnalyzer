/**
 * Central config — entry-point loader.
 *
 * This is the single public entry point for loading configuration.
 * All scanning modules, CLI commands, and test helpers must call
 * `loadConfig()` rather than reading YAML or JSON config directly.
 *
 * Resolution order:
 *   1. If configPath argument is provided, load that file (error if missing).
 *   2. Otherwise, look for config.yaml at the current working directory root.
 *   3. If neither is found, emit a warning and return the default config.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import type { AnalyzerConfig } from './types';
import { DEFAULT_CONFIG } from './defaultConfig';
import { validateConfig } from './validateConfig';
import { mergeConfig } from './mergeConfig';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Single canonical default config file name. */
export const DEFAULT_CONFIG_FILENAME = 'config.yaml';

/** Path searched when no --config flag is provided. Computed dynamically at call time. */
export const DEFAULT_CONFIG_PATH = path.join(process.cwd(), DEFAULT_CONFIG_FILENAME);

/** Legacy config file name — triggers a deprecation warning when found. */
export const LEGACY_CONFIG_FILENAME = 'coverage.config.json';

// ─── Warning / deprecation message constants ──────────────────────────────────

export const MISSING_CONFIG_WARNING = `[WARNING] No config.yaml found at project root.
Running full default analysis profile.
To customize scanning, thresholds, MCP integration, and reporting,
create a config.yaml file. See docs/guides/configuration.md for reference.`;

export const LEGACY_CONFIG_WARNING = `[DEPRECATED] coverage.config.json is no longer supported.
Please migrate your configuration to config.yaml.
See docs/guides/migration-to-config-yaml.md for instructions.`;

// ─── Loader ───────────────────────────────────────────────────────────────────

/**
 * Load, validate, merge, and return the normalized `AnalyzerConfig`.
 *
 * @param configPath  Explicit path to a config file (from --config flag).
 *                    When omitted, the loader searches for config.yaml at CWD.
 */
export function loadConfig(configPath?: string): AnalyzerConfig {
  const resolvedPath = resolveConfigPath(configPath);

  // ── Explicit path provided but file does not exist ────────────────────────
  if (configPath) {
    const absPath = path.resolve(configPath);
    if (!fs.existsSync(absPath)) {
      throw new Error(
        `Config error: configuration file not found: ${absPath}\n` +
        `  Check the path passed to --config and try again.`,
      );
    }
    return loadAndMerge(absPath);
  }

  // ── Auto-discovery ────────────────────────────────────────────────────────
  if (resolvedPath && fs.existsSync(resolvedPath)) {
    return loadAndMerge(resolvedPath);
  }

  // ── Legacy config detection ───────────────────────────────────────────────
  const legacyPath = path.join(process.cwd(), LEGACY_CONFIG_FILENAME);
  if (fs.existsSync(legacyPath)) {
    process.stderr.write(LEGACY_CONFIG_WARNING + '\n');
  }

  // ── No config found — warn and use defaults ───────────────────────────────
  // Check failOnConfigMissing from the defaults (always false unless overridden
  // by an already-loaded config — handled upstream).
  if (DEFAULT_CONFIG.analysis.failOnConfigMissing) {
    process.stderr.write(MISSING_CONFIG_WARNING + '\n');
    process.exit(1);
  }

  if (DEFAULT_CONFIG.analysis.warnOnConfigMissing !== false) {
    process.stderr.write(MISSING_CONFIG_WARNING + '\n');
  }

  return { ...DEFAULT_CONFIG };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveConfigPath(configPath?: string): string {
  if (configPath) return path.resolve(configPath);
  // Compute dynamically so tests can change process.cwd() via chdir.
  return path.join(process.cwd(), DEFAULT_CONFIG_FILENAME);
}

function loadAndMerge(absPath: string): AnalyzerConfig {
  const raw = fs.readFileSync(absPath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Config error: failed to parse ${absPath} as YAML.\n  ${msg}`);
  }

  // Determine if strict mode is requested (before full validation).
  const isStrict =
    typeof parsed === 'object' &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    (parsed as Record<string, unknown>)['qualityGate'] !== undefined &&
    ((parsed as Record<string, unknown>)['qualityGate'] as Record<string, unknown>)['mode'] === 'strict';

  const partial = validateConfig(parsed, isStrict);
  return mergeConfig(DEFAULT_CONFIG, partial);
}
