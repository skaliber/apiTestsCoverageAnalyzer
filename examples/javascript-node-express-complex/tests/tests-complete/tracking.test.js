/**
 * tests/tests-complete/tracking.test.js
 * COMPLETE COVERAGE — real-time tracking event creation and history retrieval.
 */
const request = require('supertest');
const { LogisticsApiClient } = require('../../src/helpers/apiClient');
const { SupertestClient, getApp, TOKENS } = require('../helpers/testClient');
const { resetStore, makeTrackingEventPayload } = require('../helpers/fixtures');

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

const TRK_NUM = 'TRK-TEST-UNIQUE-001';

// ─── POST /tracking/events ─────────────────────────────────────────────────

describe('POST /tracking/events', () => {
  it('creates a tracking event (direct URL)', async () => {
    const res = await request(app)
      .post('/tracking/events')
      .set({ Authorization: `Bearer ${TOKENS.operator}` })
      .send(makeTrackingEventPayload(TRK_NUM));
    expect(res.status).toBe(201);
    expect(res.body.data.trackingNumber).toBe(TRK_NUM);
    expect(res.body.data.status).toBe('in_transit');
  });

  it('creates event via wrapper client', async () => {
    const res = await apiClient.createTrackingEvent(
      makeTrackingEventPayload('TRK-CLIENT-001')
    );
    expect(res.status).toBe(201);
    expect(res.data.data.id).toBeDefined();
  });

  it('creates multiple events for same tracking number', async () => {
    await client.createTrackingEvent(
      makeTrackingEventPayload(TRK_NUM, { status: 'picked_up', timestamp: '2024-01-01T10:00:00Z' })
    );
    const res = await client.createTrackingEvent(
      makeTrackingEventPayload(TRK_NUM, { status: 'in_transit', timestamp: '2024-01-02T10:00:00Z' })
    );
    expect(res.status).toBe(201);
  });

  it('returns 409 for duplicate event (duplicate-tracking-prevention)', async () => {
    const payload = makeTrackingEventPayload(TRK_NUM, {
      status: 'in_transit',
      timestamp: '2024-01-01T10:00:00Z',
    });
    await client.createTrackingEvent(payload);
    const res = await client.createTrackingEvent(payload); // exact duplicate
    expect(res.status).toBe(409);
    expect(res.body.rule).toBe('duplicate-tracking-prevention');
  });

  it('returns 422 when required fields missing', async () => {
    const res = await client.createTrackingEvent({ status: 'in_transit' }); // missing trackingNumber
    expect(res.status).toBe(422);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/tracking/events').send(makeTrackingEventPayload(TRK_NUM));
    expect(res.status).toBe(401);
  });

  it('returns 403 for readonly role', async () => {
    const readonlyClient = new SupertestClient('readonly');
    const res = await readonlyClient.createTrackingEvent(makeTrackingEventPayload(TRK_NUM));
    expect(res.status).toBe(403);
  });
});

// ─── GET /tracking/history/:trackingNumber ─────────────────────────────────

describe('GET /tracking/history/:trackingNumber', () => {
  it('returns tracking history (direct URL)', async () => {
    await client.createTrackingEvent(makeTrackingEventPayload(TRK_NUM, { status: 'picked_up', timestamp: '2024-01-01T09:00:00Z' }));
    await client.createTrackingEvent(makeTrackingEventPayload(TRK_NUM, { status: 'in_transit', timestamp: '2024-01-02T09:00:00Z' }));

    const res = await request(app)
      .get(`/tracking/history/${TRK_NUM}`)
      .set({ Authorization: `Bearer ${TOKENS.operator}` });
    expect(res.status).toBe(200);
    expect(res.body.data.trackingNumber).toBe(TRK_NUM);
    expect(res.body.data.events.length).toBe(2);
    expect(res.body.data.total).toBe(2);
  });

  it('returns history via wrapper client', async () => {
    await apiClient.createTrackingEvent(makeTrackingEventPayload('TRK-CLIENT-002'));
    const res = await apiClient.getTrackingHistory('TRK-CLIENT-002');
    expect(res.status).toBe(200);
    expect(res.data.data.events.length).toBe(1);
  });

  it('returns events in chronological order', async () => {
    await client.createTrackingEvent(makeTrackingEventPayload(TRK_NUM, { status: 'delivered', timestamp: '2024-01-03T12:00:00Z' }));
    await client.createTrackingEvent(makeTrackingEventPayload(TRK_NUM, { status: 'picked_up', timestamp: '2024-01-01T08:00:00Z' }));

    const res = await client.getTrackingHistory(TRK_NUM);
    const events = res.body.data.events;
    expect(new Date(events[0].timestamp).getTime()).toBeLessThan(new Date(events[1].timestamp).getTime());
  });

  it('returns 404 for unknown tracking number', async () => {
    const res = await client.getTrackingHistory('TRK-UNKNOWN-000');
    expect(res.status).toBe(404);
  });

  it('returns shipmentId when tracking number matches a shipment', async () => {
    // Seed a shipment with a known tracking number
    const { store, makeShipment } = require('../../src/models/schemas');
    const s = makeShipment({ id: 'SHP-TRK-TEST', trackingNumber: TRK_NUM, carrierId: 'CAR-001', warehouseId: 'WH-001', weightKg: 5, origin: {}, destination: {} });
    store.shipments.set(s.id, s);
    store.trackingEvents.set(TRK_NUM, []);

    await client.createTrackingEvent(makeTrackingEventPayload(TRK_NUM));
    const res = await client.getTrackingHistory(TRK_NUM);
    expect(res.body.data.shipmentId).toBe('SHP-TRK-TEST');
  });
});
