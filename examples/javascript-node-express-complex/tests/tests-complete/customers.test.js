/**
 * tests/tests-complete/customers.test.js
 * COMPLETE COVERAGE — customer read and update with role-based access control.
 */
const request = require('supertest');
const { LogisticsApiClient } = require('../../src/helpers/apiClient');
const { SupertestClient, getApp, TOKENS } = require('../helpers/testClient');
const { resetStore } = require('../helpers/fixtures');

const app = getApp();
const client = new SupertestClient('operator');

let server;
let apiClient;
let customerApiClient;

beforeAll((done) => {
  server = app.listen(0, () => {
    const { port } = server.address();
    apiClient = new LogisticsApiClient(`http://localhost:${port}`, TOKENS.operator);
    customerApiClient = new LogisticsApiClient(`http://localhost:${port}`, TOKENS.customer1);
    done();
  });
});

afterAll((done) => server.close(done));
beforeEach(() => resetStore());

// ─── GET /customers/:id ────────────────────────────────────────────────────

describe('GET /customers/:id', () => {
  it('operator can read any customer (direct URL)', async () => {
    const res = await request(app)
      .get('/customers/CUST-001')
      .set({ Authorization: `Bearer ${TOKENS.operator}` });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Acme Corporation');
  });

  it('customer can read own record via wrapper client', async () => {
    const res = await customerApiClient.getCustomer('CUST-001');
    expect(res.status).toBe(200);
    expect(res.data.data.id).toBe('CUST-001');
  });

  it('customer is forbidden from reading another customer record', async () => {
    const cust2Client = new SupertestClient('customer2');
    const res = await cust2Client.getCustomer('CUST-001'); // CUST-002 token trying to read CUST-001
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown customer', async () => {
    const res = await client.getCustomer('CUST-NONE');
    expect(res.status).toBe(404);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/customers/CUST-001');
    expect(res.status).toBe(401);
  });
});

// ─── PUT /customers/:id ────────────────────────────────────────────────────

describe('PUT /customers/:id', () => {
  it('operator can update customer (direct URL)', async () => {
    const res = await request(app)
      .put('/customers/CUST-001')
      .set({ Authorization: `Bearer ${TOKENS.operator}` })
      .send({ name: 'Acme Corp Updated', phone: '+1-555-9999' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Acme Corp Updated');
    expect(res.body.data.phone).toBe('+1-555-9999');
  });

  it('customer can update own record via wrapper client', async () => {
    const res = await customerApiClient.updateCustomer('CUST-001', {
      email: 'newemail@acme.com',
    });
    expect(res.status).toBe(200);
    expect(res.data.data.email).toBe('newemail@acme.com');
  });

  it('customer is forbidden from updating another record', async () => {
    const cust1Client = new SupertestClient('customer1');
    const res = await cust1Client.updateCustomer('CUST-002', { name: 'Hacked' });
    expect(res.status).toBe(403);
  });

  it('returns 422 when no updatable fields provided', async () => {
    const res = await client.updateCustomer('CUST-001', {});
    expect(res.status).toBe(422);
  });

  it('ignores non-updatable fields', async () => {
    const res = await client.updateCustomer('CUST-001', {
      name: 'New Name',
      tier: 'free', // not in allowed update fields
    });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New Name');
    expect(res.body.data.tier).toBe('enterprise'); // unchanged
  });

  it('returns 404 for unknown customer', async () => {
    const res = await client.updateCustomer('CUST-NONE', { name: 'X' });
    expect(res.status).toBe(404);
  });
});
