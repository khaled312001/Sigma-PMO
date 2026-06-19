import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Repository } from 'typeorm';

import { Role } from '../auth/roles.enum';
import { AuditLog } from './audit-log.entity';

interface AuthedRequest {
  method?: string;
  originalUrl?: string;
  url?: string;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
  socket?: { remoteAddress?: string };
  user?: { id?: string; email?: string; role?: Role; companyId?: string | null };
  companyId?: string | null;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Always-on platform audit. Records one `AuditLog` row for every
 * state-changing request and every login attempt — actor, company, action,
 * method, path, and resulting HTTP status. Reads are not individually logged
 * (ingestion provenance already traces data lineage); request bodies are never
 * stored, so passwords/secrets never reach the log. Writes are fire-and-forget
 * and fully swallowed on error so auditing can never break a request.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(@InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest<AuthedRequest>();
    const method = (req.method ?? 'GET').toUpperCase();
    const path = String(req.originalUrl ?? req.url ?? '').split('?')[0];
    const isLogin = path.endsWith('/auth/login');

    // Audit scope: every mutation + every authentication attempt. Skip reads.
    if (!isLogin && !MUTATING.has(method)) return next.handle();

    const finalize = (statusCode: number, ok: boolean): void => {
      const action = isLogin
        ? ok
          ? 'auth.login'
          : 'auth.login.failed'
        : `http.${method.toLowerCase()}`;
      // For a login, the only safe field from the body is the attempted email.
      const attemptedEmail = isLogin ? (req.body?.email as string | undefined) : undefined;
      void this.record(req, { action, method, path, statusCode, attemptedEmail });
    };

    return next.handle().pipe(
      tap(() => finalize(http.getResponse<{ statusCode?: number }>()?.statusCode ?? 200, true)),
      catchError((err: { status?: number }) => {
        finalize(typeof err?.status === 'number' ? err.status : 500, false);
        return throwError(() => err);
      }),
    );
  }

  private async record(
    req: AuthedRequest,
    info: { action: string; method: string; path: string; statusCode: number; attemptedEmail?: string },
  ): Promise<void> {
    try {
      const fwd = req.headers?.['x-forwarded-for'];
      const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress || null;
      await this.audit.insert({
        companyId: req.user?.companyId ?? req.companyId ?? null,
        actorUserId: req.user?.id ?? null,
        actorEmail: req.user?.email ?? info.attemptedEmail ?? null,
        actorRole: req.user?.role ?? null,
        action: info.action,
        method: info.method,
        path: info.path.slice(0, 512),
        statusCode: info.statusCode,
        ip: ip ? String(ip).slice(0, 64) : null,
        meta: info.attemptedEmail && !req.user ? { attemptedEmail: info.attemptedEmail } : null,
      });
    } catch (err) {
      // Auditing must never break the request path.
      this.logger.warn(`audit write skipped: ${(err as Error).message}`);
    }
  }
}
