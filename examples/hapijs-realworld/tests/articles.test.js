const Lab = require('@hapi/lab');
const { expect } = require('@hapi/code');
const { init } = require('../src/server');

const { describe, it, beforeEach } = exports.lab = Lab.script();

describe('Articles', () => {
  let server;

  beforeEach(async () => {
    server = await init();
  });

  it('GET /api/articles returns articles', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/articles' });
    expect(res.statusCode).to.equal(200);
  });

  it('POST /api/articles creates article', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/articles',
      payload: { title: 'Test', body: 'Body' },
    });
    expect(res.statusCode).to.equal(201);
  });

  it('GET /api/articles/{slug} returns article', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/articles/test-slug' });
    expect(res.statusCode).to.equal(200);
  });

  it('PUT /api/articles/{slug} updates article', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: '/api/articles/test-slug',
      payload: { title: 'Updated' },
    });
    expect(res.statusCode).to.equal(200);
  });

  it('DELETE /api/articles/{slug} deletes article', async () => {
    const res = await server.inject({ method: 'DELETE', url: '/api/articles/test-slug' });
    expect(res.statusCode).to.equal(204);
  });
});
