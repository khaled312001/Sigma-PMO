import type { Metadata } from 'next';
import { Inter, Tajawal } from 'next/font/google';

import './globals.css';
import { ConfirmProvider } from '../components/ConfirmDialog';
import { Shell } from '../components/Shell';
import { ToastProvider } from '../components/ToastProvider';
import { MeProvider } from '../lib/me-context';
import { ProjectProvider } from '../lib/project-context';
import { ThemeProvider } from '../lib/theme-context';
import { I18nProvider } from '../lib/i18n';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '500', '700', '800'],
  variable: '--font-tajawal',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Sigma PMO — Governance Operations Console',
  description: 'AI-enabled governance & transformation platform — built on FIDIC 2017 and PMI/PMBOK.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${tajawal.variable}`}>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <ThemeProvider>
          <I18nProvider>
            <ToastProvider>
              <ConfirmProvider>
                <MeProvider>
                  <ProjectProvider>
                    <Shell>{children}</Shell>
                  </ProjectProvider>
                </MeProvider>
              </ConfirmProvider>
            </ToastProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
