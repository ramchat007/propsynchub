'use client';

import React, { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import { signOutUser } from '@/app/actions/auth';

export default function SignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleSignOut() {
    startTransition(async () => {
      // 1. Sign out on client
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();

      // 2. Clear server session cookies
      await signOutUser();

      // 3. Force hard redirect to login page
      window.location.href = '/login';
    });
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isPending}
      className="text-xs font-semibold text-neutral-500 hover:text-rose-600 dark:hover:text-rose-400 transition"
    >
      {isPending ? 'Signing out...' : 'Sign out'}
    </button>
  );
}
