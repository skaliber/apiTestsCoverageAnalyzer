/**
 * Base URL composer (Feature 27, Sub-PR 9)
 *
 * Unified URL composition across all frameworks:
 * - Flask: Blueprint url_prefix + route path
 * - Express: app.use mount prefix + router path + route path
 * - Spring: @RequestMapping class-level + method-level
 * - Angular: environment.apiUrl from environments/environment.ts
 * - Vue: axios.defaults.baseURL
 * - Slim PHP: $app->group prefix + route path
 * - HapiJS: explicit path (no composition needed)
 *
 * Normalizes: remove double slashes, ensure single leading slash.
 */

/**
 * Compose a full URL from multiple path segments.
 * Handles: double slashes, missing leading slashes, trailing slashes.
 */
export function composeUrl(...segments: (string | undefined)[]): string {
  const parts = segments
    .filter((s): s is string => typeof s === 'string' && s.length > 0);

  if (parts.length === 0) return '/';

  // Detect protocol in the first segment (e.g. http://, https://)
  const protocolMatch = parts[0].match(/^(\w+:\/\/)/);
  let protocol = '';
  if (protocolMatch) {
    protocol = protocolMatch[1];
    parts[0] = parts[0].slice(protocol.length);
  }

  const stripped = parts.map((s) => s.replace(/^\/+|\/+$/g, ''));
  const joined = stripped.join('/');
  const deduped = joined.replace(/\/+/g, '/');

  if (protocol) {
    const normalized = protocol + deduped;
    return normalized.replace(/\/+$/, '') || protocol;
  }

  const normalized = '/' + deduped;
  return normalized === '/' ? '/' : normalized.replace(/\/+$/, '');
}

/**
 * Normalize a path template: ensure leading slash, remove double slashes,
 * standardize parameter syntax.
 */
export function normalizePath(path: string): string {
  if (!path) return '/';

  // Ensure leading slash
  let normalized = path.startsWith('/') ? path : '/' + path;

  // Remove double slashes (but not from protocol like http://)
  // First handle leading double slashes
  normalized = normalized.replace(/^\/\/+/, '/');
  // Then handle double slashes in the middle
  normalized = normalized.replace(/([^:])\/\/+/g, '$1/');

  // Remove trailing slash (unless it's just "/")
  if (normalized.length > 1) {
    normalized = normalized.replace(/\/+$/, '');
  }

  return normalized;
}

/**
 * Convert framework-specific parameter syntax to OpenAPI-style {param}.
 *
 * Flask: <param>, <int:param> → {param}
 * Express: :param → {param}
 * Slim PHP: {param} (already correct)
 * HapiJS: {param} (already correct)
 * Spring: {param} (already correct)
 */
export function normalizePathParams(path: string): string {
  // Flask/Python: <param> or <type:param>
  let normalized = path.replace(/<(?:\w+:)?(\w+)>/g, '{$1}');

  // Express: :param (but not :// from URLs)
  normalized = normalized.replace(/(?<=\/):([\w]+)/g, '{$1}');

  return normalized;
}

/**
 * Compose full URL for a specific framework's route.
 */
export function composeFrameworkUrl(
  framework: string,
  parts: {
    baseUrl?: string;
    classPrefix?: string;
    mountPrefix?: string;
    routePath: string;
  },
): string {
  const segments: string[] = [];

  if (parts.baseUrl) segments.push(parts.baseUrl);
  if (parts.classPrefix) segments.push(parts.classPrefix);
  if (parts.mountPrefix) segments.push(parts.mountPrefix);
  segments.push(parts.routePath);

  const raw = composeUrl(...segments);
  return normalizePathParams(raw);
}
