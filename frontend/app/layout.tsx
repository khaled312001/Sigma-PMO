import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sigma PMO — Operations Console',
  description: 'Internal governance console for Sigma PMO (Layer 1).',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Sigma PMO</h1>
              <p className="text-xs text-slate-400">Layer 1 — Internal governance console</p>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
