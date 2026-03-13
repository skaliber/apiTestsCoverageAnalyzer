const request = require('supertest');
const app = require('../src/app');

describe('Users API', () => {
  test('POST /api/users registers user', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'test@example.com', username: 'testuser', password: 'secret' });
    expect(res.status).toBe(201);
  });

  test('POST /api/users/login authenticates user', async () => {
    const res = await request(app)
      .post('/api/users/login')
      .send({ email: 'test@example.com', password: 'secret' });
    expect(res.status).toBe(200);
  });

  test('GET /api/users/me returns current user', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(200);
  });

  test('PUT /api/users/me updates current user', async () => {
    const res = await request(app)
      .put('/api/users/me')
      .send({ bio: 'Updated' });
    expect(res.status).toBe(200);
  });
});
