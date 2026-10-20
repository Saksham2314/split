import type { ErrorRequestHandler } from 'express';
import { HttpError } from '../lib/errors.js';

// Express 5 forwards errors thrown in (async) handlers to this middleware automatically.
// Known errors become clean JSON responses; anything unexpected is logged in full
// but the client only sees a generic 500, so internals (SQL, stack traces) never leak.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { message: err.message, details: err.details } });
    return;
  }
  // Malformed JSON body or oversize payload from express.json()
  if (typeof err === 'object' && err !== null && 'type' in err && 'status' in err) {
    const status = Number(err.status);
    if (status >= 400 && status < 500) {
      res.status(status).json({ error: { message: 'Invalid request body' } });
      return;
    }
  }
  req.log.error({ err }, 'unhandled error');
  res.status(500).json({ error: { message: 'Internal server error' } });
};
