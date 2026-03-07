import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app';
import { walletRepository } from '../../src/repositories/walletRepository';
import { transactionRepository } from '../../src/repositories/transactionRepository';

const JWT_SECRET = 'test-secret';
const app = createApp();

function makeToken(userId = 'bb-user'): string {
  return jwt.sign({ userId, role: 'user' }, JWT_SECRET, { expiresIn: '1h' });
}

describe('Wallets API Blackbox', () => {
  let token: string;

  beforeEach(() => {
    walletRepository.clear();
    transactionRepository.clear();
    token = makeToken('bb-user');
  });

  describe('Positive scenarios', () => {
    it('full lifecycle: create, fund, debit, transfer, freeze, unfreeze, delete', async () => {
      // Create wallet A
      const createA = await request(app)
        .post('/wallets')
        .set('Authorization', `Bearer ${token}`)
        .send({ currency: 'USD' });
      expect(createA.status).toBe(201);
      const walletAId = createA.body.id;

      // Create wallet B (different user)
      const tokenB = makeToken('bb-user-b');
      const createB = await request(app)
        .post('/wallets')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ currency: 'USD' });
      expect(createB.status).toBe(201);
      const walletBId = createB.body.id;

      // Fund wallet A
      const fund = await request(app)
        .post(`/wallets/${walletAId}/fund`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 1000 });
      expect(fund.status).toBe(200);
      expect(fund.body.wallet.balance).toBe(1000);

      // Debit wallet A
      const debit = await request(app)
        .post(`/wallets/${walletAId}/debit`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 200 });
      expect(debit.status).toBe(200);
      expect(debit.body.wallet.balance).toBe(800);

      // Transfer from A to B
      const transfer = await request(app)
        .post(`/wallets/${walletAId}/transfer`)
        .set('Authorization', `Bearer ${token}`)
        .send({ toWalletId: walletBId, amount: 300 });
      expect(transfer.status).toBe(200);
      expect(transfer.body.from.balance).toBe(500);
      expect(transfer.body.to.balance).toBe(300);

      // Freeze wallet A
      const freeze = await request(app)
        .patch(`/wallets/${walletAId}/freeze`)
        .set('Authorization', `Bearer ${token}`);
      expect(freeze.status).toBe(200);
      expect(freeze.body.status).toBe('frozen');

      // Unfreeze wallet A
      const unfreeze = await request(app)
        .patch(`/wallets/${walletAId}/unfreeze`)
        .set('Authorization', `Bearer ${token}`);
      expect(unfreeze.status).toBe(200);
      expect(unfreeze.body.status).toBe('active');

      // Close wallet A
      const close = await request(app)
        .delete(`/wallets/${walletAId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(close.status).toBe(204);
    });
  });

  describe('Negative scenarios', () => {
    it('returns 400 when currency is missing', async () => {
      const res = await request(app)
        .post('/wallets')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for unsupported currency', async () => {
      const res = await request(app)
        .post('/wallets')
        .set('Authorization', `Bearer ${token}`)
        .send({ currency: 'AUD' });
      expect(res.status).toBe(400);
    });

    it('returns 422 for insufficient funds', async () => {
      const createRes = await request(app)
        .post('/wallets')
        .set('Authorization', `Bearer ${token}`)
        .send({ currency: 'USD' });
      const walletId = createRes.body.id;

      const res = await request(app)
        .post(`/wallets/${walletId}/debit`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 500 });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INSUFFICIENT_FUNDS');
    });
  });

  describe('Auth scenarios', () => {
    it('returns 401 when no token provided', async () => {
      const res = await request(app).get('/wallets');
      expect(res.status).toBe(401);
    });

    it('returns 401 for invalid token', async () => {
      const res = await request(app)
        .get('/wallets')
        .set('Authorization', 'Bearer invalid.token.here');
      expect(res.status).toBe(401);
    });
  });

  describe('Boundary values', () => {
    it('funds exactly $1 (minimum amount)', async () => {
      const createRes = await request(app)
        .post('/wallets')
        .set('Authorization', `Bearer ${token}`)
        .send({ currency: 'USD' });
      const walletId = createRes.body.id;

      const res = await request(app)
        .post(`/wallets/${walletId}/fund`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 1 });
      expect(res.status).toBe(200);
      expect(res.body.wallet.balance).toBe(1);
    });

    it('debits exactly the full balance', async () => {
      const createRes = await request(app)
        .post('/wallets')
        .set('Authorization', `Bearer ${token}`)
        .send({ currency: 'USD' });
      const walletId = createRes.body.id;
      await request(app)
        .post(`/wallets/${walletId}/fund`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 250 });

      const res = await request(app)
        .post(`/wallets/${walletId}/debit`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 250 });
      expect(res.status).toBe(200);
      expect(res.body.wallet.balance).toBe(0);
    });
  });
});
