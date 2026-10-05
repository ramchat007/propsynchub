import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getBookingLedger } from '@/app/actions/ledger';
import BookingLedgerClient from '@/components/admin/BookingLedgerClient';

export const dynamic = 'force-dynamic';

interface BookingDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function BookingDetailPage({ params }: BookingDetailPageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  // 1. Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=/bookings/${id}`);
  }

  // 2. Resolve Profile & Tenant Context
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single();

  const tenantId = profile?.tenant_id || process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID;

  // 3. Fetch Booking Ledger Details
  const ledgerRes = await getBookingLedger(id, tenantId);

  if (!ledgerRes.success || !ledgerRes.data) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-bold text-neutral-900 dark:text-neutral-100">
          Booking Not Found
        </h2>
        <p className="mt-2 text-xs text-neutral-500 max-w-md mx-auto">
          We could not locate booking <code className="font-mono font-bold">#{id}</code> or you do not have permission to access records for this tenant.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/bookings"
            className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            ← View All Bookings
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
          >
            Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <BookingLedgerClient initialDetails={ledgerRes.data} />;
}
