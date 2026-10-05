-- ==============================================================================
-- PropSyncHub: Room Categories Table & Schema Extension
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.room_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  base_price_inr NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (base_price_inr >= 0),
  extra_pax_price_inr NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (extra_pax_price_inr >= 0),
  max_adults INT NOT NULL DEFAULT 2 CHECK (max_adults >= 1),
  max_children INT NOT NULL DEFAULT 0 CHECK (max_children >= 0),
  amenities JSONB DEFAULT '[]'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT unique_tenant_category_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_room_categories_tenant_id ON public.room_categories(tenant_id);

-- Optional foreign key on rooms if category_id column is added
DO $$ BEGIN
  ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.room_categories(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

ALTER TABLE public.room_categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies for room_categories
DROP POLICY IF EXISTS "Public and tenant members view room categories" ON public.room_categories;
CREATE POLICY "Public and tenant members view room categories"
  ON public.room_categories
  FOR SELECT
  USING (
    tenant_id = public.requesting_tenant_id() 
    OR tenant_id = public.auth_user_tenant_id()
  );

DROP POLICY IF EXISTS "Tenant admin and staff manage room categories" ON public.room_categories;
CREATE POLICY "Tenant admin and staff manage room categories"
  ON public.room_categories
  FOR ALL
  USING (
    tenant_id = public.auth_user_tenant_id() 
    AND public.auth_user_role() IN ('tenant_admin', 'staff')
  )
  WITH CHECK (
    tenant_id = public.auth_user_tenant_id() 
    AND public.auth_user_role() IN ('tenant_admin', 'staff')
  );
