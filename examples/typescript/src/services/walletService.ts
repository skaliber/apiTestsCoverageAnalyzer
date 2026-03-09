import { walletRepository } from '../repositories/walletRepository';
import { transactionRepository } from '../repositories/transactionRepository';
import { riskService, RiskError } from './riskService';
import { Currency, Wallet, Transaction } from '../types';

export class WalletNotFoundError extends Error {
  constructor(id: string) {
    super(`Wallet not found: ${id}`);
    this.name = 'WalletNotFoundError';
  }
}

export { RiskError };

export const walletService = {
  createWallet(userId: string, currency: Currency): Wallet {
    return walletRepository.create(userId, currency);
  },

  getWallet(id: string): Wallet {
    const wallet = walletRepository.findById(id);
    if (!wallet) throw new WalletNotFoundError(id);
    return wallet;
  },

  listWallets(userId: string): Wallet[] {
    return walletRepository.findByUserId(userId);
  },

  fund(walletId: string, amount: number, description?: string): { wallet: Wallet; transaction: Transaction } {
    const wallet = walletRepository.findById(walletId);
    if (!wallet) throw new WalletNotFoundError(walletId);
    riskService.checkWalletActive(wallet);
    riskService.checkMinimumFunding(amount);

    const updated = walletRepository.update(walletId, { balance: wallet.balance + amount })!;
    const transaction = transactionRepository.create({
      walletId,
      type: 'fund',
      amount,
      currency: wallet.currency,
      description,
    });
    return { wallet: updated, transaction };
  },

  debit(walletId: string, amount: number, description?: string): { wallet: Wallet; transaction: Transaction } {
    const wallet = walletRepository.findById(walletId);
    if (!wallet) throw new WalletNotFoundError(walletId);
    riskService.checkWalletActive(wallet);
    riskService.checkSufficientBalance(wallet, amount);

    const dailyTotal = transactionRepository.getDailyTotal(walletId);
    riskService.checkDailyLimit(dailyTotal, amount);

    const updated = walletRepository.update(walletId, { balance: wallet.balance - amount })!;
    const transaction = transactionRepository.create({
      walletId,
      type: 'debit',
      amount,
      currency: wallet.currency,
      description,
    });
    return { wallet: updated, transaction };
  },

  transfer(fromWalletId: string, toWalletId: string, amount: number, description?: string): { from: Wallet; to: Wallet; transactions: Transaction[] } {
    const fromWallet = walletRepository.findById(fromWalletId);
    if (!fromWallet) throw new WalletNotFoundError(fromWalletId);
    const toWallet = walletRepository.findById(toWalletId);
    if (!toWallet) throw new WalletNotFoundError(toWalletId);

    riskService.checkWalletActive(fromWallet);
    riskService.checkWalletActive(toWallet);
    riskService.checkCurrencyMatch(fromWallet, toWallet);
    riskService.checkSufficientBalance(fromWallet, amount);

    const dailyTotal = transactionRepository.getDailyTotal(fromWalletId);
    riskService.checkDailyLimit(dailyTotal, amount);

    const updatedFrom = walletRepository.update(fromWalletId, { balance: fromWallet.balance - amount })!;
    const updatedTo = walletRepository.update(toWalletId, { balance: toWallet.balance + amount })!;

    const txOut = transactionRepository.create({ walletId: fromWalletId, type: 'transfer_out', amount, currency: fromWallet.currency, description });
    const txIn = transactionRepository.create({ walletId: toWalletId, type: 'transfer_in', amount, currency: toWallet.currency, description });

    return { from: updatedFrom, to: updatedTo, transactions: [txOut, txIn] };
  },

  freeze(walletId: string): Wallet {
    const wallet = walletRepository.findById(walletId);
    if (!wallet) throw new WalletNotFoundError(walletId);
    if (wallet.status === 'closed') throw new RiskError('WALLET_CLOSED', 'Cannot freeze a closed wallet');
    return walletRepository.update(walletId, { status: 'frozen' })!;
  },

  unfreeze(walletId: string): Wallet {
    const wallet = walletRepository.findById(walletId);
    if (!wallet) throw new WalletNotFoundError(walletId);
    if (wallet.status === 'closed') throw new RiskError('WALLET_CLOSED', 'Cannot unfreeze a closed wallet');
    return walletRepository.update(walletId, { status: 'active' })!;
  },

  closeWallet(walletId: string): void {
    const wallet = walletRepository.findById(walletId);
    if (!wallet) throw new WalletNotFoundError(walletId);
    walletRepository.update(walletId, { status: 'closed' });
  },
};
