/**
 * pathBuilder.js
 * Utility for constructing parameterized URL paths from route templates.
 * Used by both the API client and route handlers to maintain URL consistency.
 */
const ROUTES = require('./routes');

/**
 * Fills all named parameters in a route template.
 * @param {string} template - Route template with :param placeholders
 * @param {Object} params - Key/value map of parameter names to values
 * @returns {string} Fully resolved path
 *
 * @example
 *   buildPath(ROUTES.SHIPMENT, { id: 'SHP-001' })
 *   // => '/shipments/SHP-001'
 *
 *   buildPath(ROUTES.CARRIER_RATES, { id: 'CAR-42' })
 *   // => '/carriers/CAR-42/rates'
 */
function buildPath(template, params = {}) {
  return Object.entries(params).reduce((path, [key, value]) => {
    return path.replace(`:${key}`, encodeURIComponent(value));
  }, template);
}

/**
 * Appends a query string to a path.
 * @param {string} path - Base path
 * @param {Object} query - Query parameter key/value pairs
 * @returns {string}
 */
function buildUrl(path, query = {}) {
  const entries = Object.entries(query).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return path;
  const qs = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return `${path}?${qs}`;
}

/**
 * Pre-built path helpers for each resource — use these in tests and services
 * to avoid raw string manipulation.
 */
const paths = {
  shipment: (id) => buildPath(ROUTES.SHIPMENT, { id }),
  shipmentDispatch: (id) => buildPath(ROUTES.SHIPMENT_DISPATCH, { id }),
  shipmentDeliver: (id) => buildPath(ROUTES.SHIPMENT_DELIVER, { id }),
  shipmentCancel: (id) => buildPath(ROUTES.SHIPMENT_CANCEL, { id }),
  shipmentTracking: (id) => buildPath(ROUTES.SHIPMENT_TRACKING, { id }),
  order: (id) => buildPath(ROUTES.ORDER, { id }),
  orderStatus: (id) => buildPath(ROUTES.ORDER_STATUS, { id }),
  warehouse: (id) => buildPath(ROUTES.WAREHOUSE, { id }),
  warehouseInventory: (id) => buildPath(ROUTES.WAREHOUSE_INVENTORY, { id }),
  carrier: (id) => buildPath(ROUTES.CARRIER, { id }),
  carrierRates: (id) => buildPath(ROUTES.CARRIER_RATES, { id }),
  return: (id) => buildPath(ROUTES.RETURN, { id }),
  returnApprove: (id) => buildPath(ROUTES.RETURN_APPROVE, { id }),
  trackingHistory: (trackingNumber) =>
    buildPath(ROUTES.TRACKING_HISTORY, { trackingNumber }),
  customer: (id) => buildPath(ROUTES.CUSTOMER, { id }),
};

module.exports = { buildPath, buildUrl, paths, ROUTES };
