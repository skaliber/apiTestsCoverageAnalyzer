/**
 * carrierService.js
 * Business logic for carrier management and rate calculation.
 */
const { store } = require('../models/schemas');

function listCarriers({ active } = {}) {
  let results = Array.from(store.carriers.values());
  if (active !== undefined) {
    const flag = active === 'true' || active === true;
    results = results.filter((c) => c.active === flag);
  }
  return results;
}

function getCarrier(id) {
  const c = store.carriers.get(id);
  if (!c) throw Object.assign(new Error(`Carrier ${id} not found`), { code: 'NOT_FOUND' });
  return c;
}

/**
 * Calculates tiered shipping rates for a carrier.
 * @param {string} id         - Carrier ID
 * @param {number} weightKg   - Parcel weight in kg
 * @param {string} [service]  - Requested service name
 */
function getCarrierRates(id, { weightKg, service } = {}) {
  const carrier = getCarrier(id);

  const weight = parseFloat(weightKg) || 1;
  const services = service
    ? carrier.services.filter((s) => s === service)
    : carrier.services;

  if (services.length === 0) {
    throw Object.assign(
      new Error(`Carrier ${id} does not offer service '${service}'`),
      { code: 'SERVICE_NOT_AVAILABLE' }
    );
  }

  const serviceMultipliers = { ground: 1.0, air: 2.2, overnight: 3.5, international: 4.1 };

  const rates = services.map((svc) => {
    const multiplier = serviceMultipliers[svc] || 1.0;
    const baseRate   = carrier.baseRatePerKg * weight * multiplier;
    const fuelSurcharge = baseRate * 0.085;
    const total = +(baseRate + fuelSurcharge).toFixed(2);
    return {
      service: svc,
      currency: 'USD',
      baseRate: +baseRate.toFixed(2),
      fuelSurcharge: +fuelSurcharge.toFixed(2),
      total,
      estimatedTransitDays: { ground: 5, air: 2, overnight: 1, international: 10 }[svc] || 7,
    };
  });

  return {
    carrierId: id,
    carrierName: carrier.name,
    weightKg: weight,
    rates,
  };
}

module.exports = { listCarriers, getCarrier, getCarrierRates };
