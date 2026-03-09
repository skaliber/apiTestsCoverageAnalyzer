/**
 * Centralized route constants for the Logistics & Shipment Tracking Platform.
 * These constants are used by both the Express router registrations and the
 * API client wrapper, enabling indirect endpoint resolution during coverage analysis.
 */
const ROUTES = {
  // Shipment endpoints
  SHIPMENTS: '/shipments',
  SHIPMENT: '/shipments/:id',
  SHIPMENT_DISPATCH: '/shipments/:id/dispatch',
  SHIPMENT_DELIVER: '/shipments/:id/deliver',
  SHIPMENT_CANCEL: '/shipments/:id/cancel',
  SHIPMENT_TRACKING: '/shipments/:id/tracking',

  // Order endpoints
  ORDERS: '/orders',
  ORDER: '/orders/:id',
  ORDER_STATUS: '/orders/:id/status',

  // Warehouse endpoints
  WAREHOUSES: '/warehouses',
  WAREHOUSE: '/warehouses/:id',
  WAREHOUSE_INVENTORY: '/warehouses/:id/inventory',

  // Carrier endpoints
  CARRIERS: '/carriers',
  CARRIER: '/carriers/:id',
  CARRIER_RATES: '/carriers/:id/rates',

  // Return endpoints
  RETURNS: '/returns',
  RETURN: '/returns/:id',
  RETURN_APPROVE: '/returns/:id/approve',

  // Tracking endpoints
  TRACKING_EVENTS: '/tracking/events',
  TRACKING_HISTORY: '/tracking/history/:trackingNumber',

  // Customer endpoints
  CUSTOMER: '/customers/:id',

  // Admin endpoints
  ADMIN_HEALTH: '/admin/health',
  ADMIN_METRICS: '/admin/metrics',
  ADMIN_AUDIT: '/admin/audit',
};

module.exports = ROUTES;
