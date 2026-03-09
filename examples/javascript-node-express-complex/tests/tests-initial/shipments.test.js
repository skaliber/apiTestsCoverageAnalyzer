/**
 * tests/tests-initial/shipments.test.js
 *
 * INITIAL COVERAGE — ~50% of shipment endpoints covered.
 * Missing: dispatch, deliver, cancel, tracking, error paths.
 *
 * This file demonstrates the "before" state in a coverage journey.
 * The analyzer should report these endpoints as untested:
 *  - POST /shipments/:id/dispatch
 *  - POST /shipments/:id/deliver
 *  - POST /shipments/:id/cancel
 *  - GET  /shipments/:id/tracking
 */
const request = require('supertest');
const { createApp } = require('../../src/app');
const { resetStore, makeShipmentPayload } = require('../helpers/fixtures');

const app = createApp();

const OPS_TOKEN = 'token-ops-001';
const AUTH = { Authorization: `Bearer ${OPS_TOKEN}` };

beforeEach(() => {
  resetStore();
});

describe('POST /shipments — create shipment', () => {
  it('creates a shipment with valid payload', async () => {
    const payload = makeShipmentPayload();
    const res = await request(app)
      .post('/shipments')
      .set(AUTH)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      carrierId:   payload.carrierId,
      warehouseId: payload.warehouseId,
      weightKg:    payload.weightKg,
      status:      'pending',
    });
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.trackingNumber).toBeDefined();
  });

  it('returns 401 when no auth token provided', async () => {
    const res = await request(app)
      .post('/shipments')
      .send(makeShipmentPayload());
    expect(res.status).toBe(401);
  });

  it('returns 422 when required fields missing', async () => {
    const res = await request(app)
      .post('/shipments')
      .set(AUTH)
      .send({ carrierId: 'CAR-001' }); // missing many required fields
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('ValidationError');
  });

  it('returns 400 when weight exceeds 1000 kg', async () => {
    const res = await request(app)
      .post('/shipments')
      .set(AUTH)
      .send(makeShipmentPayload({ weightKg: 1500 }));
    expect(res.status).toBe(400);
    expect(res.body.rule).toBe('shipment-weight-limit');
  });

  it('returns 404 when carrier does not exist', async () => {
    const res = await request(app)
      .post('/shipments')
      .set(AUTH)
      .send(makeShipmentPayload({ carrierId: 'CAR-DOES-NOT-EXIST' }));
    expect(res.status).toBe(404);
  });

  it('returns 409 when carrier is inactive', async () => {
    const res = await request(app)
      .post('/shipments')
      .set(AUTH)
      .send(makeShipmentPayload({ carrierId: 'CAR-004' })); // OldLine Freight is inactive
    expect(res.status).toBe(409);
    expect(res.body.rule).toBe('carrier-active-required');
  });
});

describe('GET /shipments — list shipments', () => {
  it('returns empty list when no shipments exist', async () => {
    const res = await request(app).get('/shipments').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('returns created shipments', async () => {
    await request(app).post('/shipments').set(AUTH).send(makeShipmentPayload());
    await request(app).post('/shipments').set(AUTH).send(makeShipmentPayload());

    const res = await request(app).get('/shipments').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });

  it('filters by status query param', async () => {
    await request(app).post('/shipments').set(AUTH).send(makeShipmentPayload());
    const res = await request(app).get('/shipments?status=pending').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.every((s) => s.status === 'pending')).toBe(true);
  });
});

describe('GET /shipments/:id — get single shipment', () => {
  it('returns shipment by id', async () => {
    const create = await request(app).post('/shipments').set(AUTH).send(makeShipmentPayload());
    const id = create.body.data.id;

    const res = await request(app).get(`/shipments/${id}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(id);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).get('/shipments/SHP-NONE').set(AUTH);
    expect(res.status).toBe(404);
  });
});

describe('PUT /shipments/:id — update shipment', () => {
  it('updates carrier on a pending shipment', async () => {
    const create = await request(app).post('/shipments').set(AUTH).send(makeShipmentPayload());
    const id = create.body.data.id;

    const res = await request(app)
      .put(`/shipments/${id}`)
      .set(AUTH)
      .send({ carrierId: 'CAR-002' });

    expect(res.status).toBe(200);
    expect(res.body.data.carrierId).toBe('CAR-002');
  });

  it('returns 404 when shipment does not exist', async () => {
    const res = await request(app)
      .put('/shipments/SHP-NONE')
      .set(AUTH)
      .send({ carrierId: 'CAR-001' });
    expect(res.status).toBe(404);
  });
});

// NOTE: DELETE /shipments/:id, POST /shipments/:id/dispatch,
//       POST /shipments/:id/deliver, POST /shipments/:id/cancel,
//       and GET /shipments/:id/tracking are intentionally NOT tested here
// to simulate partial initial coverage.
