/**
 * routes/customers.js
 * Express router for customer endpoints.
 */
const express = require('express');
const ROUTES = require('../helpers/routes');
const { requireAuth } = require('../middleware/auth');
const { standardLimit } = require('../middleware/rateLimit');
const { store, appendAuditLog } = require('../models/schemas');

const router = express.Router();

// GET /customers/:id
router.get(ROUTES.CUSTOMER, requireAuth, standardLimit, (req, res) => {
  const customer = store.customers.get(req.params.id);
  if (!customer) {
    return res.status(404).json({ error: 'NotFound', message: `Customer ${req.params.id} not found` });
  }

  // Customers can only read their own record unless admin/operator
  if (req.user.role === 'customer' && req.user.customerId !== req.params.id) {
    return res.status(403).json({ error: 'Forbidden', message: 'You can only access your own customer record' });
  }

  res.json({ data: customer });
});

// PUT /customers/:id
router.put(ROUTES.CUSTOMER, requireAuth, standardLimit, (req, res) => {
  const customer = store.customers.get(req.params.id);
  if (!customer) {
    return res.status(404).json({ error: 'NotFound', message: `Customer ${req.params.id} not found` });
  }

  if (req.user.role === 'customer' && req.user.customerId !== req.params.id) {
    return res.status(403).json({ error: 'Forbidden', message: 'You can only update your own customer record' });
  }

  const allowedUpdates = ['name', 'email', 'phone', 'address'];
  const updates = {};
  for (const key of allowedUpdates) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(422).json({ error: 'ValidationError', message: 'No updatable fields provided' });
  }

  const updated = { ...customer, ...updates, updatedAt: new Date().toISOString() };
  store.customers.set(req.params.id, updated);
  appendAuditLog({ action: 'CUSTOMER_UPDATED', resourceId: req.params.id, userId: req.user.userId });

  res.json({ data: updated });
});

module.exports = router;
