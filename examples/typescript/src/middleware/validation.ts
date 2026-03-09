import { Request, Response, NextFunction } from 'express';

export function validateBody(fields: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const field of fields) {
      if (req.body[field] === undefined || req.body[field] === null) {
        res.status(400).json({ error: `Missing required field: ${field}` });
        return;
      }
    }
    next();
  };
}

export function validatePositiveAmount(req: Request, res: Response, next: NextFunction): void {
  const { amount } = req.body;
  if (typeof amount !== 'number' || amount <= 0) {
    res.status(400).json({ error: 'amount must be a positive number' });
    return;
  }
  next();
}
