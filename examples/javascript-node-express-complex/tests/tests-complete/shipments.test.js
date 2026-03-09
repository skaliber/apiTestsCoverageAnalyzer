/**
 * tests/tests-complete/shipments.test.js
 *
 * COMPLETE COVERAGE — all shipment endpoints tested including:
 * - Happy paths
 * - Business rule violations
 * - Error scenarios
 * - Both direct supertest and LogisticsApiClient (indirect) usage
 */
const request = require('supertest');
const { LogisticsApiClient } = require('../../src/helpers/apiClient');
const { SupertestClient, getApp, TOKENS } = require('../helpers/testClient');
const { resetStore, makeShipmentPayload } = require('../helpers/fixtures');

const app = getApp();

// Direct supertest (URL strings) — demonstrates direct endpoint resolution
const client = new SupertestClient('operator');
const adminClient = new SupertestClient('admin');

// HTTP server needed for the axios-based client
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

// ─── POST /shipments ───────────────────────────────────────────────────────

describe('POST /shipments', () => {
  it('creates shipment (direct URL)', async () => {
    const res = await request(app)
      .post('/shipments')
      .set({ Authorization: `Bearer ${TOKENS.operator}` })
      .send(makeShipmentPayload());

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.trackingNumber).toMatch(/^TRK-/);
  });

  it('creates shipment via wrapper client (indirect URL)', async () => {
    const res = await apiClient.createShipment(makeShipmentPayload());
    expect(res.status).toBe(201);
    expect(res.data.data.carrierId).toBe('CAR-001');
  });

  it('rejects missing required fields (422)', async () => {
    const res = await client.createShipment({ weightKg: 5 });
    expect(res.status).toBe(422);
  });

  it('rejects weightKg > 1000 (400 / shipment-weight-limit)', async () => {
    const res = await client.createShipment(makeShipmentPayload({ weightKg: 1001 }));
    expect(res.status).toBe(400);
    expect(res.body.rule).toBe('shipment-weight-limit');
  });

  it('rejects unknown carrier (404)', async () => {
    const res = await client.createShipment(makeShipmentPayload({ carrierId: 'CAR-X' }));
    expect(res.status).toBe(404);
  });

  it('rejects inactive carrier (409 / carrier-active-required)', async () => {
    const res = await client.createShipment(makeShipmentPayload({ carrierId: 'CAR-004' }));
    expect(res.status).toBe(409);
    expect(res.body.rule).toBe('carrier-active-required');
  });

  it('rejects hazmat on non-certified carrier (409 / hazmat-special-carrier)', async () => {
    const res = await client.createShipment(
      makeShipmentPayload({ carrierId: 'CAR-002', isHazmat: true })
    );
    expect(res.status).toBe(409);
    expect(res.body.rule).toBe('hazmat-special-carrier');
  });

  it('returns 401 without token', async () => {
    const res = await request(app).post('/shipments').send(makeShipmentPayload());
    expect(res.status).toBe(401);
  });

  it('returns 403 for readonly role', async () => {
    const res = await request(app)
      .post('/shipments')
      .set({ Authorization: `Bearer ${TOKENS.readonly}` })
      .send(makeShipmentPayload());
    expect(res.status).toBe(403);
  });
});

// ─── GET /shipments ────────────────────────────────────────────────────────

describe('GET /shipments', () => {
  it('returns empty list (direct URL)', async () => {
    const res = await client.listShipments();
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns list via wrapper client', async () => {
    await apiClient.createShipment(makeShipmentPayload());
    const res = await apiClient.listShipments({ status: 'pending' });
    expect(res.status).toBe(200);
    expect(res.data.data.length).toBeGreaterThan(0);
  });

  it('filters by carrierId', async () => {
    await client.createShipment(makeShipmentPayload({ carrierId: 'CAR-001' }));
    await client.createShipment(makeShipmentPayload({ carrierId: 'CAR-002' }));
    const res = await client.listShipments('?carrierId=CAR-001');
    expect(res.body.data.every((s) => s.carrierId === 'CAR-001')).toBe(true);
  });

  it('supports pagination', async () => {
    for (let i = 0; i < 5; i++) await client.createShipment(makeShipmentPayload());
    const res = await client.listShipments('?page=2&limit=2');
    expect(res.body.data.length).toBe(2);
    expect(res.body.page).toBe(2);
  });
});

// ─── GET /shipments/:id ────────────────────────────────────────────────────

describe('GET /shipments/:id', () => {
  it('returns shipment by id (direct URL)', async () => {
    const { body: { data: s } } = await client.createShipment(makeShipmentPayload());
    const res = await client.getShipment(s.id);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(s.id);
  });

  it('returns shipment via wrapper client', async () => {
    const created = await apiClient.createShipment(makeShipmentPayload());
    const id = created.data.data.id;
    const res = await apiClient.getShipment(id);
    expect(res.status).toBe(200);
    expect(res.data.data.id).toBe(id);
  });

  it('returns 404 for non-existent id', async () => {
    const res = await client.getShipment('SHP-NONE');
    expect(res.status).toBe(404);
  });
});

// ─── PUT /shipments/:id ────────────────────────────────────────────────────

describe('PUT /shipments/:id', () => {
  it('updates carrier (direct URL)', async () => {
    const { body: { data: s } } = await client.createShipment(makeShipmentPayload());
    const res = await client.updateShipment(s.id, { carrierId: 'CAR-002' });
    expect(res.status).toBe(200);
    expect(res.body.data.carrierId).toBe('CAR-002');
  });

  it('updates via wrapper client', async () => {
    const created = await apiClient.createShipment(makeShipmentPayload());
    const id = created.data.data.id;
    const res = await apiClient.updateShipment(id, { insured: true });
    expect(res.status).toBe(200);
    expect(res.data.data.insured).toBe(true);
  });

  it('returns 422 for unrecognized fields', async () => {
    const { body: { data: s } } = await client.createShipment(makeShipmentPayload());
    const res = await client.updateShipment(s.id, { status: 'hacked' });
    expect(res.status).toBe(422);
  });

  it('returns 404 for unknown shipment', async () => {
    const res = await client.updateShipment('SHP-NONE', { carrierId: 'CAR-001' });
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /shipments/:id ─────────────────────────────────────────────────

describe('DELETE /shipments/:id', () => {
  it('deletes pending shipment (direct URL)', async () => {
    const { body: { data: s } } = await client.createShipment(makeShipmentPayload());
    const del = await client.deleteShipment(s.id);
    expect(del.status).toBe(204);
    const get = await client.getShipment(s.id);
    expect(get.status).toBe(404);
  });

  it('deletes via wrapper client', async () => {
    const created = await apiClient.createShipment(makeShipmentPayload());
    const id = created.data.data.id;
    const res = await apiClient.deleteShipment(id);
    expect(res.status).toBe(204);
  });

  it('returns 404 for unknown id', async () => {
    const res = await client.deleteShipment('SHP-NONE');
    expect(res.status).toBe(404);
  });
});

// ─── POST /shipments/:id/dispatch ─────────────────────────────────────────

describe('POST /shipments/:id/dispatch', () => {
  it('dispatches a validated pending shipment (direct URL)', async () => {
    const { body: { data: s } } = await client.createShipment(
      makeShipmentPayload({ addressValidated: true })
    );
    const res = await client.dispatchShipment(s.id);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('dispatched');
    expect(res.body.data.dispatchedAt).toBeTruthy();
  });

  it('dispatches via wrapper client', async () => {
    const created = await apiClient.createShipment(makeShipmentPayload({ addressValidated: true }));
    const id = created.data.data.id;
    const res = await apiClient.dispatchShipment(id);
    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe('dispatched');
  });

  it('returns 422 when address not validated (address-validation-required)', async () => {
    const { body: { data: s } } = await client.createShipment(
      makeShipmentPayload({ addressValidated: false })
    );
    const res = await client.dispatchShipment(s.id);
    expect(res.status).toBe(422);
    expect(res.body.rule).toBe('address-validation-required');
  });

  it('returns 422 when high-value shipment lacks insurance (insurance-required-high-value)', async () => {
    const { body: { data: s } } = await client.createShipment(
      makeShipmentPayload({ addressValidated: true, declaredValueUsd: 6000, insured: false })
    );
    const res = await client.dispatchShipment(s.id);
    expect(res.status).toBe(422);
    expect(res.body.rule).toBe('insurance-required-high-value');
  });

  it('returns 404 for unknown shipment', async () => {
    const res = await client.dispatchShipment('SHP-NONE');
    expect(res.status).toBe(404);
  });

  it('returns 409 when already dispatched', async () => {
    const { body: { data: s } } = await client.createShipment(
      makeShipmentPayload({ addressValidated: true })
    );
    await client.dispatchShipment(s.id);
    const res = await client.dispatchShipment(s.id);
    expect(res.status).toBe(409);
  });
});

// ─── POST /shipments/:id/deliver ───────────────────────────────────────────

describe('POST /shipments/:id/deliver', () => {
  async function createDispatched() {
    const { body: { data: s } } = await client.createShipment(
      makeShipmentPayload({ addressValidated: true })
    );
    await client.dispatchShipment(s.id);
    return s.id;
  }

  it('marks dispatched shipment as delivered (direct URL)', async () => {
    const id = await createDispatched();
    const res = await client.deliverShipment(id);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('delivered');
    expect(res.body.data.deliveredAt).toBeTruthy();
  });

  it('delivers via wrapper client', async () => {
    const id = await createDispatched();
    const res = await apiClient.deliverShipment(id);
    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe('delivered');
  });

  it('returns 409 on pending shipment', async () => {
    const { body: { data: s } } = await client.createShipment(makeShipmentPayload());
    const res = await client.deliverShipment(s.id);
    expect(res.status).toBe(409);
  });

  it('returns 404 for unknown shipment', async () => {
    const res = await client.deliverShipment('SHP-NONE');
    expect(res.status).toBe(404);
  });
});

// ─── POST /shipments/:id/cancel ────────────────────────────────────────────

describe('POST /shipments/:id/cancel', () => {
  it('cancels a pending shipment (direct URL)', async () => {
    const { body: { data: s } } = await client.createShipment(makeShipmentPayload());
    const res = await client.cancelShipment(s.id, { reason: 'Customer request' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.cancelReason).toBe('Customer request');
  });

  it('cancels via wrapper client', async () => {
    const created = await apiClient.createShipment(makeShipmentPayload());
    const id = created.data.data.id;
    const res = await apiClient.cancelShipment(id, { reason: 'Test cancel' });
    expect(res.status).toBe(200);
  });

  it('returns 409 when already delivered', async () => {
    const { body: { data: s } } = await client.createShipment(
      makeShipmentPayload({ addressValidated: true })
    );
    await client.dispatchShipment(s.id);
    await client.deliverShipment(s.id);
    const res = await client.cancelShipment(s.id, {});
    expect(res.status).toBe(409);
  });

  it('returns 404 for unknown shipment', async () => {
    const res = await client.cancelShipment('SHP-NONE', {});
    expect(res.status).toBe(404);
  });
});

// ─── GET /shipments/:id/tracking ──────────────────────────────────────────

describe('GET /shipments/:id/tracking', () => {
  it('returns tracking info for a newly created shipment (direct URL)', async () => {
    const { body: { data: s } } = await client.createShipment(makeShipmentPayload());
    const res = await client.getShipmentTracking(s.id);
    expect(res.status).toBe(200);
    expect(res.body.data.trackingNumber).toBe(s.trackingNumber);
    expect(res.body.data.currentStatus).toBe('pending');
    expect(Array.isArray(res.body.data.events)).toBe(true);
  });

  it('returns tracking events after dispatch (wrapper client)', async () => {
    const created = await apiClient.createShipment(makeShipmentPayload({ addressValidated: true }));
    const id = created.data.data.id;
    await apiClient.dispatchShipment(id);
    const res = await apiClient.getShipmentTracking(id);
    expect(res.status).toBe(200);
    expect(res.data.data.events.length).toBeGreaterThan(0);
    expect(res.data.data.currentStatus).toBe('dispatched');
  });

  it('returns 404 for unknown shipment', async () => {
    const res = await client.getShipmentTracking('SHP-NONE');
    expect(res.status).toBe(404);
  });
});
