import { v4 as uuidv4 } from 'uuid';
import { Wallet, Currency } from '../types';

const store = new Map<string, Wallet>();

export const walletRepository = {
  create(userId: string, currency: Currency): Wallet {
    const wallet: Wallet = {
      id: uuidv4(),
      userId,
      currency,
      balance: 0,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.set(wallet.id, wallet);
    return wallet;
  },

  findById(id: string): Wallet | undefined {
    return store.get(id);
  },

  findByUserId(userId: string): Wallet[] {
    return Array.from(store.values()).filter(w => w.userId === userId);
  },

  update(id: string, updates: Partial<Wallet>): Wallet | undefined {
    const wallet = store.get(id);
    if (!wallet) return undefined;
    const updated = { ...wallet, ...updates, updatedAt: new Date() };
    store.set(id, updated);
    return updated;
  },

  delete(id: string): boolean {
    return store.delete(id);
  },

  clear(): void {
    store.clear();
  },
};
