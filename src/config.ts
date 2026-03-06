import * as fs from 'fs';
import * as path from 'path';

// ─── Configuration schema ─────────────────────────────────────────────────────

/**
 * Per-coverage-type threshold percentages.
 * Each key corresponds to a coverage type (e.g. "endpoint", "parameter").
 */
export interface ThresholdsConfig {
  endpoint?: number;
  parameter?: number;
  business?: number;
  integration?: number;
  security?: number;
  error?: number;
  performance?: number;
  resilience?: number;
  [key: string]: number | undefined;
}

/**
 * Exclusion rules applied before coverage calculations.
 */
export interface ExcludeConfig {
  /** Glob-style path patterns whose endpoints should be excluded (e.g. "/internal/*") */
  paths?: string[];
  /** HTTP methods to exclude (e.g. ["OPTIONS", "HEAD"]) */
  methods?: string[];
}

/**
 * Top-level configuration object that can be provided via `coverage.config.json`.
 */
export interface CoverageConfig {
  /** Per-type minimum coverage thresholds (percentages 0–100) */
  thresholds?: ThresholdsConfig;
  /** Endpoints / methods to exclude from analysis */
  exclude?: ExcludeConfig;
  /** Glob patterns for test files (overrides CLI --tests default) */
  testPatterns?: string[];
  /** Paths to plugin modules to load after built-in analysis */
  plugins?: string[];
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_CONFIG_FILENAME = 'coverage.config.json';

export const defaultConfig: CoverageConfig = {
  thresholds: {},
  exclude: {
    paths: [],
    methods: [],
  },
  testPatterns: [],
  plugins: [],
};

// ─── Loader ───────────────────────────────────────────────────────────────────

/**
 * Load a `CoverageConfig` from the given file path.
 * The file must be valid JSON.
 *
 * @throws if the file exists but cannot be parsed.
 */
export function loadConfigFile(filePath: string): CoverageConfig {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Configuration file ${filePath} must contain a JSON object`);
  }
  return parsed as CoverageConfig;
}

/**
 * Resolve and load the configuration file.
 *
 * Resolution order:
 * 1. If `configPath` is provided, load that file (error if missing).
 * 2. Otherwise, look for `coverage.config.json` in the current working directory.
 * 3. If neither is found, return the default (empty) configuration.
 */
export function resolveConfig(configPath?: string): CoverageConfig {
  if (configPath) {
    const absPath = path.resolve(configPath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Configuration file not found: ${absPath}`);
    }
    return loadConfigFile(absPath);
  }

  const defaultPath = path.join(process.cwd(), DEFAULT_CONFIG_FILENAME);
  if (fs.existsSync(defaultPath)) {
    return loadConfigFile(defaultPath);
  }

  return { ...defaultConfig };
}

/**
 * Merge a loaded `CoverageConfig` with explicit CLI overrides.
 * CLI values always take precedence over config-file values.
 *
 * @param fileConfig  Configuration loaded from the file (may be empty).
 * @param cliOverrides  Values supplied directly on the command line.
 */
export function mergeConfig(
  fileConfig: CoverageConfig,
  cliOverrides: Partial<CoverageConfig>,
): CoverageConfig {
  const merged: CoverageConfig = {
    thresholds: {
      ...(fileConfig.thresholds ?? {}),
      ...(cliOverrides.thresholds ?? {}),
    },
    exclude: {
      paths: cliOverrides.exclude?.paths ?? fileConfig.exclude?.paths ?? [],
      methods: cliOverrides.exclude?.methods ?? fileConfig.exclude?.methods ?? [],
    },
    testPatterns:
      (cliOverrides.testPatterns && cliOverrides.testPatterns.length > 0)
        ? cliOverrides.testPatterns
        : (fileConfig.testPatterns ?? []),
    plugins: [
      ...(fileConfig.plugins ?? []),
      ...(cliOverrides.plugins ?? []),
    ],
  };
  return merged;
}

// ─── Endpoint exclusion helper ────────────────────────────────────────────────

/**
 * Return `true` if the given `method` / `path` combination should be excluded
 * according to `exclude` configuration rules.
 *
 * Path matching supports simple wildcard segments using `*`
 * (e.g. `/internal/*` matches `/internal/anything`).
 */
export function isExcluded(
  method: string,
  endpointPath: string,
  exclude: ExcludeConfig,
): boolean {
  const methods = exclude.methods ?? [];
  if (methods.map((m) => m.toUpperCase()).includes(method.toUpperCase())) {
    return true;
  }

  const patterns = exclude.paths ?? [];
  for (const pattern of patterns) {
    if (matchesPathPattern(endpointPath, pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Simple glob-style path pattern matcher.
 * Supports `*` (matches a single path segment) and `**` (matches any path suffix).
 */
function matchesPathPattern(endpointPath: string, pattern: string): boolean {
  // Escape special regex characters except * and convert glob * to regex
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex specials (not *)
    .replace(/\*\*/g, '.+')                 // ** → any characters
    .replace(/\*/g, '[^/]+');               // * → any characters except /
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(endpointPath);
}
