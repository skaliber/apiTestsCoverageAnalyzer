/**
 * tests/tests-complete/orders.test.js
 *
 * COMPLETE COVERAGE — all order endpoints including status transitions,
 * deletion rules, and error paths.
 */
const request = require('supertest');
const { LogisticsApiClient } = require('../../src/helpers/apiClient');
const { SupertestClient, getApp, TOKENS } = require('../helpers/testClient');
const { resetStore, makeOrderPayload } = require('../helpers/fixtures');

const app = getApp();
const client = new SupertestClient('operator');

let server;
let apiClient;

beforeAll((done) => {
  server = app.listen(0, () => {
    const { port } = server.address();
    apiClient = new LogisticsApiClient(`http://localhost:${port}`, TOKENS.operator);
    done();
  });
});

afterAll((done) => server.close(done));
beforeEach(() => resetStore());

// ─── POST /orders ──────────────────────────────────────────────────────────

describe('POST /orders', () => {
  it('creates order (direct URL)', async () => {
    const res = await request(app)
      .post('/orders')
      .set({ Authorization: `Bearer ${TOKENS.operator}` })
      .send(makeOrderPayload());
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.totalValueUsd).toBeGreaterThan(0);
  });

  it('creates order via wrapper client', async () => {
    const res = await apiClient.createOrder(makeOrderPayload());
    expect(res.status).toBe(201);
    expect(res.data.data.customerId).toBe('CUST-001');
  });

  it('returns 422 when items missing', async () => {
    const res = await client.createOrder({ customerId: 'CUST-001', shippingAddress: {} });
    expect(res.status).toBe(422);
  });

  it('returns 422 when an item lacks required fields', async () => {
    const res = await client.createOrder(
      makeOrderPayload({ items: [{ sku: 'X' }] }) // missing quantity and unitPriceUsd
    );
    expect(res.status).toBe(422);
  });

  it('returns 404 for unknown customer', async () => {
    const res = await client.createOrder(makeOrderPayload({ customerId: 'CUST-NONE' }));
    expect(res.status).toBe(404);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/orders').send(makeOrderPayload());
    expect(res.status).toBe(401);
  });
});

// ─── GET /orders ───────────────────────────────────────────────────────────

describe('GET /orders', () => {
  it('returns all orders (direct URL)', async () => {
    await client.createOrder(makeOrderPayload());
    await client.createOrder(makeOrderPayload({ customerId: 'CUST-002' }));
    const res = await client.listOrders();
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  it('returns orders via wrapper client', async () => {
    await apiClient.createOrder(makeOrderPayload());
    const res = await apiClient.listOrders({ status: 'pending' });
    expect(res.status).toBe(200);
    expect(res.data.data.length).toBe(1);
  });

  it('filters by customerId', async () => {
    await client.createOrder(makeOrderPayload());
    await client.createOrder(makeOrderPayload({ customerId: 'CUST-002' }));
    const res = await client.listOrders('?customerId=CUST-001');
    expect(res.body.data.every((o) => o.customerId === 'CUST-001')).toBe(true);
  });
});

// ─── GET /orders/:id ───────────────────────────────────────────────────────

describe('GET /orders/:id', () => {
  it('returns order (direct URL)', async () => {
    const { body: { data: o } } = await client.createOrder(makeOrderPayload());
    const res = await client.getOrder(o.id);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(o.id);
  });

  it('returns order via wrapper client', async () => {
    const created = await apiClient.createOrder(makeOrderPayload());
    const id = created.data.data.id;
    const res = await apiClient.getOrder(id);
    expect(res.status).toBe(200);
  });

  it('returns 404 for unknown id', async () => {
    const res = await client.getOrder('ORD-NONE');
    expect(res.status).toBe(404);
  });
});

// ─── PUT /orders/:id/status ────────────────────────────────────────────────

describe('PUT /orders/:id/status', () => {
  it('transitions pending -> processing (direct URL)', async () => {
    const { body: { data: o } } = await client.createOrder(makeOrderPayload());
    const res = await client.updateOrderStatus(o.id, { status: 'processing' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('processing');
  });

  it('transitions via wrapper client', async () => {
    const created = await apiClient.createOrder(makeOrderPayload());
    const id = created.data.data.id;
    const res = await apiClient.updateOrderStatus(id, { status: 'processing' });
    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe('processing');
  });

  it('transitions processing -> fulfilled', async () => {
    const { body: { data: o } } = await client.createOrder(makeOrderPayload());
    await client.updateOrderStatus(o.id, { status: 'processing' });
    const res = await client.updateOrderStatus(o.id, { status: 'fulfilled' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('fulfilled');
  });

  it('returns 409 for invalid transition (fulfilled -> pending)', async () => {
    const { body: { data: o } } = await client.createOrder(makeOrderPayload());
    await client.updateOrderStatus(o.id, { status: 'processing' });
    await client.updateOrderStatus(o.id, { status: 'fulfilled' });
    const res = await client.updateOrderStatus(o.id, { status: 'pending' });
    expect(res.status).toBe(409);
  });

  it('returns 422 for invalid status value', async () => {
    const { body: { data: o } } = await client.createOrder(makeOrderPayload());
    const res = await client.updateOrderStatus(o.id, { status: 'shipped' }); // not a valid status
    expect(res.status).toBe(422);
  });

  it('returns 404 for unknown order', async () => {
    const res = await client.updateOrderStatus('ORD-NONE', { status: 'processing' });
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /orders/:id ────────────────────────────────────────────────────

describe('DELETE /orders/:id', () => {
  it('deletes a pending order (direct URL)', async () => {
    const { body: { data: o } } = await client.createOrder(makeOrderPayload());
    const del = await client.deleteOrder(o.id);
    expect(del.status).toBe(204);
    const get = await client.getOrder(o.id);
    expect(get.status).toBe(404);
  });

  it('deletes via wrapper client', async () => {
    const created = await apiClient.createOrder(makeOrderPayload());
    const id = created.data.data.id;
    const res = await apiClient.deleteOrder(id);
    expect(res.status).toBe(204);
  });

  it('returns 409 when trying to delete non-pending order', async () => {
    const { body: { data: o } } = await client.createOrder(makeOrderPayload());
    await client.updateOrderStatus(o.id, { status: 'processing' });
    const res = await client.deleteOrder(o.id);
    expect(res.status).toBe(409);
  });

  it('returns 404 for unknown order', async () => {
    const res = await client.deleteOrder('ORD-NONE');
    expect(res.status).toBe(404);
  });
});
