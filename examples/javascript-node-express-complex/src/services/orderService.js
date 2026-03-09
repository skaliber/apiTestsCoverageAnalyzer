/**
 * orderService.js
 * Business logic for order creation and fulfillment.
 */
const { store, makeOrder, appendAuditLog } = require('../models/schemas');

function createOrder(data) {
  const customer = store.customers.get(data.customerId);
  if (!customer) {
    throw Object.assign(new Error(`Customer ${data.customerId} not found`), { code: 'NOT_FOUND' });
  }

  // Compute totals
  const totalWeightKg = data.items.reduce((sum, i) => sum + (i.weightKg || 0) * i.quantity, 0);
  const totalValueUsd  = data.items.reduce((sum, i) => sum + i.unitPriceUsd * i.quantity, 0);

  const order = makeOrder({ ...data, totalWeightKg, totalValueUsd });
  store.orders.set(order.id, order);
  appendAuditLog({ action: 'ORDER_CREATED', resourceId: order.id, userId: data._userId });
  return order;
}

function listOrders({ customerId, status, page = 1, limit = 20 } = {}) {
  let results = Array.from(store.orders.values());
  if (customerId) results = results.filter((o) => o.customerId === customerId);
  if (status) results = results.filter((o) => o.status === status);
  const start = (page - 1) * limit;
  return {
    data: results.slice(start, start + limit),
    total: results.length,
    page: Number(page),
    limit: Number(limit),
  };
}

function getOrder(id) {
  const o = store.orders.get(id);
  if (!o) throw Object.assign(new Error(`Order ${id} not found`), { code: 'NOT_FOUND' });
  return o;
}

function updateOrderStatus(id, status) {
  const o = getOrder(id);

  const transitions = {
    pending:    ['processing', 'cancelled'],
    processing: ['fulfilled', 'cancelled'],
    fulfilled:  [],
    cancelled:  [],
  };

  if (!transitions[o.status].includes(status)) {
    throw Object.assign(
      new Error(`Cannot transition order from '${o.status}' to '${status}'`),
      { code: 'INVALID_TRANSITION' }
    );
  }

  const updated = { ...o, status, updatedAt: new Date().toISOString() };
  store.orders.set(id, updated);
  appendAuditLog({ action: 'ORDER_STATUS_UPDATED', resourceId: id, meta: { from: o.status, to: status } });
  return updated;
}

function deleteOrder(id) {
  const o = getOrder(id);
  if (o.status !== 'pending') {
    throw Object.assign(new Error('Only pending orders can be deleted'), { code: 'INVALID_STATE' });
  }
  store.orders.delete(id);
  appendAuditLog({ action: 'ORDER_DELETED', resourceId: id });
  return { deleted: true };
}

module.exports = { createOrder, listOrders, getOrder, updateOrderStatus, deleteOrder };
