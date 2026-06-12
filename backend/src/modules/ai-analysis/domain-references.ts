/**
 * Domain reference catalogue — REAL, citeable scientific & professional sources
 * (Mr. Ayham, 2026-06-12: "real scientific evidence from books or domain
 * websites"). These are the authoritative standards, professional statements
 * and texts the AI analysis layer is instructed to ground its narrative in,
 * cited via `[SOURCE: id]`. No fabricated sources: every entry is a real,
 * verifiable publication/standard with its issuing body and reference.
 *
 * This is a curated bibliography, NOT a priced cost database — consistent with
 * the platform's "Sigma's own engine, no commercial cost feeds" position.
 */

export interface DomainReference {
  id: string;
  title: string;
  author: string; // issuing body / author
  kind: 'standard' | 'professional-statement' | 'book' | 'guidance' | 'web';
  reference: string; // edition / identifier
  url?: string;
  domains: DomainKey[];
}

export type DomainKey = 'quantity-survey' | 'cost' | 'classification' | 'procurement' | 'revenue' | 'feasibility' | 'governance';

export const DOMAIN_REFERENCES: DomainReference[] = [
  // ── Quantity surveying & cost management ──
  {
    id: 'RICS-NRM1', title: 'RICS New Rules of Measurement, NRM1: Order of cost estimating and cost planning for capital building works',
    author: 'Royal Institution of Chartered Surveyors (RICS)', kind: 'standard', reference: 'NRM1, 2nd ed.',
    url: 'https://www.rics.org/profession-standards/rics-standards-and-guidance/sector-standards/construction-standards/new-rules-of-measurement',
    domains: ['quantity-survey', 'cost', 'classification', 'feasibility'],
  },
  {
    id: 'RICS-NRM2', title: 'RICS NRM2: Detailed measurement for building works',
    author: 'Royal Institution of Chartered Surveyors (RICS)', kind: 'standard', reference: 'NRM2',
    domains: ['quantity-survey', 'cost', 'classification'],
  },
  {
    id: 'RICS-NRM3', title: 'RICS NRM3: Order of cost estimating and cost planning for building maintenance works',
    author: 'Royal Institution of Chartered Surveyors (RICS)', kind: 'standard', reference: 'NRM3',
    domains: ['cost', 'feasibility'],
  },
  {
    id: 'CESMM4', title: 'Civil Engineering Standard Method of Measurement (CESMM4)',
    author: 'Institution of Civil Engineers (ICE)', kind: 'standard', reference: 'CESMM4, ICE Publishing',
    domains: ['quantity-survey', 'classification'],
  },
  {
    id: 'ASTM-E1557', title: 'Standard Classification for Building Elements and Related Sitework — UNIFORMAT II',
    author: 'ASTM International', kind: 'standard', reference: 'ASTM E1557-09 (2020)',
    url: 'https://www.astm.org/e1557-09r20.html',
    domains: ['classification', 'cost'],
  },
  {
    id: 'CSI-MASTERFORMAT', title: 'MasterFormat: Master List of Numbers and Titles for the Construction Industry',
    author: 'Construction Specifications Institute (CSI) & CSC', kind: 'standard', reference: 'MasterFormat 2020',
    url: 'https://www.csiresources.org/standards/masterformat',
    domains: ['classification', 'procurement'],
  },
  {
    id: 'RICS-COST-PREDICTION', title: 'Cost prediction (RICS professional statement)',
    author: 'Royal Institution of Chartered Surveyors (RICS)', kind: 'professional-statement', reference: '1st ed., 2020',
    domains: ['cost', 'quantity-survey', 'feasibility'],
  },
  {
    id: 'AACE-18R-97', title: 'Cost Estimate Classification System — As Applied in Engineering, Procurement, and Construction',
    author: 'AACE International', kind: 'guidance', reference: 'Recommended Practice 18R-97',
    domains: ['cost', 'feasibility', 'procurement'],
  },
  {
    id: 'SEELEY-QS', title: 'Quantity Surveying Practice',
    author: 'Ivor H. Seeley', kind: 'book', reference: 'Macmillan, 2nd ed.',
    domains: ['quantity-survey', 'cost'],
  },
  {
    id: 'KIRKHAM-FERRY', title: "Ferry and Brandon's Cost Planning of Buildings",
    author: 'Richard Kirkham', kind: 'book', reference: 'Wiley-Blackwell, 9th ed.',
    domains: ['cost', 'feasibility'],
  },
  // ── Contract / governance ──
  {
    id: 'FIDIC-RED-2017', title: 'Conditions of Contract for Construction (Red Book)',
    author: 'FIDIC', kind: 'standard', reference: '2nd ed., 2017',
    url: 'https://fidic.org',
    domains: ['governance', 'procurement', 'cost'],
  },
  {
    id: 'PMI-PMBOK7', title: 'A Guide to the Project Management Body of Knowledge (PMBOK Guide)',
    author: 'Project Management Institute (PMI)', kind: 'standard', reference: '7th ed., 2021',
    domains: ['governance', 'feasibility', 'procurement'],
  },
  // ── Procurement & supply chain ──
  {
    id: 'CIPS-PROC', title: 'CIPS Procurement Cycle & Category Management',
    author: 'Chartered Institute of Procurement & Supply (CIPS)', kind: 'guidance', reference: 'CIPS knowledge',
    url: 'https://www.cips.org/intelligence-hub',
    domains: ['procurement'],
  },
  {
    id: 'ISO-44001', title: 'Collaborative business relationship management systems',
    author: 'ISO', kind: 'standard', reference: 'ISO 44001:2017',
    domains: ['procurement', 'governance'],
  },
  {
    id: 'ISO-31000', title: 'Risk management — Guidelines',
    author: 'ISO', kind: 'standard', reference: 'ISO 31000:2018',
    domains: ['procurement', 'governance', 'revenue'],
  },
  // ── Investment / revenue / feasibility ──
  {
    id: 'RICS-DCF', title: 'Discounted cash flow for commercial property investments (RICS guidance)',
    author: 'Royal Institution of Chartered Surveyors (RICS)', kind: 'guidance', reference: 'RICS guidance note',
    domains: ['revenue', 'feasibility'],
  },
  {
    id: 'BREALEY-MYERS', title: 'Principles of Corporate Finance',
    author: 'Brealey, Myers & Allen', kind: 'book', reference: 'McGraw-Hill, 13th ed.',
    domains: ['revenue', 'feasibility'],
  },
  {
    id: 'DAMODARAN-VAL', title: 'Investment Valuation: Tools and Techniques for Determining the Value of Any Asset',
    author: 'Aswath Damodaran', kind: 'book', reference: 'Wiley, 3rd ed.',
    domains: ['revenue', 'feasibility'],
  },
  {
    id: 'WORLDBANK-PPP', title: 'Public-Private Partnership Reference Guide',
    author: 'World Bank Group', kind: 'guidance', reference: 'Version 3.0',
    url: 'https://ppp.worldbank.org',
    domains: ['revenue', 'feasibility', 'governance'],
  },
];

/** References relevant to a domain (for prompt grounding + UI display). */
export function referencesFor(domain: DomainKey): DomainReference[] {
  return DOMAIN_REFERENCES.filter((r) => r.domains.includes(domain));
}
