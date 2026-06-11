import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GovernanceStatus, HierarchyLevel } from '../../common/enums';
import {
  Enterprise,
  Portfolio,
  Program,
  Project,
} from '../canonical/entities';

/** Shape of one node in the assembled governance tree. */
export interface TreeProject {
  businessKey: string;
  name: string;
  governanceStatus: string | null;
  lifecyclePhase: string | null;
}
export interface TreeProgram {
  businessKey: string;
  name: string;
  governanceStatus: string;
  currentPhase: string | null;
  projects: TreeProject[];
}
export interface TreePortfolio {
  businessKey: string;
  name: string;
  governanceStatus: string;
  programs: TreeProgram[];
}
export interface TreeEnterprise {
  businessKey: string;
  name: string;
  governanceStatus: string;
  portfolios: TreePortfolio[];
}
export interface GovernanceTree {
  enterprises: TreeEnterprise[];
  /** Projects not yet attached to any program (project-level-only governance). */
  unattachedProjects: TreeProject[];
}

/** A sentinel run/source id for governance nodes created by hand (not ingested). */
const MANUAL = 'manual-governance';

/**
 * HierarchyService — CRUD + assembly for the governance hierarchy
 * (Enterprise → Portfolio → Program → Project). Nodes extend TraceableEntity
 * so they share the append-only provenance shape; manually-created governance
 * nodes carry the `manual-governance` sentinel provenance. The tree is keyed
 * by businessKey throughout (never raw id).
 */
@Injectable()
export class HierarchyService {
  constructor(
    @InjectRepository(Enterprise) private readonly enterprises: Repository<Enterprise>,
    @InjectRepository(Portfolio) private readonly portfolios: Repository<Portfolio>,
    @InjectRepository(Program) private readonly programs: Repository<Program>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
  ) {}

  // ───────────────────────── create ─────────────────────────

  async createEnterprise(input: { businessKey: string; name: string; description?: string }): Promise<Enterprise> {
    this.requireKey(input.businessKey, input.name);
    const existing = await this.enterprises.findOne({
      where: { businessKey: input.businessKey, isCurrent: true },
    });
    if (existing) {
      throw new BadRequestException(`A current enterprise with businessKey "${input.businessKey}" already exists`);
    }
    return this.enterprises.save(
      this.enterprises.create({
        ...this.provenance(input.businessKey),
        name: input.name,
        description: input.description ?? null,
        governanceStatus: GovernanceStatus.GREEN,
      }),
    );
  }

  async createPortfolio(input: {
    businessKey: string; name: string; description?: string;
    enterpriseBusinessKey?: string; strategicAlignment?: string;
  }): Promise<Portfolio> {
    this.requireKey(input.businessKey, input.name);
    const existing = await this.portfolios.findOne({
      where: { businessKey: input.businessKey, isCurrent: true },
    });
    if (existing) {
      throw new BadRequestException(`A current portfolio with businessKey "${input.businessKey}" already exists`);
    }
    if (input.enterpriseBusinessKey) {
      const parent = await this.enterprises.findOne({
        where: { businessKey: input.enterpriseBusinessKey, isCurrent: true },
      });
      if (!parent) throw new NotFoundException(`No current enterprise "${input.enterpriseBusinessKey}"`);
    }
    return this.portfolios.save(
      this.portfolios.create({
        ...this.provenance(input.businessKey),
        name: input.name,
        description: input.description ?? null,
        enterpriseBusinessKey: input.enterpriseBusinessKey ?? null,
        strategicAlignment: input.strategicAlignment ?? null,
        governanceStatus: GovernanceStatus.GREEN,
      }),
    );
  }

  async createProgram(input: {
    businessKey: string; name: string; description?: string;
    portfolioBusinessKey?: string; governanceOwner?: string;
  }): Promise<Program> {
    this.requireKey(input.businessKey, input.name);
    const existing = await this.programs.findOne({
      where: { businessKey: input.businessKey, isCurrent: true },
    });
    if (existing) {
      throw new BadRequestException(`A current program with businessKey "${input.businessKey}" already exists`);
    }
    if (input.portfolioBusinessKey) {
      const parent = await this.portfolios.findOne({
        where: { businessKey: input.portfolioBusinessKey, isCurrent: true },
      });
      if (!parent) throw new NotFoundException(`No current portfolio "${input.portfolioBusinessKey}"`);
    }
    return this.programs.save(
      this.programs.create({
        ...this.provenance(input.businessKey),
        name: input.name,
        description: input.description ?? null,
        portfolioBusinessKey: input.portfolioBusinessKey ?? null,
        governanceOwner: input.governanceOwner ?? null,
        currentPhase: null,
        governanceStatus: GovernanceStatus.GREEN,
      }),
    );
  }

  // ───────────────────────── linking ─────────────────────────

  /**
   * Attach a project to a program, denormalizing the full ancestry
   * (program + portfolio + enterprise businessKeys) onto the project row so
   * roll-up queries never walk the tree at read time.
   */
  async attachProjectToProgram(projectKey: string, programKey: string): Promise<Project> {
    const project = await this.projects.findOne({
      where: { businessKey: projectKey, isCurrent: true },
    });
    if (!project) throw new NotFoundException(`No current project "${projectKey}"`);
    const program = await this.programs.findOne({
      where: { businessKey: programKey, isCurrent: true },
    });
    if (!program) throw new NotFoundException(`No current program "${programKey}"`);

    let portfolioKey: string | null = program.portfolioBusinessKey ?? null;
    let enterpriseKey: string | null = null;
    if (portfolioKey) {
      const portfolio = await this.portfolios.findOne({
        where: { businessKey: portfolioKey, isCurrent: true },
      });
      enterpriseKey = portfolio?.enterpriseBusinessKey ?? null;
    }

    project.programBusinessKey = programKey;
    project.portfolioBusinessKey = portfolioKey;
    project.enterpriseBusinessKey = enterpriseKey;
    return this.projects.save(project);
  }

  /** Set a project's lifecycle phase. */
  async setProjectPhase(projectKey: string, phase: string): Promise<Project> {
    const project = await this.projects.findOne({
      where: { businessKey: projectKey, isCurrent: true },
    });
    if (!project) throw new NotFoundException(`No current project "${projectKey}"`);
    project.lifecyclePhase = phase;
    return this.projects.save(project);
  }

  // ───────────────────────── assembly ─────────────────────────

  async getTree(): Promise<GovernanceTree> {
    const [enterprises, portfolios, programs, projects] = await Promise.all([
      this.enterprises.find({ where: { isCurrent: true } }),
      this.portfolios.find({ where: { isCurrent: true } }),
      this.programs.find({ where: { isCurrent: true } }),
      this.projects.find({ where: { isCurrent: true } }),
    ]);

    const projByProgram = new Map<string, TreeProject[]>();
    const unattached: TreeProject[] = [];
    for (const p of projects) {
      const tp: TreeProject = {
        businessKey: p.businessKey,
        name: p.name,
        governanceStatus: p.governanceStatus ?? null,
        lifecyclePhase: p.lifecyclePhase ?? null,
      };
      if (p.programBusinessKey) {
        const arr = projByProgram.get(p.programBusinessKey) ?? [];
        arr.push(tp);
        projByProgram.set(p.programBusinessKey, arr);
      } else {
        unattached.push(tp);
      }
    }

    const progByPortfolio = new Map<string, TreeProgram[]>();
    for (const pr of programs) {
      const tpr: TreeProgram = {
        businessKey: pr.businessKey,
        name: pr.name,
        governanceStatus: String(pr.governanceStatus),
        currentPhase: pr.currentPhase ?? null,
        projects: projByProgram.get(pr.businessKey) ?? [],
      };
      const key = pr.portfolioBusinessKey ?? '__none__';
      const arr = progByPortfolio.get(key) ?? [];
      arr.push(tpr);
      progByPortfolio.set(key, arr);
    }

    const portByEnterprise = new Map<string, TreePortfolio[]>();
    for (const pf of portfolios) {
      const tpf: TreePortfolio = {
        businessKey: pf.businessKey,
        name: pf.name,
        governanceStatus: String(pf.governanceStatus),
        programs: progByPortfolio.get(pf.businessKey) ?? [],
      };
      const key = pf.enterpriseBusinessKey ?? '__none__';
      const arr = portByEnterprise.get(key) ?? [];
      arr.push(tpf);
      portByEnterprise.set(key, arr);
    }

    const treeEnterprises: TreeEnterprise[] = enterprises.map((e) => ({
      businessKey: e.businessKey,
      name: e.name,
      governanceStatus: String(e.governanceStatus),
      portfolios: portByEnterprise.get(e.businessKey) ?? [],
    }));

    return { enterprises: treeEnterprises, unattachedProjects: unattached };
  }

  // ───────────────────────── helpers ─────────────────────────

  private requireKey(businessKey: string, name: string): void {
    if (!businessKey?.trim()) throw new BadRequestException('businessKey is required');
    if (!name?.trim()) throw new BadRequestException('name is required');
  }

  private provenance(businessKey: string) {
    return {
      businessKey,
      version: 1,
      isCurrent: true,
      rawSource: { source: MANUAL },
      ingestionRunId: MANUAL,
      sourceFileId: MANUAL,
    };
  }

}
