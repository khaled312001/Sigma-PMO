import { CompanyType } from '../canonical/entities/company.entity';
import { Role } from '../auth/roles.enum';

/**
 * Company-type → platform configuration. The construction-entity type chosen at
 * sign-up decides the role the registering owner gets and the set of roles that
 * company may assign to its users (which in turn drives the modules they see via
 * the existing capability matrix). This is the "the type configures the
 * platform" behaviour.
 */
export interface CompanyPreset {
  type: CompanyType;
  labelEn: string;
  labelAr: string;
  /** Role given to the registering owner. */
  ownerRole: Role;
  /** Roles this company may assign to the users it invites. */
  allowedRoles: Role[];
}

export const COMPANY_PRESETS: Record<CompanyType, CompanyPreset> = {
  developer_owner: {
    type: 'developer_owner',
    labelEn: 'Developer / Owner',
    labelAr: 'مطوّر / مالك',
    ownerRole: Role.OWNER,
    allowedRoles: [Role.OWNER, Role.CLIENT, Role.CONSULTANT, Role.PMO, Role.CONTRACTOR],
  },
  contractor: {
    type: 'contractor',
    labelEn: 'Contractor',
    labelAr: 'مقاول',
    ownerRole: Role.CONTRACTOR,
    allowedRoles: [Role.CONTRACTOR, Role.SUBCONTRACTOR, Role.PMO, Role.OPERATOR],
  },
  consultant: {
    type: 'consultant',
    labelEn: 'Consultant',
    labelAr: 'استشاري',
    ownerRole: Role.CONSULTANT,
    allowedRoles: [Role.CONSULTANT, Role.PMO, Role.CONTRACTOR],
  },
  pmo: {
    type: 'pmo',
    labelEn: 'PMO / Project Management',
    labelAr: 'مكتب إدارة المشاريع',
    ownerRole: Role.PMO,
    allowedRoles: [Role.PMO, Role.CONSULTANT, Role.CONTRACTOR, Role.GOVERNANCE_BOARD],
  },
  investor: {
    type: 'investor',
    labelEn: 'Investor',
    labelAr: 'مستثمر',
    ownerRole: Role.INVESTOR,
    allowedRoles: [Role.INVESTOR, Role.LENDER, Role.ASSET_MANAGER],
  },
  lender: {
    type: 'lender',
    labelEn: 'Lender / Bank',
    labelAr: 'مموّل / بنك',
    ownerRole: Role.LENDER,
    allowedRoles: [Role.LENDER, Role.BANK, Role.INVESTOR],
  },
  government: {
    type: 'government',
    labelEn: 'Government / Regulator',
    labelAr: 'جهة حكومية / تنظيمية',
    ownerRole: Role.GOVERNMENT_REGULATOR,
    allowedRoles: [Role.GOVERNMENT_REGULATOR, Role.GOVERNANCE_BOARD],
  },
  operator: {
    type: 'operator',
    labelEn: 'Operator / Asset Manager',
    labelAr: 'مشغّل / مدير أصول',
    ownerRole: Role.OPERATOR,
    allowedRoles: [Role.OPERATOR, Role.ASSET_MANAGER, Role.PMO],
  },
};

export function presetFor(type: CompanyType): CompanyPreset {
  return COMPANY_PRESETS[type] ?? COMPANY_PRESETS.pmo;
}

/** Slugify a company name → url-safe ascii slug (caller ensures uniqueness). */
export function slugifyCompany(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/[؀-ۿ]/g, '') // drop arabic for the ascii slug
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'company';
}
