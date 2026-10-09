-- ==============================================================================
-- PropSyncHub: Resort Operations, Guest Portal & SaaS Modules Migration
-- Target: Supabase / PostgreSQL
-- Migration: 20261009_resort_saas_modules.sql
-- ==============================================================================

-- 1. RESORT MEMBERSHIPS & STAFF ROLES
CREATE TABLE IF NOT EXISTS public.resort_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('superadmin', 'tenant_admin', 'resort_manager', 'front_desk', 'housekeeping', 'restaurant_staff', 'accountant', 'staff', 'guest')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_tenant_user_membership UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON public.resort_memberships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON public.resort_memberships(user_id);

-- 2. RESTAURANT MENU CATEGORIES & ITEMS
CREATE TABLE IF NOT EXISTS public.restaurant_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_categories_tenant ON public.restaurant_categories(tenant_id);

CREATE TABLE IF NOT EXISTS public.restaurant_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.restaurant_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  price_inr NUMERIC(10, 2) NOT NULL CHECK (price_inr >= 0),
  is_veg BOOLEAN NOT NULL DEFAULT true,
  is_available BOOLEAN NOT NULL DEFAULT true,
  image_url TEXT,
  prep_time_minutes INT DEFAULT 20,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_items_tenant ON public.restaurant_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_items_category ON public.restaurant_items(category_id);

-- 3. RESTAURANT ORDERS
CREATE TABLE IF NOT EXISTS public.restaurant_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  order_number TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  guest_room TEXT,
  guest_phone TEXT,
  service_type TEXT NOT NULL DEFAULT 'room_delivery' CHECK (service_type IN ('room_delivery', 'dining', 'takeaway')),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal_inr NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  tax_inr NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total_inr NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'PLACED' CHECK (status IN ('PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'DELIVERED', 'CANCELLED')),
  payment_method TEXT NOT NULL DEFAULT 'room_folio' CHECK (payment_method IN ('room_folio', 'online_razorpay', 'pay_at_restaurant')),
  is_paid BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_orders_tenant ON public.restaurant_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_booking ON public.restaurant_orders(booking_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_status ON public.restaurant_orders(tenant_id, status);

-- 4. GUEST SERVICE REQUESTS
CREATE TABLE IF NOT EXISTS public.service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL,
  room_number TEXT,
  category TEXT NOT NULL DEFAULT 'housekeeping' CHECK (category IN ('housekeeping', 'extra_towels', 'extra_bed', 'maintenance', 'room_service', 'concierge', 'other')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  staff_notes TEXT,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_requests_tenant ON public.service_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_booking ON public.service_requests(booking_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_status ON public.service_requests(tenant_id, status);

-- 5. RESORT ACTIVITIES & BOOKINGS
CREATE TABLE IF NOT EXISTS public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price_inr NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (price_inr >= 0),
  duration_minutes INT,
  timing TEXT,
  max_participants INT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activities_tenant ON public.activities(tenant_id);

CREATE TABLE IF NOT EXISTS public.activity_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  activity_title TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  participants INT NOT NULL DEFAULT 1 CHECK (participants >= 1),
  scheduled_date DATE NOT NULL,
  total_amount_inr NUMERIC(10, 2) NOT NULL CHECK (total_amount_inr >= 0),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'completed', 'cancelled')),
  charged_to_folio BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_bookings_tenant ON public.activity_bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activity_bookings_booking ON public.activity_bookings(booking_id);

-- 6. GUEST REVIEWS & RATINGS
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_booking_review UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_tenant ON public.reviews(tenant_id, is_approved);
CREATE INDEX IF NOT EXISTS idx_reviews_booking ON public.reviews(booking_id);

-- 7. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.resort_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Service role full access
GRANT ALL ON public.resort_memberships TO service_role;
GRANT ALL ON public.restaurant_categories TO service_role;
GRANT ALL ON public.restaurant_items TO service_role;
GRANT ALL ON public.restaurant_orders TO service_role;
GRANT ALL ON public.service_requests TO service_role;
GRANT ALL ON public.activities TO service_role;
GRANT ALL ON public.activity_bookings TO service_role;
GRANT ALL ON public.reviews TO service_role;

-- Public read for active restaurant menu and approved reviews
CREATE POLICY "public_read_restaurant_items" ON public.restaurant_items FOR SELECT USING (is_available = true);
CREATE POLICY "public_read_restaurant_categories" ON public.restaurant_categories FOR SELECT USING (is_active = true);
CREATE POLICY "public_read_activities" ON public.activities FOR SELECT USING (is_active = true);
CREATE POLICY "public_read_approved_reviews" ON public.reviews FOR SELECT USING (is_approved = true);
