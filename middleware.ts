import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * PropSyncHub Edge Middleware
 * 
 * Handles:
 * 1. Multi-Tenant Routing: Extracts tenant from Subdomain or Custom Domain.
 * 2. URL Rewriting: Rewrites tenant traffic seamlessly to /app/(public)/[tenantId]/*
 * 3. Auth Guard: Protects /admin and /dashboard routes via Supabase Auth session checks.
 */

// Root apex domains that represent the main PropSyncHub platform
const ROOT_DOMAINS = [
  'propsynchub.com',
  'www.propsynchub.com',
  'localhost',
  '127.0.0.1',
  process.env.NEXT_PUBLIC_ROOT_DOMAIN?.toLowerCase(),
].filter(Boolean) as string[];

/**
 * Extracts the tenant identifier and domain classification from the request Host header.
 */
function resolveTenant(host: string): {
  tenantId: string | null;
  isCustomDomain: boolean;
  isApex: boolean;
} {
  // Strip port from host header (e.g., localhost:3000 -> localhost)
  const hostname = (host || '').split(':')[0].toLowerCase();

  // 1. Apex / Main platform check
  if (ROOT_DOMAINS.includes(hostname) || hostname === 'www.localhost') {
    return { tenantId: null, isCustomDomain: false, isApex: true };
  }

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.toLowerCase() || 'propsynchub.com';

  // 2. Production Subdomain check (e.g., resort-a.propsynchub.com)
  if (hostname.endsWith(`.${rootDomain}`)) {
    const subdomain = hostname.replace(`.${rootDomain}`, '').trim();
    if (subdomain && subdomain !== 'www') {
      return { tenantId: subdomain, isCustomDomain: false, isApex: false };
    }
    return { tenantId: null, isCustomDomain: false, isApex: true };
  }

  // 3. Local Development Subdomain check (e.g., resort-a.localhost)
  if (hostname.endsWith('.localhost')) {
    const subdomain = hostname.replace('.localhost', '').trim();
    if (subdomain && subdomain !== 'www') {
      return { tenantId: subdomain, isCustomDomain: false, isApex: false };
    }
    return { tenantId: null, isCustomDomain: false, isApex: true };
  }

  // 4. Custom Domain check (e.g., firstresort.com, www.firstresort.com)
  const customDomain = hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  return { tenantId: customDomain, isCustomDomain: true, isApex: false };
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = request.headers.get('host') || '';

  // Determine if this is an administrative or platform route requiring authentication
  const isAdminRoute =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/bookings') ||
    pathname.startsWith('/audit-logs') ||
    pathname.startsWith('/settings');
  const isLoginRoute = pathname === '/login' || pathname === '/auth/login';
  const isOnboardingRoute = pathname === '/onboarding' || pathname.startsWith('/onboarding');

  // Prepare mutable request headers for forwarding tenant context downstream
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-forwarded-host', host);
  requestHeaders.set('x-pathname', pathname);

  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // ---------------------------------------------------------------------------
  // TASK 1: AUTH GUARD (Supabase Session Verification)
  // ---------------------------------------------------------------------------
  // Initialize Supabase SSR client to inspect session cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Check auth session for protected routes, onboarding, or login page
  let user = null;
  if (isAdminRoute || isLoginRoute || isOnboardingRoute) {
    try {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    } catch {
      user = null;
    }
  }

  // Unauthorized access to admin routes -> Redirect to mobile login page
  if (isAdminRoute && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.search = `?redirectTo=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(loginUrl);
  }

  // Unauthorized access to onboarding -> Redirect to mobile login page
  if (isOnboardingRoute && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.search = `?callbackUrl=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(loginUrl);
  }

  // Already authenticated user visiting login page -> Redirect to admin dashboard
  if (isLoginRoute && user) {
    const dashboardUrl = new URL('/dashboard', request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  // ---------------------------------------------------------------------------
  // TASK 2: MULTI-TENANT RESOLUTION
  // ---------------------------------------------------------------------------
  const { tenantId, isCustomDomain, isApex } = resolveTenant(host);

  // Inject tenant details into request headers for Server Components & RLS client
  if (tenantId) {
    requestHeaders.set('x-tenant-id', tenantId);
    requestHeaders.set('x-tenant-type', isCustomDomain ? 'custom_domain' : 'subdomain');
  }

  // ---------------------------------------------------------------------------
  // TASK 3: URL REWRITING (App Router Multi-Tenant Mapping)
  // ---------------------------------------------------------------------------
  // If the request is for the root apex platform or is a platform route, do not rewrite
  if (isApex || isAdminRoute || isLoginRoute || isOnboardingRoute || !tenantId) {
    return response;
  }

  // Avoid recursive rewrites if the path already starts with the tenant identifier
  if (pathname.startsWith(`/${tenantId}`)) {
    return response;
  }

  // Seamlessly rewrite tenant public requests:
  // e.g. firstresort.com/book -> /[tenantId]/book
  // e.g. resort-a.propsynchub.com/ -> /[tenantId]
  const rewriteUrl = new URL(`/${tenantId}${pathname === '/' ? '' : pathname}${search}`, request.url);

  return NextResponse.rewrite(rewriteUrl, {
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images and static assets (.svg, .png, .jpg, .jpeg, .gif, .webp, .ico)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
};
