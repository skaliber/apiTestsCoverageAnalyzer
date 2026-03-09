/**
 * notificationService.js
 * Stubbed notification delivery for shipment and order events.
 * In production this would integrate with SES, SendGrid, Twilio, etc.
 */

/** In-memory log of sent notifications (for test assertions) */
const sentNotifications = [];

/**
 * Sends a notification (currently logs to memory, could call real provider).
 * @param {object} notification
 * @param {string} notification.type      - Event type (e.g. 'SHIPMENT_DISPATCHED')
 * @param {string} notification.recipient - Email or phone
 * @param {string} notification.channel   - 'email' | 'sms' | 'webhook'
 * @param {object} notification.payload   - Arbitrary data to include
 */
function send(notification) {
  const record = {
    ...notification,
    id: `NTF-${Date.now()}-${sentNotifications.length}`,
    sentAt: new Date().toISOString(),
    status: 'delivered',
  };
  sentNotifications.push(record);
  // In tests we don't actually call external services
  return record;
}

function notifyShipmentDispatched(shipment, recipientEmail) {
  return send({
    type: 'SHIPMENT_DISPATCHED',
    recipient: recipientEmail,
    channel: 'email',
    payload: {
      shipmentId: shipment.id,
      trackingNumber: shipment.trackingNumber,
      carrierId: shipment.carrierId,
    },
  });
}

function notifyShipmentDelivered(shipment, recipientEmail) {
  return send({
    type: 'SHIPMENT_DELIVERED',
    recipient: recipientEmail,
    channel: 'email',
    payload: {
      shipmentId: shipment.id,
      deliveredAt: shipment.deliveredAt,
    },
  });
}

function notifyReturnApproved(returnRecord, recipientEmail) {
  return send({
    type: 'RETURN_APPROVED',
    recipient: recipientEmail,
    channel: 'email',
    payload: {
      returnId: returnRecord.id,
      shipmentId: returnRecord.shipmentId,
    },
  });
}

function notifyOrderFulfilled(order, recipientEmail) {
  return send({
    type: 'ORDER_FULFILLED',
    recipient: recipientEmail,
    channel: 'email',
    payload: {
      orderId: order.id,
      totalValueUsd: order.totalValueUsd,
    },
  });
}

/** Test helper — clear sent notifications */
function clearAll() {
  sentNotifications.length = 0;
}

module.exports = {
  send,
  notifyShipmentDispatched,
  notifyShipmentDelivered,
  notifyReturnApproved,
  notifyOrderFulfilled,
  sentNotifications,
  clearAll,
};
