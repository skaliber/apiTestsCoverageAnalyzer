/**
 * Central config — deep-merge utility.
 *
 * Merges a user-supplied partial config over the built-in defaults.
 * - Plain objects are recursively merged (user values win on conflict).
 * - Array fields are replaced, not concatenated (user array replaces default).
 * - Undefined user values are ignored (defaults are preserved).
 */

import type { AnalyzerConfig } from './types';

/**
 * Deep-merge `user` over `defaults`.
 * Returns a new object; neither input is mutated.
 */
export function mergeConfig(
  defaults: AnalyzerConfig,
  user: Partial<AnalyzerConfig>,
): AnalyzerConfig {
  return deepMerge(defaults, user) as AnalyzerConfig;
}

function deepMerge<T>(target: T, source: Partial<T>): T {
  // For non-objects or arrays, the source value wins outright.
  if (
    source === undefined ||
    source === null ||
    typeof source !== 'object' ||
    Array.isArray(source)
  ) {
    return (source !== undefined ? source : target) as T;
  }
  if (
    target === undefined ||
    target === null ||
    typeof target !== 'object' ||
    Array.isArray(target)
  ) {
    return source as T;
  }

  const result: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  for (const key of Object.keys(source as Record<string, unknown>)) {
    const srcVal = (source as Record<string, unknown>)[key];
    const tgtVal = (target as Record<string, unknown>)[key];

    if (srcVal === undefined) {
      // Preserve the default.
      continue;
    }

    if (Array.isArray(srcVal)) {
      // Arrays are replaced, not merged.
      result[key] = srcVal;
    } else if (
      typeof srcVal === 'object' &&
      srcVal !== null &&
      typeof tgtVal === 'object' &&
      tgtVal !== null &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>);
    } else {
      result[key] = srcVal;
    }
  }

  return result as T;
}
