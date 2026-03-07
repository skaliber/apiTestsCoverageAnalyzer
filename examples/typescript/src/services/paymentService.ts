import { v4 as uuidv4 } from 'uuid';
import { Payment, CreatePaymentRequest } from '../types';
import { walletRepository } from '../repositories/walletRepository';
import { transactionRepository } from '../repositories/transactionRepository';
import { paymentProcessor } from '../external/paymentProcessor';
import { fraudEngine } from '../external/fraudEngine';
import { riskService, RiskError } from './riskService';

const paymentStore = new Map<string, Payment>();
const idempotencyStore = new Map<string, string>(); // key -> paymentId

export class PaymentNotFoundError extends Error {
  constructor(id: string) { super(`Payment not found: ${id}`); this.name = 'PaymentNotFoundError'; }
}

export class PaymentError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'PaymentError'; }
}

export { RiskError };

export const paymentService = {
  async createPayment(req: CreatePaymentRequest, userId: string): Promise<Payment> {
    if (req.idempotencyKey) {
      const existingId = idempotencyStore.get(req.idempotencyKey);
      if (existingId) {
        return paymentStore.get(existingId)!;
      }
    }

    const wallet = walletRepository.findById(req.walletId);
    if (!wallet) throw new RiskError('WALLET_NOT_FOUND', `Wallet not found: ${req.walletId}`);
    riskService.checkWalletActive(wallet);
    riskService.checkSufficientBalance(wallet, req.amount);

    const fraudResult = await fraudEngine.check({
      userId,
      amount: req.amount,
      currency: req.currency,
      walletId: req.walletId,
    });

    if (!fraudResult.approved) {
      const payment: Payment = {
        id: uuidv4(),
        walletId: req.walletId,
        amount: req.amount,
        currency: req.currency,
        status: 'failed',
        idempotencyKey: req.idempotencyKey,
        failureReason: fraudResult.reason || 'Fraud check failed',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      paymentStore.set(payment.id, payment);
      if (req.idempotencyKey) idempotencyStore.set(req.idempotencyKey, payment.id);
      return payment;
    }

    const payment: Payment = {
      id: uuidv4(),
      walletId: req.walletId,
      amount: req.amount,
      currency: req.currency,
      status: 'pending',
      idempotencyKey: req.idempotencyKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    paymentStore.set(payment.id, payment);
    if (req.idempotencyKey) idempotencyStore.set(req.idempotencyKey, payment.id);

    try {
      const chargeResult = await paymentProcessor.charge({
        amount: req.amount,
        currency: req.currency,
        reference: payment.id,
      });

      if (chargeResult.status === 'success') {
        const completed: Payment = {
          ...payment,
          status: 'completed',
          processorReference: chargeResult.processorReference,
          updatedAt: new Date(),
          completedAt: new Date(),
        };
        paymentStore.set(payment.id, completed);
        walletRepository.update(req.walletId, { balance: wallet.balance - req.amount });
        transactionRepository.create({
          walletId: req.walletId,
          type: 'payment',
          amount: req.amount,
          currency: req.currency,
          reference: payment.id,
        });
        return completed;
      } else {
        const failed: Payment = { ...payment, status: 'failed', failureReason: chargeResult.message, updatedAt: new Date() };
        paymentStore.set(payment.id, failed);
        return failed;
      }
    } catch (err) {
      const failed: Payment = { ...payment, status: 'failed', failureReason: 'Payment processor unavailable', updatedAt: new Date() };
      paymentStore.set(payment.id, failed);
      return failed;
    }
  },

  getPayment(id: string): Payment {
    const payment = paymentStore.get(id);
    if (!payment) throw new PaymentNotFoundError(id);
    return payment;
  },

  async refundPayment(id: string): Promise<Payment> {
    const payment = paymentStore.get(id);
    if (!payment) throw new PaymentNotFoundError(id);
    if (payment.status !== 'completed') {
      throw new PaymentError('INVALID_STATUS', `Cannot refund payment with status: ${payment.status}`);
    }
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (payment.completedAt && payment.completedAt < thirtyDaysAgo) {
      throw new PaymentError('REFUND_WINDOW_EXPIRED', 'Refund window of 30 days has expired');
    }
    const wallet = walletRepository.findById(payment.walletId);
    if (wallet) {
      walletRepository.update(payment.walletId, { balance: wallet.balance + payment.amount });
    }
    const refunded: Payment = { ...payment, status: 'refunded', updatedAt: new Date() };
    paymentStore.set(id, refunded);
    return refunded;
  },

  clear(): void {
    paymentStore.clear();
    idempotencyStore.clear();
  },
};
