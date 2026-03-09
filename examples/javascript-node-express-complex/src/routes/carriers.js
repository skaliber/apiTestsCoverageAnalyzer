/**
 * routes/carriers.js
 * Express router for carrier endpoints.
 */
const express = require('express');
const ROUTES = require('../helpers/routes');
const { requireAuth } = require('../middleware/auth');
const { standardLimit } = require('../middleware/rateLimit');
const carrierService = require('../services/carrierService');

const router = express.Router();

// GET /carriers
router.get(ROUTES.CARRIERS, requireAuth, standardLimit, (req, res) => {
  const carriers = carrierService.listCarriers({ active: req.query.active });
  res.json({ data: carriers, total: carriers.length });
});

// GET /carriers/:id
router.get(ROUTES.CARRIER, requireAuth, standardLimit, (req, res) => {
  try {
    const carrier = carrierService.getCarrier(req.params.id);
    res.json({ data: carrier });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'NotFound', message: err.message });
    res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

// GET /carriers/:id/rates
router.get(ROUTES.CARRIER_RATES, requireAuth, standardLimit, (req, res) => {
  try {
    const rates = carrierService.getCarrierRates(req.params.id, req.query);
    res.json({ data: rates });
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: 'NotFound', message: err.message });
    if (err.code === 'SERVICE_NOT_AVAILABLE') return res.status(422).json({ error: 'ServiceNotAvailable', message: err.message });
    res.status(500).json({ error: 'InternalError', message: err.message });
  }
});

module.exports = router;
