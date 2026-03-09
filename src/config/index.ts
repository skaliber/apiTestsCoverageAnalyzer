/**
 * Central config module — public barrel export.
 *
 * Import from here; do not import from individual sub-files.
 */

export * from './types';
export * from './schema';
export { DEFAULT_CONFIG } from './defaultConfig';
export {
  validateConfig,
} from './validateConfig';
export {
  mergeConfig,
} from './mergeConfig';
export {
  loadConfig,
  DEFAULT_CONFIG_FILENAME,
  DEFAULT_CONFIG_PATH,
  LEGACY_CONFIG_FILENAME,
  MISSING_CONFIG_WARNING,
  LEGACY_CONFIG_WARNING,
} from './loadConfig';
