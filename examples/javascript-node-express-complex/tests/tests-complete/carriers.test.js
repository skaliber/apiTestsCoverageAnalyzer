/**
 * tests/tests-complete/carriers.test.js
 * COMPLETE COVERAGE — all carrier endpoints including rate calculation.
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

// ─── GET /carriers ─────────────────────────────────────────────────────────

describe('GET /carriers', () => {
  it('returns all carriers (direct URL)', async () => {
    const res = await request(app)
      .get('/carriers')
      .set({ Authorization: `Bearer ${TOKENS.operator}` });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(4);
  });

  it('returns carriers via wrapper client', async () => {
    const res = await apiClient.listCarriers();
    expect(res.status).toBe(200);
    expect(res.data.total).toBe(4);
  });

  it('filters active carriers only', async () => {
    const res = await client.listCarriers('?active=true');
    expect(res.status).toBe(200);
    expect(res.body.data.every((c) => c.active === true)).toBe(true);
    expect(res.body.data.length).toBe(3); // CAR-004 is inactive
  });

  it('filters inactive carriers', async () => {
    const res = await client.listCarriers('?active=false');
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].id).toBe('CAR-004');
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/carriers');
    expect(res.status).toBe(401);
  });
});

// ─── GET /carriers/:id ─────────────────────────────────────────────────────

describe('GET /carriers/:id', () => {
  it('returns carrier by id (direct URL)', async () => {
    const res = await client.getCarrier('CAR-001');
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('FastFreight Express');
    expect(res.body.data.hazmatCertified).toBe(true);
  });

  it('returns carrier via wrapper client', async () => {
    const res = await apiClient.getCarrier('CAR-003');
    expect(res.status).toBe(200);
    expect(res.data.data.code).toBe('ACP');
  });

  it('returns inactive carrier details', async () => {
    const res = await client.getCarrier('CAR-004');
    expect(res.status).toBe(200);
    expect(res.body.data.active).toBe(false);
  });

  it('returns 404 for unknown carrier', async () => {
    const res = await client.getCarrier('CAR-NONE');
    expect(res.status).toBe(404);
  });
});

// ─── GET /carriers/:id/rates ───────────────────────────────────────────────

describe('GET /carriers/:id/rates', () => {
  it('returns rates for all services (direct URL)', async () => {
    const res = await request(app)
      .get('/carriers/CAR-001/rates?weightKg=10')
      .set({ Authorization: `Bearer ${TOKENS.operator}` });
    expect(res.status).toBe(200);
    expect(res.body.data.rates.length).toBe(3); // ground, air, overnight
    expect(res.body.data.rates[0]).toMatchObject({
      service: expect.any(String),
      total: expect.any(Number),
      currency: 'USD',
    });
  });

  it('returns rates via wrapper client', async () => {
    const res = await apiClient.getCarrierRates('CAR-001', { weightKg: 5, service: 'ground' });
    expect(res.status).toBe(200);
    expect(res.data.data.rates[0].service).toBe('ground');
  });

  it('filters by service type', async () => {
    const res = await client.getCarrierRates('CAR-001', '?weightKg=10&service=air');
    expect(res.status).toBe(200);
    expect(res.body.data.rates.length).toBe(1);
    expect(res.body.data.rates[0].service).toBe('air');
  });

  it('returns 422 when requesting unavailable service', async () => {
    const res = await client.getCarrierRates('CAR-002', '?weightKg=10&service=air');
    // CAR-002 only does ground
    expect(res.status).toBe(422);
  });

  it('returns 404 for unknown carrier', async () => {
    const res = await client.getCarrierRates('CAR-NONE', '?weightKg=10');
    expect(res.status).toBe(404);
  });

  it('includes fuel surcharge in total', async () => {
    const res = await client.getCarrierRates('CAR-001', '?weightKg=100&service=ground');
    const rate = res.body.data.rates[0];
    expect(rate.total).toBeCloseTo(rate.baseRate + rate.fuelSurcharge, 1);
  });
});
