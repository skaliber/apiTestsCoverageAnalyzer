import { v4 as uuidv4 } from 'uuid';
import { Transaction, TransactionType, Currency } from '../types';

const store = new Map<string, Transaction>();

export const transactionRepository = {
  create(params: {
    walletId: string;
    type: TransactionType;
    amount: number;
    currency: Currency;
    reference?: string;
    description?: string;
  }): Transaction {
    const tx: Transaction = {
      id: uuidv4(),
      ...params,
      createdAt: new Date(),
    };
    store.set(tx.id, tx);
    return tx;
  },

  findByWalletId(walletId: string): Transaction[] {
    return Array.from(store.values())
      .filter(t => t.walletId === walletId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  getDailyTotal(walletId: string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from(store.values())
      .filter(t => t.walletId === walletId && t.createdAt >= today && (t.type === 'debit' || t.type === 'transfer_out' || t.type === 'payment'))
      .reduce((sum, t) => sum + t.amount, 0);
  },

  findAll(): Transaction[] {
    return Array.from(store.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  clear(): void {
    store.clear();
  },
};
