import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8 text-center bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 text-xl font-bold">
        404
      </div>
      <h2 className="mt-4 text-2xl font-bold tracking-tight">Page Not Found</h2>
      <p className="mt-1 text-xs text-neutral-500 max-w-sm mx-auto">
        The requested resort, property page, or reservation path could not be located.
      </p>
      <div className="mt-6">
        <Link
          href="/"
          className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500"
        >
          Return to PropSyncHub Home
        </Link>
      </div>
    </div>
  );
}
