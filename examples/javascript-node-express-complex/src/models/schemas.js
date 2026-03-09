/**
 * schemas.js
 * In-memory data store with typed schema definitions.
 * In a production system these would be Mongoose/Sequelize models.
 * For this example they provide realistic shape and seed data.
 */

// ─── In-memory stores ─────────────────────────────────────────────────────

const store = {
  shipments: new Map(),
  orders: new Map(),
  warehouses: new Map(),
  carriers: new Map(),
  returns: new Map(),
  trackingEvents: new Map(),   // key: trackingNumber -> []
  customers: new Map(),
  auditLog: [],
};

// ─── Seed data ────────────────────────────────────────────────────────────

const seedCarriers = [
  {
    id: 'CAR-001',
    name: 'FastFreight Express',
    code: 'FFE',
    active: true,
    hazmatCertified: true,
    services: ['ground', 'air', 'overnight'],
    baseRatePerKg: 2.5,
    createdAt: new Date('2023-01-15').toISOString(),
  },
  {
    id: 'CAR-002',
    name: 'BudgetShip Co',
    code: 'BSC',
    active: true,
    hazmatCertified: false,
    services: ['ground'],
    baseRatePerKg: 1.2,
    createdAt: new Date('2023-03-10').toISOString(),
  },
  {
    id: 'CAR-003',
    name: 'AirCargo Premium',
    code: 'ACP',
    active: true,
    hazmatCertified: true,
    services: ['air', 'overnight', 'international'],
    baseRatePerKg: 4.8,
    createdAt: new Date('2023-06-01').toISOString(),
  },
  {
    id: 'CAR-004',
    name: 'OldLine Freight',
    code: 'OLF',
    active: false,
    hazmatCertified: false,
    services: ['ground'],
    baseRatePerKg: 1.0,
    createdAt: new Date('2022-11-20').toISOString(),
  },
];

const seedWarehouses = [
  {
    id: 'WH-001',
    name: 'Atlanta Distribution Center',
    location: { city: 'Atlanta', state: 'GA', country: 'US', zip: '30301' },
    capacity: 10000,
    currentOccupancy: 4230,
    active: true,
    inventory: {},
    createdAt: new Date('2022-05-01').toISOString(),
  },
  {
    id: 'WH-002',
    name: 'Los Angeles West Hub',
    location: { city: 'Los Angeles', state: 'CA', country: 'US', zip: '90001' },
    capacity: 15000,
    currentOccupancy: 12100,
    active: true,
    inventory: {},
    createdAt: new Date('2022-07-15').toISOString(),
  },
  {
    id: 'WH-003',
    name: 'Chicago Midwest Depot',
    location: { city: 'Chicago', state: 'IL', country: 'US', zip: '60601' },
    capacity: 8000,
    currentOccupancy: 7950,
    active: true,
    inventory: {},
    createdAt: new Date('2023-01-01').toISOString(),
  },
];

const seedCustomers = [
  {
    id: 'CUST-001',
    name: 'Acme Corporation',
    email: 'logistics@acme.com',
    phone: '+1-555-0100',
    address: { street: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701', country: 'US' },
    tier: 'enterprise',
    active: true,
    createdAt: new Date('2022-01-01').toISOString(),
  },
  {
    id: 'CUST-002',
    name: 'Globex Supply',
    email: 'orders@globex.com',
    phone: '+1-555-0200',
    address: { street: '456 Oak Ave', city: 'Shelbyville', state: 'TN', zip: '37160', country: 'US' },
    tier: 'standard',
    active: true,
    createdAt: new Date('2022-03-15').toISOString(),
  },
];

seedCarriers.forEach((c) => store.carriers.set(c.id, c));
seedWarehouses.forEach((w) => store.warehouses.set(w.id, w));
seedCustomers.forEach((c) => store.customers.set(c.id, c));

// ─── Schema factories ──────────────────────────────────────────────────────

function makeShipment(data) {
  return {
    id: data.id || `SHP-${Date.now()}`,
    orderId: data.orderId || null,
    carrierId: data.carrierId,
    warehouseId: data.warehouseId,
    trackingNumber: data.trackingNumber || null,
    status: data.status || 'pending',   // pending | dispatched | in_transit | delivered | cancelled
    origin: data.origin,
    destination: data.destination,
    weightKg: data.weightKg,
    declaredValueUsd: data.declaredValueUsd || 0,
    isHazmat: data.isHazmat || false,
    insured: data.insured || false,
    addressValidated: data.addressValidated || false,
    dispatchedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeOrder(data) {
  return {
    id: data.id || `ORD-${Date.now()}`,
    customerId: data.customerId,
    warehouseId: data.warehouseId || null,
    items: data.items || [],
    status: data.status || 'pending',   // pending | processing | fulfilled | cancelled
    totalWeightKg: data.totalWeightKg || 0,
    totalValueUsd: data.totalValueUsd || 0,
    shippingAddress: data.shippingAddress,
    shipmentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeReturn(data) {
  return {
    id: data.id || `RET-${Date.now()}`,
    shipmentId: data.shipmentId,
    customerId: data.customerId,
    reason: data.reason,
    status: data.status || 'requested',  // requested | approved | rejected | completed
    items: data.items || [],
    requestedAt: new Date().toISOString(),
    approvedAt: null,
    rejectedAt: null,
    deliveryDate: data.deliveryDate || null,
    createdAt: new Date().toISOString(),
  };
}

function makeTrackingEvent(data) {
  return {
    id: data.id || `EVT-${Date.now()}`,
    trackingNumber: data.trackingNumber,
    shipmentId: data.shipmentId || null,
    status: data.status,
    location: data.location || null,
    description: data.description || '',
    timestamp: data.timestamp || new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

// ─── Audit log helper ─────────────────────────────────────────────────────

function appendAuditLog(entry) {
  store.auditLog.push({
    ...entry,
    timestamp: new Date().toISOString(),
    id: `AUD-${store.auditLog.length + 1}`,
  });
}

module.exports = {
  store,
  makeShipment,
  makeOrder,
  makeReturn,
  makeTrackingEvent,
  appendAuditLog,
};
