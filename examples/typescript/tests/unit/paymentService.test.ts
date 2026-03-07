import { paymentService, PaymentError, RiskError } from '../../src/services/paymentService';
import { walletRepository } from '../../src/repositories/walletRepository';
import { transactionRepository } from '../../src/repositories/transactionRepository';

jest.mock('../../src/external/paymentProcessor');
jest.mock('../../src/external/fraudEngine');

import { paymentProcessor } from '../../src/external/paymentProcessor';
import { fraudEngine } from '../../src/external/fraudEngine';

const mockCharge = paymentProcessor.charge as jest.Mock;
const mockFraudCheck = fraudEngine.check as jest.Mock;

describe('paymentService', () => {
  let walletId: string;

  beforeEach(() => {
    walletRepository.clear();
    transactionRepository.clear();
    paymentService.clear();
    jest.clearAllMocks();

    const wallet = walletRepository.create('user-1', 'USD');
    walletId = wallet.id;
    walletRepository.update(walletId, { balance: 1000 });
  });

  describe('createPayment', () => {
    it('returns completed payment when fraud approved and processor succeeds', async () => {
      mockFraudCheck.mockResolvedValue({ approved: true, riskScore: 10 });
      mockCharge.mockResolvedValue({ processorReference: 'proc-ref-123', status: 'success' });

      const payment = await paymentService.createPayment(
        { walletId, amount: 100, currency: 'USD' },
        'user-1'
      );

      expect(payment.status).toBe('completed');
      expect(payment.processorReference).toBe('proc-ref-123');
      expect(payment.amount).toBe(100);
      expect(payment.walletId).toBe(walletId);
    });

    it('returns failed payment when fraud engine blocks', async () => {
      mockFraudCheck.mockResolvedValue({ approved: false, riskScore: 95, reason: 'High risk transaction' });

      const payment = await paymentService.createPayment(
        { walletId, amount: 100, currency: 'USD' },
        'user-1'
      );

      expect(payment.status).toBe('failed');
      expect(payment.failureReason).toBe('High risk transaction');
      expect(mockCharge).not.toHaveBeenCalled();
    });
  });

  describe('refundPayment', () => {
    it('works on completed payment', async () => {
      mockFraudCheck.mockResolvedValue({ approved: true, riskScore: 5 });
      mockCharge.mockResolvedValue({ processorReference: 'ref-456', status: 'success' });

      const payment = await paymentService.createPayment(
        { walletId, amount: 50, currency: 'USD' },
        'user-1'
      );

      const refunded = await paymentService.refundPayment(payment.id);
      expect(refunded.status).toBe('refunded');
    });

    it('throws PaymentError for non-completed payment', async () => {
      mockFraudCheck.mockResolvedValue({ approved: false, riskScore: 90, reason: 'Blocked' });

      const payment = await paymentService.createPayment(
        { walletId, amount: 50, currency: 'USD' },
        'user-1'
      );

      expect(payment.status).toBe('failed');
      await expect(paymentService.refundPayment(payment.id)).rejects.toThrow(PaymentError);
    });
  });
});
