-- ==============================================================================
-- PropSyncHub: Multi-Tenant Razorpay Test Credentials Migration
-- ==============================================================================

-- 1. Add Razorpay Test Credentials to tenants table
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS razorpay_test_key_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_test_key_secret TEXT;

-- 2. Column-Level Permission Protection
-- Revoke direct selection of key_secret by anonymous visitors
REVOKE SELECT (razorpay_test_key_secret) ON public.tenants FROM anon;

-- Ensure service_role has full access for server-side order generation
GRANT ALL ON public.tenants TO service_role;

-- 3. Secure Helper for Tenant Admin to check configuration status
CREATE OR REPLACE FUNCTION public.get_tenant_payment_settings(p_tenant_id UUID)
RETURNS TABLE (
  has_keys BOOLEAN,
  razorpay_test_key_id TEXT,
  key_secret_masked TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is tenant admin for this tenant
  IF (SELECT role FROM public.profiles WHERE id = auth.uid() AND tenant_id = p_tenant_id) != 'tenant_admin' THEN
    RAISE EXCEPTION 'Unauthorized: only tenant admins can inspect payment credentials';
  END IF;

  RETURN QUERY
  SELECT
    (t.razorpay_test_key_id IS NOT NULL AND t.razorpay_test_key_secret IS NOT NULL) AS has_keys,
    t.razorpay_test_key_id,
    CASE 
      WHEN t.razorpay_test_key_secret IS NOT NULL AND LENGTH(t.razorpay_test_key_secret) > 4
        THEN '••••••••' || RIGHT(t.razorpay_test_key_secret, 4)
      WHEN t.razorpay_test_key_secret IS NOT NULL
        THEN '••••••••••••'
      ELSE NULL
    END AS key_secret_masked
  FROM public.tenants t
  WHERE t.id = p_tenant_id;
END;
$$;
