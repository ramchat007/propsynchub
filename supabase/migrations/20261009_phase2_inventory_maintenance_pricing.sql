-- ============================================================================
-- PROPSYNCHUB PHASE 2: INVENTORY, ROOM ALLOCATIONS & SEASONAL PRICING
-- ============================================================================

-- 1. Create Room Blocks Table (Maintenance, Deep Cleaning, Out of Order)
CREATE TABLE IF NOT EXISTS public.room_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  block_type VARCHAR(50) NOT NULL DEFAULT 'maintenance', -- 'maintenance', 'renovation', 'deep_cleaning', 'owner_stay', 'blocked'
  reason TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active', -- 'active', 'completed', 'cancelled'
  created_by_user_id UUID,
  created_by_name VARCHAR(150),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for collision queries (overlapping stay windows)
CREATE INDEX IF NOT EXISTS idx_room_blocks_dates 
  ON public.room_blocks (tenant_id, room_id, start_date, end_date) 
  WHERE status = 'active';

-- Enable RLS
ALTER TABLE public.room_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "room_blocks_tenant_isolation" ON public.room_blocks
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

-- 2. Add Category Pricing and Occupancy extensions to room_categories
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS weekend_price_inr NUMERIC,
  ADD COLUMN IF NOT EXISTS extra_adult_price_inr NUMERIC DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS extra_child_price_inr NUMERIC DEFAULT 500,
  ADD COLUMN IF NOT EXISTS base_adults INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_total_guests INTEGER DEFAULT 4;

-- 3. Add Rule Type & Priority extensions to pricing table
ALTER TABLE public.pricing
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.room_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rule_type VARCHAR(50) DEFAULT 'seasonal', -- 'date_override', 'seasonal', 'weekend', 'promotional'
  ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS extra_adult_price_inr NUMERIC,
  ADD COLUMN IF NOT EXISTS extra_child_price_inr NUMERIC,
  ADD COLUMN IF NOT EXISTS days_of_week INTEGER[]; -- e.g. [5, 6] for Friday & Saturday

CREATE INDEX IF NOT EXISTS idx_pricing_tenant_dates
  ON public.pricing (tenant_id, start_date, end_date, is_active);
