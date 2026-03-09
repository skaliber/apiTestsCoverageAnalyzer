import { Router, Request, Response } from 'express';
import { walletService, WalletNotFoundError, RiskError } from '../services/walletService';
import { authMiddleware } from '../middleware/auth';
import { validateBody, validatePositiveAmount } from '../middleware/validation';

const router = Router();

router.post('/', authMiddleware, validateBody(['currency']), (req: Request, res: Response) => {
  const { currency } = req.body;
  if (!['USD', 'EUR', 'GBP'].includes(currency)) {
    return res.status(400).json({ error: 'Invalid currency. Must be USD, EUR, or GBP' });
  }
  const wallet = walletService.createWallet(req.user!.userId, currency);
  return res.status(201).json(wallet);
});

router.get('/', authMiddleware, (req: Request, res: Response) => {
  const wallets = walletService.listWallets(req.user!.userId);
  return res.json(wallets);
});

router.get('/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const wallet = walletService.getWallet(req.params.id);
    return res.json(wallet);
  } catch (err) {
    if (err instanceof WalletNotFoundError) return res.status(404).json({ error: err.message });
    throw err;
  }
});

router.patch('/:id/freeze', authMiddleware, (req: Request, res: Response) => {
  try {
    const wallet = walletService.freeze(req.params.id);
    return res.json(wallet);
  } catch (err) {
    if (err instanceof WalletNotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof RiskError) return res.status(422).json({ error: err.message, code: err.code });
    throw err;
  }
});

router.patch('/:id/unfreeze', authMiddleware, (req: Request, res: Response) => {
  try {
    const wallet = walletService.unfreeze(req.params.id);
    return res.json(wallet);
  } catch (err) {
    if (err instanceof WalletNotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof RiskError) return res.status(422).json({ error: err.message, code: err.code });
    throw err;
  }
});

router.delete('/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    walletService.closeWallet(req.params.id);
    return res.status(204).send();
  } catch (err) {
    if (err instanceof WalletNotFoundError) return res.status(404).json({ error: err.message });
    throw err;
  }
});

router.post('/:id/fund', authMiddleware, validatePositiveAmount, (req: Request, res: Response) => {
  try {
    const { amount, description } = req.body;
    const result = walletService.fund(req.params.id, amount, description);
    return res.json(result);
  } catch (err) {
    if (err instanceof WalletNotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof RiskError) return res.status(422).json({ error: err.message, code: err.code });
    throw err;
  }
});

router.post('/:id/debit', authMiddleware, validatePositiveAmount, (req: Request, res: Response) => {
  try {
    const { amount, description } = req.body;
    const result = walletService.debit(req.params.id, amount, description);
    return res.json(result);
  } catch (err) {
    if (err instanceof WalletNotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof RiskError) return res.status(422).json({ error: err.message, code: err.code });
    throw err;
  }
});

router.post('/:id/transfer', authMiddleware, validateBody(['toWalletId', 'amount']), validatePositiveAmount, (req: Request, res: Response) => {
  try {
    const { toWalletId, amount, description } = req.body;
    const result = walletService.transfer(req.params.id, toWalletId, amount, description);
    return res.json(result);
  } catch (err) {
    if (err instanceof WalletNotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof RiskError) return res.status(422).json({ error: err.message, code: err.code });
    throw err;
  }
});

export default router;
