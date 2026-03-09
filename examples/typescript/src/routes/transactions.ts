import { Router, Request, Response } from 'express';
import { transactionRepository } from '../repositories/transactionRepository';
import { walletRepository } from '../repositories/walletRepository';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, (req: Request, res: Response) => {
  const { walletId } = req.query;
  if (walletId) {
    const wallet = walletRepository.findById(walletId as string);
    if (!wallet || wallet.userId !== req.user!.userId) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    return res.json(transactionRepository.findByWalletId(walletId as string));
  }
  const userWallets = walletRepository.findByUserId(req.user!.userId);
  const walletIds = new Set(userWallets.map(w => w.id));
  const txs = transactionRepository.findAll().filter(t => walletIds.has(t.walletId));
  return res.json(txs);
});

export default router;
