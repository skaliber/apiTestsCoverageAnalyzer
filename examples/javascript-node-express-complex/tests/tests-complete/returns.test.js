/**
 * tests/tests-complete/returns.test.js
 * COMPLETE COVERAGE — all return endpoints including 30-day window enforcement.
 */
const request = require('supertest');
const { LogisticsApiClient } = require('../../src/helpers/apiClient');
const { SupertestClient, getApp, TOKENS } = require('../helpers/testClient');
const { resetStore, makeReturnPayload, seedDeliveredShipment } = require('../helpers/fixtures');

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

// ─── POST /returns ─────────────────────────────────────────────────────────

describe('POST /returns', () => {
  it('creates return for delivered shipment (direct URL)', async () => {
    const shipment = seedDeliveredShipment();
    const res = await request(app)
      .post('/returns')
      .set({ Authorization: `Bearer ${TOKENS.operator}` })
      .send(makeReturnPayload(shipment.id));
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('requested');
    expect(res.body.data.shipmentId).toBe(shipment.id);
  });

  it('creates return via wrapper client', async () => {
    const shipment = seedDeliveredShipment();
    const res = await apiClient.createReturn(makeReturnPayload(shipment.id));
    expect(res.status).toBe(201);
    expect(res.data.data.id).toMatch(/^RET-/);
  });

  it('returns 404 when shipment not found', async () => {
    const res = await client.createReturn(makeReturnPayload('SHP-NONE'));
    expect(res.status).toBe(404);
  });

  it('returns 409 when shipment not delivered', async () => {
    // Create a pending shipment
    const { store, makeShipment } = require('../../src/models/schemas');
    const s = makeShipment({ id: 'SHP-PENDING', carrierId: 'CAR-001', warehouseId: 'WH-001', weightKg: 5, origin: {}, destination: {}, status: 'pending', trackingNumber: 'TRK-XYZ' });
    store.shipments.set(s.id, s);

    const res = await client.createReturn(makeReturnPayload('SHP-PENDING'));
    expect(res.status).toBe(409);
  });

  it('returns 422 when return window expired (return-window-30-days)', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 45); // 45 days ago
    const shipment = seedDeliveredShipment({ deliveredAt: oldDate.toISOString() });
    const res = await client.createReturn(makeReturnPayload(shipment.id));
    expect(res.status).toBe(422);
    expect(res.body.rule).toBe('return-window-30-days');
  });

  it('returns 422 when required fields missing', async () => {
    const res = await client.createReturn({ shipmentId: 'SHP-X' });
    expect(res.status).toBe(422);
  });

  it('returns 401 without auth', async () => {
    const shipment = seedDeliveredShipment();
    const res = await request(app).post('/returns').send(makeReturnPayload(shipment.id));
    expect(res.status).toBe(401);
  });
});

// ─── GET /returns/:id ──────────────────────────────────────────────────────

describe('GET /returns/:id', () => {
  it('returns a return record (direct URL)', async () => {
    const shipment = seedDeliveredShipment();
    const create = await client.createReturn(makeReturnPayload(shipment.id));
    const id = create.body.data.id;

    const res = await client.getReturn(id);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(id);
  });

  it('returns record via wrapper client', async () => {
    const shipment = seedDeliveredShipment();
    const create = await apiClient.createReturn(makeReturnPayload(shipment.id));
    const id = create.data.data.id;

    const res = await apiClient.getReturn(id);
    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe('requested');
  });

  it('returns 404 for unknown return', async () => {
    const res = await client.getReturn('RET-NONE');
    expect(res.status).toBe(404);
  });
});

// ─── PUT /returns/:id/approve ──────────────────────────────────────────────

describe('PUT /returns/:id/approve', () => {
  async function createReturn() {
    const shipment = seedDeliveredShipment();
    const res = await client.createReturn(makeReturnPayload(shipment.id));
    return res.body.data.id;
  }

  it('approves a return request (direct URL)', async () => {
    const id = await createReturn();
    const res = await request(app)
      .put(`/returns/${id}/approve`)
      .set({ Authorization: `Bearer ${TOKENS.operator}` })
      .send({ approved: true });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    expect(res.body.data.approvedAt).toBeTruthy();
  });

  it('rejects a return request (direct URL)', async () => {
    const id = await createReturn();
    const res = await client.approveReturn(id, { approved: false, rejectionReason: 'Outside policy' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('rejected');
    expect(res.body.data.rejectionReason).toBe('Outside policy');
  });

  it('approves via wrapper client', async () => {
    const id = await createReturn();
    const res = await apiClient.approveReturn(id, { approved: true });
    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe('approved');
  });

  it('returns 409 when return already approved', async () => {
    const id = await createReturn();
    await client.approveReturn(id, { approved: true });
    const res = await client.approveReturn(id, { approved: true });
    expect(res.status).toBe(409);
  });

  it('returns 404 for unknown return', async () => {
    const res = await client.approveReturn('RET-NONE', { approved: true });
    expect(res.status).toBe(404);
  });
});
