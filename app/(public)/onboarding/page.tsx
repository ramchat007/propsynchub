import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import OnboardingWizardClient from '@/components/public/OnboardingWizardClient';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const supabase = await createServerSupabaseClient();

  // 1. Session verification: Only authenticated users can access onboarding
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?callbackUrl=/onboarding');
  }

  // 2. Tenant isolation check:
  // Only users who do NOT yet have an assigned tenant_id should be able to access it
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role, mobile_number')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.tenant_id) {
    // Already assigned to a resort organization -> Send directly to admin dashboard
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-neutral-50 pb-20 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      {/* Onboarding Header */}
      <header className="border-b border-neutral-200 bg-white py-4 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 font-bold text-white shadow-xs">
              P
            </span>
            <span className="text-base font-bold tracking-tight">PropSyncHub</span>
            <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-600 uppercase dark:bg-neutral-800 dark:text-neutral-400">
              Setup Wizard
            </span>
          </div>

          <div className="text-xs text-neutral-500">
            Signed in as <span className="font-mono font-semibold text-neutral-800 dark:text-neutral-200">{user.phone || user.email || 'Owner'}</span>
          </div>
        </div>
      </header>

      {/* Main Wizard Form */}
      <main className="mt-8">
        <OnboardingWizardClient
          userPhone={user.phone || profile?.mobile_number}
          userEmail={user.email}
        />
      </main>
    </div>
  );
}
