import { randomUUID } from 'node:crypto';

import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Honours an inbound `x-request-id` header if present (for upstream proxies
 * that already set one); otherwise generates a UUID v4. The id is echoed
 * back on the response so callers can correlate. pino-http binds it into
 * every log line via the `genReqId` option in `logger.ts`.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
    req.headers[REQUEST_ID_HEADER] = id;
    res.setHeader(REQUEST_ID_HEADER, id);
    next();
  }
}
