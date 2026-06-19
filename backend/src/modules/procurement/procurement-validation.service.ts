import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  ProcurementFinding,
  ProcurementPackage,
  Vendor,
} from '../canonical/entities';
import { daysBetween } from '../../common/dates';

interface DraftFinding {
  findingType: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  refs: Record<string, unknown>;
  recommendation: string | null;
  dedupKey: string;
}

/**
 * ProcurementValidationService — the Procurement Governance Validation engine
 * (Mr. Ayham, 2026-06-12). Continuously compares procurement sources and raises
 * deterministic findings:
 *   • qty-bim-vs-procured        modelled vs procured quantity deviation
 *   • qty-procured-vs-installed  procured vs installed (waste / shortfall)
 *   • delivery-delay             planned vs actual delivery (or overdue today)
 *   • long-lead-exposure         long-lead item with insufficient lead time
 *   • vendor-risk                awarded to a high-risk / disqualified vendor
 *
 * Idempotent (dedupKey). The `asOfDate` is injected (deterministic; no
 * Date.now() in the service) so the result is reproducible + testable.
 */
@Injectable()
export class ProcurementValidationService {
  private readonly logger = new Logger(ProcurementValidationService.name);
  private readonly QTY_WARN = 0.1;
  private readonly QTY_CRIT = 0.25;

  constructor(
    @InjectRepository(ProcurementFinding) private readonly findings: Repository<ProcurementFinding>,
    @InjectRepository(ProcurementPackage) private readonly packages: Repository<ProcurementPackage>,
    @InjectRepository(Vendor) private readonly vendors: Repository<Vendor>,
  ) {}

  async validate(projectKey: string, asOfDate?: string): Promise<{ projectKey: string; findings: ProcurementFinding[]; counts: Record<string, number> }> {
    const asOf = asOfDate ?? '2026-06-12';
    const pkgs = await this.packages.find({ where: { projectBusinessKey: projectKey, isCurrent: true } });
    const vendorByKey = new Map<string, Vendor>();
    for (const v of await this.vendors.find({ where: { isCurrent: true } })) vendorByKey.set(v.businessKey, v);

    const drafts: DraftFinding[] = [];

    for (const p of pkgs) {
      const bim = num(p.bimQuantity);
      const procured = num(p.procuredQuantity);
      const installed = num(p.installedQuantity);

      // 1. BIM vs procured.
      if (bim !== null && procured !== null && bim > 0) {
        const variance = (procured - bim) / bim;
        if (Math.abs(variance) >= this.QTY_WARN) {
          drafts.push({
            findingType: 'qty-bim-vs-procured',
            severity: Math.abs(variance) >= this.QTY_CRIT ? 'critical' : 'warning',
            title: `Procured vs BIM quantity off by ${(variance * 100).toFixed(0)}% — ${p.businessKey}`,
            description: `Package ${p.businessKey} "${p.title}": procured ${procured} vs BIM-modelled ${bim} ${p.unit ?? ''} (${(variance * 100).toFixed(1)}% ${variance > 0 ? 'over' : 'under'}).`,
            refs: { packageKey: p.businessKey, bimQuantity: bim, procuredQuantity: procured, variancePct: round4(variance) },
            recommendation: variance > 0 ? 'Verify the order — possible over-procurement / waste.' : 'Verify coverage — procured quantity may be short of the model.',
            dedupKey: `bimproc:${projectKey}:${p.businessKey}`,
          });
        }
      }

      // 2. Procured vs installed.
      if (procured !== null && installed !== null && procured > 0) {
        const gap = (procured - installed) / procured;
        if (gap >= this.QTY_CRIT) {
          drafts.push({
            findingType: 'qty-procured-vs-installed',
            severity: gap >= 0.4 ? 'critical' : 'warning',
            title: `Installed lagging procured by ${(gap * 100).toFixed(0)}% — ${p.businessKey}`,
            description: `Package ${p.businessKey}: installed ${installed} of procured ${procured} ${p.unit ?? ''} — ${(gap * 100).toFixed(0)}% on site uninstalled (storage / waste / over-procurement).`,
            refs: { packageKey: p.businessKey, procuredQuantity: procured, installedQuantity: installed, gapPct: round4(gap) },
            recommendation: 'Reconcile site stock against installed works; investigate over-procurement or wastage.',
            dedupKey: `procinst:${projectKey}:${p.businessKey}`,
          });
        }
      }

      // 3. Delivery delay (actual vs planned, or overdue vs asOf).
      if (p.plannedDeliveryDate) {
        const ref = p.actualDeliveryDate ?? asOf;
        const slip = daysBetween(p.plannedDeliveryDate, ref) ?? 0;
        const delivered = !!p.actualDeliveryDate;
        if (slip > 7) {
          const overdueWord = delivered ? 'was delivered' : 'is overdue';
          drafts.push({
            findingType: 'delivery-delay',
            severity: slip > 30 ? 'critical' : 'warning',
            title: `${p.businessKey} ${delivered ? 'delivered late' : 'delivery overdue'} by ${slip}d`,
            description: `Package ${p.businessKey} "${p.title}" ${overdueWord} ${slip} day(s) after the planned ${p.plannedDeliveryDate}${p.requiredOnSiteDate ? ` (required on site ${p.requiredOnSiteDate})` : ''}.`,
            refs: { packageKey: p.businessKey, plannedDeliveryDate: p.plannedDeliveryDate, actualDeliveryDate: p.actualDeliveryDate, asOf, slipDays: slip },
            recommendation: delivered ? 'Assess downstream schedule impact / EOT exposure.' : 'Expedite the supplier; assess impact on dependent activities.',
            dedupKey: `deliv:${projectKey}:${p.businessKey}`,
          });
        }
      }

      // 4. Long-lead exposure: required on site sooner than lead time allows.
      if (p.longLead && p.leadTimeDays && p.requiredOnSiteDate && p.status === 'planned') {
        const available = daysBetween(asOf, p.requiredOnSiteDate) ?? 0;
        if (available < p.leadTimeDays) {
          drafts.push({
            findingType: 'long-lead-exposure',
            severity: available < p.leadTimeDays * 0.5 ? 'critical' : 'warning',
            title: `Long-lead exposure — ${p.businessKey} not yet ordered`,
            description: `Long-lead package ${p.businessKey} needs ${p.leadTimeDays}d lead but only ${available}d remain to the required-on-site date ${p.requiredOnSiteDate}, and it is still '${p.status}'.`,
            refs: { packageKey: p.businessKey, leadTimeDays: p.leadTimeDays, daysAvailable: available, requiredOnSiteDate: p.requiredOnSiteDate },
            recommendation: 'Place the order immediately or re-sequence dependent works.',
            dedupKey: `longlead:${projectKey}:${p.businessKey}`,
          });
        }
      }

      // 5. Vendor risk on award.
      if (p.awardedVendorBusinessKey) {
        const v = vendorByKey.get(p.awardedVendorBusinessKey);
        if (v && (v.riskScore >= 60 || v.status === 'disqualified')) {
          drafts.push({
            findingType: 'vendor-risk',
            severity: v.status === 'disqualified' || v.riskScore >= 75 ? 'critical' : 'warning',
            title: `High-risk vendor on ${p.businessKey}`,
            description: `Package ${p.businessKey} is awarded to ${v.name} (risk ${v.riskScore}/100, status ${v.status}).`,
            refs: { packageKey: p.businessKey, vendorBusinessKey: v.businessKey, riskScore: v.riskScore, vendorStatus: v.status },
            recommendation: 'Apply enhanced supervision / performance bond, or re-evaluate the award.',
            dedupKey: `vendrisk:${projectKey}:${p.businessKey}`,
          });
        }
      }
    }

    const persisted = await this.persist(projectKey, drafts);
    const counts: Record<string, number> = {};
    for (const f of persisted) counts[f.findingType] = (counts[f.findingType] ?? 0) + 1;
    this.logger.log(`Procurement governance for ${projectKey}: ${persisted.length} finding(s) ${JSON.stringify(counts)}`);
    return { projectKey, findings: persisted, counts };
  }

  /** Delivery-tracking summary: status mix + on-time rate across packages. */
  async deliveryStatus(projectKey: string, asOfDate?: string): Promise<{
    total: number; delivered: number; overdue: number; onTimeRatePct: number | null;
    rows: Array<{ businessKey: string; title: string; status: string; plannedDeliveryDate: string | null; actualDeliveryDate: string | null; slipDays: number | null }>;
  }> {
    const asOf = asOfDate ?? '2026-06-12';
    const pkgs = await this.packages.find({ where: { projectBusinessKey: projectKey, isCurrent: true } });
    let delivered = 0, overdue = 0, onTime = 0;
    const rows = pkgs.map((p) => {
      let slip: number | null = null;
      if (p.plannedDeliveryDate) {
        const ref = p.actualDeliveryDate ?? asOf;
        slip = daysBetween(p.plannedDeliveryDate, ref) ?? 0;
        if (p.actualDeliveryDate) { delivered += 1; if (slip <= 0) onTime += 1; }
        else if (slip > 0) overdue += 1;
      }
      return { businessKey: p.businessKey, title: p.title, status: p.status, plannedDeliveryDate: p.plannedDeliveryDate, actualDeliveryDate: p.actualDeliveryDate, slipDays: slip };
    });
    return {
      total: pkgs.length, delivered, overdue,
      onTimeRatePct: delivered > 0 ? round4(onTime / delivered) : null,
      rows,
    };
  }

  list(projectKey: string, status?: string): Promise<ProcurementFinding[]> {
    const where: Record<string, unknown> = { projectBusinessKey: projectKey };
    if (status) where.status = status;
    return this.findings.find({ where, order: { createdAt: 'DESC' } });
  }

  async setStatus(id: string, status: string): Promise<ProcurementFinding> {
    const f = await this.findings.findOne({ where: { id } });
    if (!f) throw new NotFoundException(`Procurement finding ${id} not found`);
    f.status = status;
    return this.findings.save(f);
  }

  private async persist(projectKey: string, drafts: DraftFinding[]): Promise<ProcurementFinding[]> {
    const existing = await this.findings.find({ where: { projectBusinessKey: projectKey } });
    const byKey = new Map(existing.map((e) => [e.dedupKey, e]));
    const out: ProcurementFinding[] = [];
    for (const d of drafts) {
      const prior = byKey.get(d.dedupKey);
      if (prior) {
        prior.severity = d.severity;
        prior.title = d.title;
        prior.description = d.description;
        prior.refs = d.refs;
        prior.recommendation = d.recommendation;
        out.push(await this.findings.save(prior));
      } else {
        out.push(await this.findings.save(this.findings.create({
          projectBusinessKey: projectKey,
          findingType: d.findingType,
          severity: d.severity,
          title: d.title,
          description: d.description,
          refs: d.refs,
          recommendation: d.recommendation,
          status: 'open',
          dedupKey: d.dedupKey,
        })));
      }
    }
    return out;
  }
}

const num = (v: string | null): number | null => (v === null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const round4 = (n: number): number => Math.round(n * 10000) / 10000;
