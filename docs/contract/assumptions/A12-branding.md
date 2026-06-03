# Annex 3 #12 — Branding · logos · visual style guide

- **Status:** `DRAFT — pending Sigma confirmation`
- **Contract reference:** Annex 3 item #12 (line 1008)
- **Lock window:** before Layer 3 Cycle 8 begins

## 1. The assumption (verbatim)

> *Branding, logos, and visual style guide are provided before Layer 3 Cycle 8 begins.*

## 2. Current state (interim)

The frontend ships with a Sigma-neutral functional design language until Sigma provides its brand kit:

| Element             | Current value                                            | Source                         |
| ------------------- | -------------------------------------------------------- | ------------------------------ |
| Product name        | **Sigma PMO**                                            | `<title>` + page header        |
| Tagline             | "Governance operating system"                            | `components/Sidebar.tsx`       |
| Base palette        | `slate-950` background · `slate-100` text               | `frontend/app/globals.css`     |
| Primary accent      | `sky-500` (links · primary buttons · focus rings)        | `components/ui.tsx`            |
| Semantic colours    | `emerald-500` success · `amber-400` warning · `red-500` critical · `violet-500` LLM · `rose-500` admin | `components/ui.tsx` |
| Surface accents     | `sky` input · `emerald` review · `amber` approval · `fuchsia` evidence · `rose` admin · `slate` overview | `components/Sidebar.tsx` |
| Logo                | Inline SVG abstract activity glyph (`IconActivity`)      | `components/Icons.tsx`         |
| Typography          | System default sans (Tailwind)                           | `frontend/app/globals.css`     |
| Icon style          | Heroicons-outline (1.75 stroke)                          | `components/Icons.tsx`         |

## 3. Locked decisions (default — overrideable by Sigma)

- The platform name displayed in UI is "Sigma PMO" and the subtitle is "Governance operating system".
- The product is presented in dark theme by default; a light-theme toggle is not in Cycle 8 scope.
- The four surface accent colours (sky · emerald · amber · fuchsia) and the Sigma admin accent (rose) are part of the visual language.

## 4. Open items (require Sigma decision)

| Item                                 | Default if Sigma doesn't specify    |
| ------------------------------------ | ----------------------------------- |
| Brand logo asset (SVG)               | Current abstract activity glyph     |
| Brand colour primary                 | sky-500 (current)                   |
| Brand colour secondary               | emerald-500 (current)               |
| Typography (display / body)          | Tailwind system default             |
| Favicon                              | Next.js default                     |
| Light theme                          | Not delivered (out of Cycle 8 scope unless re-scoped) |
| Multi-tenant white-label             | Re-scope trigger per Annex 2        |

## 5. Confirmation signature

| Party                         | Name        | Date | Signature |
| ----------------------------- | ----------- | ---- | --------- |
| Client (Sigma)                | Al Ayham    |      |           |
| Service Provider              | Khaled Ahmed |      |           |
