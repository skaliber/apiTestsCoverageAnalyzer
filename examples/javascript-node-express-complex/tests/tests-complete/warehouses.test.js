/**
 * tests/tests-complete/warehouses.test.js
 * COMPLETE COVERAGE — all warehouse endpoints including capacity enforcement.
 */
const request = require('supertest');
const { LogisticsApiClient } = require('../../src/helpers/apiClient');
const { SupertestClient, getApp, TOKENS } = require('../helpers/testClient');
const { resetStore } = require('../helpers/fixtures');

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

// ─── GET /warehouses ───────────────────────────────────────────────────────

describe('GET /warehouses', () => {
  it('returns all warehouses (direct URL)', async () => {
    const res = await request(app)
      .get('/warehouses')
      .set({ Authorization: `Bearer ${TOKENS.operator}` });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
  });

  it('returns warehouses via wrapper client', async () => {
    const res = await apiClient.listWarehouses();
    expect(res.status).toBe(200);
    expect(res.data.data.length).toBe(3);
  });

  it('filters by active=true', async () => {
    const res = await client.listWarehouses('?active=true');
    expect(res.body.data.every((w) => w.active === true)).toBe(true);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/warehouses');
    expect(res.status).toBe(401);
  });
});

// ─── GET /warehouses/:id ───────────────────────────────────────────────────

describe('GET /warehouses/:id', () => {
  it('returns warehouse with utilization (direct URL)', async () => {
    const res = await client.getWarehouse('WH-001');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('WH-001');
    expect(res.body.data.utilizationPct).toBeDefined();
  });

  it('returns warehouse via wrapper client', async () => {
    const res = await apiClient.getWarehouse('WH-002');
    expect(res.status).toBe(200);
    expect(res.data.data.capacity).toBe(15000);
  });

  it('returns 404 for unknown warehouse', async () => {
    const res = await client.getWarehouse('WH-NONE');
    expect(res.status).toBe(404);
  });
});

// ─── POST /warehouses/:id/inventory ───────────────────────────────────────

describe('POST /warehouses/:id/inventory', () => {
  it('adds inventory (direct URL)', async () => {
    const res = await request(app)
      .post('/warehouses/WH-001/inventory')
      .set({ Authorization: `Bearer ${TOKENS.operator}` })
      .send({ items: [{ sku: 'WIDGET-A', units: 100 }], operation: 'add' });
    expect(res.status).toBe(200);
    expect(res.body.data.inventory['WIDGET-A']).toBe(100);
  });

  it('adds inventory via wrapper client', async () => {
    const res = await apiClient.updateWarehouseInventory('WH-001', {
      items: [{ sku: 'GADGET-B', units: 50 }],
      operation: 'add',
    });
    expect(res.status).toBe(200);
    expect(res.data.data.inventory['GADGET-B']).toBe(50);
  });

  it('removes inventory', async () => {
    // First add
    await client.updateWarehouseInventory('WH-001', {
      items: [{ sku: 'WIDGET-A', units: 200 }],
      operation: 'add',
    });
    // Then remove
    const res = await client.updateWarehouseInventory('WH-001', {
      items: [{ sku: 'WIDGET-A', units: 50 }],
      operation: 'remove',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.inventory['WIDGET-A']).toBe(150);
  });

  it('sets inventory with operation=set', async () => {
    const res = await client.updateWarehouseInventory('WH-001', {
      items: [{ sku: 'WIDGET-A', units: 500 }],
      operation: 'set',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.inventory['WIDGET-A']).toBe(500);
  });

  it('returns 409 when adding exceeds capacity (warehouse-capacity-check)', async () => {
    // WH-003 is nearly full: 7950/8000
    const res = await client.updateWarehouseInventory('WH-003', {
      items: [{ sku: 'BIG-ITEM', units: 100 }], // 7950 + 100 = 8050 > 8000
      operation: 'add',
    });
    expect(res.status).toBe(409);
    expect(res.body.rule).toBe('warehouse-capacity-check');
  });

  it('returns 422 for invalid operation', async () => {
    const res = await client.updateWarehouseInventory('WH-001', {
      items: [{ sku: 'X', units: 1 }],
      operation: 'invalid',
    });
    expect(res.status).toBe(422);
  });

  it('returns 404 for unknown warehouse', async () => {
    const res = await client.updateWarehouseInventory('WH-NONE', {
      items: [{ sku: 'X', units: 1 }],
      operation: 'add',
    });
    expect(res.status).toBe(404);
  });
});
