import axios from 'axios';

const FRAUD_URL = process.env.FRAUD_ENGINE_URL || 'http://fraud-engine.internal';

export interface FraudCheckRequest {
  userId: string;
  amount: number;
  currency: string;
  walletId: string;
}

export interface FraudCheckResponse {
  approved: boolean;
  riskScore: number;
  reason?: string;
}

export const fraudEngine = {
  async check(req: FraudCheckRequest): Promise<FraudCheckResponse> {
    const response = await axios.post<FraudCheckResponse>(`${FRAUD_URL}/v1/check`, req, {
      timeout: 3000,
    });
    return response.data;
  },
};
