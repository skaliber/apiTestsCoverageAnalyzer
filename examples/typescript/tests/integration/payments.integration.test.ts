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

function makeToken(userId = 'user-test'): string {
  return jwt.sign({ userId, role: 'user' }, JWT_SECRET, { expiresIn: '1h' });
}

describe('Payments API Integration', () => {
  let token: string;
  let walletId: string;

  beforeEach(async () => {
    walletRepository.clear();
    transactionRepository.clear();
    paymentService.clear();
    jest.clearAllMocks();

    token = makeToken('user-test');
    const wallet = walletRepository.create('user-test', 'USD');
    walletId = wallet.id;
    walletRepository.update(walletId, { balance: 5000 });

    mockFraudCheck.mockResolvedValue({ approved: true, riskScore: 5 });
    mockCharge.mockResolvedValue({ processorReference: 'proc-ref-001', status: 'success' });
  });

  describe('POST /payments', () => {
    it('creates a payment and returns 201', async () => {
      const res = await request(app)
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ walletId, amount: 100, currency: 'USD' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('completed');
    });

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/payments')
        .send({ walletId, amount: 100, currency: 'USD' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /payments/:id', () => {
    it('returns payment', async () => {
      const createRes = await request(app)
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ walletId, amount: 50, currency: 'USD' });
      const paymentId = createRes.body.id;

      const res = await request(app)
        .get(`/payments/${paymentId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(paymentId);
    });

    it('returns 404 for unknown payment', async () => {
      const res = await request(app)
        .get('/payments/unknown-id')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /payments/:id/refund', () => {
    it('refunds a completed payment', async () => {
      const createRes = await request(app)
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ walletId, amount: 200, currency: 'USD' });
      const paymentId = createRes.body.id;

      const res = await request(app)
        .post(`/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('refunded');
    });

    it('returns 404 for non-existent payment', async () => {
      const res = await request(app)
        .post('/payments/non-existent/refund')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('Idempotency', () => {
    it('returns same payment for duplicate idempotency key', async () => {
      const res1 = await request(app)
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .set('x-idempotency-key', 'idem-key-001')
        .send({ walletId, amount: 75, currency: 'USD' });

      const res2 = await request(app)
        .post('/payments')
        .set('Authorization', `Bearer ${token}`)
        .set('x-idempotency-key', 'idem-key-001')
        .send({ walletId, amount: 75, currency: 'USD' });

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res1.body.id).toBe(res2.body.id);
    });
  });
});
