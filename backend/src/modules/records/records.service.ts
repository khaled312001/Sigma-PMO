import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { currentCompanyId } from '../../common/tenant/tenant-context';
import { AuditLog } from '../audit/audit-log.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../canonical/entities';
import { LegalHoldService } from '../legal-hold/legal-hold.service';

/**
 * Generic, tenant-safe delete/edit of ANY result row across the platform
 * (Mr. Ayham, 2026-06-20: "ability to delete or edit any results in all pages").
 * Operates on a WHITELIST of result tables only, verifies the row belongs to the
 * caller's company, edits only safe whitelisted columns that actually exist, and
 * audits every change. One reusable mechanism the whole UI calls.
 */

/** table → friendly label. Only these result tables may be edited/deleted here. */
export const RESULT_TABLES: Record<string, string> = {
  project_record: 'Project record',
  risk: 'Risk',
  claim: 'Claim',
  communication: 'Communication',
  governance_decision: 'Governance decision',
  alert: 'Alert',
  evidence_item: 'Evidence finding',
  evidence_room: 'Dispute data room',
  qs_finding: 'QS finding',
  procurement_finding: 'Procurement finding',
  procurement_package: 'Procurement package',
  cost_estimate: 'Cost estimate',
  feasibility_assessment: 'Feasibility assessment',
  investment_opportunity: 'Investment opportunity',
  funding_facility: 'Funding facility',
  safety_record: 'Safety record',
  quality_record: 'Quality / NCR record',
  fire_safety_record: 'Fire-safety record',
  authority_submission: 'Authority submission',
  utility_connection: 'Utility connection',
  operational_readiness_item: 'Operational-readiness item',
  authority_matrix_entry: 'Authority matrix entry',
  contract_clause_rule: 'Contract clause rule',
  lessons_learned: 'Lesson learned',
  letter: 'Letter',
  clash_item: 'Clash',
  monthly_report: 'Report',
  output_comparison: 'Comparison',
  scenario: 'Scenario',
  input_proposal: 'Input proposal',
};

/** Columns safe to edit generically (only applied when present on the table). */
const EDITABLE_COLS = [
  'label', 'title', 'value', 'status', 'notes', 'description', 'summary', 'details',
  'severity', 'amount', 'party', 'category', 'refNumber', 'subject', 'body',
  'criticality', 'effectiveDate', 'raisedDate', 'dueDate', 'actionDueDate',
  'correctedValue', 'responsibleRole', 'explanation', 'mitigation', 'recommendation',
];

@Injectable()
export class RecordsService {
  private readonly logger = new Logger(RecordsService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
    private readonly legalHold: LegalHoldService,
  ) {}

  listTables(): Array<{ table: string; label: string }> {
    return Object.entries(RESULT_TABLES).map(([table, label]) => ({ table, label }));
  }

  private assertTable(table: string): void {
    if (!RESULT_TABLES[table]) throw new BadRequestException(`Table "${table}" is not an editable result table.`);
  }

  private async columns(table: string): Promise<Set<string>> {
    const rows = (await this.ds.query(
      `SELECT COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
    )) as Array<{ c: string }>;
    return new Set(rows.map((r) => r.c));
  }

  /** Load a row and enforce tenant ownership (when the table is company-scoped). */
  private async loadRow(table: string, id: string, cols: Set<string>): Promise<Record<string, unknown>> {
    const rows = (await this.ds.query(`SELECT * FROM \`${table}\` WHERE \`id\` = ? LIMIT 1`, [id])) as Array<Record<string, unknown>>;
    if (!rows.length) throw new NotFoundException(`${RESULT_TABLES[table]} not found`);
    const companyId = currentCompanyId();
    if (cols.has('companyId') && companyId && rows[0].companyId && rows[0].companyId !== companyId) {
      throw new ForbiddenException('Not your record');
    }
    return rows[0];
  }

  async deleteRecord(table: string, id: string, caller: User): Promise<{ deleted: boolean; table: string; id: string }> {
    this.assertTable(table);
    const cols = await this.columns(table);
    const row = await this.loadRow(table, id, cols);
    const label = (row.label ?? row.title ?? row.subject ?? null) as string | null;
    const projectKey = (row.projectBusinessKey ?? row.projectKey ?? null) as string | null;

    // Legal hold: refuse to hard-delete a row preserved for a dispute/claim
    // (Mr. Ayham acceptance #6/#12). The hold must be released by a privileged
    // user first; the attempt is recorded in the custody ledger.
    if (await this.legalHold.isHeld(table, id)) {
      await this.legalHold.logCustody({
        targetTable: table, targetId: id, event: 'delete_blocked', projectBusinessKey: projectKey,
        actorEmail: caller.email, actorRole: caller.role, detail: { label },
      });
      throw new ForbiddenException(
        'This record is under an active legal hold and cannot be deleted. Release the hold (a high-privilege, audited action) before deleting.',
      );
    }

    await this.ds.query(`DELETE FROM \`${table}\` WHERE \`id\` = ?`, [id]);
    await this.writeAudit(caller, table, id, 'record.deleted', { label });
    await this.legalHold.logCustody({
      targetTable: table, targetId: id, event: 'deleted', projectBusinessKey: projectKey,
      actorEmail: caller.email, actorRole: caller.role, detail: { label },
    });
    return { deleted: true, table, id };
  }

  async editRecord(table: string, id: string, patch: Record<string, unknown>, caller: User): Promise<Record<string, unknown>> {
    this.assertTable(table);
    const cols = await this.columns(table);
    await this.loadRow(table, id, cols);
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const key of EDITABLE_COLS) {
      if (key in patch && cols.has(key)) {
        let v = patch[key];
        if (v !== null && typeof v === 'object') v = JSON.stringify(v); // json columns
        sets.push(`\`${key}\` = ?`);
        params.push(v as unknown);
      }
    }
    if (!sets.length) throw new BadRequestException('No editable fields supplied.');
    params.push(id);
    await this.ds.query(`UPDATE \`${table}\` SET ${sets.join(', ')} WHERE \`id\` = ?`, params);
    await this.writeAudit(caller, table, id, 'record.edited', { fields: sets.map((s) => s.split(' ')[0].replace(/`/g, '')) });
    const updated = (await this.ds.query(`SELECT * FROM \`${table}\` WHERE \`id\` = ? LIMIT 1`, [id])) as Array<Record<string, unknown>>;
    return updated[0] ?? {};
  }

  private async writeAudit(caller: User, table: string, id: string, action: string, meta: Record<string, unknown>): Promise<void> {
    try {
      await this.audit.save(this.audit.create({
        companyId: caller.companyId ?? currentCompanyId(), actorUserId: caller.id, actorEmail: caller.email, actorRole: caller.role,
        action, method: action === 'record.deleted' ? 'DELETE' : 'PATCH', path: `/records/${table}/${id}`, statusCode: 200, ip: null,
        meta: { table, id, ...meta },
      }));
    } catch (err) { this.logger.warn(`Records audit skipped: ${(err as Error).message}`); }
  }
}
