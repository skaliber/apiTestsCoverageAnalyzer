/**
 * Integration tests for the deep endpoint resolver orchestrator.
 *
 * Coverage:
 *   deepResolveFile() across TypeScript, Java, and Python patterns:
 *     - const USERS_PATH = '/users';  client.get(USERS_PATH)
 *     - enum Routes { USERS = '/users' };  client.get(Routes.USERS)
 *     - client.get(`${BASE}/users/${userId}`)
 *     - function getUsers(client) { return client.get('/users'); }  getUsers(apiClient)
 *     - new ApiRequest('GET', '/users');  client.execute(request)
 *     - Java: static final String PATH = "/users";  api.get(PATH)
 *     - Python: USERS_PATH = "/users";  client.get(USERS_PATH)
 *     - Python: def fetch(id): return client.get(f"/users/{id}")
 *     - Confidence scoring
 *     - Assertion linking
 *     - deepAnalysis.enabled=false produces no results
 */

import { deepResolveFile } from '../../../src/coverage/deep-analysis/deepEndpointResolver';
import { DEFAULT_DEEP_ANALYSIS_CONFIG } from '../../../src/coverage/deep-analysis/types';
import type { DeepAnalysisConfig } from '../../../src/coverage/deep-analysis/types';

const FILE = '/test/file.ts';

function cfgWith(overrides: Partial<DeepAnalysisConfig> = {}): DeepAnalysisConfig {
  return { ...DEFAULT_DEEP_ANALYSIS_CONFIG, ...overrides };
}

// ─── disabled configuration ───────────────────────────────────────────────────

describe('deepResolveFile — disabled', () => {
  it('returns an empty array when config.enabled is false', () => {
    const src = `const USERS = '/users'; client.get(USERS);`;
    const results = deepResolveFile(src, FILE, 'typescript', cfgWith({ enabled: false }));
    expect(results).toEqual([]);
  });
});

// ─── TypeScript: constant resolution ─────────────────────────────────────────

describe('deepResolveFile — TypeScript constant resolution', () => {
  it('resolves a simple const path reference', () => {
    const src = `
      const USERS_PATH = '/users';
      client.get(USERS_PATH);
    `;
    const results = deepResolveFile(src, FILE, 'typescript', cfgWith());
    const call = results.find((r) => r.method === 'GET' && r.path === '/users');
    expect(call).toBeDefined();
    expect(call?.resolutionType).toBe('constant');
    expect(call?.confidence).toBe('high');
  });

  it('resolves a let path reference', () => {
    const src = `
      let apiBase = '/api';
      client.get(apiBase);
    `;
    const results = deepResolveFile(src, FILE, 'typescript', cfgWith());
    expect(results.find((r) => r.path === '/api')).toBeDefined();
  });

  it('includes sourceFile and sourceLanguage metadata', () => {
    const src = `const PATH = '/items'; api.get(PATH);`;
    const results = deepResolveFile(src, FILE, 'typescript', cfgWith());
    expect(results[0]?.sourceFile).toBe(FILE);
    expect(results[0]?.sourceLanguage).toBe('typescript');
  });

  it('does not resolve a constant when resolveConstants is disabled', () => {
    const src = `const USERS_PATH = '/users'; client.get(USERS_PATH);`;
    const results = deepResolveFile(src, FILE, 'typescript', cfgWith({ resolveConstants: false, resolveEnums: false }));
    // The constant should no longer be resolved
    expect(results.find((r) => r.path === '/users' && r.resolutionType === 'constant')).toBeUndefined();
  });
});

// ─── TypeScript: enum resolution ──────────────────────────────────────────────

describe('deepResolveFile — TypeScript enum resolution', () => {
  it('resolves an enum member reference in a .get() call', () => {
    const src = `
      enum Routes {
        USERS = '/users',
        ORDERS = '/orders',
      }
      client.get(Routes.USERS);
    `;
    const results = deepResolveFile(src, FILE, 'typescript', cfgWith());
    const call = results.find((r) => r.method === 'GET' && r.path === '/users');
    expect(call).toBeDefined();
    expect(call?.resolutionType).toBe('enum');
  });

  it('resolves multiple enum members from the same file', () => {
    const src = `
      enum Routes {
        USERS = '/users',
        ORDERS = '/orders',
      }
      client.get(Routes.USERS);
      client.post(Routes.ORDERS);
    `;
    const results = deepResolveFile(src, FILE, 'typescript', cfgWith());
    const paths = results.map((r) => r.path);
    expect(paths).toContain('/users');
    expect(paths).toContain('/orders');
  });

  it('does not resolve enum when resolveEnums is disabled', () => {
    const src = `
      enum Routes { USERS = '/users' }
      client.get(Routes.USERS);
    `;
    const results = deepResolveFile(src, FILE, 'typescript',
      cfgWith({ resolveEnums: false, resolveConstants: false }));
    expect(results.find((r) => r.resolutionType === 'enum')).toBeUndefined();
  });
});

// ─── TypeScript: template literal resolution ──────────────────────────────────

describe('deepResolveFile — TypeScript template literals', () => {
  it('resolves a template literal with a known BASE constant', () => {
    const src = `
      const BASE = '/api';
      client.get(\`\${BASE}/users/\${userId}\`);
    `;
    const results = deepResolveFile(src, FILE, 'typescript', cfgWith());
    const call = results.find((r) => r.method === 'GET');
    expect(call).toBeDefined();
    expect(call?.path).toContain('/api/users/');
    expect(call?.resolutionType).toBe('string-template');
  });

  it('assigns medium confidence when the resolved path contains a placeholder', () => {
    const src = `
      const BASE = '/api';
      client.get(\`\${BASE}/users/\${userId}\`);
    `;
    const results = deepResolveFile(src, FILE, 'typescript', cfgWith());
    const call = results.find((r) => r.resolutionType === 'string-template');
    expect(call?.confidence).toBe('medium');
  });

  it('does not produce template results when resolveStringTemplates is disabled', () => {
    const src = 'client.get(`/users/${id}`);';
    const results = deepResolveFile(src, FILE, 'typescript', cfgWith({ resolveStringTemplates: false }));
    expect(results.find((r) => r.resolutionType === 'string-template')).toBeUndefined();
  });
});

// ─── TypeScript: wrapper-method resolution ────────────────────────────────────

describe('deepResolveFile — TypeScript wrapper method resolution', () => {
  it('resolves HTTP calls inside a wrapper function that is called from top level', () => {
    const src = `
      function getUsers(apiClient) {
        return apiClient.get('/users');
      }
      getUsers(apiClient);
    `;
    const results = deepResolveFile(src, FILE, 'typescript', cfgWith());
    const call = results.find((r) => r.path === '/users');
    expect(call).toBeDefined();
    expect(call?.resolutionType).toBe('wrapper-method');
  });

  it('does not resolve wrappers when resolveWrappers is disabled', () => {
    const src = `
      function getUsers(c) { return c.get('/users'); }
      getUsers(apiClient);
    `;
    const results = deepResolveFile(src, FILE, 'typescript',
      cfgWith({ resolveWrappers: false }));
    // Wrapper results should be absent
    expect(results.find((r) => r.resolutionType === 'wrapper-method')).toBeUndefined();
  });
});

// ─── TypeScript: request builder resolution ───────────────────────────────────

describe('deepResolveFile — TypeScript request builder resolution', () => {
  it('resolves a new ApiRequest("GET", "/users") pattern', () => {
    const src = `const request = new ApiRequest('GET', '/users');`;
    const results = deepResolveFile(src, FILE, 'typescript', cfgWith());
    const call = results.find((r) => r.method === 'GET' && r.path === '/users');
    expect(call).toBeDefined();
    expect(call?.resolutionType).toBe('request-builder');
  });

  it('resolves a fetch("/users", { method: "POST" }) pattern', () => {
    const src = `fetch('/orders', { method: 'POST' });`;
    const results = deepResolveFile(src, FILE, 'typescript', cfgWith());
    expect(results.find((r) => r.method === 'POST' && r.path === '/orders')).toBeDefined();
  });

  it('does not resolve builders when resolveRequestBuilders is disabled', () => {
    const src = `new ApiRequest('GET', '/users')`;
    const results = deepResolveFile(src, FILE, 'typescript',
      cfgWith({ resolveRequestBuilders: false }));
    expect(results.find((r) => r.resolutionType === 'request-builder')).toBeUndefined();
  });
});

// ─── Java: constant resolution ───────────────────────────────────────────────

describe('deepResolveFile — Java constant resolution', () => {
  it('resolves a static final String PATH constant in api.get(PATH)', () => {
    const src = `
      public class UserTest {
        static final String PATH = "/users";

        public void testGetUsers() {
          api.get(PATH);
        }
      }
    `;
    const results = deepResolveFile(src, '/test/UserTest.java', 'java', cfgWith());
    const call = results.find((r) => r.method === 'GET' && r.path === '/users');
    expect(call).toBeDefined();
    expect(call?.sourceLanguage).toBe('java');
  });

  it('resolves a Java enum member in api.get(Routes.USERS)', () => {
    const src = `
      enum Routes {
        USERS("/users");
        private final String path;
        Routes(String path) { this.path = path; }
      }

      api.get(Routes.USERS);
    `;
    const results = deepResolveFile(src, '/test/Test.java', 'java', cfgWith());
    expect(results.find((r) => r.path === '/users')).toBeDefined();
  });
});

// ─── Python: constant resolution ─────────────────────────────────────────────

describe('deepResolveFile — Python constant resolution', () => {
  it('resolves an upper-case module constant used in client.get()', () => {
    const src = `
USERS_PATH = "/users"
response = client.get(USERS_PATH)
    `;
    const results = deepResolveFile(src, '/test/test_users.py', 'python', cfgWith());
    const call = results.find((r) => r.method === 'GET' && r.path === '/users');
    expect(call).toBeDefined();
    expect(call?.sourceLanguage).toBe('python');
  });
});

// ─── Python: f-string resolution ─────────────────────────────────────────────

describe('deepResolveFile — Python f-string resolution', () => {
  it('resolves a Python f-string template path', () => {
    const src = `
def fetch(user_id):
    return client.get(f"/users/{user_id}")
`;
    const results = deepResolveFile(src, '/test/test_api.py', 'python', cfgWith());
    const call = results.find((r) => r.method === 'GET');
    expect(call).toBeDefined();
    expect(call?.path).toContain('/users/');
    expect(call?.resolutionType).toBe('string-template');
  });

  it('normalizes the f-string path correctly', () => {
    const src = `client.get(f"/users/{user_id}")`;
    const results = deepResolveFile(src, '/test/test.py', 'python', cfgWith());
    const call = results.find((r) => r.method === 'GET');
    expect(call?.path).toContain('/users/');
  });
});

// ─── Assertion linking ────────────────────────────────────────────────────────

describe('deepResolveFile — assertion linking', () => {
  it('marks assertionLinked as true when expect() follows the response variable', () => {
    const src = `
      const response = client.get('/users');
      expect(response.status).toBe(200);
    `;
    const results = deepResolveFile(src, FILE, 'typescript', cfgWith());
    const linked = results.find((r) => r.assertionLinked === true);
    expect(linked).toBeDefined();
  });

  it('does not produce assertionLinked results when assertionAware is disabled', () => {
    const src = `
      const response = client.get('/users');
      expect(response.status).toBe(200);
    `;
    const results = deepResolveFile(src, FILE, 'typescript',
      cfgWith({ assertionAware: false }));
    expect(results.some((r) => r.assertionLinked === true)).toBe(false);
  });

  it('marks assertionLinked for a Python assert statement', () => {
    const src = `
response = client.get('/users')
assert response.status_code == 200
    `;
    const results = deepResolveFile(src, '/test/test.py', 'python', cfgWith());
    const linked = results.find((r) => r.assertionLinked === true);
    expect(linked).toBeDefined();
  });
});

// ─── Client mapping resolution ────────────────────────────────────────────────

describe('deepResolveFile — client mapping resolution', () => {
  it('resolves a known client.method() via an explicit mapping', () => {
    const src = `userClient.getById(userId);`;
    const config = cfgWith({
      clientMappings: [
        { classOrObject: 'userClient', method: 'getById', httpMethod: 'GET', pathTemplate: '/users/{id}' },
      ],
    });
    const results = deepResolveFile(src, FILE, 'typescript', config);
    const call = results.find((r) => r.method === 'GET' && r.path === '/users/{id}');
    expect(call).toBeDefined();
    expect(call?.resolutionType).toBe('client-mapping');
    expect(call?.confidence).toBe('high');
  });

  it('does not apply client mappings when resolveClientMappings is disabled', () => {
    const src = `userClient.getById(userId);`;
    const config = cfgWith({
      resolveClientMappings: false,
      clientMappings: [
        { classOrObject: 'userClient', method: 'getById', httpMethod: 'GET', pathTemplate: '/users/{id}' },
      ],
    });
    const results = deepResolveFile(src, FILE, 'typescript', config);
    expect(results.find((r) => r.resolutionType === 'client-mapping')).toBeUndefined();
  });
});

// ─── Normalized path ──────────────────────────────────────────────────────────

describe('deepResolveFile — normalizedPath', () => {
  it('populates normalizedPath for a path with a numeric segment', () => {
    const src = `new ApiRequest('GET', '/users/42')`;
    const results = deepResolveFile(src, FILE, 'typescript', cfgWith());
    const call = results.find((r) => r.path === '/users/42');
    expect(call?.normalizedPath).toBe('/users/{id}');
  });

  it('leaves normalizedPath undefined when the path is already a template', () => {
    const src = `const P = '/users/{id}'; client.get(P);`;
    const results = deepResolveFile(src, FILE, 'typescript', cfgWith());
    const call = results.find((r) => r.path === '/users/{id}');
    // normalizedPath should be undefined when identical to path
    if (call) {
      expect(call.normalizedPath).toBeUndefined();
    }
  });
});

// ─── Deduplication ───────────────────────────────────────────────────────────

describe('deepResolveFile — deduplication', () => {
  it('does not produce duplicate entries for the same method+path+resolutionType', () => {
    const src = `
      const USERS_PATH = '/users';
      client.get(USERS_PATH);
      client.get(USERS_PATH);
    `;
    const results = deepResolveFile(src, FILE, 'typescript', cfgWith());
    const usersCalls = results.filter((r) => r.method === 'GET' && r.path === '/users' && r.resolutionType === 'constant');
    expect(usersCalls).toHaveLength(1);
  });
});
