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
