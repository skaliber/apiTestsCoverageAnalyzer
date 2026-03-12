import {
  detectHapiRoutes,
  detectBoomErrors,
} from '../../../src/languages/javascript/hapiDetector';

describe('detectHapiRoutes', () => {
  it('detects simple server.route with method and path', () => {
    const source = `
server.route({
  method: 'GET',
  path: '/api/articles',
  handler: async (request, h) => {
    return articles;
  }
});
`;
    const routes = detectHapiRoutes(source, '/fake/routes.js');
    expect(routes).toHaveLength(1);
    expect(routes[0].method).toBe('GET');
    expect(routes[0].path).toBe('/api/articles');
  });

  it('detects route with auth: jwt (required)', () => {
    const source = `
server.route({
  method: 'POST',
  path: '/api/articles',
  options: {
    auth: 'jwt',
  },
  handler: async (request, h) => {}
});
`;
    const routes = detectHapiRoutes(source, '/fake/routes.js');
    expect(routes).toHaveLength(1);
    expect(routes[0].auth).toBeDefined();
    expect(routes[0].auth!.strategy).toBe('jwt');
    expect(routes[0].auth!.mode).toBe('required');
  });

  it('detects route with auth mode try (optional)', () => {
    const source = `
server.route({
  method: 'GET',
  path: '/api/articles',
  options: {
    auth: { mode: 'try' },
  },
  handler: async (request, h) => {}
});
`;
    const routes = detectHapiRoutes(source, '/fake/routes.js');
    expect(routes).toHaveLength(1);
    expect(routes[0].auth).toBeDefined();
    expect(routes[0].auth!.mode).toBe('optional');
  });

  it('detects path parameters with {param} syntax', () => {
    const source = `
server.route({
  method: 'GET',
  path: '/api/articles/{slug}',
  handler: async (request, h) => {}
});
`;
    const routes = detectHapiRoutes(source, '/fake/routes.js');
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe('/api/articles/{slug}');
  });

  it('detects multiple routes', () => {
    const source = `
server.route({
  method: 'GET',
  path: '/api/articles',
  handler: list
});

server.route({
  method: 'POST',
  path: '/api/articles',
  handler: create
});
`;
    const routes = detectHapiRoutes(source, '/fake/routes.js');
    expect(routes).toHaveLength(2);
    expect(routes[0].method).toBe('GET');
    expect(routes[1].method).toBe('POST');
  });

  it('returns empty for non-Hapi code', () => {
    const source = `const x = 1; function foo() {}`;
    expect(detectHapiRoutes(source, '/fake/util.js')).toEqual([]);
  });
});

describe('detectBoomErrors', () => {
  it('detects Boom.notFound', () => {
    const source = `
if (!article) {
  throw Boom.notFound('Article not found');
}
`;
    const errors = detectBoomErrors(source, '/fake/handler.js');
    expect(errors).toHaveLength(1);
    expect(errors[0].errorType).toBe('notFound');
    expect(errors[0].statusCode).toBe(404);
  });

  it('detects Boom.unauthorized', () => {
    const source = `return Boom.unauthorized('Invalid credentials');`;
    const errors = detectBoomErrors(source, '/fake/auth.js');
    expect(errors).toHaveLength(1);
    expect(errors[0].errorType).toBe('unauthorized');
    expect(errors[0].statusCode).toBe(401);
  });

  it('detects multiple Boom errors', () => {
    const source = `
throw Boom.badRequest('Invalid input');
throw Boom.forbidden('Access denied');
throw Boom.conflict('Already exists');
`;
    const errors = detectBoomErrors(source, '/fake/handler.js');
    expect(errors).toHaveLength(3);
    expect(errors.map((e) => e.statusCode)).toEqual([400, 403, 409]);
  });

  it('returns empty for non-Boom code', () => {
    const source = `throw new Error('Something went wrong');`;
    expect(detectBoomErrors(source, '/fake/handler.js')).toEqual([]);
  });
});

describe('hapiDetector – edge cases and error handling', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('detectHapiRoutes returns empty array for null-like empty string input', () => {
    const result = detectHapiRoutes('', '/fake/empty.js');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('detectHapiRoutes handles invalid/malformed route without method gracefully', () => {
    const source = `
server.route({
  path: '/api/broken',
  handler: async (request, h) => {}
});
`;
    const routes = detectHapiRoutes(source, '/fake/broken.js');
    // Either returns empty or handles missing method without throwing
    expect(Array.isArray(routes)).toBe(true);
  });

  it('detectBoomErrors returns empty array for null-like empty string input (boundary)', () => {
    const result = detectBoomErrors('', '/fake/empty.js');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('detectBoomErrors handles missing/undefined Boom method name without throwing', () => {
    const source = `throw Boom.badImplementation('Internal server error');`;
    expect(() => detectBoomErrors(source, '/fake/handler.js')).not.toThrow();
    const errors = detectBoomErrors(source, '/fake/handler.js');
    expect(Array.isArray(errors)).toBe(true);
  });

  it('detectHapiRoutes detects route with auth: false (no authorization required)', () => {
    const source = `
server.route({
  method: 'GET',
  path: '/public',
  options: {
    auth: false,
  },
  handler: async (request, h) => { return 'public'; }
});
`;
    const routes = detectHapiRoutes(source, '/fake/public.js');
    expect(routes.length).toBeGreaterThanOrEqual(1);
    expect(routes[0].path).toBe('/public');
  });

  it('detectBoomErrors detects 401 unauthorized and 403 forbidden errors (auth errors)', () => {
    const source = `
throw Boom.unauthorized('Token missing or invalid');
throw Boom.forbidden('Access not allowed');
`;
    const errors = detectBoomErrors(source, '/fake/auth-handler.js');
    expect(errors.length).toBe(2);
    const statusCodes = errors.map((e) => e.statusCode);
    expect(statusCodes).toContain(401);
    expect(statusCodes).toContain(403);
  });

  it('detectHapiRoutes handles min boundary of single char path without throwing', () => {
    const source = `
server.route({
  method: 'GET',
  path: '/',
  handler: async (request, h) => {}
});
`;
    expect(() => detectHapiRoutes(source, '/fake/root.js')).not.toThrow();
    const routes = detectHapiRoutes(source, '/fake/root.js');
    expect(routes[0].path).toBe('/');
  });
});
