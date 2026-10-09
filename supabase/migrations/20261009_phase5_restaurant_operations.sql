-- ==============================================================================
-- PropSyncHub: Phase 5 — Restaurant Operations & Kitchen Order Tickets (KOT)
-- Target: Supabase / PostgreSQL
-- Migration: 20261009_phase5_restaurant_operations.sql
-- ==============================================================================

-- 1. EXTEND RESTAURANT ITEMS FOR CONFIGURABLE ITEM-LEVEL TAX & COMPLIANCE
ALTER TABLE IF EXISTS public.restaurant_items
  ADD COLUMN IF NOT EXISTS hsn_sac_code TEXT DEFAULT '996331',
  ADD COLUMN IF NOT EXISTS tax_rate_percent NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS is_tax_inclusive BOOLEAN DEFAULT false;

-- 2. EXTEND RESTAURANT ORDERS FOR KOT, SERVICE CHARGE, DISCOUNTS & FOLIO IDEMPOTENCY
ALTER TABLE IF EXISTS public.restaurant_orders
  ADD COLUMN IF NOT EXISTS kot_number TEXT,
  ADD COLUMN IF NOT EXISTS service_charge_percent NUMERIC(5, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS service_charge_inr NUMERIC(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS discount_inr NUMERIC(10, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS tax_breakdown JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS charged_to_folio BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS folio_charge_id TEXT,
  ADD COLUMN IF NOT EXISTS folio_posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT;

-- 3. INDEXES FOR KITCHEN & FOLIO LOOKUPS
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_kot ON public.restaurant_orders(tenant_id, kot_number);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_folio_charge ON public.restaurant_orders(folio_charge_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_items_available ON public.restaurant_items(tenant_id, is_available);
