import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * PropSyncHub Edge Middleware
 * 
 * Handles:
 * 1. Root Apex Routing: propsynchub.in marketing, exclusive /admin-master portal, clean /admin redirects.
 * 2. Development Preview: /r/[tenantSlug] preview routes without custom domains.
 * 3. Resort Custom Domains:
 *    - Branded Public Website & Booking: raigadtropical.in -> /[tenantId]
 *    - Resort Management Portal: raigadtropical.in/app/* -> /(admin)/*
 * 4. Subdomains: resort.propsynchub.in routing.
 * 5. Server-Side Auth Guard: Supabase Session Verification.
 */

// Root platform apex domains
const ROOT_DOMAINS = [
  'propsynchub.in',
  'www.propsynchub.in',
  'propsynchub.com',
  'www.propsynchub.com',
  'localhost',
  '127.0.0.1',
  process.env.NEXT_PUBLIC_ROOT_DOMAIN?.toLowerCase(),
].filter(Boolean) as string[];

/**
 * Extracts tenant identifier, domain classification, and apex status from Host header.
 */
function resolveHostInfo(host: string): {
  tenantId: string | null;
  isCustomDomain: boolean;
  isApex: boolean;
  normalizedHost: string;
} {
  const hostname = (host || '').split(':')[0].toLowerCase();

  let appUrlHost = '';
  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      appUrlHost = new URL(process.env.NEXT_PUBLIC_APP_URL).hostname.toLowerCase();
    } catch {
      // ignore
    }
  }

  // 1. Apex / Main platform check
  if (
    ROOT_DOMAINS.includes(hostname) ||
    hostname === 'www.localhost' ||
    hostname.includes('netlify.app') ||
    hostname.includes('vercel.app') ||
    (appUrlHost && hostname === appUrlHost)
  ) {
    return { tenantId: null, isCustomDomain: false, isApex: true, normalizedHost: hostname };
  }

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.toLowerCase() || 'propsynchub.in';

  // 2. Production Subdomain check (e.g. raigad-tropical.propsynchub.in or .com)
  if (hostname.endsWith(`.${rootDomain}`) || hostname.endsWith('.propsynchub.com')) {
    const subdomain = hostname
      .replace(`.${rootDomain}`, '')
      .replace('.propsynchub.com', '')
      .trim();
    if (subdomain && subdomain !== 'www') {
      return { tenantId: subdomain, isCustomDomain: false, isApex: false, normalizedHost: hostname };
    }
    return { tenantId: null, isCustomDomain: false, isApex: true, normalizedHost: hostname };
  }

  // 3. Local Development Subdomain check (e.g., raigad-tropical.localhost)
  if (hostname.endsWith('.localhost')) {
    const subdomain = hostname.replace('.localhost', '').trim();
    if (subdomain && subdomain !== 'www') {
      return { tenantId: subdomain, isCustomDomain: false, isApex: false, normalizedHost: hostname };
    }
    return { tenantId: null, isCustomDomain: false, isApex: true, normalizedHost: hostname };
  }

  // 4. Custom Domain check (e.g., raigadtropical.in, www.raigadtropical.in)
  const customDomain = hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  return { tenantId: customDomain, isCustomDomain: true, isApex: false, normalizedHost: customDomain };
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = request.headers.get('host') || '';

  // Classify Host
  const { tenantId, isCustomDomain, isApex, normalizedHost } = resolveHostInfo(host);

  // Prepare mutable headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-forwarded-host', host);
  requestHeaders.set('x-pathname', pathname);
  requestHeaders.set('x-normalized-host', normalizedHost);

  if (tenantId) {
    requestHeaders.set('x-tenant-id', tenantId);
    requestHeaders.set('x-tenant-type', isCustomDomain ? 'custom_domain' : 'subdomain');
  }

  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Server Actions handle their own auth; preserve RSC action stream
  const isServerAction = request.headers.has('next-action');
  if (isServerAction) {
    return response;
  }

  // ---------------------------------------------------------------------------
  // 1. SUPABASE SSR CLIENT INITIALIZATION
  // ---------------------------------------------------------------------------
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qqxctovvqrwllyanwglh.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxeGN0b3Z2cXJ3bGx5YW53Z2xoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExOTc2NTIsImV4cCI6MjEwNjc3MzY1Mn0.rM0IxipDbqhbaYjRoJ95Z6tAfJEbz2YsMnfN9s1-oRY',
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

  // ---------------------------------------------------------------------------
  // 2. DEV PREVIEW REWRITE: /r/[tenantSlug] on Apex or Localhost
  // ---------------------------------------------------------------------------
  if (pathname.startsWith('/r/')) {
    const segments = pathname.replace(/^\/r\//, '').split('/');
    const previewSlug = segments[0];
    const previewSubpath = segments.slice(1).join('/');

    if (previewSlug) {
      requestHeaders.set('x-tenant-id', previewSlug);
      requestHeaders.set('x-tenant-type', 'preview');

      const targetPath = `/${previewSlug}${previewSubpath ? `/${previewSubpath}` : ''}${search}`;
      const rewriteUrl = new URL(targetPath, request.url);
      return NextResponse.rewrite(rewriteUrl, {
        request: {
          headers: requestHeaders,
        },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 3. /admin REDIRECTION GUARD ON APEX
  // Do not create a conflicting second platform-admin portal at /admin.
  // ---------------------------------------------------------------------------
  if (pathname === '/admin' || pathname === '/admin/') {
    try {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (user && user.email?.toLowerCase() === 'ramchat007@gmail.com') {
        return NextResponse.redirect(new URL('/admin-master', request.url));
      } else if (user) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      } else {
        return NextResponse.redirect(new URL('/login?redirectTo=/admin-master', request.url));
      }
    } catch {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // /platform URL should cleanly redirect to /admin-master
  if (pathname === '/platform' || pathname === '/platform/') {
    return NextResponse.redirect(new URL('/admin-master', request.url));
  }

  // ---------------------------------------------------------------------------
  // 4. /admin-master ACCESS GUARD
  // Platform superadmin entrance: forbidden on resort custom domains, strictly guarded on apex
  // ---------------------------------------------------------------------------
  if (pathname.startsWith('/admin-master')) {
    if (!isApex) {
      // Disallow accessing /admin-master from a resort's custom domain
      const apexRoot = process.env.NEXT_PUBLIC_APP_URL || 'https://propsynchub.in';
      return NextResponse.redirect(new URL('/admin-master', apexRoot));
    }

    // Inspect user session
    let user = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    } catch {
      user = null;
    }

    if (!user) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.search = `?redirectTo=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(loginUrl);
    }

    // Pass through to Server Component for authoritative SUPER_ADMIN role verification
    return response;
  }

  // ---------------------------------------------------------------------------
  // 5. RESORT CUSTOM DOMAIN & SUBDOMAIN MANAGEMENT ROUTING (/app and /app/*)
  // e.g. https://raigadtropical.in/app -> Resort management dashboard
  // ---------------------------------------------------------------------------
  if (!isApex && (pathname === '/app' || pathname.startsWith('/app/'))) {
    // Determine internal target admin route
    let internalPath = '/dashboard';
    if (pathname === '/app' || pathname === '/app/') {
      internalPath = '/dashboard';
    } else if (pathname === '/app/login') {
      internalPath = '/login';
    } else {
      // e.g. /app/bookings -> /bookings, /app/settings/website -> /settings/website
      internalPath = pathname.replace(/^\/app/, '');
    }

    // Authenticate session for admin routes
    let user = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    } catch {
      user = null;
    }

    if (!user && internalPath !== '/login') {
      const loginUrl = new URL('/app/login', request.url);
      loginUrl.search = `?redirectTo=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(loginUrl);
    }

    requestHeaders.set('x-app-portal', 'true');
    const rewriteUrl = new URL(`${internalPath}${search}`, request.url);
    return NextResponse.rewrite(rewriteUrl, {
      request: {
        headers: requestHeaders,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 6. GENERAL AUTH GUARD FOR APEX ADMIN ROUTES
  // ---------------------------------------------------------------------------
  const isAdminRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/bookings') ||
    pathname.startsWith('/calendar') ||
    pathname.startsWith('/inventory') ||
    pathname.startsWith('/housekeeping') ||
    pathname.startsWith('/restaurant') ||
    pathname.startsWith('/guest-services') ||
    pathname.startsWith('/activities') ||
    pathname.startsWith('/reviews') ||
    pathname.startsWith('/reports') ||
    pathname.startsWith('/audit-logs') ||
    pathname.startsWith('/settings');

  const isLoginRoute = pathname === '/login' || pathname === '/auth/login';
  const isAuthRoute = pathname.startsWith('/auth');
  const isOnboardingRoute = pathname === '/onboarding' || pathname.startsWith('/onboarding');

  let user = null;
  if (isAdminRoute || isLoginRoute || isOnboardingRoute) {
    try {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    } catch {
      user = null;
    }
  }

  if (isAdminRoute && !user) {
    const isRscRequest = request.headers.has('rsc') || request.nextUrl.searchParams.has('_rsc');
    if (isRscRequest) {
      return response;
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.search = `?redirectTo=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(loginUrl);
  }

  if (isOnboardingRoute && !user) {
    const isRscRequest = request.headers.has('rsc') || request.nextUrl.searchParams.has('_rsc');
    if (isRscRequest) {
      return response;
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.search = `?callbackUrl=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(loginUrl);
  }

  if (isLoginRoute && user) {
    // If user is superadmin, redirect to /admin-master, else /dashboard
    const isSuper = user.email?.toLowerCase() === 'ramchat007@gmail.com';
    const destination = isSuper ? '/admin-master' : '/dashboard';
    return NextResponse.redirect(new URL(destination, request.url));
  }

  const isApiRoute = pathname.startsWith('/api');

  // ---------------------------------------------------------------------------
  // 7. PUBLIC RESORT WEBSITE REWRITING (Custom Domains & Subdomains)
  // Maps raigadtropical.in/ -> /[tenantId]
  // Maps raigadtropical.in/book -> /[tenantId]/book
  // Maps raigadtropical.in/portal/[id] -> /[tenantId]/portal/[id]
  // ---------------------------------------------------------------------------
  if (isApex || isAdminRoute || isLoginRoute || isOnboardingRoute || isAuthRoute || isApiRoute || !tenantId) {
    return response;
  }

  // Avoid recursive rewrite
  if (pathname.startsWith(`/${tenantId}`)) {
    return response;
  }

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
     * - images and static assets (.svg, .png, .jpg, .jpeg, .gif, .webp, .ico, .css, .js)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
};
