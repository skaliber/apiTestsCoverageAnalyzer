/**
 * API Client wrapper for the Logistics & Shipment Tracking Platform.
 * Uses centralized ROUTES constants for all endpoint URLs, enabling
 * indirect endpoint resolution in coverage analysis tools.
 *
 * Tests that use this client exercise the same endpoints as direct
 * supertest calls but via an abstraction layer.
 */
const axios = require('axios');
const ROUTES = require('./routes');

/**
 * Replaces a named path parameter in a route template.
 * @param {string} route - Route template (e.g. '/shipments/:id')
 * @param {string} param - Parameter name without colon (e.g. 'id')
 * @param {string|number} value - Value to substitute
 * @returns {string}
 */
function replaceParam(route, param, value) {
  return route.replace(`:${param}`, encodeURIComponent(value));
}

class LogisticsApiClient {
  /**
   * @param {string} baseUrl - Base URL of the API (e.g. 'http://localhost:3000')
   * @param {string} [token] - Bearer token for Authorization header
   */
  constructor(baseUrl, token) {
    this.client = axios.create({
      baseURL: baseUrl,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      validateStatus: () => true, // never throw on HTTP errors — let tests assert
    });
  }

  // ─── Shipments ────────────────────────────────────────────────────────────

  createShipment(data) {
    return this.client.post(ROUTES.SHIPMENTS, data);
  }

  listShipments(params) {
    return this.client.get(ROUTES.SHIPMENTS, { params });
  }

  getShipment(id) {
    return this.client.get(replaceParam(ROUTES.SHIPMENT, 'id', id));
  }

  updateShipment(id, data) {
    return this.client.put(replaceParam(ROUTES.SHIPMENT, 'id', id), data);
  }

  deleteShipment(id) {
    return this.client.delete(replaceParam(ROUTES.SHIPMENT, 'id', id));
  }

  dispatchShipment(id, data) {
    return this.client.post(replaceParam(ROUTES.SHIPMENT_DISPATCH, 'id', id), data);
  }

  deliverShipment(id, data) {
    return this.client.post(replaceParam(ROUTES.SHIPMENT_DELIVER, 'id', id), data);
  }

  cancelShipment(id, data) {
    return this.client.post(replaceParam(ROUTES.SHIPMENT_CANCEL, 'id', id), data);
  }

  getShipmentTracking(id) {
    return this.client.get(replaceParam(ROUTES.SHIPMENT_TRACKING, 'id', id));
  }

  // ─── Orders ───────────────────────────────────────────────────────────────

  createOrder(data) {
    return this.client.post(ROUTES.ORDERS, data);
  }

  listOrders(params) {
    return this.client.get(ROUTES.ORDERS, { params });
  }

  getOrder(id) {
    return this.client.get(replaceParam(ROUTES.ORDER, 'id', id));
  }

  updateOrderStatus(id, data) {
    return this.client.put(replaceParam(ROUTES.ORDER_STATUS, 'id', id), data);
  }

  deleteOrder(id) {
    return this.client.delete(replaceParam(ROUTES.ORDER, 'id', id));
  }

  // ─── Warehouses ───────────────────────────────────────────────────────────

  listWarehouses(params) {
    return this.client.get(ROUTES.WAREHOUSES, { params });
  }

  getWarehouse(id) {
    return this.client.get(replaceParam(ROUTES.WAREHOUSE, 'id', id));
  }

  updateWarehouseInventory(id, data) {
    return this.client.post(replaceParam(ROUTES.WAREHOUSE_INVENTORY, 'id', id), data);
  }

  // ─── Carriers ─────────────────────────────────────────────────────────────

  listCarriers(params) {
    return this.client.get(ROUTES.CARRIERS, { params });
  }

  getCarrier(id) {
    return this.client.get(replaceParam(ROUTES.CARRIER, 'id', id));
  }

  getCarrierRates(id, params) {
    return this.client.get(replaceParam(ROUTES.CARRIER_RATES, 'id', id), { params });
  }

  // ─── Returns ──────────────────────────────────────────────────────────────

  createReturn(data) {
    return this.client.post(ROUTES.RETURNS, data);
  }

  getReturn(id) {
    return this.client.get(replaceParam(ROUTES.RETURN, 'id', id));
  }

  approveReturn(id, data) {
    return this.client.put(replaceParam(ROUTES.RETURN_APPROVE, 'id', id), data);
  }

  // ─── Tracking ─────────────────────────────────────────────────────────────

  createTrackingEvent(data) {
    return this.client.post(ROUTES.TRACKING_EVENTS, data);
  }

  getTrackingHistory(trackingNumber) {
    return this.client.get(
      replaceParam(ROUTES.TRACKING_HISTORY, 'trackingNumber', trackingNumber)
    );
  }

  // ─── Customers ────────────────────────────────────────────────────────────

  getCustomer(id) {
    return this.client.get(replaceParam(ROUTES.CUSTOMER, 'id', id));
  }

  updateCustomer(id, data) {
    return this.client.put(replaceParam(ROUTES.CUSTOMER, 'id', id), data);
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  getHealth() {
    return this.client.get(ROUTES.ADMIN_HEALTH);
  }

  getMetrics() {
    return this.client.get(ROUTES.ADMIN_METRICS);
  }

  getAuditLog(params) {
    return this.client.get(ROUTES.ADMIN_AUDIT, { params });
  }
}

module.exports = { LogisticsApiClient, replaceParam };
