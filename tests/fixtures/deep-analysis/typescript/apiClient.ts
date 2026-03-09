/**
 * Stub HTTP client for deep-analysis TypeScript fixture tests.
 * Returns synchronous mock responses so fixture tests don't need to await calls.
 */
export const client = {
  get: (_path: string) => ({ status: 200, body: {} }),
  post: (_path: string, _body?: unknown) => ({ status: 201, body: {} }),
  put: (_path: string, _body?: unknown) => ({ status: 200, body: {} }),
  patch: (_path: string, _body?: unknown) => ({ status: 200, body: {} }),
  delete: (_path: string) => ({ status: 204, body: {} }),
};

export const apiClient = client;
