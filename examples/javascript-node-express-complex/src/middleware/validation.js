/**
 * validation.js
 * Request body and parameter validation middleware using simple
 * schema-based checks (no external library dependency for portability).
 */

/** Throw-like helper that returns a 422 response */
function validationError(res, errors) {
  return res.status(422).json({
    error: 'ValidationError',
    message: 'Request validation failed',
    details: errors,
  });
}

/** Check required string fields */
function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  return missing;
}

// ─── Shipment validators ───────────────────────────────────────────────────

function validateCreateShipment(req, res, next) {
  const required = ['carrierId', 'warehouseId', 'origin', 'destination', 'weightKg'];
  const missing = requireFields(req.body, required);
  if (missing.length) return validationError(res, missing.map((f) => `${f} is required`));

  const { weightKg, declaredValueUsd, origin, destination } = req.body;

  if (typeof weightKg !== 'number' || weightKg <= 0) {
    return validationError(res, ['weightKg must be a positive number']);
  }
  if (weightKg > 1000) {
    return res.status(400).json({
      error: 'BusinessRuleViolation',
      rule: 'shipment-weight-limit',
      message: 'A single shipment cannot exceed 1000 kg',
    });
  }
  if (declaredValueUsd !== undefined && typeof declaredValueUsd !== 'number') {
    return validationError(res, ['declaredValueUsd must be a number']);
  }
  if (!origin || typeof origin !== 'object') {
    return validationError(res, ['origin must be an address object']);
  }
  if (!destination || typeof destination !== 'object') {
    return validationError(res, ['destination must be an address object']);
  }
  next();
}

function validateUpdateShipment(req, res, next) {
  const allowed = ['carrierId', 'warehouseId', 'destination', 'declaredValueUsd', 'insured', 'isHazmat'];
  const keys = Object.keys(req.body);
  if (keys.length === 0) return validationError(res, ['request body must not be empty']);
  const invalid = keys.filter((k) => !allowed.includes(k));
  if (invalid.length) {
    return validationError(res, invalid.map((k) => `field '${k}' cannot be updated`));
  }
  next();
}

// ─── Order validators ─────────────────────────────────────────────────────

function validateCreateOrder(req, res, next) {
  const required = ['customerId', 'items', 'shippingAddress'];
  const missing = requireFields(req.body, required);
  if (missing.length) return validationError(res, missing.map((f) => `${f} is required`));

  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return validationError(res, ['items must be a non-empty array']);
  }
  for (const item of items) {
    if (!item.sku || !item.quantity || !item.unitPriceUsd) {
      return validationError(res, ['each item must have sku, quantity, and unitPriceUsd']);
    }
  }
  next();
}

function validateUpdateOrderStatus(req, res, next) {
  const valid = ['pending', 'processing', 'fulfilled', 'cancelled'];
  const { status } = req.body;
  if (!status) return validationError(res, ['status is required']);
  if (!valid.includes(status)) {
    return validationError(res, [`status must be one of: ${valid.join(', ')}`]);
  }
  next();
}

// ─── Return validators ────────────────────────────────────────────────────

function validateCreateReturn(req, res, next) {
  const required = ['shipmentId', 'customerId', 'reason', 'items'];
  const missing = requireFields(req.body, required);
  if (missing.length) return validationError(res, missing.map((f) => `${f} is required`));

  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return validationError(res, ['items must be a non-empty array']);
  }
  next();
}

// ─── Tracking event validator ─────────────────────────────────────────────

function validateTrackingEvent(req, res, next) {
  const required = ['trackingNumber', 'status'];
  const missing = requireFields(req.body, required);
  if (missing.length) return validationError(res, missing.map((f) => `${f} is required`));
  next();
}

// ─── Warehouse inventory validator ───────────────────────────────────────

function validateWarehouseInventory(req, res, next) {
  const { items, operation } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return validationError(res, ['items must be a non-empty array']);
  }
  const validOps = ['add', 'remove', 'set'];
  if (!operation || !validOps.includes(operation)) {
    return validationError(res, [`operation must be one of: ${validOps.join(', ')}`]);
  }
  next();
}

module.exports = {
  validateCreateShipment,
  validateUpdateShipment,
  validateCreateOrder,
  validateUpdateOrderStatus,
  validateCreateReturn,
  validateTrackingEvent,
  validateWarehouseInventory,
};
