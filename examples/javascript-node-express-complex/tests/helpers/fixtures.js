/**
 * tests/helpers/fixtures.js
 * Shared test data factories.
 * Returns new plain objects each time to prevent mutation across tests.
 */

/**
 * Reset the in-memory store to a clean state.
 * Call in beforeEach / afterEach to prevent test bleed-through.
 */
function resetStore() {
  const { store } = require('../../src/models/schemas');

  // Clear mutable collections
  store.shipments.clear();
  store.orders.clear();
  store.returns.clear();
  store.trackingEvents.clear();
  store.auditLog.length = 0;

  // Keep carriers and customers (seed data) but allow overrides
  // Re-seed carriers
  const seedCarriers = [
    { id: 'CAR-001', name: 'FastFreight Express', code: 'FFE', active: true, hazmatCertified: true,  services: ['ground', 'air', 'overnight'], baseRatePerKg: 2.5, createdAt: '2023-01-15T00:00:00.000Z' },
    { id: 'CAR-002', name: 'BudgetShip Co',       code: 'BSC', active: true, hazmatCertified: false, services: ['ground'],                    baseRatePerKg: 1.2, createdAt: '2023-03-10T00:00:00.000Z' },
    { id: 'CAR-003', name: 'AirCargo Premium',    code: 'ACP', active: true, hazmatCertified: true,  services: ['air', 'overnight', 'international'], baseRatePerKg: 4.8, createdAt: '2023-06-01T00:00:00.000Z' },
    { id: 'CAR-004', name: 'OldLine Freight',     code: 'OLF', active: false, hazmatCertified: false, services: ['ground'],                   baseRatePerKg: 1.0, createdAt: '2022-11-20T00:00:00.000Z' },
  ];
  store.carriers.clear();
  seedCarriers.forEach((c) => store.carriers.set(c.id, { ...c }));

  const seedWarehouses = [
    { id: 'WH-001', name: 'Atlanta Distribution Center', location: { city: 'Atlanta', state: 'GA', country: 'US', zip: '30301' }, capacity: 10000, currentOccupancy: 4230, active: true, inventory: {}, createdAt: '2022-05-01T00:00:00.000Z' },
    { id: 'WH-002', name: 'Los Angeles West Hub',        location: { city: 'Los Angeles', state: 'CA', country: 'US', zip: '90001' }, capacity: 15000, currentOccupancy: 12100, active: true, inventory: {}, createdAt: '2022-07-15T00:00:00.000Z' },
    { id: 'WH-003', name: 'Chicago Midwest Depot',       location: { city: 'Chicago', state: 'IL', country: 'US', zip: '60601' }, capacity: 8000, currentOccupancy: 7950, active: true, inventory: {}, createdAt: '2023-01-01T00:00:00.000Z' },
  ];
  store.warehouses.clear();
  seedWarehouses.forEach((w) => store.warehouses.set(w.id, { ...w }));

  const seedCustomers = [
    { id: 'CUST-001', name: 'Acme Corporation', email: 'logistics@acme.com', phone: '+1-555-0100', address: { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701', country: 'US' }, tier: 'enterprise', active: true, createdAt: '2022-01-01T00:00:00.000Z' },
    { id: 'CUST-002', name: 'Globex Supply',    email: 'orders@globex.com',  phone: '+1-555-0200', address: { street: '456 Oak Ave', city: 'Shelbyville', state: 'TN', zip: '37160', country: 'US' }, tier: 'standard', active: true, createdAt: '2022-03-15T00:00:00.000Z' },
  ];
  store.customers.clear();
  seedCustomers.forEach((c) => store.customers.set(c.id, { ...c }));
}

// ─── Payload factories ─────────────────────────────────────────────────────

function makeShipmentPayload(overrides = {}) {
  return {
    carrierId: 'CAR-001',
    warehouseId: 'WH-001',
    origin: {
      street: '100 Warehouse Blvd',
      city: 'Atlanta',
      state: 'GA',
      zip: '30301',
      country: 'US',
    },
    destination: {
      street: '789 Customer Lane',
      city: 'New York',
      state: 'NY',
      zip: '10001',
      country: 'US',
    },
    weightKg: 15,
    declaredValueUsd: 500,
    isHazmat: false,
    insured: false,
    addressValidated: true,
    ...overrides,
  };
}

function makeOrderPayload(overrides = {}) {
  return {
    customerId: 'CUST-001',
    items: [
      { sku: 'WIDGET-A', quantity: 10, unitPriceUsd: 29.99, weightKg: 0.5 },
      { sku: 'GADGET-B', quantity: 2,  unitPriceUsd: 149.99, weightKg: 1.2 },
    ],
    shippingAddress: {
      street: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
      country: 'US',
    },
    ...overrides,
  };
}

function makeReturnPayload(shipmentId, overrides = {}) {
  return {
    shipmentId,
    customerId: 'CUST-001',
    reason: 'Item damaged in transit',
    items: [{ sku: 'WIDGET-A', quantity: 2 }],
    ...overrides,
  };
}

function makeTrackingEventPayload(trackingNumber, overrides = {}) {
  return {
    trackingNumber,
    status: 'in_transit',
    location: { city: 'Nashville', state: 'TN', country: 'US' },
    description: 'Package arrived at sorting facility',
    ...overrides,
  };
}

/**
 * Seeds a delivered shipment into the store so return tests work.
 * Returns the seeded shipment object.
 */
function seedDeliveredShipment(overrides = {}) {
  const { store, makeShipment } = require('../../src/models/schemas');
  const tracking = `TRK-TEST-${Date.now()}`;
  const shipment = makeShipment({
    id: overrides.id || `SHP-DELIVERED-${Date.now()}`,
    carrierId: 'CAR-001',
    warehouseId: 'WH-001',
    trackingNumber: tracking,
    status: 'delivered',
    addressValidated: true,
    weightKg: 10,
    declaredValueUsd: 200,
    origin: { city: 'Atlanta', state: 'GA', country: 'US' },
    destination: { city: 'New York', state: 'NY', country: 'US' },
    deliveredAt: new Date().toISOString(),
    ...overrides,
  });
  store.shipments.set(shipment.id, shipment);
  store.trackingEvents.set(tracking, []);
  return shipment;
}

module.exports = {
  resetStore,
  makeShipmentPayload,
  makeOrderPayload,
  makeReturnPayload,
  makeTrackingEventPayload,
  seedDeliveredShipment,
};
