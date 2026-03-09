import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app';
import { walletRepository } from '../../src/repositories/walletRepository';
import { transactionRepository } from '../../src/repositories/transactionRepository';

const JWT_SECRET = 'test-secret';
const app = createApp();

function makeToken(userId = 'user-test'): string {
  return jwt.sign({ userId, role: 'user' }, JWT_SECRET, { expiresIn: '1h' });
}

describe('Wallets API Integration', () => {
  let token: string;

  beforeEach(() => {
    walletRepository.clear();
    transactionRepository.clear();
    token = makeToken('user-test');
  });

  describe('POST /wallets', () => {
    it('creates wallet and returns 201', async () => {
      const res = await request(app)
        .post('/wallets')
        .set('Authorization', `Bearer ${token}`)
        .send({ currency: 'USD' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.currency).toBe('USD');
      expect(res.body.balance).toBe(0);
      expect(res.body.status).toBe('active');
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).post('/wallets').send({ currency: 'USD' });
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid currency', async () => {
      const res = await request(app)
        .post('/wallets')
        .set('Authorization', `Bearer ${token}`)
        .send({ currency: 'JPY' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /wallets/:id', () => {
    it('returns 404 for unknown wallet id', async () => {
      const res = await request(app)
        .get('/wallets/unknown-id')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it('returns wallet', async () => {
      const createRes = await request(app)
        .post('/wallets')
        .set('Authorization', `Bearer ${token}`)
        .send({ currency: 'EUR' });
      const walletId = createRes.body.id;

      const res = await request(app)
        .get(`/wallets/${walletId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(walletId);
    });
  });

  describe('POST /wallets/:id/fund', () => {
    it('adds funds to wallet', async () => {
      const createRes = await request(app)
        .post('/wallets')
        .set('Authorization', `Bearer ${token}`)
        .send({ currency: 'USD' });
      const walletId = createRes.body.id;

      const res = await request(app)
        .post(`/wallets/${walletId}/fund`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 500 });
      expect(res.status).toBe(200);
      expect(res.body.wallet.balance).toBe(500);
      expect(res.body.transaction.type).toBe('fund');
    });
  });

  describe('POST /wallets/:id/debit', () => {
    it('removes funds from wallet', async () => {
      const createRes = await request(app)
        .post('/wallets')
        .set('Authorization', `Bearer ${token}`)
        .send({ currency: 'USD' });
      const walletId = createRes.body.id;
      await request(app)
        .post(`/wallets/${walletId}/fund`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 300 });

      const res = await request(app)
        .post(`/wallets/${walletId}/debit`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 100 });
      expect(res.status).toBe(200);
      expect(res.body.wallet.balance).toBe(200);
    });

    it('returns 422 with insufficient funds', async () => {
      const createRes = await request(app)
        .post('/wallets')
        .set('Authorization', `Bearer ${token}`)
        .send({ currency: 'USD' });
      const walletId = createRes.body.id;

      const res = await request(app)
        .post(`/wallets/${walletId}/debit`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 9999 });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INSUFFICIENT_FUNDS');
    });
  });

  describe('POST /wallets/:id/transfer', () => {
    it('transfers funds between wallets', async () => {
      const fromRes = await request(app)
        .post('/wallets')
        .set('Authorization', `Bearer ${token}`)
        .send({ currency: 'USD' });
      const fromId = fromRes.body.id;
      await request(app)
        .post(`/wallets/${fromId}/fund`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 1000 });

      const toToken = makeToken('user-2');
      const toRes = await request(app)
        .post('/wallets')
        .set('Authorization', `Bearer ${toToken}`)
        .send({ currency: 'USD' });
      const toId = toRes.body.id;

      const res = await request(app)
        .post(`/wallets/${fromId}/transfer`)
        .set('Authorization', `Bearer ${token}`)
        .send({ toWalletId: toId, amount: 400 });
      expect(res.status).toBe(200);
      expect(res.body.from.balance).toBe(600);
      expect(res.body.to.balance).toBe(400);
    });
  });

  describe('PATCH /wallets/:id/freeze and /unfreeze', () => {
    it('freezes a wallet', async () => {
      const createRes = await request(app)
        .post('/wallets')
        .set('Authorization', `Bearer ${token}`)
        .send({ currency: 'GBP' });
      const walletId = createRes.body.id;

      const res = await request(app)
        .patch(`/wallets/${walletId}/freeze`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('frozen');
    });

    it('unfreezes a wallet', async () => {
      const createRes = await request(app)
        .post('/wallets')
        .set('Authorization', `Bearer ${token}`)
        .send({ currency: 'GBP' });
      const walletId = createRes.body.id;
      await request(app).patch(`/wallets/${walletId}/freeze`).set('Authorization', `Bearer ${token}`);

      const res = await request(app)
        .patch(`/wallets/${walletId}/unfreeze`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('active');
    });
  });

  describe('DELETE /wallets/:id', () => {
    it('closes wallet and returns 204', async () => {
      const createRes = await request(app)
        .post('/wallets')
        .set('Authorization', `Bearer ${token}`)
        .send({ currency: 'USD' });
      const walletId = createRes.body.id;

      const res = await request(app)
        .delete(`/wallets/${walletId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(204);
    });
  });
});
