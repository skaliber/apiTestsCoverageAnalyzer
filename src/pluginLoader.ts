import { CoverageResult } from './reporting';
import { CoverageConfig } from './config';

// ─── Plugin interface ─────────────────────────────────────────────────────────

/**
 * Context object passed to every plugin's `analyze` function.
 */
export interface PluginContext {
  /** Raw OpenAPI / Swagger spec object (already parsed). May be undefined if not available. */
  spec?: unknown;
  /** Glob patterns that were used to locate test files */
  testPatterns: string[];
  /** Coverage results produced by the built-in analysers */
  results: CoverageResult[];
  /** The resolved configuration that the analyser is running with */
  config: CoverageConfig;
}

/**
 * The shape a plugin module must export.
 */
export interface Plugin {
  /**
   * Main entry-point of the plugin.
   *
   * @param context  Analysis context (spec, tests, results, config)
   * @returns A `CoverageResult` (or array of `CoverageResult`s) to append to the report.
   */
  analyze: (context: PluginContext) => Promise<CoverageResult | CoverageResult[]>;
}

// ─── Loader ───────────────────────────────────────────────────────────────────

/**
 * Dynamically load a plugin module from the given path.
 *
 * Plugin paths may be:
 * - Absolute paths
 * - Relative paths (resolved against `basedir`, default: `process.cwd()`)
 * - Node module names (resolved normally)
 *
 * Errors during loading are caught and logged as warnings; `null` is returned.
 */
export async function loadPlugin(pluginPath: string, basedir?: string): Promise<Plugin | null> {
  const base = basedir ?? process.cwd();
  let resolvedPath = pluginPath;

  // Resolve relative paths against the base directory
  if (pluginPath.startsWith('./') || pluginPath.startsWith('../')) {
    resolvedPath = require('path').resolve(base, pluginPath);
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(resolvedPath) as Record<string, unknown>;
    if (typeof mod.analyze !== 'function') {
      console.warn(
        `[plugin] Warning: plugin "${pluginPath}" does not export an "analyze" function – skipping.`,
      );
      return null;
    }
    return mod as unknown as Plugin;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[plugin] Warning: failed to load plugin "${pluginPath}": ${message}`);
    return null;
  }
}

/**
 * Run all plugins listed in `config.plugins`, collect their results, and
 * return them as an array of `CoverageResult` objects.
 *
 * Errors thrown by individual plugins are caught, logged as warnings, and
 * do not prevent other plugins from running.
 *
 * @param config    Resolved configuration containing the `plugins` list
 * @param context   Context passed to each plugin's `analyze` function
 * @param basedir   Directory used to resolve relative plugin paths (default: cwd)
 */
export async function runPlugins(
  config: CoverageConfig,
  context: PluginContext,
  basedir?: string,
): Promise<CoverageResult[]> {
  const pluginPaths = config.plugins ?? [];
  const allResults: CoverageResult[] = [];

  for (const pluginPath of pluginPaths) {
    const plugin = await loadPlugin(pluginPath, basedir);
    if (!plugin) continue;

    try {
      const pluginResult = await plugin.analyze(context);
      if (Array.isArray(pluginResult)) {
        allResults.push(...pluginResult);
      } else {
        allResults.push(pluginResult);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[plugin] Warning: plugin "${pluginPath}" threw an error during analysis: ${message}`);
    }
  }

  return allResults;
}
