/**
 * routes/tracking.js
 * Express router for real-time tracking event endpoints.
 * Enforces BR-006: duplicate-tracking-prevention.
 */
const express = require('express');
const ROUTES = require('../helpers/routes');
const { requireAuth, requireOperator } = require('../middleware/auth');
const { standardLimit } = require('../middleware/rateLimit');
const { validateTrackingEvent } = require('../middleware/validation');
const { store, makeTrackingEvent, appendAuditLog } = require('../models/schemas');

const router = express.Router();

// POST /tracking/events
router.post(ROUTES.TRACKING_EVENTS, requireAuth, requireOperator, standardLimit, validateTrackingEvent, (req, res) => {
  const { trackingNumber, status, location, description, timestamp } = req.body;

  const events = store.trackingEvents.get(trackingNumber);
  if (events === undefined) {
    // Auto-initialize for new tracking numbers
    store.trackingEvents.set(trackingNumber, []);
  }

  // BR-006: check for duplicate event (same trackingNumber + status + timestamp)
  const existingEvents = store.trackingEvents.get(trackingNumber);
  const isDuplicate = existingEvents.some(
    (e) => e.status === status && e.timestamp === (timestamp || null)
  );

  if (isDuplicate) {
    return res.status(409).json({
      error: 'DuplicateEvent',
      rule: 'duplicate-tracking-prevention',
      message: 'A tracking event with this status and timestamp already exists',
    });
  }

  const event = makeTrackingEvent({ trackingNumber, status, location, description, timestamp });
  existingEvents.push(event);
  store.trackingEvents.set(trackingNumber, existingEvents);

  appendAuditLog({ action: 'TRACKING_EVENT_CREATED', resourceId: event.id });

  res.status(201).json({ data: event });
});

// GET /tracking/history/:trackingNumber
router.get(ROUTES.TRACKING_HISTORY, requireAuth, standardLimit, (req, res) => {
  const { trackingNumber } = req.params;
  const events = store.trackingEvents.get(trackingNumber);

  if (!events) {
    return res.status(404).json({
      error: 'NotFound',
      message: `No tracking history found for tracking number '${trackingNumber}'`,
    });
  }

  // Determine associated shipment
  const shipment = Array.from(store.shipments.values()).find(
    (s) => s.trackingNumber === trackingNumber
  );

  res.json({
    data: {
      trackingNumber,
      shipmentId: shipment ? shipment.id : null,
      currentStatus: shipment ? shipment.status : (events.length ? events[events.length - 1].status : 'unknown'),
      events: [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)),
      total: events.length,
    },
  });
});

module.exports = router;
