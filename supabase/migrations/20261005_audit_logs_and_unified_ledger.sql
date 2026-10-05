-- ==============================================================================
-- PropSyncHub: Unified Ledger & Audit Logging Migration
-- Migration: 20261005_audit_logs_and_unified_ledger.sql
-- ==============================================================================

-- 1. CREATE AUDIT LOGS TABLE
-- Records every mutation on sensitive tables (pricing, bookings, incidentals)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance Indexes for Audit Trail Queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created 
  ON public.audit_logs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record 
  ON public.audit_logs(table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id 
  ON public.audit_logs(user_id);

-- 2. CREATE POSTGRESQL TRIGGER FUNCTION FOR AUDIT LOGGING
-- Automatically captures user_id (via auth.uid()), tenant_id, table, and row changes
CREATE OR REPLACE FUNCTION public.fn_record_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_user_id UUID;
  v_record_id TEXT;
  v_old_data JSONB := NULL;
  v_new_data JSONB := NULL;
BEGIN
  -- Obtain authenticated user performing the mutation
  v_user_id := auth.uid();

  -- Extract tenant_id, record_id, and JSON representation of the row
  IF (TG_OP = 'DELETE') THEN
    v_tenant_id := OLD.tenant_id;
    v_record_id := OLD.id::TEXT;
    v_old_data  := to_jsonb(OLD);
  ELSIF (TG_OP = 'UPDATE') THEN
    v_tenant_id := NEW.tenant_id;
    v_record_id := NEW.id::TEXT;
    v_old_data  := to_jsonb(OLD);
    v_new_data  := to_jsonb(NEW);
  ELSIF (TG_OP = 'INSERT') THEN
    v_tenant_id := NEW.tenant_id;
    v_record_id := NEW.id::TEXT;
    v_new_data  := to_jsonb(NEW);
  END IF;

  -- Fallback if tenant_id is somehow absent
  IF v_tenant_id IS NULL THEN
    v_tenant_id := public.requesting_tenant_id();
  END IF;

  -- Insert audit entry
  INSERT INTO public.audit_logs (
    tenant_id,
    user_id,
    table_name,
    record_id,
    action_type,
    old_data,
    new_data,
    created_at
  ) VALUES (
    v_tenant_id,
    v_user_id,
    TG_TABLE_NAME,
    v_record_id,
    TG_OP,
    v_old_data,
    v_new_data,
    now()
  );

  RETURN NULL; -- AFTER trigger
END;
$$;

-- 3. ATTACH AUDIT LOG TRIGGERS TO PRICING & BOOKINGS TABLES
DROP TRIGGER IF EXISTS trigger_audit_pricing ON public.pricing;
CREATE TRIGGER trigger_audit_pricing
  AFTER INSERT OR UPDATE OR DELETE ON public.pricing
  FOR EACH ROW EXECUTE FUNCTION public.fn_record_audit_log();

DROP TRIGGER IF EXISTS trigger_audit_bookings ON public.bookings;
CREATE TRIGGER trigger_audit_bookings
  AFTER INSERT OR UPDATE OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.fn_record_audit_log();

-- 4. CREATE INCIDENTAL CHARGES TABLE (UNIFIED LEDGER)
-- Stores extra guest expenses (dining, spa, minibar, damage fees, etc.)
CREATE TABLE IF NOT EXISTS public.incidental_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  amount_inr NUMERIC(10, 2) NOT NULL CHECK (amount_inr >= 0),
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for Incidental Ledger Queries
CREATE INDEX IF NOT EXISTS idx_incidental_charges_tenant 
  ON public.incidental_charges(tenant_id);

CREATE INDEX IF NOT EXISTS idx_incidental_charges_booking 
  ON public.incidental_charges(booking_id);

-- Attach Audit Trigger to Incidental Charges as well for complete accountability
DROP TRIGGER IF EXISTS trigger_audit_incidental_charges ON public.incidental_charges;
CREATE TRIGGER trigger_audit_incidental_charges
  AFTER INSERT OR UPDATE OR DELETE ON public.incidental_charges
  FOR EACH ROW EXECUTE FUNCTION public.fn_record_audit_log();

-- 5. ROW LEVEL SECURITY (RLS) POLICIES

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidental_charges ENABLE ROW LEVEL SECURITY;

-- Audit Logs Policies:
-- Tenant managers and staff can read audit logs belonging to their resort
DROP POLICY IF EXISTS "tenant_members_select_audit_logs" ON public.audit_logs;
CREATE POLICY "tenant_members_select_audit_logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.requesting_tenant_id());

-- Audit logs cannot be updated or deleted by normal users (Immutable Audit Trail)
-- Insert is handled via SECURITY DEFINER trigger function or service_role
GRANT ALL ON public.audit_logs TO service_role;
GRANT SELECT ON public.audit_logs TO authenticated;

-- Incidental Charges Policies:
-- Read incidentals for tenant
DROP POLICY IF EXISTS "tenant_members_select_incidentals" ON public.incidental_charges;
CREATE POLICY "tenant_members_select_incidentals"
  ON public.incidental_charges
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.requesting_tenant_id());

-- Insert incidentals (Staff & Tenant Admin)
DROP POLICY IF EXISTS "tenant_members_insert_incidentals" ON public.incidental_charges;
CREATE POLICY "tenant_members_insert_incidentals"
  ON public.incidental_charges
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.requesting_tenant_id()
    AND public.auth_user_role() IN ('tenant_admin', 'staff', 'superadmin')
  );

-- Update incidentals
DROP POLICY IF EXISTS "tenant_members_update_incidentals" ON public.incidental_charges;
CREATE POLICY "tenant_members_update_incidentals"
  ON public.incidental_charges
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.requesting_tenant_id()
    AND public.auth_user_role() IN ('tenant_admin', 'staff', 'superadmin')
  );

-- Delete incidentals (Tenant Admin only)
DROP POLICY IF EXISTS "tenant_admin_delete_incidentals" ON public.incidental_charges;
CREATE POLICY "tenant_admin_delete_incidentals"
  ON public.incidental_charges
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.requesting_tenant_id()
    AND public.auth_user_role() IN ('tenant_admin', 'superadmin')
  );

GRANT ALL ON public.incidental_charges TO authenticated;
GRANT ALL ON public.incidental_charges TO service_role;
