import { Controller, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { currentCompanyId } from '../../common/tenant/tenant-context';
import { RequiresCapability } from '../auth/require-capability.decorator';
import { AuditLog } from './audit-log.entity';

/**
 * Read-only audit trail. Company-scoped by the tenant context: a company admin
 * (`canManageRoles`) sees only their own company's entries; the platform
 * super-admin (companyId = null) sees every entry across all companies.
 */
@Controller('audit')
export class AuditController {
  constructor(@InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>) {}

  @Get()
  @RequiresCapability('canManageRoles')
  async list(@Query('limit') limit?: string, @Query('action') action?: string): Promise<AuditLog[]> {
    const take = Math.min(Math.max(Number.parseInt(limit ?? '100', 10) || 100, 1), 500);
    const cid = currentCompanyId();
    const where: Record<string, unknown> = {};
    if (cid) where.companyId = cid; // null => platform super-admin sees all
    if (action) where.action = action;
    return this.audit.find({ where, order: { createdAt: 'DESC' }, take });
  }
}
