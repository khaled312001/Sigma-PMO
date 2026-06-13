/**
 * Run the Sigma 23-test Acceptance Program against the live platform and print
 * the results (Mr. Ayham, 2026-06-13). Bootstraps the Nest app context (so every
 * agent self-registers and the schema is in sync), seeds a representative sample
 * for the five new site-governance layers on a real project, then executes
 * AcceptanceRunnerService.runAll and writes the JSON + a markdown summary.
 *
 *   npx ts-node scripts/run-acceptance.ts [projectKey]
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';

import { AppModule } from '../src/app.module';
import {
  Project,
  Activity,
  SafetyRecord,
  FireSafetyRecord,
  AuthoritySubmission,
  UtilityConnection,
  OperationalReadinessItem,
} from '../src/modules/canonical/entities';
import { AcceptanceRunnerService } from '../src/modules/acceptance/acceptance.service';

/* eslint-disable no-console */

const ASOF = '2026-06-12';

async function seed(ds: DataSource, projectKey: string): Promise<string> {
  const safety = ds.getRepository(SafetyRecord);
  const existing = await safety.count({ where: { projectBusinessKey: projectKey } });
  if (existing > 0) return `already seeded (${existing} safety records)`;

  // Link the stop-work to a real critical activity if one exists.
  const act = await ds.getRepository(Activity).findOne({
    where: { isCurrent: true } as any,
    order: { createdAt: 'DESC' },
  });
  const actKey = act?.businessKey ?? 'A-1010';

  await safety.save([
    safety.create({ projectBusinessKey: projectKey, businessKey: 'SAF-001', title: 'Fall-from-height incident — Tower A slab', recordType: 'incident', severity: 'high', status: 'open', recordDate: '2026-05-20' }),
    safety.create({ projectBusinessKey: projectKey, businessKey: 'SAF-002', title: 'Stop-work: unsafe scaffolding, Zone 3', recordType: 'incident', severity: 'critical', status: 'open', recordDate: '2026-05-28', stopWork: true, affectedActivityKeys: [actKey], eotDays: 12 }),
    safety.create({ projectBusinessKey: projectKey, businessKey: 'SAF-003', title: 'Corrective action — toolbox briefing reinforced', recordType: 'corrective_action', severity: 'low', status: 'closed', recordDate: '2026-06-01' }),
    safety.create({ projectBusinessKey: projectKey, businessKey: 'SAF-004', title: 'Weekly HSE inspection — overall compliant', recordType: 'inspection', severity: 'info', status: 'closed', recordDate: '2026-06-05' }),
    safety.create({ projectBusinessKey: projectKey, businessKey: 'SAF-005', title: 'Near-miss reported — dropped object', recordType: 'near_miss', severity: 'medium', status: 'closed', recordDate: '2026-06-08' }),
  ]);

  const fire = ds.getRepository(FireSafetyRecord);
  await fire.save([
    fire.create({ projectBusinessKey: projectKey, businessKey: 'FLS-001', title: 'Fire strategy — Civil Defence review', recordType: 'civil_defense_review', authority: 'Civil Defence', status: 'comments', openComments: 6, submittedDate: '2026-04-15', approvalForecastDate: '2026-07-30', severity: 'high' }),
    fire.create({ projectBusinessKey: projectKey, businessKey: 'FLS-002', title: 'Sprinkler T&C report', recordType: 'testing_commissioning', authority: 'Civil Defence', status: 'approved', openComments: 0, submittedDate: '2026-05-01', approvalForecastDate: '2026-05-20', severity: 'info' }),
  ]);

  const auth = ds.getRepository(AuthoritySubmission);
  await auth.save([
    auth.create({ projectBusinessKey: projectKey, businessKey: 'AUTH-001', title: 'Building permit — Municipality', authority: 'municipality', submissionType: 'Building Permit', status: 'comments', openComments: 3, submittedDate: '2026-03-10', forecastApprovalDate: '2026-08-01', requiredByDate: '2026-05-01', affectedActivityKeys: [actKey] }),
    auth.create({ projectBusinessKey: projectKey, businessKey: 'AUTH-002', title: 'DEWA electricity NOC', authority: 'electricity', submissionType: 'NOC', status: 'approved', openComments: 0, submittedDate: '2026-02-01', forecastApprovalDate: '2026-03-01', requiredByDate: '2026-06-01' }),
  ]);

  const util = ds.getRepository(UtilityConnection);
  await util.save([
    util.create({ projectBusinessKey: projectKey, businessKey: 'UTL-001', title: 'Permanent power connection', utilityType: 'power', status: 'not_started', applicationDate: null, forecastConnectionDate: '2026-12-01', requiredByDate: '2026-09-01' }),
    util.create({ projectBusinessKey: projectKey, businessKey: 'UTL-002', title: 'Potable water connection', utilityType: 'water', status: 'connected', applicationDate: '2026-02-01', forecastConnectionDate: '2026-05-01', requiredByDate: '2026-06-01' }),
  ]);

  const opr = ds.getRepository(OperationalReadinessItem);
  await opr.save([
    opr.create({ projectBusinessKey: projectKey, businessKey: 'OPR-001', title: 'O&M manuals package', category: 'om_manual', status: 'in_progress', completionPct: 40, dueDate: '2026-11-01' }),
    opr.create({ projectBusinessKey: projectKey, businessKey: 'OPR-002', title: 'Operator training programme', category: 'training', status: 'not_started', completionPct: 0, dueDate: '2026-10-15' }),
    opr.create({ projectBusinessKey: projectKey, businessKey: 'OPR-003', title: 'Asset register handover', category: 'asset_register', status: 'complete', completionPct: 100, dueDate: '2026-09-01' }),
  ]);

  return 'seeded 5 layers (safety/fire/authority/utility/operational-readiness)';
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const ds = app.get(DataSource);
    const argKey = process.argv[2];
    const project = argKey
      ? await ds.getRepository(Project).findOne({ where: { businessKey: argKey, isCurrent: true } as any })
      : await ds.getRepository(Project).findOne({ where: { isCurrent: true } as any, order: { createdAt: 'ASC' } });
    if (!project) { console.error('No current project found. Seed/ingest a project first.'); process.exitCode = 1; return; }
    const projectKey = project.businessKey;

    console.log(`[acceptance] project=${projectKey} asOf=${ASOF}`);
    try {
      const s = await seed(ds, projectKey);
      console.log(`[acceptance] seed: ${s}`);
    } catch (e) {
      console.log(`[acceptance] seed skipped/failed: ${(e as Error).message}`);
    }

    const runner = app.get(AcceptanceRunnerService);
    const report = await runner.runAll(projectKey);

    console.log('\n=== ACCEPTANCE REPORT (JSON) ===');
    console.log(JSON.stringify(report, null, 2));
    console.log('\n=== SUMMARY ===');
    const r: any = report;
    console.log(`total=${r.total} passed=${r.passed} failed=${r.failed} skipped=${r.skipped}`);
    for (const t of r.results) {
      console.log(`  ${t.id}  ${String(t.status).toUpperCase().padEnd(7)}  ${t.title}${t.reason ? '  — ' + t.reason : ''}`);
    }
  } finally {
    await app.close();
  }
}

void main();
