/**
 * routes/returns.js
 * Express router for shipment return endpoints.
 * Enforces BR-004: return-window-30-days.
 */
const express = require('express');
const ROUTES = require('../helpers/routes');
const { requireAuth, requireOperator } = require('../middleware/auth');
const { standardLimit } = require('../middleware/rateLimit');
const { validateCreateReturn } = require('../middleware/validation');
const { store, makeReturn, appendAuditLog } = require('../models/schemas');
const { notifyReturnApproved } = require('../services/notificationService');

const RETURN_WINDOW_DAYS = 30;

const router = express.Router();

// POST /returns
router.post(ROUTES.RETURNS, requireAuth, standardLimit, validateCreateReturn, (req, res) => {
  const { shipmentId, customerId, reason, items } = req.body;

  const shipment = store.shipments.get(shipmentId);
  if (!shipment) {
    return res.status(404).json({ error: 'NotFound', message: `Shipment ${shipmentId} not found` });
  }

  if (shipment.status !== 'delivered') {
    return res.status(409).json({
      error: 'InvalidState',
      message: 'Returns can only be initiated for delivered shipments',
    });
  }

  // BR-004: 30-day return window
  if (shipment.deliveredAt) {
    const deliveryDate = new Date(shipment.deliveredAt);
    const daysSince = (Date.now() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > RETURN_WINDOW_DAYS) {
      return res.status(422).json({
        error: 'BusinessRuleViolation',
        rule: 'return-window-30-days',
        message: `Return window of ${RETURN_WINDOW_DAYS} days has expired`,
        deliveredAt: shipment.deliveredAt,
        daysSinceDelivery: Math.floor(daysSince),
      });
    }
  }

  const returnRecord = makeReturn({
    shipmentId,
    customerId,
    reason,
    items,
    deliveryDate: shipment.deliveredAt,
  });

  store.returns.set(returnRecord.id, returnRecord);
  appendAuditLog({ action: 'RETURN_REQUESTED', resourceId: returnRecord.id });

  res.status(201).json({ data: returnRecord });
});

// GET /returns/:id
router.get(ROUTES.RETURN, requireAuth, standardLimit, (req, res) => {
  const returnRecord = store.returns.get(req.params.id);
  if (!returnRecord) {
    return res.status(404).json({ error: 'NotFound', message: `Return ${req.params.id} not found` });
  }
  res.json({ data: returnRecord });
});

// PUT /returns/:id/approve
router.put(ROUTES.RETURN_APPROVE, requireAuth, requireOperator, standardLimit, (req, res) => {
  const returnRecord = store.returns.get(req.params.id);
  if (!returnRecord) {
    return res.status(404).json({ error: 'NotFound', message: `Return ${req.params.id} not found` });
  }
  if (returnRecord.status !== 'requested') {
    return res.status(409).json({
      error: 'InvalidState',
      message: `Return is already '${returnRecord.status}', cannot approve`,
    });
  }

  const { approved, rejectionReason } = req.body;

  if (approved) {
    returnRecord.status = 'approved';
    returnRecord.approvedAt = new Date().toISOString();
    appendAuditLog({ action: 'RETURN_APPROVED', resourceId: returnRecord.id });

    // Notify customer
    const customer = store.customers.get(returnRecord.customerId);
    if (customer) notifyReturnApproved(returnRecord, customer.email);
  } else {
    returnRecord.status = 'rejected';
    returnRecord.rejectedAt = new Date().toISOString();
    returnRecord.rejectionReason = rejectionReason || 'Not approved';
    appendAuditLog({ action: 'RETURN_REJECTED', resourceId: returnRecord.id });
  }

  store.returns.set(returnRecord.id, returnRecord);
  res.json({ data: returnRecord });
});

module.exports = router;
