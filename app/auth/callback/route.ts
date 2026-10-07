import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Supabase Auth Callback Route Handler
 * 
 * Handles PKCE exchange for OAuth providers (such as Google One-Tap & Social Sign-In).
 * Exchanges the temporary auth code for a persisted session in cookies.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('redirectTo') || searchParams.get('next') || '/dashboard';

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
      {
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
              // Ignore if called in environment without cookie writes
            }
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data?.user) {
      // Check if user has an assigned tenant profile; if not, redirect to onboarding or dashboard
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', data.user.id)
        .maybeSingle();

      const destination = profile?.tenant_id ? next : (next !== '/dashboard' ? next : '/dashboard');
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  // Fallback if exchange failed
  return NextResponse.redirect(`${origin}/login?error=Google%20authentication%20failed`);
}
