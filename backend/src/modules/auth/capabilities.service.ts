import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RoleCapabilityOverride } from '../canonical/entities';
import { CAPABILITY_FLAGS, ROLE_CAPABILITIES, Role } from './roles.enum';

type Caps = (typeof ROLE_CAPABILITIES)[Role];
export type CapabilityFlag = keyof Caps;

/**
 * CapabilitiesService — the single source of truth for "can role X do Y?",
 * merging the hardcoded `ROLE_CAPABILITIES` defaults with admin-set
 * `RoleCapabilityOverride` rows. The merged matrix is held in an in-memory
 * cache (rebuilt on init + on every change) so the ApiKeyGuard can answer
 * synchronously on every request. This is what makes admin permission control
 * actually ENFORCED, not cosmetic.
 *
 * Guardrails (lockout protection):
 *  - the `sigma_admin` role is immutable — it always keeps every capability;
 *  - `canRead` can never be disabled for any role (everyone needs to read);
 *  - `canManageRoles` can never be disabled (so an admin can't lock everyone
 *    out of the controls).
 */
@Injectable()
export class CapabilitiesService implements OnModuleInit {
  private readonly logger = new Logger(CapabilitiesService.name);
  private cache: Record<string, Caps> = this.cloneDefaults();

  constructor(
    @InjectRepository(RoleCapabilityOverride)
    private readonly overrides: Repository<RoleCapabilityOverride>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rebuild();
  }

  /** Synchronous capability check used by the guard. */
  can(role: string, capability: string): boolean {
    const caps = this.cache[role];
    if (!caps) return false;
    return !!(caps as Record<string, boolean>)[capability];
  }

  /** The full effective matrix (defaults merged with overrides). */
  effectiveMatrix(): Record<string, Caps> {
    return this.cache;
  }

  flags(): string[] {
    return [...CAPABILITY_FLAGS] as string[];
  }

  roles(): string[] {
    return Object.values(Role);
  }

  listOverrides(): Promise<RoleCapabilityOverride[]> {
    return this.overrides.find({ order: { role: 'ASC', capability: 'ASC' } });
  }

  /** Set (or clear-to-default) one (role, capability) pair, with guardrails. */
  async setOverride(
    role: string,
    capability: string,
    enabled: boolean,
    updatedBy: string | null,
  ): Promise<void> {
    if (!Object.values(Role).includes(role as Role)) {
      throw new BadRequestException(`Unknown role "${role}"`);
    }
    if (!(CAPABILITY_FLAGS as string[]).includes(capability)) {
      throw new BadRequestException(`Unknown capability "${capability}"`);
    }
    if (role === Role.SIGMA_ADMIN) {
      throw new ForbiddenException('The sigma_admin role is immutable and always retains every capability.');
    }
    if ((capability === 'canRead' || capability === 'canManageRoles') && !enabled) {
      throw new ForbiddenException(`"${capability}" cannot be disabled (lockout protection).`);
    }

    const existing = await this.overrides.findOne({ where: { role, capability } });
    const defaultValue = !!(ROLE_CAPABILITIES[role as Role] as Record<string, boolean>)[capability];

    if (enabled === defaultValue) {
      // Back to default → remove the override row so the matrix stays clean.
      if (existing) await this.overrides.remove(existing);
    } else {
      const row = existing ?? this.overrides.create({ role, capability });
      row.enabled = enabled;
      row.updatedBy = updatedBy;
      row.updatedAt = new Date();
      await this.overrides.save(row);
    }
    await this.rebuild();
    this.logger.log(`Capability ${role}.${capability} set to ${enabled} by ${updatedBy ?? 'unknown'}`);
  }

  /** Clear all overrides for a role (or all roles when role is omitted). */
  async reset(role?: string): Promise<void> {
    if (role) {
      if (!Object.values(Role).includes(role as Role)) {
        throw new BadRequestException(`Unknown role "${role}"`);
      }
      await this.overrides.delete({ role });
    } else {
      await this.overrides.clear();
    }
    await this.rebuild();
    this.logger.log(`Capability overrides reset for ${role ?? 'all roles'}`);
  }

  // ───────────────────────── internals ─────────────────────────

  private async rebuild(): Promise<void> {
    const next = this.cloneDefaults();
    const rows = await this.overrides.find();
    for (const r of rows) {
      if (r.role === Role.SIGMA_ADMIN) continue; // immutable
      const caps = next[r.role] as Record<string, boolean> | undefined;
      if (caps && (CAPABILITY_FLAGS as string[]).includes(r.capability)) {
        caps[r.capability] = r.enabled;
      }
    }
    // Re-assert the lockout guardrails defensively: everyone keeps canRead,
    // admin keeps every capability.
    for (const role of Object.values(Role)) {
      (next[role] as Record<string, boolean>).canRead = true;
    }
    next[Role.SIGMA_ADMIN] = { ...ROLE_CAPABILITIES[Role.SIGMA_ADMIN] };
    this.cache = next;
  }

  private cloneDefaults(): Record<string, Caps> {
    const out: Record<string, Caps> = {};
    for (const role of Object.values(Role)) {
      out[role] = { ...ROLE_CAPABILITIES[role] };
    }
    return out;
  }
}
