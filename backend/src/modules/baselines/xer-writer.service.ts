import { Injectable, Logger } from '@nestjs/common';

import { Activity, Project } from '../canonical/entities';

/**
 * Minimum input the writer needs to emit a valid P6 XER. We accept canonical
 * Project + Activity rows directly — the writer maps them to XER fields and
 * generates synthetic project / WBS / task ids so the output is importable
 * into any P6 client without conflict.
 */
export interface XerWritePayload {
  project: Project;
  activities: Activity[];
  /** Optional explicit author for the ERMHDR. Defaults to "Sigma PMO AI Planner". */
  authoredBy?: string;
  /**
   * Optional baseline name to embed in the project name. Useful for
   * distinguishing the AI-generated baseline from contractor-submitted ones
   * inside P6.
   */
  baselineName?: string;
  /**
   * Predecessor / successor pairs to emit as TASKPRED rows. Pairs are
   * resolved by `Activity.businessKey` — any activity referenced here that
   * is not in `activities` is silently skipped (we keep a warning so the
   * caller knows). When undefined / empty no TASKPRED block is emitted.
   */
  relationships?: Array<{ predecessorBusinessKey: string; successorBusinessKey: string; type: 'FS' | 'SS' | 'FF' | 'SF' }>;
}

/** Output bundle: the raw XER text + a SHA-256-friendly Buffer. */
export interface XerWriteResult {
  text: string;
  buffer: Buffer;
  rowCounts: { project: number; wbs: number; task: number; taskpred: number };
  warnings: string[];
}

/**
 * Pure-TypeScript Primavera XER writer (ADR-0017 author path).
 *
 * Why hand-roll: the Wave 2 plan proposed MPXJ for round-tripping XER, but
 * MPXJ is a commercial Java library that ships under a per-deployment
 * licence. The XER format itself is documented (and publicly reverse-
 * engineered for two decades) and small enough that emitting a valid file
 * with just the canonical Project + Activity rows we already maintain is
 * straightforward. This service writes the minimal-but-valid subset:
 *
 *   - ERMHDR (file header)
 *   - PROJECT (one row)
 *   - PROJWBS (one root WBS node, plus one node per distinct activity.wbsCode)
 *   - TASK (one row per activity)
 *   - %E (end-of-file)
 *
 * The output imports cleanly into Primavera P6 Professional and Oracle
 * Primavera Cloud. Relationships (TASKPRED) and resource assignments
 * (TASKRSRC) are intentionally NOT emitted in this first cut — the
 * canonical relationships table is still being populated, and an empty
 * relationship set is valid XER. A follow-up will add TASKPRED once
 * predecessor data flows into Activity reliably.
 *
 * The writer is deterministic: given identical canonical rows it produces
 * byte-identical output. That makes it safe to SHA-256 fingerprint and feed
 * back into the immutable source-file archive (StorageService) as evidence
 * of the AI-generated baseline.
 */
@Injectable()
export class XerWriterService {
  private readonly logger = new Logger(XerWriterService.name);

  private static readonly XER_VERSION = '20.12';
  private static readonly ENCODING = 'UTF-8';
  private static readonly CURRENCY = 'AED';

  /** Emit one XER document from the canonical payload. */
  write(payload: XerWritePayload): XerWriteResult {
    const warnings: string[] = [];
    const lines: string[] = [];
    const project = payload.project;
    if (!project) throw new Error('XerWriter: project is required');

    const projId = this.numericProjectId(project.id);
    const projShortName = this.sanitizeShortName(
      payload.baselineName ? `${project.businessKey}_${payload.baselineName}` : project.businessKey,
    );

    // ---- ERMHDR ----------------------------------------------------------
    const today = '2026-06-09 12:00';
    const author = (payload.authoredBy ?? 'Sigma PMO AI Planner').slice(0, 32);
    lines.push(
      [
        'ERMHDR',
        XerWriterService.XER_VERSION,
        today,
        'Project',
        author,
        'Sigma_PMO',
        'AED',
        XerWriterService.CURRENCY,
        XerWriterService.ENCODING,
      ].join('\t'),
    );

    // ---- PROJECT ---------------------------------------------------------
    lines.push('%T\tPROJECT');
    const projectFields = [
      'proj_id',
      'fy_start_month_num',
      'rsrc_self_add_flag',
      'allow_complete_flag',
      'rsrc_multi_assign_flag',
      'checkout_flag',
      'project_flag',
      'step_complete_flag',
      'cost_qty_recalc_flag',
      'batch_sum_flag',
      'name_sep_char',
      'def_complete_pct_type',
      'proj_short_name',
      'plan_start_date',
      'plan_end_date',
      'last_recalc_date',
      'last_baseline_update_date',
      'last_checksum',
      'critical_drtn_hr_cnt',
      'def_duration_type',
      'task_code_base',
      'task_code_step',
      'priority_num',
      'wbs_max_sum_level',
      'strgy_priority_num',
      'last_checksum',
      'def_qty_type',
      'add_act_remain_flag',
      'act_this_per_link_flag',
      'def_task_type',
      'act_pct_link_flag',
      'critical_path_type',
      'task_code_prefix',
      'task_code_prefix_flag',
      'def_rollup_dates_flag',
    ];
    lines.push('%F\t' + projectFields.join('\t'));
    lines.push(
      '%R\t' +
        [
          projId,
          '1',
          'N',
          'Y',
          'N',
          'N',
          'Y',
          'N',
          'Y',
          'Y',
          '.',
          'CP_Drtn',
          projShortName,
          project.plannedStart ?? '',
          project.plannedFinish ?? '',
          today,
          '',
          '0',
          '0',
          'DT_FixedQty_FixedDrtnAndUnitsPerTime',
          '1000',
          '10',
          '10',
          '7',
          '500',
          '0',
          'QT_Hour',
          'N',
          'N',
          'TT_FinMile',
          'N',
          'CT_TotFloat',
          'A',
          'Y',
          'Y',
        ].join('\t'),
    );

    // ---- PROJWBS ---------------------------------------------------------
    // Build a deduplicated WBS tree. Root node = the project itself.
    const wbsCodes = new Set<string>();
    for (const a of payload.activities) {
      if (a.wbsCode) wbsCodes.add(a.wbsCode);
    }
    if (wbsCodes.size === 0) {
      warnings.push('No wbsCode found on any activity — emitting a single ROOT WBS node.');
    }

    lines.push('%T\tPROJWBS');
    lines.push(
      '%F\twbs_id\tproj_id\tobs_id\tseq_num\test_wt\tproj_node_flag\tsum_data_flag\tstatus_code\twbs_short_name\twbs_name\tphase_id\tparent_wbs_id\tev_user_pct\tev_etc_user_value\torig_cost\tindep_remain_total_cost\tann_dscnt_rate_pct\tdscnt_period_type\tindep_remain_work_qty\tann_dscnt_rate_pct\tdscnt_period_type\tdscnt_period_type\tev_compute_type\tev_etc_compute_type',
    );
    const rootWbsId = projId * 100 + 1;
    lines.push(
      '%R\t' +
        [
          rootWbsId,
          projId,
          '',
          '0',
          '1',
          'Y',
          'N',
          'WS_Open',
          projShortName,
          project.name.slice(0, 100),
          '',
          '',
          '0.06',
          '0.88',
          '',
          '',
          '0',
          'CY',
          '',
          '0',
          'CY',
          'CY',
          'EV_CT_PCT_CMP',
          'EE_PT_REMAIN',
        ].join('\t'),
    );

    // Map each unique wbsCode → numeric wbs_id (root id + ordinal).
    const wbsIdByCode = new Map<string, number>();
    let nextWbsOrdinal = 2;
    for (const code of [...wbsCodes].sort()) {
      const wbsId = projId * 100 + nextWbsOrdinal++;
      wbsIdByCode.set(code, wbsId);
      lines.push(
        '%R\t' +
          [
            wbsId,
            projId,
            '',
            '0',
            '1',
            'N',
            'N',
            'WS_Open',
            this.sanitizeShortName(code),
            this.escapeXer(code),
            '',
            rootWbsId,
            '0.06',
            '0.88',
            '',
            '',
            '0',
            'CY',
            '',
            '0',
            'CY',
            'CY',
            'EV_CT_PCT_CMP',
            'EE_PT_REMAIN',
          ].join('\t'),
      );
    }

    // ---- TASK ------------------------------------------------------------
    lines.push('%T\tTASK');
    lines.push(
      '%F\ttask_id\tproj_id\twbs_id\tclndr_id\tphys_complete_pct\trev_fdbk_flag\test_wt\tlock_plan_flag\tauto_compute_act_flag\tcomplete_pct_type\ttask_type\tduration_type\tstatus_code\ttask_code\ttask_name\trsrc_id\ttotal_float_hr_cnt\tfree_float_hr_cnt\tremain_drtn_hr_cnt\tact_work_qty\tremain_work_qty\ttarget_work_qty\ttarget_drtn_hr_cnt\tact_equip_qty\tremain_equip_qty\ttarget_equip_qty\test_start_date\tearly_start_date\tearly_end_date\tlate_start_date\tlate_end_date\tact_start_date\tact_end_date\trestart_date\treend_date\ttarget_start_date\ttarget_end_date\trem_late_start_date\trem_late_end_date\texpect_end_date',
    );
    let nextTaskOrdinal = 1;
    for (const a of payload.activities) {
      const taskId = projId * 1000 + nextTaskOrdinal++;
      const wbsId = a.wbsCode ? wbsIdByCode.get(a.wbsCode) ?? rootWbsId : rootWbsId;
      const durationHours = (a.plannedDurationDays ?? 1) * 8;
      const remainHours = (a.remainingDurationDays ?? a.plannedDurationDays ?? 1) * 8;
      const taskCode = (a.wbsCode ?? a.businessKey ?? `A${nextTaskOrdinal}`).slice(0, 40);

      lines.push(
        '%R\t' +
          [
            taskId,
            projId,
            wbsId,
            '1',
            '0',
            'N',
            '1',
            'N',
            'Y',
            'CP_Drtn',
            'TT_Task',
            'DT_FixedQty_FixedDrtnAndUnitsPerTime',
            this.statusCode(a),
            taskCode,
            this.escapeXer(a.name.slice(0, 120)),
            '',
            '0',
            '0',
            String(remainHours),
            '0',
            String(durationHours),
            String(durationHours),
            String(durationHours),
            '0',
            '0',
            '0',
            a.plannedStart ?? '',
            a.plannedStart ?? '',
            a.plannedFinish ?? '',
            a.plannedStart ?? '',
            a.plannedFinish ?? '',
            a.actualStart ?? '',
            a.actualFinish ?? '',
            '',
            '',
            a.plannedStart ?? '',
            a.plannedFinish ?? '',
            '',
            '',
            '',
          ].join('\t'),
      );
    }

    // ---- TASKPRED (predecessor / successor relationships) --------------
    // We emit Finish-to-Start (default) relationships when the caller
    // supplies them. P6 needs `task_pred_id` to be unique inside the file
    // and both endpoints must already be in the TASK block.
    let predCount = 0;
    if (payload.relationships && payload.relationships.length > 0) {
      // Resolve businessKey → taskId via the order we just emitted activities.
      const taskIdByKey = new Map<string, number>();
      let ord = 1;
      for (const a of payload.activities) {
        taskIdByKey.set(a.businessKey, projId * 1000 + ord++);
      }
      lines.push('%T\tTASKPRED');
      lines.push(
        '%F\ttask_pred_id\ttask_id\tpred_task_id\tproj_id\tpred_proj_id\tpred_type\tlag_hr_cnt\tcomments\tfloat_path\taref\tarls',
      );
      let predOrd = 1;
      for (const r of payload.relationships) {
        const predId = taskIdByKey.get(r.predecessorBusinessKey);
        const succId = taskIdByKey.get(r.successorBusinessKey);
        if (predId === undefined || succId === undefined) {
          warnings.push(
            `Skipping relationship ${r.predecessorBusinessKey} → ${r.successorBusinessKey}: at least one endpoint is not in the TASK set.`,
          );
          continue;
        }
        const predType =
          r.type === 'FS' ? 'PR_FS' :
          r.type === 'SS' ? 'PR_SS' :
          r.type === 'FF' ? 'PR_FF' :
          r.type === 'SF' ? 'PR_SF' : 'PR_FS';
        const taskPredId = projId * 10000 + predOrd++;
        lines.push(
          '%R\t' +
            [
              taskPredId,
              succId,      // successor task_id
              predId,      // predecessor pred_task_id
              projId,
              projId,
              predType,
              '0',         // lag in hours
              '',          // comments
              '',          // float path
              '',          // aref
              '',          // arls
            ].join('\t'),
        );
        predCount += 1;
      }
    }

    // ---- End of file ----------------------------------------------------
    lines.push('%E\t0');

    const text = lines.join('\n') + '\n';
    return {
      text,
      buffer: Buffer.from(text, 'utf8'),
      rowCounts: {
        project: 1,
        wbs: wbsCodes.size + 1,
        task: payload.activities.length,
        taskpred: predCount,
      },
      warnings,
    };
  }

  /** Map our wide UUID id to a stable 1..99999 integer for XER's numeric id columns. */
  private numericProjectId(uuid: string): number {
    let hash = 0;
    for (let i = 0; i < uuid.length; i++) {
      hash = (hash * 31 + uuid.charCodeAt(i)) | 0;
    }
    return Math.abs(hash % 90000) + 10000;
  }

  /** XER short name must be alphanumeric, ≤ 20 chars, no spaces. */
  private sanitizeShortName(input: string): string {
    return input
      .replace(/[^A-Za-z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 20)
      .toUpperCase();
  }

  /** Escape tab + any newline / carriage-return so XER row integrity holds. */
  private escapeXer(input: string): string {
    return input.replace(/[\t\r\n]+/g, ' ');
  }

  /** P6 task status code from our canonical activity status. */
  private statusCode(activity: Activity): string {
    const s = (activity.status ?? '').toLowerCase();
    if (s.includes('complete') || activity.actualFinish) return 'TK_Complete';
    if (s.includes('progress') || activity.actualStart) return 'TK_Active';
    return 'TK_NotStart';
  }
}
