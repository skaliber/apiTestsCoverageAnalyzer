import express from 'express';
import rateLimit from 'express-rate-limit';
import walletRoutes from './routes/wallets';
import paymentRoutes from './routes/payments';
import transactionRoutes from './routes/transactions';

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

export function createApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use(apiLimiter);

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/wallets', walletRoutes);
  app.use('/payments', paymentRoutes);
  app.use('/transactions', transactionRoutes);

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
