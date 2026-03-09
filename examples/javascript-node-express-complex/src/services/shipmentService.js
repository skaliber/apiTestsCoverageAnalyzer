/**
 * shipmentService.js
 * Business logic for shipment lifecycle management.
 * Enforces business rules defined in business-rules.yaml.
 */
const { store, makeShipment, makeTrackingEvent, appendAuditLog } = require('../models/schemas');

let trackingCounter = 1000;

function generateTrackingNumber() {
  trackingCounter += 1;
  return `TRK-${Date.now()}-${trackingCounter}`;
}

// ─── Business rule enforcement ────────────────────────────────────────────

/**
 * BR-001: shipment-weight-limit — max 1000 kg
 */
function enforceWeightLimit(weightKg) {
  if (weightKg > 1000) {
    const err = new Error('A single shipment cannot exceed 1000 kg');
    err.code = 'WEIGHT_LIMIT_EXCEEDED';
    err.rule = 'shipment-weight-limit';
    throw err;
  }
}

/**
 * BR-002: carrier-active-required
 */
function enforceCarrierActive(carrier) {
  if (!carrier.active) {
    const err = new Error(`Carrier ${carrier.id} is not active`);
    err.code = 'CARRIER_INACTIVE';
    err.rule = 'carrier-active-required';
    throw err;
  }
}

/**
 * BR-003: address-validation-required — must validate before dispatch
 */
function enforceAddressValidated(shipment) {
  if (!shipment.addressValidated) {
    const err = new Error('Shipping address must be validated before dispatch');
    err.code = 'ADDRESS_NOT_VALIDATED';
    err.rule = 'address-validation-required';
    throw err;
  }
}

/**
 * BR-007: hazmat-special-carrier
 */
function enforceHazmatCarrier(shipment, carrier) {
  if (shipment.isHazmat && !carrier.hazmatCertified) {
    const err = new Error(`Carrier ${carrier.id} is not certified for hazardous materials`);
    err.code = 'HAZMAT_CARRIER_REQUIRED';
    err.rule = 'hazmat-special-carrier';
    throw err;
  }
}

/**
 * BR-008: insurance-required-high-value
 */
function enforceInsuranceHighValue(shipment) {
  if (shipment.declaredValueUsd > 5000 && !shipment.insured) {
    const err = new Error('Shipments with declared value over $5000 require insurance');
    err.code = 'INSURANCE_REQUIRED';
    err.rule = 'insurance-required-high-value';
    throw err;
  }
}

// ─── CRUD operations ───────────────────────────────────────────────────────

function createShipment(data) {
  enforceWeightLimit(data.weightKg);

  const carrier = store.carriers.get(data.carrierId);
  if (!carrier) throw Object.assign(new Error(`Carrier ${data.carrierId} not found`), { code: 'NOT_FOUND' });

  enforceCarrierActive(carrier);

  const warehouse = store.warehouses.get(data.warehouseId);
  if (!warehouse) throw Object.assign(new Error(`Warehouse ${data.warehouseId} not found`), { code: 'NOT_FOUND' });

  // BR-007
  if (data.isHazmat) enforceHazmatCarrier({ isHazmat: true }, carrier);

  const shipment = makeShipment({
    ...data,
    trackingNumber: generateTrackingNumber(),
    addressValidated: data.addressValidated || false,
  });

  // BR-008 — warn but don't block creation; dispatch will enforce
  store.shipments.set(shipment.id, shipment);
  store.trackingEvents.set(shipment.trackingNumber, []);

  appendAuditLog({ action: 'SHIPMENT_CREATED', resourceId: shipment.id, userId: data._userId });
  return shipment;
}

function listShipments({ status, carrierId, warehouseId, page = 1, limit = 20 } = {}) {
  let results = Array.from(store.shipments.values());
  if (status) results = results.filter((s) => s.status === status);
  if (carrierId) results = results.filter((s) => s.carrierId === carrierId);
  if (warehouseId) results = results.filter((s) => s.warehouseId === warehouseId);
  const start = (page - 1) * limit;
  return {
    data: results.slice(start, start + limit),
    total: results.length,
    page: Number(page),
    limit: Number(limit),
  };
}

function getShipment(id) {
  const s = store.shipments.get(id);
  if (!s) throw Object.assign(new Error(`Shipment ${id} not found`), { code: 'NOT_FOUND' });
  return s;
}

function updateShipment(id, updates) {
  const s = getShipment(id);
  if (['delivered', 'cancelled'].includes(s.status)) {
    throw Object.assign(new Error('Cannot update a delivered or cancelled shipment'), { code: 'INVALID_STATE' });
  }
  if (updates.carrierId) {
    const carrier = store.carriers.get(updates.carrierId);
    if (!carrier) throw Object.assign(new Error(`Carrier ${updates.carrierId} not found`), { code: 'NOT_FOUND' });
    enforceCarrierActive(carrier);
  }
  const updated = { ...s, ...updates, updatedAt: new Date().toISOString() };
  store.shipments.set(id, updated);
  appendAuditLog({ action: 'SHIPMENT_UPDATED', resourceId: id });
  return updated;
}

function deleteShipment(id) {
  const s = getShipment(id);
  if (s.status !== 'pending') {
    throw Object.assign(new Error('Only pending shipments can be deleted'), { code: 'INVALID_STATE' });
  }
  store.shipments.delete(id);
  appendAuditLog({ action: 'SHIPMENT_DELETED', resourceId: id });
  return { deleted: true };
}

function dispatchShipment(id) {
  const s = getShipment(id);
  if (s.status !== 'pending') {
    throw Object.assign(new Error('Only pending shipments can be dispatched'), { code: 'INVALID_STATE' });
  }
  enforceAddressValidated(s);
  const carrier = store.carriers.get(s.carrierId);
  enforceCarrierActive(carrier);
  if (s.isHazmat) enforceHazmatCarrier(s, carrier);
  enforceInsuranceHighValue(s);

  const updated = {
    ...s,
    status: 'dispatched',
    dispatchedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.shipments.set(id, updated);

  const event = makeTrackingEvent({
    trackingNumber: s.trackingNumber,
    shipmentId: id,
    status: 'dispatched',
    description: 'Shipment dispatched from warehouse',
  });
  const events = store.trackingEvents.get(s.trackingNumber) || [];
  events.push(event);
  store.trackingEvents.set(s.trackingNumber, events);

  appendAuditLog({ action: 'SHIPMENT_DISPATCHED', resourceId: id });
  return updated;
}

function deliverShipment(id) {
  const s = getShipment(id);
  if (!['dispatched', 'in_transit'].includes(s.status)) {
    throw Object.assign(new Error('Shipment must be dispatched or in transit to deliver'), { code: 'INVALID_STATE' });
  }
  const updated = {
    ...s,
    status: 'delivered',
    deliveredAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.shipments.set(id, updated);

  const event = makeTrackingEvent({
    trackingNumber: s.trackingNumber,
    shipmentId: id,
    status: 'delivered',
    description: 'Shipment delivered to recipient',
  });
  const events = store.trackingEvents.get(s.trackingNumber) || [];
  events.push(event);
  store.trackingEvents.set(s.trackingNumber, events);

  appendAuditLog({ action: 'SHIPMENT_DELIVERED', resourceId: id });
  return updated;
}

function cancelShipment(id, reason) {
  const s = getShipment(id);
  if (['delivered', 'cancelled'].includes(s.status)) {
    throw Object.assign(new Error('Cannot cancel a delivered or already-cancelled shipment'), { code: 'INVALID_STATE' });
  }
  const updated = {
    ...s,
    status: 'cancelled',
    cancelReason: reason || 'No reason provided',
    cancelledAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.shipments.set(id, updated);
  appendAuditLog({ action: 'SHIPMENT_CANCELLED', resourceId: id });
  return updated;
}

function getShipmentTracking(id) {
  const s = getShipment(id);
  return {
    shipmentId: id,
    trackingNumber: s.trackingNumber,
    currentStatus: s.status,
    events: store.trackingEvents.get(s.trackingNumber) || [],
  };
}

module.exports = {
  createShipment,
  listShipments,
  getShipment,
  updateShipment,
  deleteShipment,
  dispatchShipment,
  deliverShipment,
  cancelShipment,
  getShipmentTracking,
};
