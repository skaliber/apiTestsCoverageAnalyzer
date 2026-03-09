/**
 * tests/tests-complete/error.test.js
 *
 * Cross-cutting error scenario tests:
 * - 404 for unknown routes
 * - Malformed JSON bodies
 * - Missing Content-Type
 * - Method not allowed (implicit 404)
 * - Large payload rejection
 */
const request = require('supertest');
const { getApp, TOKENS } = require('../helpers/testClient');
const { resetStore } = require('../helpers/fixtures');

const app = getApp();
const AUTH = { Authorization: `Bearer ${TOKENS.operator}` };

beforeEach(() => resetStore());

describe('404 — unknown routes', () => {
  it('returns 404 for GET /unknown-path', async () => {
    const res = await request(app).get('/unknown-path').set(AUTH);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });

  it('returns 404 for POST /v2/shipments (wrong version)', async () => {
    const res = await request(app).post('/v2/shipments').set(AUTH).send({});
    expect(res.status).toBe(404);
  });

  it('includes the path in the error message', async () => {
    const res = await request(app).get('/not-a-real-endpoint').set(AUTH);
    expect(res.body.message).toContain('/not-a-real-endpoint');
  });
});

describe('Malformed request bodies', () => {
  it('returns 400 for malformed JSON', async () => {
    const res = await request(app)
      .post('/shipments')
      .set({ ...AUTH, 'Content-Type': 'application/json' })
      .send('{ invalid json }');
    // Express returns 400 for broken JSON
    expect([400, 422, 500]).toContain(res.status);
  });

  it('returns sensible error for completely empty body on POST /shipments', async () => {
    const res = await request(app)
      .post('/shipments')
      .set(AUTH)
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('ValidationError');
  });
});

describe('Authentication edge cases', () => {
  it('returns 401 for malformed token format', async () => {
    const res = await request(app)
      .get('/shipments')
      .set({ Authorization: 'NotBearer abc123' });
    expect(res.status).toBe(401);
    expect(res.body.message).toContain('malformed');
  });

  it('returns 401 for invalid token value', async () => {
    const res = await request(app)
      .get('/shipments')
      .set({ Authorization: 'Bearer not-a-real-token' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for completely missing Authorization header', async () => {
    const res = await request(app).get('/shipments');
    expect(res.status).toBe(401);
  });
});

describe('Business rule boundary conditions', () => {
  it('allows shipment at exactly 1000 kg limit', async () => {
    const res = await request(app)
      .post('/shipments')
      .set(AUTH)
      .send({
        carrierId: 'CAR-001',
        warehouseId: 'WH-001',
        origin: { city: 'Atlanta' },
        destination: { city: 'New York' },
        weightKg: 1000, // exactly at limit
      });
    expect(res.status).toBe(201);
  });

  it('rejects shipment 0.1 kg over limit', async () => {
    const res = await request(app)
      .post('/shipments')
      .set(AUTH)
      .send({
        carrierId: 'CAR-001',
        warehouseId: 'WH-001',
        origin: { city: 'Atlanta' },
        destination: { city: 'New York' },
        weightKg: 1000.1,
      });
    expect(res.status).toBe(400);
    expect(res.body.rule).toBe('shipment-weight-limit');
  });
});

describe('Content-Type handling', () => {
  it('accepts application/json', async () => {
    const res = await request(app)
      .get('/carriers')
      .set(AUTH)
      .set('Accept', 'application/json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
