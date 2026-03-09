export type Currency = 'USD' | 'EUR' | 'GBP';
export type WalletStatus = 'active' | 'frozen' | 'closed';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type TransactionType = 'fund' | 'debit' | 'transfer_in' | 'transfer_out' | 'payment';

export interface Wallet {
  id: string;
  userId: string;
  currency: Currency;
  balance: number;
  status: WalletStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Transaction {
  id: string;
  walletId: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  reference?: string;
  description?: string;
  createdAt: Date;
}

export interface Payment {
  id: string;
  walletId: string;
  amount: number;
  currency: Currency;
  status: PaymentStatus;
  idempotencyKey?: string;
  processorReference?: string;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface CreateWalletRequest {
  currency: Currency;
}

export interface FundWalletRequest {
  amount: number;
  description?: string;
}

export interface DebitWalletRequest {
  amount: number;
  description?: string;
}

export interface TransferRequest {
  toWalletId: string;
  amount: number;
  description?: string;
}

export interface CreatePaymentRequest {
  walletId: string;
  amount: number;
  currency: Currency;
  idempotencyKey?: string;
}

export interface AuthUser {
  userId: string;
  role: string;
}
