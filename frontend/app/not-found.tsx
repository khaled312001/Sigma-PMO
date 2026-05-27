import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="grid place-items-center py-24 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-400">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-50">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        The page you tried to open doesn&rsquo;t exist in this version of the console.
      </p>
      <Link href="/" className="mt-6 inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500">
        Back to Overview
      </Link>
    </div>
  );
}
