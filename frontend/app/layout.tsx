import type { Metadata } from 'next';
import './globals.css';
import { ConfirmProvider } from '../components/ConfirmDialog';
import { Shell } from '../components/Shell';
import { ToastProvider } from '../components/ToastProvider';
import { MeProvider } from '../lib/me-context';
import { ProjectProvider } from '../lib/project-context';
import { ThemeProvider } from '../lib/theme-context';
import { I18nProvider } from '../lib/i18n';

export const metadata: Metadata = {
  title: 'Sigma PMO — Operations Console',
  description: 'Governance operating system for the Sigma PMO platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
