/** Quick live verification of the proposed-change fixes (CSV linkage + workflow). */
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3009/api/v1';
const RUN = Date.now().toString(36).slice(-6);
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };

async function call(method, path, { key, body } = {}) {
  const headers = {};
  if (key) headers['x-api-key'] = key;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, json: j(text) };
}
const b64 = (rel) => readFileSync(new URL(rel, import.meta.url)).toString('base64');

const reg = await call('POST', '/onboarding/register', { body: {
  companyName: `Verify Co ${RUN}`, companyType: 'pmo', country: 'AE',
  ownerEmail: `owner-${RUN}@verify.test`, ownerDisplayName: 'Verify Owner', ownerPassword: 'Owner!Pass#2026',
}});
const key = reg.json?.apiKey;
console.log('register:', reg.status, 'companyId:', reg.json?.company?.id);

// 1) Upload PROJECT only
const up1 = await call('POST', '/ingestion/upload', { key, body: { filename: 'projects.csv', contentBase64: b64('../../data/samples/projects.csv') } });
console.log('upload projects:', up1.status, 'counts:', JSON.stringify(up1.json?.counts));

// 2) Upload ACTIVITIES in a SEPARATE request (the bug: was activity:0)
const up2 = await call('POST', '/ingestion/upload', { key, body: { filename: 'activities.csv', contentBase64: b64('../../data/samples/activities.csv') } });
const actCount = up2.json?.counts?.activity ?? 0;
console.log('upload activities (separate):', up2.status, 'counts:', JSON.stringify(up2.json?.counts));
console.log(actCount > 0 ? `  ✔ FIX CONFIRMED — activities linked across datasets (activity=${actCount})` : '  �’ activity still 0');

// 3) Run governance workflow for the project — should not 500
const wf = await call('POST', '/rules/workflows/run', { key, body: { projectKey: 'P-1000' } });
console.log('workflow run:', wf.status, 'result:', JSON.stringify({ projectCount: wf.json?.projectCount, alerts: wf.json?.totalAlertCount, decisions: wf.json?.totalDecisionCount, failures: wf.json?.failures?.length, empty: wf.json?.empty }));
console.log(wf.status === 200 ? '  ✔ workflow returns a structured result (no 500)' : '  ✗ workflow failed');

// 4) Workflow with an unknown project (clear, scoped error)
const wfBad = await call('POST', '/rules/workflows/run', { key, body: { projectKey: 'P-DOES-NOT-EXIST' } });
console.log('workflow unknown project:', wfBad.status, '(expect 404 with clear message):', wfBad.json?.message);
