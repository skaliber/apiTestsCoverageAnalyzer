/**
 * routes/shipments.js
 * Express router for shipment endpoints.
 * Uses ROUTES constants for all path registrations.
 */
const express = require('express');
const ROUTES = require('../helpers/routes');
const { requireAuth, requireOperator } = require('../middleware/auth');
const { standardLimit } = require('../middleware/rateLimit');
const {
  validateCreateShipment,
  validateUpdateShipment,
} = require('../middleware/validation');
const shipmentService = require('../services/shipmentService');

const router = express.Router();

// POST /shipments
router.post(
  ROUTES.SHIPMENTS,
  requireAuth,
  requireOperator,
  standardLimit,
  validateCreateShipment,
  (req, res) => {
    try {
      const shipment = shipmentService.createShipment({ ...req.body, _userId: req.user.userId });
      res.status(201).json({ data: shipment });
    } catch (err) {
      if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'NotFound', message: err.message });
      if (err.code === 'CARRIER_INACTIVE') return res.status(409).json({ error: 'BusinessRuleViolation', rule: err.rule, message: err.message });
      if (err.code === 'HAZMAT_CARRIER_REQUIRED') return res.status(409).json({ error: 'BusinessRuleViolation', rule: err.rule, message: err.message });
      if (err.code === 'WEIGHT_LIMIT_EXCEEDED') return res.status(400).json({ error: 'BusinessRuleViolation', rule: err.rule, message: err.message });
      res.status(500).json({ error: 'InternalError', message: err.message });
    }
  }
);

// GET /shipments
router.get(ROUTES.SHIPMENTS, requireAuth, standardLimit, (req, res) => {
  const result = shipmentService.listShipments(req.query);
  res.json(result);
});

// GET /shipments/:id
router.get(ROUTES.SHIPMENT, requireAuth, standardLimit, (req, res) => {
  try {
    const shipment = shipmentService.getShipment(req.params.id);
    res.json({ data: shipment });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'NotFound', message: err.message });
    res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// PUT /shipments/:id
router.put(
  ROUTES.SHIPMENT,
  requireAuth,
  requireOperator,
  standardLimit,
  validateUpdateShipment,
  (req, res) => {
    try {
      const updated = shipmentService.updateShipment(req.params.id, req.body);
      res.json({ data: updated });
    } catch (err) {
      if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'NotFound', message: err.message });
      if (err.code === 'INVALID_STATE') return res.status(409).json({ error: 'InvalidState', message: err.message });
      if (err.code === 'CARRIER_INACTIVE') return res.status(409).json({ error: 'BusinessRuleViolation', rule: err.rule, message: err.message });
      res.status(500).json({ error: 'InternalError', message: err.message });
    }
  }
);

// DELETE /shipments/:id
router.delete(ROUTES.SHIPMENT, requireAuth, requireOperator, standardLimit, (req, res) => {
  try {
    shipmentService.deleteShipment(req.params.id);
    res.status(204).send();
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'NotFound', message: err.message });
    if (err.code === 'INVALID_STATE') return res.status(409).json({ error: 'InvalidState', message: err.message });
    res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// POST /shipments/:id/dispatch
router.post(ROUTES.SHIPMENT_DISPATCH, requireAuth, requireOperator, standardLimit, (req, res) => {
  try {
    const shipment = shipmentService.dispatchShipment(req.params.id);
    res.json({ data: shipment, message: 'Shipment dispatched successfully' });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'NotFound', message: err.message });
    if (err.code === 'INVALID_STATE') return res.status(409).json({ error: 'InvalidState', message: err.message });
    if (['ADDRESS_NOT_VALIDATED', 'CARRIER_INACTIVE', 'HAZMAT_CARRIER_REQUIRED', 'INSURANCE_REQUIRED'].includes(err.code)) {
      return res.status(422).json({ error: 'BusinessRuleViolation', rule: err.rule, message: err.message });
    }
    res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// POST /shipments/:id/deliver
router.post(ROUTES.SHIPMENT_DELIVER, requireAuth, requireOperator, standardLimit, (req, res) => {
  try {
    const shipment = shipmentService.deliverShipment(req.params.id);
    res.json({ data: shipment, message: 'Shipment marked as delivered' });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'NotFound', message: err.message });
    if (err.code === 'INVALID_STATE') return res.status(409).json({ error: 'InvalidState', message: err.message });
    res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// POST /shipments/:id/cancel
router.post(ROUTES.SHIPMENT_CANCEL, requireAuth, requireOperator, standardLimit, (req, res) => {
  try {
    const shipment = shipmentService.cancelShipment(req.params.id, req.body.reason);
    res.json({ data: shipment, message: 'Shipment cancelled' });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'NotFound', message: err.message });
    if (err.code === 'INVALID_STATE') return res.status(409).json({ error: 'InvalidState', message: err.message });
    res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// GET /shipments/:id/tracking
router.get(ROUTES.SHIPMENT_TRACKING, requireAuth, standardLimit, (req, res) => {
  try {
    const tracking = shipmentService.getShipmentTracking(req.params.id);
    res.json({ data: tracking });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'NotFound', message: err.message });
    res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

module.exports = router;
