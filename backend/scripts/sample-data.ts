/**
 * Canonical synthetic dataset for Cycle 1 — a small construction/EPC project
 * (the contractual domain for Layer 1). Used by sample generation and tests.
 * The data is intentionally realistic: completed, in-progress, and not-started
 * activities, with one delayed activity so later cycles have deviation signal.
 */

export interface SampleActivity {
  key: string;
  wbs: string;
  name: string;
  type: string;
  status: string;
  plannedStart: string;
  plannedFinish: string;
  actualStart: string | null;
  actualFinish: string | null;
  plannedDurationDays: number;
  remainingDurationDays: number;
  plannedPctComplete: number;
  actualPctComplete: number;
  budgetedCost: number;
  actualCost: number;
}

export interface SampleResource {
  key: string;
  name: string;
  type: 'labor' | 'material' | 'equipment' | 'nonlabor';
  unitOfMeasure: string;
  maxUnitsPerDay: number | null;
  standardRate: number;
}

export interface SampleAssignment {
  activityKey: string;
  resourceKey: string;
  plannedUnits: number;
  actualUnits: number;
  plannedCost: number;
  actualCost: number;
}

export interface SampleReport {
  key: string;
  reportType: 'weekly';
  reportDate: string;
  periodStart: string;
  periodEnd: string;
  submittedBy: string;
  reportedPctComplete: number;
  narrative: string;
}

export const PROJECT = {
  key: 'P-1000',
  name: 'Nile Tower — Main Construction',
  status: 'Active',
  clientName: 'Sigma Holdings',
  currency: 'USD',
  dataDate: '2026-05-15',
  plannedStart: '2026-01-05',
  plannedFinish: '2026-12-18',
  actualStart: '2026-01-07',
  actualFinish: null as string | null,
  budgetAtCompletion: 4_200_000,
};

export const ACTIVITIES: SampleActivity[] = [
  { key: 'A1000', wbs: '1.1', name: 'Site Mobilisation', type: 'Task Dependent', status: 'Completed', plannedStart: '2026-01-05', plannedFinish: '2026-01-16', actualStart: '2026-01-07', actualFinish: '2026-01-19', plannedDurationDays: 10, remainingDurationDays: 0, plannedPctComplete: 1, actualPctComplete: 1, budgetedCost: 80_000, actualCost: 86_500 },
  { key: 'A1010', wbs: '1.2', name: 'Bulk Excavation', type: 'Task Dependent', status: 'Completed', plannedStart: '2026-01-19', plannedFinish: '2026-02-13', actualStart: '2026-01-21', actualFinish: '2026-02-20', plannedDurationDays: 20, remainingDurationDays: 0, plannedPctComplete: 1, actualPctComplete: 1, budgetedCost: 240_000, actualCost: 268_000 },
  { key: 'A1020', wbs: '1.3', name: 'Piling & Foundations', type: 'Task Dependent', status: 'In Progress', plannedStart: '2026-02-16', plannedFinish: '2026-04-10', actualStart: '2026-02-23', actualFinish: null, plannedDurationDays: 40, remainingDurationDays: 8, plannedPctComplete: 1, actualPctComplete: 0.8, budgetedCost: 620_000, actualCost: 540_000 },
  { key: 'A1030', wbs: '2.1', name: 'Basement RC Structure', type: 'Task Dependent', status: 'In Progress', plannedStart: '2026-04-13', plannedFinish: '2026-06-19', actualStart: '2026-04-27', actualFinish: null, plannedDurationDays: 50, remainingDurationDays: 38, plannedPctComplete: 0.45, actualPctComplete: 0.22, budgetedCost: 910_000, actualCost: 210_000 },
  { key: 'A1040', wbs: '2.2', name: 'Superstructure — Cores', type: 'Task Dependent', status: 'Not Started', plannedStart: '2026-06-22', plannedFinish: '2026-09-04', actualStart: null, actualFinish: null, plannedDurationDays: 55, remainingDurationDays: 55, plannedPctComplete: 0, actualPctComplete: 0, budgetedCost: 1_180_000, actualCost: 0 },
  { key: 'A1050', wbs: '3.1', name: 'MEP First Fix', type: 'Task Dependent', status: 'Not Started', plannedStart: '2026-08-10', plannedFinish: '2026-10-30', actualStart: null, actualFinish: null, plannedDurationDays: 60, remainingDurationDays: 60, plannedPctComplete: 0, actualPctComplete: 0, budgetedCost: 540_000, actualCost: 0 },
  { key: 'A1060', wbs: '3.2', name: 'Facade Installation', type: 'Task Dependent', status: 'Not Started', plannedStart: '2026-09-07', plannedFinish: '2026-11-27', actualStart: null, actualFinish: null, plannedDurationDays: 60, remainingDurationDays: 60, plannedPctComplete: 0, actualPctComplete: 0, budgetedCost: 470_000, actualCost: 0 },
  { key: 'A1070', wbs: '4.1', name: 'Commissioning & Handover', type: 'Task Dependent', status: 'Not Started', plannedStart: '2026-11-30', plannedFinish: '2026-12-18', actualStart: null, actualFinish: null, plannedDurationDays: 15, remainingDurationDays: 15, plannedPctComplete: 0, actualPctComplete: 0, budgetedCost: 160_000, actualCost: 0 },
];

export const RESOURCES: SampleResource[] = [
  { key: 'R-CIVIL', name: 'Civil Crew A', type: 'labor', unitOfMeasure: 'hours', maxUnitsPerDay: 80, standardRate: 24 },
  { key: 'R-MEP', name: 'MEP Crew', type: 'labor', unitOfMeasure: 'hours', maxUnitsPerDay: 48, standardRate: 30 },
  { key: 'R-EXC', name: 'Excavator 30T', type: 'equipment', unitOfMeasure: 'hours', maxUnitsPerDay: 10, standardRate: 120 },
  { key: 'R-CONC', name: 'Concrete C40', type: 'material', unitOfMeasure: 'm3', maxUnitsPerDay: null, standardRate: 95 },
];

export const ASSIGNMENTS: SampleAssignment[] = [
  { activityKey: 'A1010', resourceKey: 'R-EXC', plannedUnits: 160, actualUnits: 188, plannedCost: 19_200, actualCost: 22_560 },
  { activityKey: 'A1010', resourceKey: 'R-CIVIL', plannedUnits: 1200, actualUnits: 1320, plannedCost: 28_800, actualCost: 31_680 },
  { activityKey: 'A1020', resourceKey: 'R-CONC', plannedUnits: 3200, actualUnits: 2600, plannedCost: 304_000, actualCost: 247_000 },
  { activityKey: 'A1020', resourceKey: 'R-CIVIL', plannedUnits: 2400, actualUnits: 2100, plannedCost: 57_600, actualCost: 50_400 },
  { activityKey: 'A1030', resourceKey: 'R-CONC', plannedUnits: 4100, actualUnits: 900, plannedCost: 389_500, actualCost: 85_500 },
  { activityKey: 'A1030', resourceKey: 'R-CIVIL', plannedUnits: 3000, actualUnits: 700, plannedCost: 72_000, actualCost: 16_800 },
];

export const REPORTS: SampleReport[] = [
  { key: 'RPT-W17', reportType: 'weekly', reportDate: '2026-05-01', periodStart: '2026-04-25', periodEnd: '2026-05-01', submittedBy: 'Site Engineer', reportedPctComplete: 0.38, narrative: 'Foundations nearing completion; basement RC slipped due to late rebar delivery.' },
  { key: 'RPT-W18', reportType: 'weekly', reportDate: '2026-05-08', periodStart: '2026-05-02', periodEnd: '2026-05-08', submittedBy: 'Site Engineer', reportedPctComplete: 0.41, narrative: 'Basement RC progressing slowly; piling at 80%. Concrete pour rate below plan.' },
  { key: 'RPT-W19', reportType: 'weekly', reportDate: '2026-05-15', periodStart: '2026-05-09', periodEnd: '2026-05-15', submittedBy: 'Project Manager', reportedPctComplete: 0.44, narrative: 'Schedule pressure on basement RC; recovery plan requested for cores start.' },
];
