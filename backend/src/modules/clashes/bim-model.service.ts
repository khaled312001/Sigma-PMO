import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ProjectRecord } from '../canonical/entities';
import { StorageService } from '../ingestion/storage/storage.service';

/** One detected building storey (level) from the IFC model. */
export interface BimStorey {
  name: string;
  elevation: number | null;
}

/** Element-instance counts by IFC entity family. */
export interface BimCounts {
  walls: number;
  slabs: number;
  columns: number;
  beams: number;
  doors: number;
  windows: number;
  spaces: number;
  storeys: number;
}

/** A pass/fail check carried on the BIM record's details.checks. */
export interface BimCheck {
  check: string;
  pass: boolean;
}

/** The deterministic feature pack extracted from one IFC STEP file. */
export interface BimModelSummary {
  projectName: string | null;
  unitsDefined: boolean;
  storeys: BimStorey[];
  counts: BimCounts;
  checks: { validation: BimCheck[]; governance: BimCheck[] };
}

const MAX_BYTES = 50 * 1024 * 1024;

/**
 * BimModelService — phase-2 BIM/IFC intake (drawings correction-plan §2.1
 * "IFC (phase 2)"; clash module §3.7). Accepts an IFC STEP text file
 * (`ISO-10303-21`), archives the bytes immutably via StorageService, and runs
 * a HAND-ROLLED deterministic parser over the entity-instance lines — NO new
 * dependency, NO geometry kernel. We scan for the entity families a governance
 * reviewer cares about (storeys, spaces, walls/slabs/columns/beams,
 * doors/windows), capture the IFCPROJECT name + unit definitions, then compute
 * model-validation and governance checks at upload time.
 *
 * Honesty contract (mirrors DrawingsService): the parser reports only what it
 * detected in the STEP text. It does not interpret geometry, resolve the IFC
 * inheritance graph, or invent counts — a malformed or non-IFC file yields an
 * explicit error, not a guessed summary. The result is persisted as a
 * `ProjectRecord` (recordType 'bim-model') so it rides the same append-only
 * provenance + downstream-agent surface as every other L1 record family.
 */
@Injectable()
export class BimModelService {
  private readonly logger = new Logger(BimModelService.name);

  constructor(
    @InjectRepository(ProjectRecord) private readonly records: Repository<ProjectRecord>,
    private readonly storage: StorageService,
  ) {}

  /** Ingest + validate one IFC STEP file. */
  async ingestIfc(input: {
    projectKey: string;
    filename: string;
    buffer: Buffer;
    uploadedBy?: string | null;
  }): Promise<ProjectRecord> {
    if (!input.projectKey?.trim()) throw new BadRequestException('projectKey is required');
    if (!input.filename?.toLowerCase().endsWith('.ifc')) {
      throw new BadRequestException('BIM intake accepts .ifc STEP text files only.');
    }
    if (input.buffer.length > MAX_BYTES) {
      throw new BadRequestException(`File exceeds the ${MAX_BYTES / 1024 / 1024} MB IFC limit.`);
    }
    const text = input.buffer.toString('utf8');
    // ISO-10303-21 is the STEP header marker every IFC file opens with.
    if (!/ISO-10303-21/.test(text) && !/IFC[24]X?\d?/i.test(text)) {
      throw new BadRequestException('File does not look like an IFC STEP text (missing ISO-10303-21 / IFC schema header).');
    }

    // Immutable archive first — evidence chain before parsing.
    const sha256 = this.storage.sha256(input.buffer);
    const storedPath = await this.storage.archive(input.filename, input.buffer, sha256);

    const summary = this.parseIfc(text);

    const businessKey = `${input.projectKey}:bim:${input.filename}`;
    const prior = await this.records.findOne({ where: { businessKey, isCurrent: true } });
    if (prior) {
      prior.isCurrent = false;
      await this.records.save(prior);
    }
    const version = prior ? prior.version + 1 : 1;

    const row = await this.records.save(
      this.records.create({
        businessKey,
        version,
        isCurrent: true,
        rawSource: { source: 'bim-ifc-intake', filename: input.filename, sha256 },
        ingestionRunId: `bim-${businessKey}-v${version}`,
        sourceFileId: storedPath,
        projectBusinessKey: input.projectKey,
        recordType: 'bim-model',
        refNumber: input.filename,
        title: summary.projectName
          ? `IFC model — ${summary.projectName}`
          : `IFC model — ${input.filename}`,
        status: this.allPass(summary.checks.validation) ? 'valid' : 'flagged',
        party: input.uploadedBy ?? null,
        details: {
          projectName: summary.projectName,
          unitsDefined: summary.unitsDefined,
          storeys: summary.storeys,
          counts: summary.counts,
          checks: summary.checks,
          storedPath,
          sha256,
          byteSize: input.buffer.length,
        },
      }),
    );

    this.logger.log(
      `BIM model ${row.id} ingested for ${input.projectKey}: ` +
        `${summary.counts.storeys} storey(s), ${this.totalElements(summary.counts)} element(s).`,
    );
    return row;
  }

  /** BIM-model records for one project, newest first. */
  list(projectKey: string): Promise<ProjectRecord[]> {
    if (!projectKey?.trim()) throw new BadRequestException('projectKey is required');
    return this.records.find({
      where: { projectBusinessKey: projectKey, recordType: 'bim-model', isCurrent: true },
      order: { createdAt: 'DESC' },
    });
  }

  // ───────────────────────── internals ─────────────────────────

  /**
   * Hand-rolled IFC STEP parser. IFC bodies are a flat list of entity
   * instances: `#42=IFCWALLSTANDARDCASE('guid',#1,'Name',...);`. We scan
   * per-instance (entities can span lines, so we re-join on `;`) and tally the
   * families we care about. Names/elevations are pulled from the quoted/number
   * argument positions IFC fixes for IFCBUILDINGSTOREY.
   */
  private parseIfc(text: string): BimModelSummary {
    // Work on the DATA section only; HEADER carries FILE_* metadata.
    const dataStart = text.indexOf('DATA;');
    const body = dataStart >= 0 ? text.slice(dataStart + 5) : text;

    // Split into entity instances on the STEP record terminator ';'. Cheap and
    // robust enough for counting — we are not building the object graph.
    const instances = body.split(';');

    const counts: BimCounts = {
      walls: 0, slabs: 0, columns: 0, beams: 0,
      doors: 0, windows: 0, spaces: 0, storeys: 0,
    };
    const storeys: BimStorey[] = [];
    let projectName: string | null = null;
    let unitsDefined = false;

    for (const raw of instances) {
      const inst = raw.trim();
      if (!inst.startsWith('#')) continue;
      const eq = inst.indexOf('=');
      if (eq < 0) continue;
      const def = inst.slice(eq + 1).trimStart();
      const type = (def.match(/^([A-Z0-9_]+)\s*\(/) ?? [])[1];
      if (!type) continue;

      if (type === 'IFCBUILDINGSTOREY') {
        counts.storeys += 1;
        storeys.push(this.parseStorey(def));
      } else if (type === 'IFCSPACE') {
        counts.spaces += 1;
      } else if (type.startsWith('IFCWALL')) {
        counts.walls += 1;
      } else if (type === 'IFCSLAB') {
        counts.slabs += 1;
      } else if (type === 'IFCCOLUMN') {
        counts.columns += 1;
      } else if (type === 'IFCBEAM') {
        counts.beams += 1;
      } else if (type === 'IFCDOOR') {
        counts.doors += 1;
      } else if (type === 'IFCWINDOW') {
        counts.windows += 1;
      } else if (type === 'IFCPROJECT' && projectName === null) {
        projectName = this.firstQuoted(def);
      } else if (type === 'IFCSIUNIT' || type === 'IFCUNITASSIGNMENT') {
        unitsDefined = true;
      }
    }

    // Sort storeys by elevation so the UI shows them bottom-to-top.
    storeys.sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0));

    const validation = this.validationChecks(counts, unitsDefined);
    const governance = this.governanceChecks(storeys, projectName, counts);

    return {
      projectName,
      unitsDefined,
      storeys,
      counts,
      checks: { validation, governance },
    };
  }

  /**
   * IFCBUILDINGSTOREY signature:
   *   IFCBUILDINGSTOREY(GlobalId, OwnerHistory, Name, Description,
   *     ObjectType, ObjectPlacement, Representation, LongName,
   *     CompositionType, Elevation)
   * Name = the 3rd argument (1st quoted string after the guid); Elevation =
   * the trailing numeric argument. We pull both defensively.
   */
  private parseStorey(def: string): BimStorey {
    const quoted = [...def.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
    // arg0 = GlobalId (quoted), arg2 (Name) is the 2nd quoted entry typically.
    const name = (quoted[1] ?? quoted[0] ?? 'Unnamed storey').trim() || 'Unnamed storey';
    // Elevation: the last bare REAL argument in the list. IFC writes reals with
    // a trailing dot (`0.`, `3500.`, `1.2E3`), so we split on top-level commas
    // and keep the last whole-token that is purely numeric (a REAL, never a
    // ref `#42`, enum `.ELEMENT.`, string, or `$`).
    const argsInner = def.slice(def.indexOf('(') + 1, def.lastIndexOf(')'));
    const realRe = /^-?\d+(?:\.\d*)?(?:E[-+]?\d+)?$/i;
    let elevation: number | null = null;
    for (const tok of argsInner.split(',')) {
      const t = tok.trim();
      if (realRe.test(t) && /\d/.test(t)) {
        const n = parseFloat(t);
        if (Number.isFinite(n)) elevation = n;
      }
    }
    return { name, elevation };
  }

  /** First quoted string argument of a STEP record (e.g. IFCPROJECT Name). */
  private firstQuoted(def: string): string | null {
    const m = def.match(/'((?:[^']|'')*)'/g);
    if (!m || m.length === 0) return null;
    // arg0 is the GlobalId; Name is usually the 2nd quoted value.
    const candidate = (m[1] ?? m[0]).replace(/^'|'$/g, '').replace(/''/g, "'").trim();
    return candidate.length > 0 ? candidate : null;
  }

  private validationChecks(counts: BimCounts, unitsDefined: boolean): BimCheck[] {
    const structural = counts.walls + counts.slabs + counts.columns + counts.beams;
    return [
      { check: 'Has storeys', pass: counts.storeys > 0 },
      { check: 'Units defined', pass: unitsDefined },
      { check: 'Has structural elements', pass: structural > 0 },
      { check: 'Has spaces', pass: counts.spaces > 0 },
    ];
  }

  private governanceChecks(
    storeys: BimStorey[],
    projectName: string | null,
    counts: BimCounts,
  ): BimCheck[] {
    // Storey naming convention: "Level NN" / "LNN" / "L NN" (case-insensitive).
    const namingRe = /^(level\s*\d+|l\s*\d+|l\d+)$/i;
    const namingOk =
      storeys.length > 0 && storeys.every((s) => namingRe.test(s.name.trim()));
    return [
      { check: 'Storey naming convention (Level NN / LNN)', pass: namingOk },
      { check: 'Project name set', pass: !!projectName && projectName.trim().length > 0 },
      { check: 'Element density sane (>10 elements)', pass: this.totalElements(counts) > 10 },
    ];
  }

  private totalElements(c: BimCounts): number {
    return c.walls + c.slabs + c.columns + c.beams + c.doors + c.windows + c.spaces;
  }

  private allPass(checks: BimCheck[]): boolean {
    return checks.every((c) => c.pass);
  }
}
