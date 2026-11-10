import type { RequestHandler } from 'express';
import { newId } from '../lib/ids';

/** Gives every request an ID that appears in logs and in error responses. */
export const requestId: RequestHandler = (req, res, next) => {
  req.requestId = newId('req');
  res.setHeader('X-Request-Id', req.requestId);
  next();
};
