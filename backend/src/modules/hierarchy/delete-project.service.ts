import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { currentCompanyId } from '../../common/tenant/tenant-context';

export interface DeleteProjectResult {
  project: string;
  name: string | null;
  deletedByTable: Record<string, number>;
  totalRows: number;
}

/**
 * Deletes a project node and ALL of its results across every project-keyed table.
 * Discovers the tables dynamically from information_schema (any table with a
 * `projectBusinessKey` or `projectKey` column), so it stays correct as new
 * governance layers are added. Tenant-safe: refuses to touch a project that
 * belongs to another company, and constrains each delete to the caller's
 * `companyId` when that column exists.
 */
@Injectable()
export class DeleteProjectService {
  private readonly logger = new Logger(DeleteProjectService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** Project-keyed (table, column) pairs discovered from the live schema. */
  private async projectKeyedColumns(): Promise<Array<{ tn: string; cn: string }>> {
    return this.ds.query(
      `SELECT TABLE_NAME tn, COLUMN_NAME cn FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME IN ('projectBusinessKey','projectKey')`,
    );
  }

  private async loadProject(key: string): Promise<{ id: string; name: string | null; companyId: string | null }> {
    const proj = (await this.ds.query(
      'SELECT id, name, companyId FROM `project` WHERE businessKey = ? LIMIT 1',
      [key],
    )) as Array<{ id: string; name: string | null; companyId: string | null }>;
    if (!proj.length) throw new NotFoundException(`Project ${key} not found`);
    const companyId = currentCompanyId();
    if (companyId && proj[0].companyId && proj[0].companyId !== companyId) {
      throw new ForbiddenException('Not your project');
    }
    return proj[0];
  }

  /**
   * READ-ONLY footprint: how many rows in each table reference this project —
   * exactly what `deleteProject` would remove. Lets the operator preview the
   * blast radius before confirming a destructive delete.
   */
  async previewProject(businessKey: string): Promise<DeleteProjectResult> {
    const key = (businessKey || '').trim();
    if (!key) throw new NotFoundException('Project businessKey is required');
    const proj = await this.loadProject(key);
    const companyId = currentCompanyId();
    const cols = await this.projectKeyedColumns();
    const byTable: Record<string, number> = {};
    let total = 0;
    for (const { tn, cn } of cols) {
      if (tn === 'project') continue;
      const rows = (await this.ds.query(
        `SELECT COUNT(*) c FROM \`${tn}\` WHERE \`${cn}\` = ?`,
        [key],
      )) as Array<{ c: number }>;
      const n = Number(rows[0]?.c ?? 0);
      if (n > 0) { byTable[tn] = n; total += n; }
    }
    byTable['project'] = 1; total += 1;
    return { project: key, name: proj.name, deletedByTable: byTable, totalRows: total };
  }

  async deleteProject(businessKey: string): Promise<DeleteProjectResult> {
    const key = (businessKey || '').trim();
    if (!key) throw new NotFoundException('Project businessKey is required');
    const proj = await this.loadProject(key);
    const companyId = currentCompanyId();

    // Every table that references a project by key (discovered, not hardcoded).
    const cols = await this.projectKeyedColumns();

    const deletedByTable: Record<string, number> = {};
    let totalRows = 0;

    for (const { tn, cn } of cols) {
      if (tn === 'project') continue; // the node itself is removed last
      const hasCompany = (await this.ds.query(
        `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'companyId' LIMIT 1`,
        [tn],
      )) as unknown[];
      const scoped = hasCompany.length > 0 && companyId;
      const sql = scoped
        ? `DELETE FROM \`${tn}\` WHERE \`${cn}\` = ? AND \`companyId\` = ?`
        : `DELETE FROM \`${tn}\` WHERE \`${cn}\` = ?`;
      const res = await this.ds.query(sql, scoped ? [key, companyId] : [key]);
      const affected = (res?.affectedRows as number) ?? 0;
      if (affected > 0) { deletedByTable[tn] = affected; totalRows += affected; }
    }

    // Finally the project node.
    const pres = await this.ds.query(
      companyId
        ? 'DELETE FROM `project` WHERE businessKey = ? AND (companyId = ? OR companyId IS NULL)'
        : 'DELETE FROM `project` WHERE businessKey = ?',
      companyId ? [key, companyId] : [key],
    );
    const pAffected = (pres?.affectedRows as number) ?? 0;
    if (pAffected > 0) { deletedByTable['project'] = pAffected; totalRows += pAffected; }

    this.logger.warn(`Project ${key} deleted: ${totalRows} rows across ${Object.keys(deletedByTable).length} tables (company=${companyId ?? 'global'}).`);
    return { project: key, name: proj.name, deletedByTable, totalRows };
  }
}
