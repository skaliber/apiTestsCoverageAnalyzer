import { Router, Request, Response } from 'express';
import { paymentService, PaymentNotFoundError, PaymentError, RiskError } from '../services/paymentService';
import { authMiddleware } from '../middleware/auth';
import { validateBody, validatePositiveAmount } from '../middleware/validation';

const router = Router();

router.post('/', authMiddleware, validateBody(['walletId', 'amount', 'currency']), validatePositiveAmount, async (req: Request, res: Response) => {
  try {
    const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;
    const payment = await paymentService.createPayment(
      { ...req.body, idempotencyKey },
      req.user!.userId
    );
    return res.status(201).json(payment);
  } catch (err) {
    if (err instanceof RiskError) return res.status(422).json({ error: err.message, code: err.code });
    throw err;
  }
});

router.get('/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const payment = paymentService.getPayment(req.params.id);
    return res.json(payment);
  } catch (err) {
    if (err instanceof PaymentNotFoundError) return res.status(404).json({ error: err.message });
    throw err;
  }
});

router.post('/:id/refund', authMiddleware, async (req: Request, res: Response) => {
  try {
    const payment = await paymentService.refundPayment(req.params.id);
    return res.json(payment);
  } catch (err) {
    if (err instanceof PaymentNotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof PaymentError) return res.status(422).json({ error: err.message, code: err.code });
    throw err;
  }
});

export default router;
