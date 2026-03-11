const request = require('supertest');
const app = require('../src/app');

describe('Articles API', () => {
  test('GET /api/articles returns articles', async () => {
    const res = await request(app).get('/api/articles');
    expect(res.status).toBe(200);
  });

  test('POST /api/articles creates article', async () => {
    const res = await request(app)
      .post('/api/articles')
      .send({ title: 'Test', body: 'Body' });
    expect(res.status).toBe(201);
  });

  test('GET /api/articles/:slug returns article', async () => {
    const res = await request(app).get('/api/articles/test-slug');
    expect(res.status).toBe(200);
  });

  test('PUT /api/articles/:slug updates article', async () => {
    const res = await request(app)
      .put('/api/articles/test-slug')
      .send({ title: 'Updated' });
    expect(res.status).toBe(200);
  });

  test('DELETE /api/articles/:slug deletes article', async () => {
    const res = await request(app).delete('/api/articles/test-slug');
    expect(res.status).toBe(200);
  });

  test('POST /api/articles/:slug/favorite favorites article', async () => {
    const res = await request(app).post('/api/articles/test-slug/favorite');
    expect(res.status).toBe(200);
  });
});
