-- ==============================================================================
-- PropSyncHub: Multi-Tenant Schema & Row Level Security (RLS) Migration
-- Target: Supabase / PostgreSQL
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. CUSTOM TYPES & ENUMS
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('superadmin', 'tenant_admin', 'staff', 'guest');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE room_status AS ENUM ('available', 'maintenance', 'blocked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'partially_paid', 'failed', 'refunded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ==============================================================================
-- 3. TABLES DEFINITION
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Table 1: TENANTS (Stores resort/property organization details)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE NOT NULL,
  custom_domain TEXT UNIQUE,
  logo_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  settings JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------------------------
-- Table 2: PROFILES (Users linked to Supabase Auth, Mobile as Primary Identity)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  mobile_number TEXT NOT NULL,
  full_name TEXT,
  role user_role NOT NULL DEFAULT 'guest',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT check_mobile_format CHECK (mobile_number ~ '^\+?[1-9]\d{9,14}$'),
  CONSTRAINT unique_tenant_mobile UNIQUE (tenant_id, mobile_number)
);

-- ------------------------------------------------------------------------------
-- Table 3: ROOMS (Resort units and inventory)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  room_number TEXT,
  room_type TEXT NOT NULL DEFAULT 'standard',
  capacity_adults INT NOT NULL DEFAULT 2 CHECK (capacity_adults >= 1),
  capacity_children INT NOT NULL DEFAULT 0 CHECK (capacity_children >= 0),
  base_price_inr NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (base_price_inr >= 0),
  status room_status NOT NULL DEFAULT 'available',
  amenities JSONB DEFAULT '[]'::jsonb NOT NULL,
  images JSONB DEFAULT '[]'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT unique_tenant_room_name UNIQUE (tenant_id, name)
);

-- ------------------------------------------------------------------------------
-- Table 4: PRICING (Seasonal, dynamic, or promotional rate rules)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE, -- NULL applies to all rooms in tenant
  title TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  multiplier NUMERIC(4, 2) DEFAULT 1.00 CHECK (multiplier > 0),
  fixed_price_inr NUMERIC(10, 2) CHECK (fixed_price_inr >= 0),
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT check_pricing_dates CHECK (end_date >= start_date)
);

-- ------------------------------------------------------------------------------
-- Table 5: BOOKINGS (Reservations, Guest Identity via mobile_number)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  guest_mobile_number TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  guest_email TEXT,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  num_adults INT NOT NULL DEFAULT 1 CHECK (num_adults >= 1),
  num_children INT NOT NULL DEFAULT 0 CHECK (num_children >= 0),
  total_amount_inr NUMERIC(10, 2) NOT NULL CHECK (total_amount_inr >= 0),
  booking_status booking_status NOT NULL DEFAULT 'confirmed',
  payment_status payment_status NOT NULL DEFAULT 'pending',
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  special_requests TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT check_booking_dates CHECK (check_out_date > check_in_date),
  CONSTRAINT check_guest_mobile_format CHECK (guest_mobile_number ~ '^\+?[1-9]\d{9,14}$')
);

-- ==============================================================================
-- 4. PERFORMANCE INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON public.tenants(subdomain);
CREATE INDEX IF NOT EXISTS idx_tenants_custom_domain ON public.tenants(custom_domain);

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON public.profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_mobile_number ON public.profiles(mobile_number);

CREATE INDEX IF NOT EXISTS idx_rooms_tenant_id ON public.rooms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rooms_tenant_status ON public.rooms(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_pricing_tenant_dates ON public.pricing(tenant_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_pricing_room_id ON public.pricing(room_id);

CREATE INDEX IF NOT EXISTS idx_bookings_tenant_guest_mobile ON public.bookings(tenant_id, guest_mobile_number);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_dates ON public.bookings(tenant_id, check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_bookings_room_dates ON public.bookings(room_id, check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_status ON public.bookings(tenant_id, booking_status);

-- ==============================================================================
-- 5. AUTOMATIC updated_at TIMESTAMP TRIGGERS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_tenants_updated_at ON public.tenants;
CREATE TRIGGER trigger_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS trigger_rooms_updated_at ON public.rooms;
CREATE TRIGGER trigger_rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS trigger_pricing_updated_at ON public.pricing;
CREATE TRIGGER trigger_pricing_updated_at
  BEFORE UPDATE ON public.pricing
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS trigger_bookings_updated_at ON public.bookings;
CREATE TRIGGER trigger_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- ==============================================================================
-- 6. SECURITY DEFINER HELPER FUNCTIONS FOR RLS
-- ==============================================================================

-- Returns the tenant_id of the currently logged-in user from profiles
CREATE OR REPLACE FUNCTION public.auth_user_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Returns the role of the currently logged-in user from profiles
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Returns the mobile_number of the currently logged-in user from profiles
CREATE OR REPLACE FUNCTION public.auth_user_mobile()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mobile_number FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Resolves the current tenant context from:
-- 1. 'x-tenant-id' HTTP header passed by createTenantClient
-- 2. 'tenant_id' in JWT app_metadata
-- 3. Authenticated user's profile tenant_id
CREATE OR REPLACE FUNCTION public.requesting_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.headers', true)::jsonb ->> 'x-tenant-id', '')::uuid,
    NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id', '')::uuid,
    (SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
  );
$$;

-- ==============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS across all tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- RLS POLICIES: TENANTS
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view active tenants" ON public.tenants;
CREATE POLICY "Public can view active tenants"
  ON public.tenants
  FOR SELECT
  USING (
    is_active = true 
    OR id = public.auth_user_tenant_id()
  );

DROP POLICY IF EXISTS "Tenant admin can update own tenant" ON public.tenants;
CREATE POLICY "Tenant admin can update own tenant"
  ON public.tenants
  FOR UPDATE
  USING (
    id = public.auth_user_tenant_id() 
    AND public.auth_user_role() = 'tenant_admin'
  )
  WITH CHECK (
    id = public.auth_user_tenant_id() 
    AND public.auth_user_role() = 'tenant_admin'
  );

-- ------------------------------------------------------------------------------
-- RLS POLICIES: PROFILES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own profile or tenant admin/staff can view tenant profiles" ON public.profiles;
CREATE POLICY "Users can view own profile or tenant admin/staff can view tenant profiles"
  ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR (
      tenant_id = public.auth_user_tenant_id() 
      AND public.auth_user_role() IN ('tenant_admin', 'staff')
    )
  );

DROP POLICY IF EXISTS "Users can insert own profile or admin can invite" ON public.profiles;
CREATE POLICY "Users can insert own profile or admin can invite"
  ON public.profiles
  FOR INSERT
  WITH CHECK (
    -- User creating their own profile for the tenant
    (id = auth.uid() AND tenant_id = public.requesting_tenant_id())
    -- Or tenant admin onboarding users to their own tenant
    OR (
      tenant_id = public.auth_user_tenant_id() 
      AND public.auth_user_role() = 'tenant_admin'
    )
  );

DROP POLICY IF EXISTS "Users can update own profile or tenant admin can manage" ON public.profiles;
CREATE POLICY "Users can update own profile or tenant admin can manage"
  ON public.profiles
  FOR UPDATE
  USING (
    (id = auth.uid() AND tenant_id = public.auth_user_tenant_id())
    OR (
      tenant_id = public.auth_user_tenant_id() 
      AND public.auth_user_role() = 'tenant_admin'
    )
  )
  WITH CHECK (
    (id = auth.uid() AND tenant_id = public.auth_user_tenant_id())
    OR (
      tenant_id = public.auth_user_tenant_id() 
      AND public.auth_user_role() = 'tenant_admin'
    )
  );

DROP POLICY IF EXISTS "Tenant admin can delete tenant profiles" ON public.profiles;
CREATE POLICY "Tenant admin can delete tenant profiles"
  ON public.profiles
  FOR DELETE
  USING (
    tenant_id = public.auth_user_tenant_id()
    AND public.auth_user_role() = 'tenant_admin'
    AND id != auth.uid() -- Prevent admin from deleting themselves
  );

-- ------------------------------------------------------------------------------
-- RLS POLICIES: ROOMS
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public and tenant members can view rooms of targeted tenant" ON public.rooms;
CREATE POLICY "Public and tenant members can view rooms of targeted tenant"
  ON public.rooms
  FOR SELECT
  USING (
    tenant_id = public.requesting_tenant_id()
    OR tenant_id = public.auth_user_tenant_id()
  );

DROP POLICY IF EXISTS "Tenant admin and staff can insert rooms" ON public.rooms;
CREATE POLICY "Tenant admin and staff can insert rooms"
  ON public.rooms
  FOR INSERT
  WITH CHECK (
    tenant_id = public.auth_user_tenant_id()
    AND public.auth_user_role() IN ('tenant_admin', 'staff')
  );

DROP POLICY IF EXISTS "Tenant admin and staff can update rooms" ON public.rooms;
CREATE POLICY "Tenant admin and staff can update rooms"
  ON public.rooms
  FOR UPDATE
  USING (
    tenant_id = public.auth_user_tenant_id()
    AND public.auth_user_role() IN ('tenant_admin', 'staff')
  )
  WITH CHECK (
    tenant_id = public.auth_user_tenant_id()
    AND public.auth_user_role() IN ('tenant_admin', 'staff')
  );

DROP POLICY IF EXISTS "Only tenant admin can delete rooms" ON public.rooms;
CREATE POLICY "Only tenant admin can delete rooms"
  ON public.rooms
  FOR DELETE
  USING (
    tenant_id = public.auth_user_tenant_id()
    AND public.auth_user_role() = 'tenant_admin'
  );

-- ------------------------------------------------------------------------------
-- RLS POLICIES: PRICING
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public and tenant members can view pricing rules" ON public.pricing;
CREATE POLICY "Public and tenant members can view pricing rules"
  ON public.pricing
  FOR SELECT
  USING (
    tenant_id = public.requesting_tenant_id()
    OR tenant_id = public.auth_user_tenant_id()
  );

DROP POLICY IF EXISTS "Tenant admin can insert pricing" ON public.pricing;
CREATE POLICY "Tenant admin can insert pricing"
  ON public.pricing
  FOR INSERT
  WITH CHECK (
    tenant_id = public.auth_user_tenant_id()
    AND public.auth_user_role() = 'tenant_admin'
  );

DROP POLICY IF EXISTS "Tenant admin can update pricing" ON public.pricing;
CREATE POLICY "Tenant admin can update pricing"
  ON public.pricing
  FOR UPDATE
  USING (
    tenant_id = public.auth_user_tenant_id()
    AND public.auth_user_role() = 'tenant_admin'
  )
  WITH CHECK (
    tenant_id = public.auth_user_tenant_id()
    AND public.auth_user_role() = 'tenant_admin'
  );

DROP POLICY IF EXISTS "Tenant admin can delete pricing" ON public.pricing;
CREATE POLICY "Tenant admin can delete pricing"
  ON public.pricing
  FOR DELETE
  USING (
    tenant_id = public.auth_user_tenant_id()
    AND public.auth_user_role() = 'tenant_admin'
  );

-- ------------------------------------------------------------------------------
-- RLS POLICIES: BOOKINGS
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Guests view own bookings and admin/staff view tenant bookings" ON public.bookings;
CREATE POLICY "Guests view own bookings and admin/staff view tenant bookings"
  ON public.bookings
  FOR SELECT
  USING (
    -- Admin and staff see all bookings for their tenant
    (
      tenant_id = public.auth_user_tenant_id()
      AND public.auth_user_role() IN ('tenant_admin', 'staff')
    )
    -- Guests only see their own bookings within their tenant (matching user_id or mobile_number)
    OR (
      tenant_id = public.auth_user_tenant_id()
      AND (
        user_id = auth.uid()
        OR (
          public.auth_user_mobile() IS NOT NULL 
          AND guest_mobile_number = public.auth_user_mobile()
        )
      )
    )
  );

DROP POLICY IF EXISTS "Guests and staff can create bookings for tenant" ON public.bookings;
CREATE POLICY "Guests and staff can create bookings for tenant"
  ON public.bookings
  FOR INSERT
  WITH CHECK (
    tenant_id = public.requesting_tenant_id()
    OR tenant_id = public.auth_user_tenant_id()
  );

DROP POLICY IF EXISTS "Guests can modify own bookings or staff can manage" ON public.bookings;
CREATE POLICY "Guests can modify own bookings or staff can manage"
  ON public.bookings
  FOR UPDATE
  USING (
    (
      tenant_id = public.auth_user_tenant_id()
      AND public.auth_user_role() IN ('tenant_admin', 'staff')
    )
    OR (
      tenant_id = public.auth_user_tenant_id()
      AND (
        user_id = auth.uid()
        OR (
          public.auth_user_mobile() IS NOT NULL 
          AND guest_mobile_number = public.auth_user_mobile()
        )
      )
    )
  )
  WITH CHECK (
    (
      tenant_id = public.auth_user_tenant_id()
      AND public.auth_user_role() IN ('tenant_admin', 'staff')
    )
    OR (
      tenant_id = public.auth_user_tenant_id()
      AND (
        user_id = auth.uid()
        OR (
          public.auth_user_mobile() IS NOT NULL 
          AND guest_mobile_number = public.auth_user_mobile()
        )
      )
    )
  );

DROP POLICY IF EXISTS "Only tenant admin can delete bookings" ON public.bookings;
CREATE POLICY "Only tenant admin can delete bookings"
  ON public.bookings
  FOR DELETE
  USING (
    tenant_id = public.auth_user_tenant_id()
    AND public.auth_user_role() = 'tenant_admin'
  );

-- ==============================================================================
-- 8. AUTOMATIC PROFILE PROVISIONING TRIGGER (Auth -> Profiles)
-- ==============================================================================
-- Automatically provisions or links a profile when a user signs in via WhatsApp / Phone OTP
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id UUID;
  v_role user_role;
  v_mobile TEXT;
BEGIN
  -- Extract tenant_id from user metadata or fallback to default
  v_tenant_id := NULLIF(NEW.raw_user_meta_data->>'tenant_id', '')::uuid;
  v_role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', '')::user_role, 'guest'::user_role);
  v_mobile := COALESCE(NEW.phone, NEW.raw_user_meta_data->>'mobile_number');

  -- Only proceed if mobile number and tenant_id are present
  IF v_tenant_id IS NOT NULL AND v_mobile IS NOT NULL THEN
    INSERT INTO public.profiles (id, tenant_id, mobile_number, full_name, role)
    VALUES (
      NEW.id,
      v_tenant_id,
      v_mobile,
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'Guest User'),
      v_role
    )
    ON CONFLICT (id) DO UPDATE
    SET
      mobile_number = EXCLUDED.mobile_number,
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_on_auth_user_created ON auth.users;
CREATE TRIGGER trigger_on_auth_user_created
  AFTER INSERT OR UPDATE OF phone, raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
