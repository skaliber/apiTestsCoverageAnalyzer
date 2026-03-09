/**
 * routes/admin.js
 * Express router for admin/operational endpoints.
 * All endpoints require admin role.
 */
const express = require('express');
const os = require('os');
const ROUTES = require('../helpers/routes');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { adminLimit } = require('../middleware/rateLimit');
const { store } = require('../models/schemas');

const startedAt = new Date().toISOString();

const router = express.Router();

// GET /admin/health
router.get(ROUTES.ADMIN_HEALTH, requireAuth, requireAdmin, adminLimit, (req, res) => {
  res.json({
    status: 'ok',
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    startedAt,
    environment: process.env.NODE_ENV || 'development',
    node: process.version,
  });
});

// GET /admin/metrics
router.get(ROUTES.ADMIN_METRICS, requireAuth, requireAdmin, adminLimit, (req, res) => {
  const shipments = Array.from(store.shipments.values());
  const orders    = Array.from(store.orders.values());
  const returns   = Array.from(store.returns.values());

  const shipmentsByStatus = shipments.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {});

  const ordersByStatus = orders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  res.json({
    data: {
      shipments: {
        total: shipments.length,
        byStatus: shipmentsByStatus,
      },
      orders: {
        total: orders.length,
        byStatus: ordersByStatus,
      },
      returns: {
        total: returns.length,
        pending: returns.filter((r) => r.status === 'requested').length,
      },
      warehouses: {
        total: store.warehouses.size,
        active: Array.from(store.warehouses.values()).filter((w) => w.active).length,
      },
      carriers: {
        total: store.carriers.size,
        active: Array.from(store.carriers.values()).filter((c) => c.active).length,
      },
      system: {
        memoryUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        loadAvg: os.loadavg(),
        cpus: os.cpus().length,
      },
    },
  });
});

// GET /admin/audit
router.get(ROUTES.ADMIN_AUDIT, requireAuth, requireAdmin, adminLimit, (req, res) => {
  const { action, resourceId, page = 1, limit = 50 } = req.query;
  let entries = [...store.auditLog];

  if (action) entries = entries.filter((e) => e.action === action);
  if (resourceId) entries = entries.filter((e) => e.resourceId === resourceId);

  // Most recent first
  entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const start = (Number(page) - 1) * Number(limit);
  const paged = entries.slice(start, start + Number(limit));

  res.json({
    data: paged,
    total: entries.length,
    page: Number(page),
    limit: Number(limit),
  });
});

module.exports = router;
