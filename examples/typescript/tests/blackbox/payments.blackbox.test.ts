import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app';
import { walletRepository } from '../../src/repositories/walletRepository';
import { transactionRepository } from '../../src/repositories/transactionRepository';
import { paymentService } from '../../src/services/paymentService';

jest.mock('../../src/external/paymentProcessor');
jest.mock('../../src/external/fraudEngine');

import { paymentProcessor } from '../../src/external/paymentProcessor';
import { fraudEngine } from '../../src/external/fraudEngine';

const mockCharge = paymentProcessor.charge as jest.Mock;
const mockFraudCheck = fraudEngine.check as jest.Mock;

const JWT_SECRET = 'test-secret';
const app = createApp();

function makeToken(userId = 'bb-payment-user'): string {
  return jwt.sign({ userId, role: 'user' }, JWT_SECRET, { expiresIn: '1h' });
}

describe('Payments API Blackbox', () => {
  let token: string;
  let walletId: string;

  beforeEach(async () => {
    walletRepository.clear();
    transactionRepository.clear();
    paymentService.clear();
    jest.clearAllMocks();

    token = makeToken('bb-payment-user');
    const wallet = walletRepository.create('bb-payment-user', 'USD');
    walletId = wallet.id;
    walletRepository.update(walletId, { balance: 10000 });

    mockFraudCheck.mockResolvedValue({ approved: true, riskScore: 5 });
    mockCharge.mockResolvedValue({ processorReference: 'proc-bb-001', status: 'success' });
  });

  describe('Positive scenarios', () => {
    it('creates payment with idempotency key', async () => {
      const res = await request(app)
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .set('x-idempotency-key', 'bb-idem-001')
        .send({ walletId, amount: 150, currency: 'USD' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('completed');
      expect(res.body.idempotencyKey).toBe('bb-idem-001');
    });
  });

  describe('Negative scenarios', () => {
    it('returns 400 for missing required fields', async () => {
      const res = await request(app)
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 100 }); // missing walletId and currency
      expect(res.status).toBe(400);
    });

    it('returns 422 for invalid (non-existent) wallet', async () => {
      const res = await request(app)
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ walletId: 'non-existent-wallet', amount: 100, currency: 'USD' });
      expect(res.status).toBe(422);
    });
  });

  describe('Auth scenarios', () => {
    it('returns 401 when no token', async () => {
      const res = await request(app)
        .post('/payments')
        .send({ walletId, amount: 100, currency: 'USD' });
      expect(res.status).toBe(401);
    });
  });

  describe('Idempotency', () => {
    it('returns same payment id for duplicate key', async () => {
      const res1 = await request(app)
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .set('x-idempotency-key', 'bb-idem-dup')
        .send({ walletId, amount: 99, currency: 'USD' });

      const res2 = await request(app)
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .set('x-idempotency-key', 'bb-idem-dup')
        .send({ walletId, amount: 99, currency: 'USD' });

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res1.body.id).toBe(res2.body.id);
    });
  });

  describe('Refund scenarios', () => {
    it('refunds a completed payment', async () => {
      const createRes = await request(app)
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ walletId, amount: 300, currency: 'USD' });
      expect(createRes.body.status).toBe('completed');

      const refundRes = await request(app)
        .post(`/payments/${createRes.body.id}/refund`)
        .set('Authorization', `Bearer ${token}`);
      expect(refundRes.status).toBe(200);
      expect(refundRes.body.status).toBe('refunded');
    });

    it('returns 422 when refunding a non-completed payment', async () => {
      mockFraudCheck.mockResolvedValueOnce({ approved: false, riskScore: 99, reason: 'Blocked' });

      const createRes = await request(app)
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ walletId, amount: 300, currency: 'USD' });
      expect(createRes.body.status).toBe('failed');

      const refundRes = await request(app)
        .post(`/payments/${createRes.body.id}/refund`)
        .set('Authorization', `Bearer ${token}`);
      expect(refundRes.status).toBe(422);
    });
  });
});
