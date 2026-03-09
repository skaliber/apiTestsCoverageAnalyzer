import { walletService, WalletNotFoundError, RiskError } from '../../src/services/walletService';
import { walletRepository } from '../../src/repositories/walletRepository';
import { transactionRepository } from '../../src/repositories/transactionRepository';

describe('walletService', () => {
  beforeEach(() => {
    walletRepository.clear();
    transactionRepository.clear();
  });

  describe('createWallet', () => {
    it('returns wallet with correct fields', () => {
      const wallet = walletService.createWallet('user-1', 'USD');
      expect(wallet.id).toBeDefined();
      expect(wallet.userId).toBe('user-1');
      expect(wallet.currency).toBe('USD');
      expect(wallet.balance).toBe(0);
      expect(wallet.status).toBe('active');
      expect(wallet.createdAt).toBeInstanceOf(Date);
      expect(wallet.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('fund', () => {
    it('adds to balance and returns transaction', () => {
      const wallet = walletService.createWallet('user-1', 'USD');
      const { wallet: funded, transaction } = walletService.fund(wallet.id, 100, 'top-up');
      expect(funded.balance).toBe(100);
      expect(transaction.type).toBe('fund');
      expect(transaction.amount).toBe(100);
      expect(transaction.walletId).toBe(wallet.id);
      expect(transaction.description).toBe('top-up');
    });

    it('fails with BELOW_MIN_FUND for amount < 1', () => {
      const wallet = walletService.createWallet('user-1', 'USD');
      expect(() => walletService.fund(wallet.id, 0.5)).toThrow(RiskError);
      try {
        walletService.fund(wallet.id, 0.5);
        fail('Expected RiskError');
      } catch (err) {
        expect(err).toBeInstanceOf(RiskError);
        expect((err as RiskError).code).toBe('BELOW_MIN_FUND');
      }
    });
  });

  describe('debit', () => {
    it('reduces balance', () => {
      const wallet = walletService.createWallet('user-1', 'USD');
      walletService.fund(wallet.id, 200);
      const { wallet: debited, transaction } = walletService.debit(wallet.id, 50);
      expect(debited.balance).toBe(150);
      expect(transaction.type).toBe('debit');
      expect(transaction.amount).toBe(50);
    });

    it('fails with INSUFFICIENT_FUNDS when balance too low', () => {
      const wallet = walletService.createWallet('user-1', 'USD');
      walletService.fund(wallet.id, 10);
      try {
        walletService.debit(wallet.id, 100);
        fail('Expected RiskError');
      } catch (err) {
        expect(err).toBeInstanceOf(RiskError);
        expect((err as RiskError).code).toBe('INSUFFICIENT_FUNDS');
      }
    });
  });

  describe('transfer', () => {
    it('moves funds between wallets', () => {
      const from = walletService.createWallet('user-1', 'USD');
      const to = walletService.createWallet('user-2', 'USD');
      walletService.fund(from.id, 500);
      const result = walletService.transfer(from.id, to.id, 200);
      expect(result.from.balance).toBe(300);
      expect(result.to.balance).toBe(200);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].type).toBe('transfer_out');
      expect(result.transactions[1].type).toBe('transfer_in');
    });
  });

  describe('freeze / unfreeze', () => {
    it('freeze changes status to frozen', () => {
      const wallet = walletService.createWallet('user-1', 'USD');
      const frozen = walletService.freeze(wallet.id);
      expect(frozen.status).toBe('frozen');
    });

    it('unfreeze changes status back to active', () => {
      const wallet = walletService.createWallet('user-1', 'USD');
      walletService.freeze(wallet.id);
      const active = walletService.unfreeze(wallet.id);
      expect(active.status).toBe('active');
    });

    it('freeze throws RiskError on closed wallet', () => {
      const wallet = walletService.createWallet('user-1', 'USD');
      walletService.closeWallet(wallet.id);
      expect(() => walletService.freeze(wallet.id)).toThrow(RiskError);
    });
  });

  describe('getWallet', () => {
    it('throws WalletNotFoundError for unknown id', () => {
      expect(() => walletService.getWallet('non-existent')).toThrow(WalletNotFoundError);
    });
  });
});
