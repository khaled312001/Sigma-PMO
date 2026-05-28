/**
 * Inline SVG icon set (Heroicons outline 24x24, stroke-width 1.75).
 * No external icon library — keeps the bundle lean and the design tokens
 * explicit. All icons inherit `currentColor` and accept className.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

function Icon({ children, className = 'h-4 w-4', ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden {...rest}>
      {children}
    </svg>
  );
}

export const IconDashboard = (p: IconProps) => (
  <Icon {...p}><path d="M3 13.5V19a2 2 0 0 0 2 2h4v-7H3Zm0-2.5h6V3H5a2 2 0 0 0-2 2v6Zm12 10h4a2 2 0 0 0 2-2V8h-6v13Zm0-15.5h6V5a2 2 0 0 0-2-2h-4v2.5Z"/></Icon>
);
export const IconUpload = (p: IconProps) => (
  <Icon {...p}><path d="M12 16V4m0 0 4 4m-4-4-4 4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></Icon>
);
export const IconReview = (p: IconProps) => (
  <Icon {...p}><path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1.5 1.5L7 5"/><path d="m3 12 1.5 1.5L7 11"/><path d="m3 18 1.5 1.5L7 17"/></Icon>
);
export const IconEvidence = (p: IconProps) => (
  <Icon {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><circle cx="11" cy="14.5" r="2"/><path d="m13 16.5 2 2"/></Icon>
);
export const IconApproval = (p: IconProps) => (
  <Icon {...p}><path d="M9 12.75 11.25 15 15 9.75"/><path d="M9.75 3.104A4.5 4.5 0 0 0 12 3a4.5 4.5 0 0 0 2.25.104A4.5 4.5 0 0 1 19.5 7.5v6.04a4.5 4.5 0 0 1-2.25 3.897l-3.75 2.165a3 3 0 0 1-3 0l-3.75-2.165A4.5 4.5 0 0 1 4.5 13.54V7.5a4.5 4.5 0 0 1 5.25-4.396Z"/></Icon>
);
export const IconShield = (p: IconProps) => (
  <Icon {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></Icon>
);
export const IconUsers = (p: IconProps) => (
  <Icon {...p}><circle cx="9" cy="8" r="3"/><path d="M3 21v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"/><circle cx="17" cy="7" r="2.5"/><path d="M15 14h2a4 4 0 0 1 4 4v1"/></Icon>
);
export const IconLogIn = (p: IconProps) => (
  <Icon {...p}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></Icon>
);
export const IconLogOut = (p: IconProps) => (
  <Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></Icon>
);
export const IconAlertCritical = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></Icon>
);
export const IconAlertWarning = (p: IconProps) => (
  <Icon {...p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></Icon>
);
export const IconInfo = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></Icon>
);
export const IconDatabase = (p: IconProps) => (
  <Icon {...p}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/></Icon>
);
export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}><path d="m9 18 6-6-6-6"/></Icon>
);
export const IconCheck = (p: IconProps) => (
  <Icon {...p}><path d="M5 12l5 5L20 7"/></Icon>
);
export const IconX = (p: IconProps) => (
  <Icon {...p}><path d="M6 6l12 12M6 18 18 6"/></Icon>
);
export const IconActivity = (p: IconProps) => (
  <Icon {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></Icon>
);
export const IconSparkles = (p: IconProps) => (
  <Icon {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M5.5 18.5l2.1-2.1M16.4 7.6l2.1-2.1"/></Icon>
);
export const IconRefresh = (p: IconProps) => (
  <Icon {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></Icon>
);
export const IconMenu = (p: IconProps) => (
  <Icon {...p}><path d="M4 6h16M4 12h16M4 18h16"/></Icon>
);
