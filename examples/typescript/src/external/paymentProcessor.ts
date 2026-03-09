import axios from 'axios';

const PROCESSOR_URL = process.env.PAYMENT_PROCESSOR_URL || 'http://payment-processor.internal';

export interface ChargeRequest {
  amount: number;
  currency: string;
  reference: string;
}

export interface ChargeResponse {
  processorReference: string;
  status: 'success' | 'failed';
  message?: string;
}

export const paymentProcessor = {
  async charge(req: ChargeRequest): Promise<ChargeResponse> {
    const response = await axios.post<ChargeResponse>(`${PROCESSOR_URL}/v1/charge`, req, {
      timeout: 5000,
    });
    return response.data;
  },
};
