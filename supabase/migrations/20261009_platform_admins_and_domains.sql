-- ==============================================================================
-- PropSyncHub: Platform Superadmin & Custom Domain Management Migration
-- Migration: 20261009_platform_admins_and_domains.sql
-- ==============================================================================

-- 1. Create Dedicated platform_admins Table
-- Decouples platform superadmin authorization from ordinary tenant profiles.
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'SUPER_ADMIN',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on platform_admins
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Allow only platform admins to query platform_admins table
DROP POLICY IF EXISTS "Platform admins can view platform_admins" ON public.platform_admins;
CREATE POLICY "Platform admins can view platform_admins"
  ON public.platform_admins
  FOR SELECT
  USING (
    user_id = auth.uid()
  );

-- 2. Index custom_domain column on tenants for sub-millisecond host lookups
CREATE INDEX IF NOT EXISTS idx_tenants_custom_domain 
  ON public.tenants(custom_domain) 
  WHERE custom_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_subdomain 
  ON public.tenants(subdomain);

-- 3. Provision Initial Superadmin: ramchat007@gmail.com
-- Seed ramchat007@gmail.com into platform_admins if auth user exists
DO $$
DECLARE
  v_admin_user_id UUID;
BEGIN
  SELECT id INTO v_admin_user_id 
  FROM auth.users 
  WHERE lower(email) = 'ramchat007@gmail.com' 
  LIMIT 1;

  IF v_admin_user_id IS NOT NULL THEN
    INSERT INTO public.platform_admins (user_id, email, role, is_active)
    VALUES (v_admin_user_id, 'ramchat007@gmail.com', 'SUPER_ADMIN', true)
    ON CONFLICT (user_id) DO UPDATE
    SET 
      role = 'SUPER_ADMIN',
      is_active = true,
      updated_at = now();

    -- Ensure profile record also stays in sync as superadmin
    UPDATE public.profiles
    SET role = 'superadmin', updated_at = now()
    WHERE id = v_admin_user_id;
  END IF;
END $$;
