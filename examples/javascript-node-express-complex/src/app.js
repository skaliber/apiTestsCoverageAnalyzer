/**
 * app.js
 * Express application factory.
 * Exported separately from server.js so tests can import without starting a listener.
 */
const express = require('express');

// Route modules
const shipmentsRouter  = require('./routes/shipments');
const ordersRouter     = require('./routes/orders');
const warehousesRouter = require('./routes/warehouses');
const carriersRouter   = require('./routes/carriers');
const returnsRouter    = require('./routes/returns');
const trackingRouter   = require('./routes/tracking');
const customersRouter  = require('./routes/customers');
const adminRouter      = require('./routes/admin');

function createApp() {
  const app = express();

  // ─── Global middleware ───────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));

  // Request ID header — helpful for tracing in logs
  app.use((req, res, next) => {
    res.setHeader('X-Request-Id', `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    next();
  });

  // ─── Routes ─────────────────────────────────────────────────────────────
  app.use(shipmentsRouter);
  app.use(ordersRouter);
  app.use(warehousesRouter);
  app.use(carriersRouter);
  app.use(returnsRouter);
  app.use(trackingRouter);
  app.use(customersRouter);
  app.use(adminRouter);

  // ─── 404 handler ────────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({
      error: 'NotFound',
      message: `Route ${req.method} ${req.path} does not exist`,
    });
  });

  // ─── Global error handler ────────────────────────────────────────────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[UnhandledError]', err);
    res.status(500).json({
      error: 'InternalError',
      message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
    });
  });

  return app;
}

module.exports = { createApp };
