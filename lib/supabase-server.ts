if (typeof window === 'undefined' && process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qqxctovvqrwllyanwglh.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxeGN0b3Z2cXJ3bGx5YW53Z2xoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExOTc2NTIsImV4cCI6MjEwNjc3MzY1Mn0.rM0IxipDbqhbaYjRoJ95Z6tAfJEbz2YsMnfN9s1-oRY';

/**
 * Creates an authenticated Supabase client for Server Components, Server Actions,
 * and Route Handlers. Automatically accesses and syncs cookies with next/headers.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Ignored in Server Component renders where headers are already sent
        }
      },
    },
  });
}
