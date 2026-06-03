import { LoggerModule, Params } from 'nestjs-pino';

import { REQUEST_ID_HEADER } from './request-id.middleware';

/**
 * pino-based structured logger configured for development (pretty-printed)
 * and production (single-line JSON). The HTTP middleware emits one log
 * line per request, automatically bound to the `x-request-id` set by
 * RequestIdMiddleware so every line is correlatable.
 */
export function buildLoggerModule() {
  const isProd = process.env.NODE_ENV === 'production';
  const params: Params = {
    pinoHttp: {
      level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
      genReqId: (req) => {
        const id = req.headers[REQUEST_ID_HEADER];
        return typeof id === 'string' ? id : '';
      },
      customLogLevel(_req, res, err) {
        if (err) return 'error';
        if (res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      customSuccessMessage(req, res) {
        return `${req.method} ${req.url} → ${res.statusCode}`;
      },
      customErrorMessage(req, res, err) {
        return `${req.method} ${req.url} → ${res.statusCode} (${err.message})`;
      },
      // Production format = ndjson; dev format = colourised single line.
      transport: isProd
        ? undefined
        : {
            target: 'pino-pretty',
            options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname,req,res,responseTime' },
          },
      // Drop noisy verbose fields from request log (we already log them in custom messages).
      serializers: {
        req: (req) => ({ method: req.method, url: req.url, reqId: req.id }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    },
  };
  return LoggerModule.forRoot(params);
}
