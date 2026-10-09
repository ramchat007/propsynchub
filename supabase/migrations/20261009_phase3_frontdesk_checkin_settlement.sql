-- ==============================================================================
-- PROPSYNCHUB PHASE 3: FRONT DESK, CHECK-IN/OUT & FOLIO SETTLEMENT
-- ==============================================================================

-- 1. Guest Identities table for privacy-first verification (Last 4 digits / Form C)
CREATE TABLE IF NOT EXISTS public.guest_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  id_type TEXT NOT NULL CHECK (id_type IN ('aadhaar', 'passport', 'driving_license', 'voter_id', 'other')),
  id_number_masked TEXT NOT NULL,
  holder_name TEXT NOT NULL,
  nationality TEXT NOT NULL DEFAULT 'Indian',
  is_foreign_guest BOOLEAN DEFAULT false NOT NULL,
  form_c_data JSONB, -- { passport_number, visa_number, visa_valid_until, place_of_issue, next_destination }
  verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  retention_consent BOOLEAN DEFAULT true NOT NULL,
  is_redacted BOOLEAN DEFAULT false NOT NULL,
  redacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Add Front Desk Operational Columns to bookings table
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS actual_check_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_check_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS room_key_number TEXT,
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS guest_identity_data JSONB;

-- 3. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_guest_identities_tenant_booking
  ON public.guest_identities (tenant_id, booking_id);

CREATE INDEX IF NOT EXISTS idx_bookings_actual_checkin
  ON public.bookings (tenant_id, actual_check_in_at);

CREATE INDEX IF NOT EXISTS idx_bookings_actual_checkout
  ON public.bookings (tenant_id, actual_check_out_at);

-- 4. Enable RLS on guest_identities
ALTER TABLE public.guest_identities ENABLE ROW LEVEL SECURITY;

-- 5. Strict Staff Access Policies on guest_identities (Zero Public Access)
DROP POLICY IF EXISTS "Staff can view tenant guest identities" ON public.guest_identities;
CREATE POLICY "Staff can view tenant guest identities"
  ON public.guest_identities
  FOR SELECT
  USING (
    tenant_id = public.auth_user_tenant_id()
    OR public.auth_user_role() = 'superadmin'
  );

DROP POLICY IF EXISTS "Staff can insert tenant guest identities" ON public.guest_identities;
CREATE POLICY "Staff can insert tenant guest identities"
  ON public.guest_identities
  FOR INSERT
  WITH CHECK (
    tenant_id = public.auth_user_tenant_id()
    OR public.auth_user_role() = 'superadmin'
  );

DROP POLICY IF EXISTS "Staff can update tenant guest identities" ON public.guest_identities;
CREATE POLICY "Staff can update tenant guest identities"
  ON public.guest_identities
  FOR UPDATE
  USING (
    tenant_id = public.auth_user_tenant_id()
    OR public.auth_user_role() = 'superadmin'
  );
