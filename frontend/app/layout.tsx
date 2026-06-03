import type { Metadata } from 'next';
import './globals.css';
import { ConfirmProvider } from '../components/ConfirmDialog';
import { Shell } from '../components/Shell';
import { ToastProvider } from '../components/ToastProvider';
import { ProjectProvider } from '../lib/project-context';

export const metadata: Metadata = {
  title: 'Sigma PMO — Operations Console',
  description: 'Governance operating system for the Sigma PMO platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <ToastProvider>
          <ConfirmProvider>
            <ProjectProvider>
              <Shell>{children}</Shell>
            </ProjectProvider>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
