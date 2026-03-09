/**
 * tests/tests-initial/orders.test.js
 *
 * INITIAL COVERAGE — ~40% of order endpoints covered.
 * Missing: PUT /orders/:id/status, DELETE /orders/:id, and most error paths.
 *
 * Intentionally incomplete to demonstrate coverage gap in the dashboard.
 */
const request = require('supertest');
const { createApp } = require('../../src/app');
const { resetStore, makeOrderPayload } = require('../helpers/fixtures');

const app = createApp();
const OPS_TOKEN = 'token-ops-001';
const AUTH = { Authorization: `Bearer ${OPS_TOKEN}` };

beforeEach(() => {
  resetStore();
});

describe('POST /orders — create order', () => {
  it('creates an order with valid payload', async () => {
    const payload = makeOrderPayload();
    const res = await request(app).post('/orders').set(AUTH).send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      customerId: 'CUST-001',
      status: 'pending',
    });
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.items.length).toBe(2);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/orders').send(makeOrderPayload());
    expect(res.status).toBe(401);
  });

  it('returns 422 when items array is empty', async () => {
    const res = await request(app)
      .post('/orders')
      .set(AUTH)
      .send(makeOrderPayload({ items: [] }));
    expect(res.status).toBe(422);
  });

  it('returns 422 when required fields missing', async () => {
    const res = await request(app)
      .post('/orders')
      .set(AUTH)
      .send({ customerId: 'CUST-001' }); // missing items and shippingAddress
    expect(res.status).toBe(422);
  });

  it('returns 404 when customer does not exist', async () => {
    const res = await request(app)
      .post('/orders')
      .set(AUTH)
      .send(makeOrderPayload({ customerId: 'CUST-NONE' }));
    expect(res.status).toBe(404);
  });
});

describe('GET /orders — list orders', () => {
  it('returns empty list initially', async () => {
    const res = await request(app).get('/orders').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it('returns paginated results', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).post('/orders').set(AUTH).send(makeOrderPayload());
    }
    const res = await request(app).get('/orders?page=1&limit=2').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.total).toBe(3);
  });
});

describe('GET /orders/:id — get single order', () => {
  it('returns order by id', async () => {
    const create = await request(app).post('/orders').set(AUTH).send(makeOrderPayload());
    const id = create.body.data.id;

    const res = await request(app).get(`/orders/${id}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(id);
  });

  it('returns 404 for unknown order', async () => {
    const res = await request(app).get('/orders/ORD-NONE').set(AUTH);
    expect(res.status).toBe(404);
  });
});

// NOTE: PUT /orders/:id/status and DELETE /orders/:id are NOT tested here.
// These gaps will be visible in the coverage analyzer dashboard.
