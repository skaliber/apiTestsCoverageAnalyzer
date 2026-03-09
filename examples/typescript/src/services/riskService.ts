import { Wallet } from '../types';

/** Daily outbound transaction limit per wallet (not per user) in the wallet's native currency units */
const DAILY_LIMIT = 10_000;
/** Minimum funding amount in the wallet's native currency units */
const MIN_FUND_AMOUNT = 1;

export class RiskError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'RiskError';
  }
}

export const riskService = {
  checkMinimumFunding(amount: number): void {
    if (amount < MIN_FUND_AMOUNT) {
      throw new RiskError('BELOW_MIN_FUND', `Minimum funding amount is $${MIN_FUND_AMOUNT}`);
    }
  },

  checkSufficientBalance(wallet: Wallet, amount: number): void {
    if (wallet.balance < amount) {
      throw new RiskError('INSUFFICIENT_FUNDS', `Insufficient funds: balance is ${wallet.balance}, requested ${amount}`);
    }
  },

  checkDailyLimit(currentDailyTotal: number, amount: number): void {
    if (currentDailyTotal + amount > DAILY_LIMIT) {
      throw new RiskError('DAILY_LIMIT_EXCEEDED', `Daily transaction limit of $${DAILY_LIMIT} would be exceeded`);
    }
  },

  checkWalletActive(wallet: Wallet): void {
    if (wallet.status === 'frozen') {
      throw new RiskError('WALLET_FROZEN', `Wallet ${wallet.id} is frozen`);
    }
    if (wallet.status === 'closed') {
      throw new RiskError('WALLET_CLOSED', `Wallet ${wallet.id} is closed`);
    }
  },

  checkCurrencyMatch(walletA: Wallet, walletB: Wallet): void {
    if (walletA.currency !== walletB.currency) {
      throw new RiskError('CURRENCY_MISMATCH', `Currency mismatch: ${walletA.currency} vs ${walletB.currency}`);
    }
  },
};
