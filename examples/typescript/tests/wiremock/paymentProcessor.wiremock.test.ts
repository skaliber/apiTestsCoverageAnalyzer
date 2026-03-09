import nock from 'nock';
import { paymentProcessor } from '../../src/external/paymentProcessor';

const PROCESSOR_URL = 'http://payment-processor.internal';

afterEach(() => {
  nock.cleanAll();
});

describe('paymentProcessor (WireMock / nock)', () => {
  it('successful charge returns processorReference', async () => {
    nock(PROCESSOR_URL)
      .post('/v1/charge')
      .reply(200, { processorReference: 'ref-success-001', status: 'success' });

    const result = await paymentProcessor.charge({
      amount: 100,
      currency: 'USD',
      reference: 'payment-001',
    });

    expect(result.status).toBe('success');
    expect(result.processorReference).toBe('ref-success-001');
  });

  it('processor returns failed status', async () => {
    nock(PROCESSOR_URL)
      .post('/v1/charge')
      .reply(200, { processorReference: '', status: 'failed', message: 'Card declined' });

    const result = await paymentProcessor.charge({
      amount: 500,
      currency: 'EUR',
      reference: 'payment-002',
    });

    expect(result.status).toBe('failed');
    expect(result.message).toBe('Card declined');
  });

  it('processor returns 500 → error thrown', async () => {
    nock(PROCESSOR_URL)
      .post('/v1/charge')
      .reply(500, { message: 'Internal server error' });

    await expect(
      paymentProcessor.charge({ amount: 100, currency: 'USD', reference: 'payment-003' })
    ).rejects.toThrow();
  });

  it('processor connection error → error thrown', async () => {
    nock(PROCESSOR_URL)
      .post('/v1/charge')
      .replyWithError('connect ECONNREFUSED');

    await expect(
      paymentProcessor.charge({ amount: 100, currency: 'USD', reference: 'payment-004' })
    ).rejects.toThrow();
  });
});
