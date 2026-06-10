import { Injectable, Logger } from '@nestjs/common';

/**
 * BaselineTemplateService — synthesizes a realistic construction-project
 * baseline (WBS + activities + dependencies) when the canonical Activity
 * set is empty.
 *
 * Why this exists. The Author Path (ADR-0017) was previously running the
 * XerWriter against the canonical Activity rows directly. For a brand-new
 * project with no schedule ingested yet that produced a `.xer` file with
 * zero TASK rows — technically valid, practically worthless. A senior
 * planner doing the same exercise would not return an empty schedule; they
 * would draft a Method-Statement-of-Works for a typical building project,
 * lay it onto the contractual start/finish window, and hand it over as the
 * proposed baseline.
 *
 * This service is the equivalent: a "default construction baseline" with
 * the structure observed in the reference Abu Dhabi Equine and Camel
 * Hospital programme (366-day duration, ~80–120 activities) — Milestones,
 * Building Permit, Contract Deliverables, Engineering Works, Civil Works
 * (Substructure + Superstructure), MEP First & Second Fix, Internal
 * Finishing, External Works, Testing & Commissioning, Handover.
 *
 * The template is deterministic: given the same (projectStart, projectFinish)
 * it produces byte-identical output, so the SHA-256 of the resulting `.xer`
 * stays stable across re-runs.
 */
@Injectable()
export class BaselineTemplateService {
  private readonly logger = new Logger(BaselineTemplateService.name);

  /**
   * Produce a synthesised activity list scaled to the given project window.
   * Durations and dependencies are honest construction-engineering defaults;
   * any sub-task longer than the available window is clamped so the schedule
   * still fits inside the contractual end date.
   */
  synthesise(input: {
    projectStartIso: string;
    projectFinishIso: string;
    projectName: string;
    /**
     * Above-ground floor count (drawing-driven path, correction-plan §2.1).
     * Default 2 (Ground + First) preserves the original template. The
     * superstructure block generates a columns+slab cycle PER floor, so a
     * G+5 drawing set genuinely produces a different, larger schedule.
     */
    floorCount?: number;
  }): SynthesisResult {
    const start = parseDate(input.projectStartIso);
    const finish = parseDate(input.projectFinishIso);
    const totalDays = daysBetween(start, finish);
    if (totalDays < 30) {
      throw new Error(
        `Project window too short (${totalDays} days). Template assumes at least a 30-day construction window.`,
      );
    }

    // Phase weights (sum to 1.0) — these mirror the reference programme.
    // Mobilisation/permit/contract deliverables sit at the start with overlap;
    // substructure → superstructure → MEP → finishing run mostly sequentially;
    // commissioning / handover compress at the tail.
    const phaseWeights = {
      milestones: 0.0,           // milestones are zero-duration markers
      mobilisation: 0.06,
      buildingPermit: 0.04,
      contractDeliverables: 0.04,
      subcontractorPrequal: 0.05,
      shopDrawings: 0.08,
      materialProcurement: 0.10,
      substructure: 0.15,
      superstructure: 0.20,
      mepFirstFix: 0.10,
      blockwork: 0.08,
      mepSecondFix: 0.09,
      internalFinishing: 0.12,
      externalFinishing: 0.07,
      externalWorks: 0.05,
      testingCommissioning: 0.06,
      handover: 0.02,
    };
    // Normalise so the sum is 1 (rounding tolerance).
    const sum = Object.values(phaseWeights).reduce((a, b) => a + b, 0);
    for (const k of Object.keys(phaseWeights) as (keyof typeof phaseWeights)[]) {
      phaseWeights[k] = phaseWeights[k] / sum;
    }

    // Phase windows on the calendar — many overlap intentionally.
    const dayFor = (frac: number) => addDays(start, Math.round(frac * totalDays));

    const phaseWindows: Record<string, { start: Date; finish: Date }> = {
      mobilisation: { start, finish: dayFor(0.06) },
      buildingPermit: { start, finish: dayFor(0.04) },
      contractDeliverables: { start: addDays(start, 1), finish: dayFor(0.05) },
      subcontractorPrequal: { start: addDays(start, 2), finish: dayFor(0.07) },
      shopDrawings: { start: dayFor(0.03), finish: dayFor(0.18) },
      materialProcurement: { start: dayFor(0.05), finish: dayFor(0.22) },
      substructure: { start: dayFor(0.06), finish: dayFor(0.27) },
      superstructure: { start: dayFor(0.20), finish: dayFor(0.52) },
      mepFirstFix: { start: dayFor(0.32), finish: dayFor(0.62) },
      blockwork: { start: dayFor(0.40), finish: dayFor(0.65) },
      mepSecondFix: { start: dayFor(0.55), finish: dayFor(0.78) },
      internalFinishing: { start: dayFor(0.60), finish: dayFor(0.86) },
      externalFinishing: { start: dayFor(0.65), finish: dayFor(0.88) },
      externalWorks: { start: dayFor(0.70), finish: dayFor(0.92) },
      testingCommissioning: { start: dayFor(0.86), finish: dayFor(0.96) },
      handover: { start: dayFor(0.94), finish },
    };

    // WBS hierarchy. Each entry: { code, name, children?: [{code,name}] }
    const wbs: WbsNode[] = [
      {
        code: 'WBS.1',
        name: 'Milestones',
        children: [
          { code: 'WBS.1.1', name: 'Contractual' },
          { code: 'WBS.1.2', name: 'Key Milestones' },
        ],
      },
      {
        code: 'WBS.2',
        name: 'Site Mobilisation',
        children: [
          { code: 'WBS.2.1', name: 'Mobilisation Works' },
        ],
      },
      {
        code: 'WBS.3',
        name: 'Building Permit',
        children: [{ code: 'WBS.3.1', name: 'General' }],
      },
      {
        code: 'WBS.4',
        name: 'Contract Deliverables',
        children: [
          { code: 'WBS.4.1', name: 'Submissions' },
          { code: 'WBS.4.2', name: 'Approvals' },
        ],
      },
      {
        code: 'WBS.5',
        name: 'Engineering Works (Off-Site)',
        children: [
          { code: 'WBS.5.1', name: 'Subcontractor / Supplier Pre-qualification' },
          { code: 'WBS.5.2', name: 'Shop Drawings' },
          { code: 'WBS.5.3', name: 'Material Procurement' },
        ],
      },
      {
        code: 'WBS.6',
        name: 'Civil Works',
        children: [
          { code: 'WBS.6.1', name: 'Substructure' },
          { code: 'WBS.6.2', name: 'Superstructure' },
          { code: 'WBS.6.3', name: 'Blockwork & Plaster' },
        ],
      },
      {
        code: 'WBS.7',
        name: 'MEP Works',
        children: [
          { code: 'WBS.7.1', name: 'MEP First Fix' },
          { code: 'WBS.7.2', name: 'MEP Second Fix' },
        ],
      },
      {
        code: 'WBS.8',
        name: 'Finishing Works',
        children: [
          { code: 'WBS.8.1', name: 'Internal Finishes' },
          { code: 'WBS.8.2', name: 'External Finishes' },
        ],
      },
      {
        code: 'WBS.9',
        name: 'External Works',
        children: [{ code: 'WBS.9.1', name: 'Landscaping & Hardscape' }],
      },
      {
        code: 'WBS.10',
        name: 'Testing & Commissioning',
        children: [{ code: 'WBS.10.1', name: 'Systems T&C' }],
      },
      {
        code: 'WBS.11',
        name: 'Handover',
        children: [{ code: 'WBS.11.1', name: 'Snag & Hand-over' }],
      },
    ];

    // Activity definitions: per WBS leaf, a list of (name, durationDays).
    // Durations are in working days — we use straight calendar days here for
    // simplicity (the XER calendar slot is single-shift 8h).
    const acts: ActivityDef[] = [
      // ── Milestones (zero-duration) ──
      { wbs: 'WBS.1.1', name: 'Project Commencement Date',                     days: 0, phase: 'mobilisation', isMilestone: true },
      { wbs: 'WBS.1.1', name: 'Project Completion Date',                       days: 0, phase: 'handover',     isMilestone: true, finishAlign: true },
      { wbs: 'WBS.1.2', name: 'Completion of Substructure',                    days: 0, phase: 'substructure', isMilestone: true, finishAlign: true },
      { wbs: 'WBS.1.2', name: 'Completion of Superstructure',                  days: 0, phase: 'superstructure', isMilestone: true, finishAlign: true },
      { wbs: 'WBS.1.2', name: 'Completion of MEP First Fix',                   days: 0, phase: 'mepFirstFix',  isMilestone: true, finishAlign: true },
      { wbs: 'WBS.1.2', name: 'Completion of Internal Finishes',               days: 0, phase: 'internalFinishing', isMilestone: true, finishAlign: true },
      { wbs: 'WBS.1.2', name: 'Completion of External Works',                  days: 0, phase: 'externalWorks', isMilestone: true, finishAlign: true },

      // ── Site Mobilisation ──
      { wbs: 'WBS.2.1', name: 'Site Hand-over to Contractor',                  days: 1, phase: 'mobilisation' },
      { wbs: 'WBS.2.1', name: 'Site Set-up & Welfare Facilities',              days: 7, phase: 'mobilisation' },
      { wbs: 'WBS.2.1', name: 'Site Hoarding & Access Roads',                  days: 5, phase: 'mobilisation' },
      { wbs: 'WBS.2.1', name: 'Temporary Power, Water & Drainage',             days: 6, phase: 'mobilisation' },
      { wbs: 'WBS.2.1', name: 'Site Demarcation & Survey',                     days: 3, phase: 'mobilisation' },

      // ── Building Permit ──
      { wbs: 'WBS.3.1', name: 'Issuance of Building Permit',                   days: 1, phase: 'buildingPermit' },
      { wbs: 'WBS.3.1', name: 'Obtain All NOCs',                               days: 7, phase: 'buildingPermit' },
      { wbs: 'WBS.3.1', name: 'Receiving IFC Drawings',                        days: 3, phase: 'buildingPermit' },

      // ── Contract Deliverables ──
      { wbs: 'WBS.4.1', name: 'Insurance / Bond / Programme Submission',       days: 3, phase: 'contractDeliverables' },
      { wbs: 'WBS.4.1', name: 'Quality Plan Submission',                       days: 4, phase: 'contractDeliverables' },
      { wbs: 'WBS.4.1', name: 'HSE Plan Submission',                           days: 4, phase: 'contractDeliverables' },
      { wbs: 'WBS.4.2', name: 'Insurance / Bond Approval',                     days: 6, phase: 'contractDeliverables' },
      { wbs: 'WBS.4.2', name: 'Programme Approval',                            days: 7, phase: 'contractDeliverables' },
      { wbs: 'WBS.4.2', name: 'Quality / HSE Plan Approval',                   days: 5, phase: 'contractDeliverables' },

      // ── Subcontractor / Supplier Prequal ──
      { wbs: 'WBS.5.1', name: 'Steel Reinforcement SC Prequalification',       days: 4, phase: 'subcontractorPrequal' },
      { wbs: 'WBS.5.1', name: 'Ready-Mix Concrete SC Prequalification',        days: 4, phase: 'subcontractorPrequal' },
      { wbs: 'WBS.5.1', name: 'Blockwork SC Prequalification',                 days: 4, phase: 'subcontractorPrequal' },
      { wbs: 'WBS.5.1', name: 'Waterproofing SC Prequalification',             days: 5, phase: 'subcontractorPrequal' },
      { wbs: 'WBS.5.1', name: 'MEP SC Prequalification',                       days: 6, phase: 'subcontractorPrequal' },

      // ── Shop Drawings ──
      { wbs: 'WBS.5.2', name: 'Substructure Shop Drawings — Foundations',      days: 14, phase: 'shopDrawings' },
      { wbs: 'WBS.5.2', name: 'Substructure Shop Drawings — Tie Beams',        days: 10, phase: 'shopDrawings' },
      { wbs: 'WBS.5.2', name: 'Superstructure Shop Drawings — Columns',        days: 12, phase: 'shopDrawings' },
      { wbs: 'WBS.5.2', name: 'Superstructure Shop Drawings — Slabs',          days: 14, phase: 'shopDrawings' },
      { wbs: 'WBS.5.2', name: 'MEP Shop Drawings — Mechanical',                days: 18, phase: 'shopDrawings' },
      { wbs: 'WBS.5.2', name: 'MEP Shop Drawings — Electrical',                days: 16, phase: 'shopDrawings' },
      { wbs: 'WBS.5.2', name: 'Finishes Shop Drawings — Internal',             days: 14, phase: 'shopDrawings' },
      { wbs: 'WBS.5.2', name: 'Finishes Shop Drawings — External',             days: 12, phase: 'shopDrawings' },

      // ── Material Procurement ──
      { wbs: 'WBS.5.3', name: 'Procurement — Steel Reinforcement',             days: 21, phase: 'materialProcurement' },
      { wbs: 'WBS.5.3', name: 'Procurement — Cement & Aggregates',             days: 14, phase: 'materialProcurement' },
      { wbs: 'WBS.5.3', name: 'Procurement — Blockwork',                       days: 18, phase: 'materialProcurement' },
      { wbs: 'WBS.5.3', name: 'Procurement — MEP Mechanical Equipment',        days: 45, phase: 'materialProcurement' },
      { wbs: 'WBS.5.3', name: 'Procurement — MEP Electrical Equipment',        days: 40, phase: 'materialProcurement' },
      { wbs: 'WBS.5.3', name: 'Procurement — Finishing Materials',             days: 35, phase: 'materialProcurement' },

      // ── Substructure ──
      { wbs: 'WBS.6.1', name: 'Bulk Excavation',                               days: 14, phase: 'substructure' },
      { wbs: 'WBS.6.1', name: 'Blinding for Footings',                         days: 3,  phase: 'substructure' },
      { wbs: 'WBS.6.1', name: 'Steel Reinforcement & Formwork for Footings',   days: 16, phase: 'substructure' },
      { wbs: 'WBS.6.1', name: 'Consultant / Authority Inspection — Footings',  days: 2,  phase: 'substructure' },
      { wbs: 'WBS.6.1', name: 'Concreting for Footings',                       days: 1,  phase: 'substructure' },
      { wbs: 'WBS.6.1', name: 'Waterproofing for Footings',                    days: 7,  phase: 'substructure' },
      { wbs: 'WBS.6.1', name: 'Neck Columns (Shutter, Steel Reinf., Concrete)', days: 6, phase: 'substructure' },
      { wbs: 'WBS.6.1', name: 'Back-filling & Compaction up to Tie Beam',      days: 6, phase: 'substructure' },
      { wbs: 'WBS.6.1', name: 'Steel Reinforcement for Tie Beams',             days: 8, phase: 'substructure' },
      { wbs: 'WBS.6.1', name: 'Concreting for Tie Beams',                      days: 2, phase: 'substructure' },
      { wbs: 'WBS.6.1', name: 'Steel Reinforcement & Formwork for Slab-on-Grade', days: 10, phase: 'substructure' },
      { wbs: 'WBS.6.1', name: 'Slab-on-Grade Concreting',                       days: 2, phase: 'substructure' },

      // ── Superstructure (drawing-driven floor cycles, see below) ──
      ...this.superstructureFloors(input.floorCount ?? 2),
      { wbs: 'WBS.6.2', name: 'Roof Slab — Shutter & Reinforcement',            days: 18, phase: 'superstructure' },
      { wbs: 'WBS.6.2', name: 'Roof Slab — Concreting',                         days: 2,  phase: 'superstructure' },
      { wbs: 'WBS.6.2', name: 'Roof Waterproofing',                             days: 8,  phase: 'superstructure' },
      { wbs: 'WBS.6.2', name: 'Staircases — Form, Reinforce & Concrete',        days: 12, phase: 'superstructure' },

      // ── Blockwork ──
      { wbs: 'WBS.6.3', name: 'External Blockwork',                             days: 22, phase: 'blockwork' },
      { wbs: 'WBS.6.3', name: 'Internal Blockwork',                             days: 25, phase: 'blockwork' },
      { wbs: 'WBS.6.3', name: 'External Plaster',                               days: 18, phase: 'blockwork' },
      { wbs: 'WBS.6.3', name: 'Internal Plaster',                               days: 20, phase: 'blockwork' },

      // ── MEP First Fix ──
      { wbs: 'WBS.7.1', name: 'Mechanical — Conduits Embedded in Slabs',        days: 14, phase: 'mepFirstFix' },
      { wbs: 'WBS.7.1', name: 'Electrical — Conduits Embedded in Slabs',        days: 14, phase: 'mepFirstFix' },
      { wbs: 'WBS.7.1', name: 'Plumbing — Below-grade Drainage',                days: 12, phase: 'mepFirstFix' },
      { wbs: 'WBS.7.1', name: 'HVAC — Duct Routing in Ceiling Spaces',          days: 20, phase: 'mepFirstFix' },
      { wbs: 'WBS.7.1', name: 'Fire Fighting — Sprinkler Pipework',             days: 18, phase: 'mepFirstFix' },
      { wbs: 'WBS.7.1', name: 'Electrical — Main Cable Trays',                  days: 16, phase: 'mepFirstFix' },

      // ── MEP Second Fix ──
      { wbs: 'WBS.7.2', name: 'Sanitary-ware Installation',                     days: 12, phase: 'mepSecondFix' },
      { wbs: 'WBS.7.2', name: 'HVAC Grilles & Diffusers Installation',          days: 10, phase: 'mepSecondFix' },
      { wbs: 'WBS.7.2', name: 'Electrical — Switches & Sockets',                days: 14, phase: 'mepSecondFix' },
      { wbs: 'WBS.7.2', name: 'Lighting Fixtures Installation',                 days: 12, phase: 'mepSecondFix' },
      { wbs: 'WBS.7.2', name: 'Fire Detection & Alarm Devices',                 days: 10, phase: 'mepSecondFix' },

      // ── Internal Finishing ──
      { wbs: 'WBS.8.1', name: 'Floor Tiling — Internal',                        days: 22, phase: 'internalFinishing' },
      { wbs: 'WBS.8.1', name: 'Wall Tiling — Wet Areas',                        days: 18, phase: 'internalFinishing' },
      { wbs: 'WBS.8.1', name: 'Internal Painting — Primer Coat',                days: 12, phase: 'internalFinishing' },
      { wbs: 'WBS.8.1', name: 'Internal Painting — Final Coats',                days: 14, phase: 'internalFinishing' },
      { wbs: 'WBS.8.1', name: 'False Ceiling Installation',                     days: 18, phase: 'internalFinishing' },
      { wbs: 'WBS.8.1', name: 'Joinery — Doors & Frames',                       days: 16, phase: 'internalFinishing' },
      { wbs: 'WBS.8.1', name: 'Joinery — Wardrobes & Vanities',                 days: 14, phase: 'internalFinishing' },

      // ── External Finishing ──
      { wbs: 'WBS.8.2', name: 'External Cladding & Stone',                      days: 22, phase: 'externalFinishing' },
      { wbs: 'WBS.8.2', name: 'External Painting',                              days: 14, phase: 'externalFinishing' },
      { wbs: 'WBS.8.2', name: 'Aluminium Windows & Glazing',                    days: 18, phase: 'externalFinishing' },

      // ── External Works ──
      { wbs: 'WBS.9.1', name: 'Landscaping — Soft',                             days: 14, phase: 'externalWorks' },
      { wbs: 'WBS.9.1', name: 'Landscaping — Hard (Interlocks & Kerbs)',        days: 16, phase: 'externalWorks' },
      { wbs: 'WBS.9.1', name: 'External Lighting',                              days: 10, phase: 'externalWorks' },
      { wbs: 'WBS.9.1', name: 'Boundary Wall & Gates',                          days: 12, phase: 'externalWorks' },

      // ── Testing & Commissioning ──
      { wbs: 'WBS.10.1', name: 'HVAC Testing, Adjusting & Balancing',           days: 10, phase: 'testingCommissioning' },
      { wbs: 'WBS.10.1', name: 'Electrical Load Testing',                       days: 7,  phase: 'testingCommissioning' },
      { wbs: 'WBS.10.1', name: 'Fire Fighting System Testing',                  days: 6,  phase: 'testingCommissioning' },
      { wbs: 'WBS.10.1', name: 'Plumbing Pressure Testing',                     days: 5,  phase: 'testingCommissioning' },
      { wbs: 'WBS.10.1', name: 'Authority Inspections (Civil Defence, DM)',     days: 7,  phase: 'testingCommissioning' },

      // ── Handover ──
      { wbs: 'WBS.11.1', name: 'Snag-list Preparation',                         days: 5, phase: 'handover' },
      { wbs: 'WBS.11.1', name: 'Snag Clearance',                                days: 7, phase: 'handover' },
      { wbs: 'WBS.11.1', name: 'O&M Manuals & As-built Drawings',               days: 6, phase: 'handover' },
      { wbs: 'WBS.11.1', name: 'Final Handover to Client',                      days: 1, phase: 'handover' },
    ];

    // Schedule activities chronologically inside each phase window.
    // Activities within the same phase are dispatched in series (one after
    // the next) so the within-phase sequence reads correctly. The phase
    // window may overlap with neighbour phases — that's the point.
    const byPhase = new Map<string, ActivityDef[]>();
    for (const a of acts) {
      if (!byPhase.has(a.phase)) byPhase.set(a.phase, []);
      byPhase.get(a.phase)!.push(a);
    }

    interface ScheduledActivity {
      def: ActivityDef;
      idx: number;
      startIso: string;
      finishIso: string;
      businessKey: string;
    }
    const scheduled: ScheduledActivity[] = [];
    let globalIdx = 1;

    for (const phase of Object.keys(phaseWindows)) {
      const list = byPhase.get(phase);
      if (!list) continue;
      const win = phaseWindows[phase];
      const phaseDur = Math.max(1, daysBetween(win.start, win.finish));
      // Lay each activity end-to-end inside the window — clamp if needed.
      let cursor = new Date(win.start);
      for (const def of list) {
        let s: Date;
        let f: Date;
        if (def.isMilestone) {
          if (def.finishAlign) {
            s = new Date(win.finish);
            f = new Date(win.finish);
          } else {
            s = new Date(win.start);
            f = new Date(win.start);
          }
        } else {
          s = new Date(cursor);
          // Scale duration so the phase fits if too tight.
          const totalListDays = list.reduce((acc, x) => acc + (x.isMilestone ? 0 : x.days), 0);
          const scale = phaseDur / Math.max(1, totalListDays);
          const scaled = Math.max(1, Math.round(def.days * scale));
          f = addDays(s, scaled - 1); // inclusive finish
          cursor = addDays(f, 1);
          if (cursor > win.finish) cursor = new Date(win.finish);
          if (f > finish) f = new Date(finish);
        }
        scheduled.push({
          def,
          idx: globalIdx,
          startIso: toIsoDate(s),
          finishIso: toIsoDate(f),
          businessKey: `BL-${String(globalIdx).padStart(4, '0')}`,
        });
        globalIdx += 1;
      }
    }

    // Build the simple FS dependency graph: each activity depends on the
    // previous activity in the same phase (intra-phase serial). Plus four
    // inter-phase hand-offs that anchor the critical path (mobilisation →
    // substructure → superstructure → MEP first fix → MEP second fix →
    // internal finishing → testing → handover).
    interface Dep { fromIdx: number; toIdx: number; type: 'FS' }
    const deps: Dep[] = [];
    // Intra-phase serial.
    for (const phase of Object.keys(phaseWindows)) {
      const list = scheduled.filter((s) => s.def.phase === phase && !s.def.isMilestone);
      for (let i = 1; i < list.length; i++) {
        deps.push({ fromIdx: list[i - 1].idx, toIdx: list[i].idx, type: 'FS' });
      }
    }
    // Inter-phase hand-offs (last non-milestone of phase A → first non-milestone of phase B).
    const handoffPairs: Array<[string, string]> = [
      ['mobilisation', 'substructure'],
      ['substructure', 'superstructure'],
      ['superstructure', 'mepFirstFix'],
      ['mepFirstFix', 'mepSecondFix'],
      ['mepSecondFix', 'internalFinishing'],
      ['internalFinishing', 'testingCommissioning'],
      ['testingCommissioning', 'handover'],
    ];
    for (const [from, to] of handoffPairs) {
      const fromList = scheduled.filter((s) => s.def.phase === from && !s.def.isMilestone);
      const toList = scheduled.filter((s) => s.def.phase === to && !s.def.isMilestone);
      if (fromList.length && toList.length) {
        deps.push({
          fromIdx: fromList[fromList.length - 1].idx,
          toIdx: toList[0].idx,
          type: 'FS',
        });
      }
    }

    // Compute total float per activity via forward + backward pass.
    const activities = scheduled.map((s) => ({
      idx: s.idx,
      es: parseDate(s.startIso),
      ef: parseDate(s.finishIso),
      duration: Math.max(0, daysBetween(parseDate(s.startIso), parseDate(s.finishIso))),
      isMilestone: !!s.def.isMilestone,
    }));
    const idxMap = new Map<number, typeof activities[number]>();
    for (const a of activities) idxMap.set(a.idx, a);

    // Backward pass — for each node, latest finish = min(LF of successors) − 0.
    const lf = new Map<number, Date>();
    const ls = new Map<number, Date>();
    for (const a of activities) lf.set(a.idx, new Date(finish));
    // Process in reverse topological-ish order: descending start date is a fair proxy.
    const reverseOrder = [...activities].sort((a, b) => b.ef.getTime() - a.ef.getTime());
    for (const a of reverseOrder) {
      const succ = deps.filter((d) => d.fromIdx === a.idx);
      if (succ.length > 0) {
        let earliestSuccLs: Date | null = null;
        for (const d of succ) {
          const sNode = idxMap.get(d.toIdx);
          if (!sNode) continue;
          const sLs = ls.get(d.toIdx) ?? sNode.es;
          if (!earliestSuccLs || sLs.getTime() < earliestSuccLs.getTime()) {
            earliestSuccLs = sLs;
          }
        }
        if (earliestSuccLs) {
          // LF = predecessor's LS − 1 day (FS finish-to-start dependency).
          lf.set(a.idx, addDays(earliestSuccLs, -1));
        }
      }
      const a_lf = lf.get(a.idx)!;
      ls.set(a.idx, addDays(a_lf, -a.duration));
    }

    // Total float (days) = LS − ES.
    const out: TemplateActivity[] = scheduled.map((s) => {
      const a = idxMap.get(s.idx)!;
      const a_ls = ls.get(s.idx)!;
      const float = Math.max(0, daysBetween(a.es, a_ls));
      return {
        businessKey: s.businessKey,
        idx: s.idx,
        wbsCode: s.def.wbs,
        name: s.def.name,
        plannedStart: s.startIso,
        plannedFinish: s.finishIso,
        plannedDurationDays: a.duration,
        isMilestone: a.isMilestone,
        totalFloatDays: float,
        isCritical: float === 0,
        phase: s.def.phase,
      };
    });

    const dependencyOut: TemplateDependency[] = deps.map((d) => ({
      predecessorBusinessKey: out.find((a) => a.idx === d.fromIdx)!.businessKey,
      successorBusinessKey: out.find((a) => a.idx === d.toIdx)!.businessKey,
      type: d.type,
    }));

    this.logger.log(
      `Synthesised baseline: ${out.length} activities across ${wbs.length} WBS branches; ` +
        `${out.filter((a) => a.isCritical).length} critical; project window ${toIsoDate(start)} → ${toIsoDate(finish)}.`,
    );

    return { activities: out, dependencies: dependencyOut, wbs };
  }

  /**
   * One columns+slab cycle per above-ground floor. Floor names follow the
   * construction convention (Ground, First, Second, …). A G+5 drawing set
   * yields 6 cycles = 24 activities here instead of the template's 8 —
   * the drawing-driven requirement of correction-plan §2.1 made concrete.
   */
  private superstructureFloors(floorCount: number): ActivityDef[] {
    const floors = Math.max(1, Math.min(40, Math.round(floorCount)));
    const name = (i: number): string => {
      const names = ['Ground', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
      return i < names.length ? `${names[i]} Floor` : `Floor ${i}`;
    };
    const out: ActivityDef[] = [];
    for (let i = 0; i < floors; i += 1) {
      out.push(
        { wbs: 'WBS.6.2', name: `${name(i)} Columns — Shutter & Reinforcement`, days: 14, phase: 'superstructure' },
        { wbs: 'WBS.6.2', name: `${name(i)} Columns — Concreting`,              days: 3,  phase: 'superstructure' },
        { wbs: 'WBS.6.2', name: `${name(i)} Slab — Shutter & Reinforcement`,    days: 18, phase: 'superstructure' },
        { wbs: 'WBS.6.2', name: `${name(i)} Slab — Concreting`,                 days: 2,  phase: 'superstructure' },
      );
    }
    return out;
  }
}

// ─────────────────────── pure types + helpers ───────────────────────

interface WbsNode {
  code: string;
  name: string;
  children?: WbsNode[];
}

interface ActivityDef {
  wbs: string;
  name: string;
  days: number;
  phase: string;
  isMilestone?: boolean;
  finishAlign?: boolean;
}

export interface TemplateActivity {
  businessKey: string;
  idx: number;
  wbsCode: string;
  name: string;
  plannedStart: string;
  plannedFinish: string;
  plannedDurationDays: number;
  isMilestone: boolean;
  totalFloatDays: number;
  isCritical: boolean;
  phase: string;
}

export interface TemplateDependency {
  predecessorBusinessKey: string;
  successorBusinessKey: string;
  type: 'FS';
}

export interface SynthesisResult {
  activities: TemplateActivity[];
  dependencies: TemplateDependency[];
  wbs: WbsNode[];
}

function parseDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
