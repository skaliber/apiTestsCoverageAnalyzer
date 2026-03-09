/**
 * MCP integration – configuration loader and validator.
 *
 * Handles loading the `mcp` block from the project config file, applying
 * defaults, validating allowed transports and server URLs, and providing a
 * single function to resolve the effective configuration for a named server.
 */

import type {
  McpConfig,
  McpServerConfig,
  McpTransport,
} from './types';

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const MCP_DEFAULT_TIMEOUT_MS = 30_000;
export const MCP_DEFAULT_MAX_PAYLOAD_BYTES = 1_048_576; // 1 MB
export const MCP_DEFAULT_MAX_RETRIES = 2;
export const MCP_DEFAULT_RETRY_DELAY_MS = 500;
export const MCP_DEFAULT_TRANSPORT: McpTransport = 'stdio';

export const MCP_ALLOWED_TRANSPORTS: McpTransport[] = ['stdio', 'http'];

/** Sensitive key patterns that must never appear in MCP prompts */
export const REDACTED_KEYS = [
  'token',
  'password',
  'secret',
  'apikey',
  'api_key',
  'connectionstring',
  'connection_string',
  'authorization',
  'bearer',
  'private_key',
  'privatekey',
  'access_key',
  'accesskey',
];

// ─── Effective config resolution ──────────────────────────────────────────────

/**
 * Merge per-server overrides with global defaults.
 */
export function resolveServerConfig(
  global: McpConfig,
  serverName: string,
): McpServerConfig & { timeoutMs: number } {
  const server = global.servers?.[serverName] ?? {};
  return {
    ...server,
    transport: server.transport ?? global.defaultTransport ?? MCP_DEFAULT_TRANSPORT,
    timeoutMs: server.timeoutMs ?? global.timeoutMs ?? MCP_DEFAULT_TIMEOUT_MS,
  };
}

/**
 * Return true if MCP is globally enabled AND the named server is enabled.
 */
export function isMcpEnabledFor(config: McpConfig, serverName: string): boolean {
  if (!config.enabled) return false;
  const server = config.servers?.[serverName];
  // If the server key is omitted entirely it defaults to disabled.
  return server?.enabled === true;
}

// ─── Transport validation ─────────────────────────────────────────────────────

/**
 * Validate that the transport is in the allowlist (if configured).
 * Throws when the transport is not permitted.
 */
export function validateTransport(config: McpConfig, transport: McpTransport): void {
  const allowlist = config.transportAllowlist;
  if (!allowlist || allowlist.length === 0) return;
  if (!allowlist.includes(transport)) {
    throw new Error(
      `MCP transport "${transport}" is not in the configured allowlist [${allowlist.join(', ')}]`,
    );
  }
}

/**
 * Validate that an HTTP server URL is in the allowlist (if configured).
 * Throws when the URL does not match any allowed prefix.
 */
export function validateServerUrl(config: McpConfig, url: string): void {
  const allowlist = config.serverAllowlist;
  if (!allowlist || allowlist.length === 0) return;
  const permitted = allowlist.some((prefix) => url.startsWith(prefix));
  if (!permitted) {
    throw new Error(
      `MCP server URL "${url}" is not in the configured server allowlist`,
    );
  }
}

// ─── Payload size validation ──────────────────────────────────────────────────

/**
 * Validate that a payload string does not exceed the configured size limit.
 * Throws when the limit is exceeded.
 */
export function validatePayloadSize(config: McpConfig, payload: string): void {
  const limitBytes = config.maxPayloadBytes ?? MCP_DEFAULT_MAX_PAYLOAD_BYTES;
  const sizeBytes = Buffer.byteLength(payload, 'utf-8');
  if (sizeBytes > limitBytes) {
    throw new Error(
      `MCP prompt payload size ${sizeBytes} B exceeds the configured limit of ${limitBytes} B`,
    );
  }
}

// ─── Secret redaction ─────────────────────────────────────────────────────────

/**
 * Recursively redact sensitive values from a plain object.
 * Keys matching any of the REDACTED_KEYS patterns (case-insensitive) have
 * their values replaced with "[REDACTED]".
 *
 * Returns a deep-cloned sanitised copy; never mutates the original.
 */
export function redactSecrets(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactSecrets);

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isSensitive = REDACTED_KEYS.some((k) => lowerKey.includes(k.replace(/[^a-z0-9]/g, '')));
    out[key] = isSensitive ? '[REDACTED]' : redactSecrets(val);
  }
  return out;
}
