/**
 * tests/helpers/testClient.js
 * Supertest-based test client that wraps the Express app.
 * Provides convenience methods mirroring LogisticsApiClient but using
 * supertest directly (no running server required).
 *
 * Purpose: used in tests-complete/ to exercise endpoints via supertest,
 * demonstrating direct URL usage alongside the wrapper client.
 */
const request = require('supertest');
const { createApp } = require('../../src/app');

// Shared app instance — recreated fresh for each test file via resetStore()
let app;

function getApp() {
  if (!app) app = createApp();
  return app;
}

/**
 * Token shortcuts matching auth.js VALID_TOKENS
 */
const TOKENS = {
  admin:    'token-admin-001',
  operator: 'token-ops-001',
  customer1:'token-cust-001',
  customer2:'token-cust-002',
  readonly: 'token-readonly',
};

function authHeader(role = 'operator') {
  return { Authorization: `Bearer ${TOKENS[role]}` };
}

/**
 * Thin supertest wrapper. Every method returns a supertest Test chain
 * so callers can chain .expect() assertions directly.
 */
class SupertestClient {
  constructor(role = 'operator') {
    this.role = role;
  }

  _req(method, path) {
    return request(getApp())[method](path).set(authHeader(this.role));
  }

  // ── Shipments ──────────────────────────────────────────────────────────
  createShipment(body)         { return this._req('post', '/shipments').send(body); }
  listShipments(qs = '')       { return this._req('get', `/shipments${qs}`); }
  getShipment(id)              { return this._req('get', `/shipments/${id}`); }
  updateShipment(id, body)     { return this._req('put', `/shipments/${id}`).send(body); }
  deleteShipment(id)           { return this._req('delete', `/shipments/${id}`); }
  dispatchShipment(id, body={})  { return this._req('post', `/shipments/${id}/dispatch`).send(body); }
  deliverShipment(id)          { return this._req('post', `/shipments/${id}/deliver`); }
  cancelShipment(id, body={})  { return this._req('post', `/shipments/${id}/cancel`).send(body); }
  getShipmentTracking(id)      { return this._req('get', `/shipments/${id}/tracking`); }

  // ── Orders ─────────────────────────────────────────────────────────────
  createOrder(body)            { return this._req('post', '/orders').send(body); }
  listOrders(qs = '')          { return this._req('get', `/orders${qs}`); }
  getOrder(id)                 { return this._req('get', `/orders/${id}`); }
  updateOrderStatus(id, body)  { return this._req('put', `/orders/${id}/status`).send(body); }
  deleteOrder(id)              { return this._req('delete', `/orders/${id}`); }

  // ── Warehouses ─────────────────────────────────────────────────────────
  listWarehouses(qs = '')              { return this._req('get', `/warehouses${qs}`); }
  getWarehouse(id)                     { return this._req('get', `/warehouses/${id}`); }
  updateWarehouseInventory(id, body)   { return this._req('post', `/warehouses/${id}/inventory`).send(body); }

  // ── Carriers ───────────────────────────────────────────────────────────
  listCarriers(qs = '')        { return this._req('get', `/carriers${qs}`); }
  getCarrier(id)               { return this._req('get', `/carriers/${id}`); }
  getCarrierRates(id, qs = '') { return this._req('get', `/carriers/${id}/rates${qs}`); }

  // ── Returns ────────────────────────────────────────────────────────────
  createReturn(body)           { return this._req('post', '/returns').send(body); }
  getReturn(id)                { return this._req('get', `/returns/${id}`); }
  approveReturn(id, body)      { return this._req('put', `/returns/${id}/approve`).send(body); }

  // ── Tracking ───────────────────────────────────────────────────────────
  createTrackingEvent(body)            { return this._req('post', '/tracking/events').send(body); }
  getTrackingHistory(trackingNumber)   { return this._req('get', `/tracking/history/${trackingNumber}`); }

  // ── Customers ──────────────────────────────────────────────────────────
  getCustomer(id)              { return this._req('get', `/customers/${id}`); }
  updateCustomer(id, body)     { return this._req('put', `/customers/${id}`).send(body); }

  // ── Admin ──────────────────────────────────────────────────────────────
  getHealth()                  { return this._req('get', '/admin/health'); }
  getMetrics()                 { return this._req('get', '/admin/metrics'); }
  getAuditLog(qs = '')         { return this._req('get', `/admin/audit${qs}`); }
}

module.exports = { getApp, SupertestClient, TOKENS, authHeader };
