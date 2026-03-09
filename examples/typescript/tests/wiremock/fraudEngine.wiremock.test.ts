import nock from 'nock';
import { fraudEngine } from '../../src/external/fraudEngine';

const FRAUD_URL = 'http://fraud-engine.internal';

afterEach(() => {
  nock.cleanAll();
});

describe('fraudEngine (WireMock / nock)', () => {
  it('fraud check returns approved: true', async () => {
    nock(FRAUD_URL)
      .post('/v1/check')
      .reply(200, { approved: true, riskScore: 12 });

    const result = await fraudEngine.check({
      userId: 'user-1',
      amount: 100,
      currency: 'USD',
      walletId: 'wallet-1',
    });

    expect(result.approved).toBe(true);
    expect(result.riskScore).toBe(12);
  });

  it('fraud check returns approved: false with reason', async () => {
    nock(FRAUD_URL)
      .post('/v1/check')
      .reply(200, { approved: false, riskScore: 95, reason: 'Suspicious activity' });

    const result = await fraudEngine.check({
      userId: 'user-2',
      amount: 9999,
      currency: 'USD',
      walletId: 'wallet-2',
    });

    expect(result.approved).toBe(false);
    expect(result.riskScore).toBe(95);
    expect(result.reason).toBe('Suspicious activity');
  });

  it('fraud engine returns 503 → error thrown', async () => {
    nock(FRAUD_URL)
      .post('/v1/check')
      .reply(503, { message: 'Service unavailable' });

    await expect(
      fraudEngine.check({ userId: 'user-3', amount: 100, currency: 'USD', walletId: 'wallet-3' })
    ).rejects.toThrow();
  });

  it('fraud engine connection error → error thrown', async () => {
    nock(FRAUD_URL)
      .post('/v1/check')
      .replyWithError('connect ECONNREFUSED');

    await expect(
      fraudEngine.check({ userId: 'user-4', amount: 200, currency: 'GBP', walletId: 'wallet-4' })
    ).rejects.toThrow();
  });
});
