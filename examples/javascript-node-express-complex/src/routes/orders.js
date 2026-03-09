/**
 * routes/orders.js
 * Express router for order endpoints.
 */
const express = require('express');
const ROUTES = require('../helpers/routes');
const { requireAuth, requireOperator } = require('../middleware/auth');
const { standardLimit } = require('../middleware/rateLimit');
const { validateCreateOrder, validateUpdateOrderStatus } = require('../middleware/validation');
const orderService = require('../services/orderService');

const router = express.Router();

// POST /orders
router.post(ROUTES.ORDERS, requireAuth, requireOperator, standardLimit, validateCreateOrder, (req, res) => {
  try {
    const order = orderService.createOrder({ ...req.body, _userId: req.user.userId });
    res.status(201).json({ data: order });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'NotFound', message: err.message });
    res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// GET /orders
router.get(ROUTES.ORDERS, requireAuth, standardLimit, (req, res) => {
  const result = orderService.listOrders(req.query);
  res.json(result);
});

// GET /orders/:id
router.get(ROUTES.ORDER, requireAuth, standardLimit, (req, res) => {
  try {
    const order = orderService.getOrder(req.params.id);
    res.json({ data: order });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'NotFound', message: err.message });
    res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// PUT /orders/:id/status
router.put(ROUTES.ORDER_STATUS, requireAuth, requireOperator, standardLimit, validateUpdateOrderStatus, (req, res) => {
  try {
    const order = orderService.updateOrderStatus(req.params.id, req.body.status);
    res.json({ data: order });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'NotFound', message: err.message });
    if (err.code === 'INVALID_TRANSITION') return res.status(409).json({ error: 'InvalidTransition', message: err.message });
    res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// DELETE /orders/:id
router.delete(ROUTES.ORDER, requireAuth, requireOperator, standardLimit, (req, res) => {
  try {
    orderService.deleteOrder(req.params.id);
    res.status(204).send();
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'NotFound', message: err.message });
    if (err.code === 'INVALID_STATE') return res.status(409).json({ error: 'InvalidState', message: err.message });
    res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

module.exports = router;
