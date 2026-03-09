/**
 * tests/tests-complete/security.test.js
 *
 * Security-focused test scenarios:
 * - Role-based access control enforcement
 * - Token validation
 * - Customer data isolation (IDOR prevention)
 * - Admin endpoint protection
 * - Rate limit headers presence
 */
const request = require('supertest');
const { getApp, TOKENS, SupertestClient } = require('../helpers/testClient');
const { resetStore, makeShipmentPayload, makeOrderPayload } = require('../helpers/fixtures');

const app = getApp();

beforeEach(() => {
  resetStore();
  // Reset rate limit windows between tests
  require('../../src/middleware/rateLimit').resetAll();
});

// ─── Role-based access control ─────────────────────────────────────────────

describe('RBAC — write endpoints require operator or higher', () => {
  const readonlyClient = new SupertestClient('readonly');

  it('readonly cannot POST /shipments (403)', async () => {
    const res = await readonlyClient.createShipment(makeShipmentPayload());
    expect(res.status).toBe(403);
  });

  it('readonly cannot POST /orders (403)', async () => {
    const res = await readonlyClient.createOrder(makeOrderPayload());
    expect(res.status).toBe(403);
  });

  it('readonly cannot POST /tracking/events (403)', async () => {
    const res = await readonlyClient.createTrackingEvent({
      trackingNumber: 'TRK-TEST',
      status: 'in_transit',
    });
    expect(res.status).toBe(403);
  });

  it('readonly CAN GET /shipments (200)', async () => {
    const res = await readonlyClient.listShipments();
    expect(res.status).toBe(200);
  });

  it('readonly CAN GET /carriers (200)', async () => {
    const res = await readonlyClient.listCarriers();
    expect(res.status).toBe(200);
  });
});

describe('RBAC — admin endpoints require admin role', () => {
  const opsClient = new SupertestClient('operator');
  const adminClient = new SupertestClient('admin');

  it('operator cannot GET /admin/health (403)', async () => {
    const res = await opsClient.getHealth();
    expect(res.status).toBe(403);
  });

  it('operator cannot GET /admin/metrics (403)', async () => {
    const res = await opsClient.getMetrics();
    expect(res.status).toBe(403);
  });

  it('operator cannot GET /admin/audit (403)', async () => {
    const res = await opsClient.getAuditLog();
    expect(res.status).toBe(403);
  });

  it('admin CAN access all admin endpoints', async () => {
    expect((await adminClient.getHealth()).status).toBe(200);
    expect((await adminClient.getMetrics()).status).toBe(200);
    expect((await adminClient.getAuditLog()).status).toBe(200);
  });
});

describe('Customer data isolation (IDOR prevention)', () => {
  it('customer-1 cannot read customer-2 record', async () => {
    const cust1Client = new SupertestClient('customer1');
    const res = await cust1Client.getCustomer('CUST-002');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('customer-1 cannot update customer-2 record', async () => {
    const cust1Client = new SupertestClient('customer1');
    const res = await cust1Client.updateCustomer('CUST-002', { name: 'Attack' });
    expect(res.status).toBe(403);
  });

  it('customer-1 CAN read own record', async () => {
    const cust1Client = new SupertestClient('customer1');
    const res = await cust1Client.getCustomer('CUST-001');
    expect(res.status).toBe(200);
  });
});

describe('Token validation', () => {
  it('rejects expired/invalid token', async () => {
    const res = await request(app)
      .get('/shipments')
      .set({ Authorization: 'Bearer totally-invalid-token-xyz' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('rejects missing token', async () => {
    const res = await request(app).get('/shipments');
    expect(res.status).toBe(401);
  });

  it('rejects Basic auth instead of Bearer', async () => {
    const encoded = Buffer.from('admin:password').toString('base64');
    const res = await request(app)
      .get('/shipments')
      .set({ Authorization: `Basic ${encoded}` });
    expect(res.status).toBe(401);
  });
});

describe('Rate limit headers', () => {
  it('includes X-RateLimit-Limit header on success', async () => {
    const res = await request(app)
      .get('/carriers')
      .set({ Authorization: `Bearer ${TOKENS.operator}` });
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
  });

  it('remaining decrements on subsequent requests', async () => {
    const auth = { Authorization: `Bearer ${TOKENS.operator}` };
    const res1 = await request(app).get('/carriers').set(auth);
    const res2 = await request(app).get('/carriers').set(auth);
    const remaining1 = parseInt(res1.headers['x-ratelimit-remaining'], 10);
    const remaining2 = parseInt(res2.headers['x-ratelimit-remaining'], 10);
    expect(remaining2).toBeLessThan(remaining1);
  });
});

describe('Sensitive data not exposed in errors', () => {
  it('404 error does not leak internal stack traces', async () => {
    const res = await request(app)
      .get('/shipments/SHP-NONE')
      .set({ Authorization: `Bearer ${TOKENS.operator}` });
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('at Object.');
    expect(JSON.stringify(res.body)).not.toContain('node_modules');
  });
});
