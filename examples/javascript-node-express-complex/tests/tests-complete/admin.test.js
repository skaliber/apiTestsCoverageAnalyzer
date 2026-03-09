/**
 * tests/tests-complete/admin.test.js
 * COMPLETE COVERAGE — health, metrics, and audit log endpoints.
 */
const request = require('supertest');
const { LogisticsApiClient } = require('../../src/helpers/apiClient');
const { SupertestClient, getApp, TOKENS } = require('../helpers/testClient');
const { resetStore, makeShipmentPayload, makeOrderPayload } = require('../helpers/fixtures');

const app = getApp();
const adminClient = new SupertestClient('admin');
const opsClient   = new SupertestClient('operator');

let server;
let adminApiClient;

beforeAll((done) => {
  server = app.listen(0, () => {
    const { port } = server.address();
    adminApiClient = new LogisticsApiClient(`http://localhost:${port}`, TOKENS.admin);
    done();
  });
});

afterAll((done) => server.close(done));
beforeEach(() => resetStore());

// ─── GET /admin/health ─────────────────────────────────────────────────────

describe('GET /admin/health', () => {
  it('returns health status (direct URL)', async () => {
    const res = await request(app)
      .get('/admin/health')
      .set({ Authorization: `Bearer ${TOKENS.admin}` });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    expect(res.body.node).toMatch(/^v/);
  });

  it('returns health via wrapper client', async () => {
    const res = await adminApiClient.getHealth();
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('ok');
  });

  it('returns 403 for operator role', async () => {
    const res = await opsClient.getHealth();
    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/admin/health');
    expect(res.status).toBe(401);
  });
});

// ─── GET /admin/metrics ────────────────────────────────────────────────────

describe('GET /admin/metrics', () => {
  it('returns metrics with empty store (direct URL)', async () => {
    const res = await adminClient.getMetrics();
    expect(res.status).toBe(200);
    expect(res.body.data.shipments.total).toBe(0);
    expect(res.body.data.carriers.total).toBe(4);
    expect(res.body.data.warehouses.total).toBe(3);
  });

  it('reflects created resources in metrics', async () => {
    await opsClient.createShipment(makeShipmentPayload());
    await opsClient.createOrder(makeOrderPayload());

    const res = await adminClient.getMetrics();
    expect(res.status).toBe(200);
    expect(res.body.data.shipments.total).toBe(1);
    expect(res.body.data.orders.total).toBe(1);
  });

  it('returns metrics via wrapper client', async () => {
    const res = await adminApiClient.getMetrics();
    expect(res.status).toBe(200);
    expect(res.data.data.system.cpus).toBeGreaterThan(0);
  });

  it('returns 403 for non-admin', async () => {
    const res = await opsClient.getMetrics();
    expect(res.status).toBe(403);
  });

  it('includes byStatus breakdown', async () => {
    await opsClient.createShipment(makeShipmentPayload());
    await opsClient.createShipment(makeShipmentPayload());
    const res = await adminClient.getMetrics();
    expect(res.body.data.shipments.byStatus.pending).toBe(2);
  });
});

// ─── GET /admin/audit ──────────────────────────────────────────────────────

describe('GET /admin/audit', () => {
  it('returns audit log entries (direct URL)', async () => {
    await opsClient.createShipment(makeShipmentPayload());
    await opsClient.createOrder(makeOrderPayload());

    const res = await request(app)
      .get('/admin/audit')
      .set({ Authorization: `Bearer ${TOKENS.admin}` });
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.data[0]).toMatchObject({
      action: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('returns audit log via wrapper client', async () => {
    await opsClient.createShipment(makeShipmentPayload());
    const res = await adminApiClient.getAuditLog();
    expect(res.status).toBe(200);
    expect(res.data.data.length).toBeGreaterThan(0);
  });

  it('filters audit log by action', async () => {
    await opsClient.createShipment(makeShipmentPayload());
    await opsClient.createOrder(makeOrderPayload());

    const res = await adminClient.getAuditLog('?action=SHIPMENT_CREATED');
    expect(res.body.data.every((e) => e.action === 'SHIPMENT_CREATED')).toBe(true);
  });

  it('supports pagination of audit log', async () => {
    for (let i = 0; i < 5; i++) await opsClient.createShipment(makeShipmentPayload());
    const res = await adminClient.getAuditLog('?page=1&limit=3');
    expect(res.body.data.length).toBe(3);
    expect(res.body.page).toBe(1);
  });

  it('returns 403 for operator', async () => {
    const res = await opsClient.getAuditLog();
    expect(res.status).toBe(403);
  });

  it('returns most recent entries first', async () => {
    await opsClient.createShipment(makeShipmentPayload());
    await opsClient.createOrder(makeOrderPayload());
    const res = await adminClient.getAuditLog();
    const entries = res.body.data;
    if (entries.length >= 2) {
      expect(new Date(entries[0].timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(entries[1].timestamp).getTime()
      );
    }
  });
});
