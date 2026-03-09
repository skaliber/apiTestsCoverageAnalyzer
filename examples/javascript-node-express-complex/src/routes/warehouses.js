/**
 * routes/warehouses.js
 * Express router for warehouse endpoints.
 * Enforces BR-005: warehouse-capacity-check.
 */
const express = require('express');
const ROUTES = require('../helpers/routes');
const { requireAuth, requireOperator } = require('../middleware/auth');
const { standardLimit } = require('../middleware/rateLimit');
const { validateWarehouseInventory } = require('../middleware/validation');
const { store, appendAuditLog } = require('../models/schemas');

const router = express.Router();

// GET /warehouses
router.get(ROUTES.WAREHOUSES, requireAuth, standardLimit, (req, res) => {
  let results = Array.from(store.warehouses.values());
  if (req.query.active !== undefined) {
    const flag = req.query.active === 'true';
    results = results.filter((w) => w.active === flag);
  }
  res.json({ data: results, total: results.length });
});

// GET /warehouses/:id
router.get(ROUTES.WAREHOUSE, requireAuth, standardLimit, (req, res) => {
  const warehouse = store.warehouses.get(req.params.id);
  if (!warehouse) {
    return res.status(404).json({ error: 'NotFound', message: `Warehouse ${req.params.id} not found` });
  }
  const utilizationPct = ((warehouse.currentOccupancy / warehouse.capacity) * 100).toFixed(1);
  res.json({ data: { ...warehouse, utilizationPct: Number(utilizationPct) } });
});

// POST /warehouses/:id/inventory
router.post(
  ROUTES.WAREHOUSE_INVENTORY,
  requireAuth,
  requireOperator,
  standardLimit,
  validateWarehouseInventory,
  (req, res) => {
    const warehouse = store.warehouses.get(req.params.id);
    if (!warehouse) {
      return res.status(404).json({ error: 'NotFound', message: `Warehouse ${req.params.id} not found` });
    }

    const { items, operation } = req.body;
    const deltaUnits = items.reduce((sum, i) => sum + (i.units || 0), 0);

    if (operation === 'add') {
      // BR-005: capacity check
      const projected = warehouse.currentOccupancy + deltaUnits;
      if (projected > warehouse.capacity) {
        return res.status(409).json({
          error: 'BusinessRuleViolation',
          rule: 'warehouse-capacity-check',
          message: `Adding ${deltaUnits} units would exceed warehouse capacity (${warehouse.capacity})`,
          current: warehouse.currentOccupancy,
          capacity: warehouse.capacity,
        });
      }
      warehouse.currentOccupancy = projected;
    } else if (operation === 'remove') {
      warehouse.currentOccupancy = Math.max(0, warehouse.currentOccupancy - deltaUnits);
    }

    // Merge inventory records
    for (const item of items) {
      if (!item.sku) continue;
      const existing = warehouse.inventory[item.sku] || 0;
      if (operation === 'add') warehouse.inventory[item.sku] = existing + (item.units || 0);
      else if (operation === 'remove') warehouse.inventory[item.sku] = Math.max(0, existing - (item.units || 0));
      else if (operation === 'set') warehouse.inventory[item.sku] = item.units || 0;
    }

    store.warehouses.set(warehouse.id, warehouse);
    appendAuditLog({ action: 'WAREHOUSE_INVENTORY_UPDATED', resourceId: warehouse.id, meta: { operation, items } });

    res.json({
      data: {
        warehouseId: warehouse.id,
        operation,
        currentOccupancy: warehouse.currentOccupancy,
        capacity: warehouse.capacity,
        inventory: warehouse.inventory,
      },
    });
  }
);

module.exports = router;
