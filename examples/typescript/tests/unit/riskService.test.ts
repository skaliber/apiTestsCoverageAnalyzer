import { riskService, RiskError } from '../../src/services/riskService';
import { Wallet } from '../../src/types';

function makeWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: 'wallet-1',
    userId: 'user-1',
    currency: 'USD',
    balance: 500,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('riskService', () => {
  describe('checkMinimumFunding', () => {
    it('passes for amount >= 1', () => {
      expect(() => riskService.checkMinimumFunding(1)).not.toThrow();
      expect(() => riskService.checkMinimumFunding(100)).not.toThrow();
    });

    it('throws RiskError for amount < 1', () => {
      expect(() => riskService.checkMinimumFunding(0)).toThrow(RiskError);
      expect(() => riskService.checkMinimumFunding(0.5)).toThrow(RiskError);
      try {
        riskService.checkMinimumFunding(0);
      } catch (err) {
        expect((err as RiskError).code).toBe('BELOW_MIN_FUND');
      }
    });
  });

  describe('checkSufficientBalance', () => {
    it('passes when balance >= amount', () => {
      const wallet = makeWallet({ balance: 100 });
      expect(() => riskService.checkSufficientBalance(wallet, 100)).not.toThrow();
      expect(() => riskService.checkSufficientBalance(wallet, 50)).not.toThrow();
    });

    it('throws for insufficient funds', () => {
      const wallet = makeWallet({ balance: 10 });
      expect(() => riskService.checkSufficientBalance(wallet, 100)).toThrow(RiskError);
      try {
        riskService.checkSufficientBalance(wallet, 100);
      } catch (err) {
        expect((err as RiskError).code).toBe('INSUFFICIENT_FUNDS');
      }
    });
  });

  describe('checkWalletActive', () => {
    it('passes for active wallet', () => {
      const wallet = makeWallet({ status: 'active' });
      expect(() => riskService.checkWalletActive(wallet)).not.toThrow();
    });

    it('throws for frozen wallet', () => {
      const wallet = makeWallet({ status: 'frozen' });
      expect(() => riskService.checkWalletActive(wallet)).toThrow(RiskError);
      try {
        riskService.checkWalletActive(wallet);
      } catch (err) {
        expect((err as RiskError).code).toBe('WALLET_FROZEN');
      }
    });

    it('throws for closed wallet', () => {
      const wallet = makeWallet({ status: 'closed' });
      expect(() => riskService.checkWalletActive(wallet)).toThrow(RiskError);
      try {
        riskService.checkWalletActive(wallet);
      } catch (err) {
        expect((err as RiskError).code).toBe('WALLET_CLOSED');
      }
    });
  });
});
