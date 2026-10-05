import Link from 'next/link';

interface TenantPageProps {
  params: Promise<{
    tenantId: string;
  }>;
}

export default async function TenantHomePage({ params }: TenantPageProps) {
  const { tenantId } = await params;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <div className="max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
          Tenant Portal
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          {decodeURIComponent(tenantId)}
        </h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Welcome to our resort reservation portal.
        </p>
        <div className="mt-6">
          <Link
            href="/book"
            className="inline-flex items-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Book Your Stay
          </Link>
        </div>
      </div>
    </div>
  );
}
