import { createClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export type SupabaseCustomClientOptions = NonNullable<
  Parameters<typeof createClient>[2]
>;

export interface MultiTenantOptions {
  /**
   * Unique identifier of the tenant / property organization.
   * Injected into the request headers ('x-tenant-id') for RLS policy enforcement.
   */
  tenantId?: string;

  /**
   * Database schema name if using a schema-per-tenant isolation architecture.
   * Defaults to 'public'.
   */
  schema?: string;

  /**
   * Optional custom JWT / auth token to impersonate or bind a tenant session.
   */
  accessToken?: string;

  /**
   * Additional Supabase ClientOptions overrides.
   */
  options?: SupabaseCustomClientOptions;
}

/**
 * Singleton instance for standard client-side browser usage.
 * Utilizes @supabase/ssr createBrowserClient to persist authentication sessions
 * directly into browser cookies so Next.js middleware and Server Components can read them.
 */
let browserClientInstance: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (browserClientInstance) {
    return browserClientInstance;
  }

  browserClientInstance = createBrowserClient(supabaseUrl, supabaseAnonKey);
  return browserClientInstance;
}

/**
 * Default Supabase client instance (standard browser client with cookie sync).
 */
export const supabase = getSupabaseBrowserClient();

/**
 * Factory for creating a tenant-scoped Supabase client.
 *
 * Designed for multi-tenant SaaS architecture:
 * 1. Attaches 'x-tenant-id' header for Row-Level Security (RLS) enforcement.
 * 2. Scopes database queries to a specific database schema if schema isolation is used.
 * 3. Can be instantiated both server-side (in Server Components / Route Handlers) and client-side.
 *
 * @param config Multi-tenant configuration
 * @returns SupabaseClient scoped to the tenant
 */
export function createTenantClient(config: MultiTenantOptions = {}) {
  const { tenantId, schema = 'public', accessToken, options } = config;

  const headers: Record<string, string> = {
    ...(options?.global?.headers || {}),
  };

  if (tenantId) {
    headers['x-tenant-id'] = tenantId;
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    ...options,
    db: {
      schema,
      ...options?.db,
    },
    global: {
      ...options?.global,
      headers,
    },
    auth: {
      persistSession: typeof window !== 'undefined',
      autoRefreshToken: typeof window !== 'undefined',
      detectSessionInUrl: typeof window !== 'undefined',
      ...options?.auth,
    },
  });
}

/**
 * Factory for creating a server-side administrative Supabase client using the Service Role Key.
 *
 * CAUTION:
 * - NEVER invoke this function on the client-side (browser).
 * - Bypasses Postgres Row-Level Security (RLS).
 * - Intended for server-only operations (tenant onboarding, administrative sync, Razorpay webhook processing).
 *
 * @param schema Database schema to target (defaults to 'public')
 * @returns Elevated SupabaseClient instance
 */
export function createAdminClient(schema = 'public') {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient must strictly be called in server environments only.');
  }

  if (!supabaseServiceRoleKey) {
    console.warn(
      'SUPABASE_SERVICE_ROLE_KEY is not defined in environment variables. Falling back to anon key.'
    );
  }

  return createClient(
    supabaseUrl,
    supabaseServiceRoleKey || supabaseAnonKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema,
      },
    }
  );
}
