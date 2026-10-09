-- ============================================================================
-- PROPSYNCHUB MIGRATION: PHASE 4 - HOUSEKEEPING & FLOOR OPERATIONS
-- Dedicated Housekeeping Tasks, Supervisor Inspection Returns, and Floor Maintenance Integration
-- ============================================================================

-- 1. Create public.housekeeping_tasks table
CREATE TABLE IF NOT EXISTS public.housekeeping_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'dirty', -- 'dirty', 'cleaning', 'inspected', 'ready'
  priority VARCHAR(20) NOT NULL DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  assigned_staff_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_staff_name VARCHAR(255),
  assigned_at TIMESTAMPTZ,
  cleaning_started_at TIMESTAMPTZ,
  cleaning_completed_at TIMESTAMPTZ,
  turnaround_minutes INTEGER,
  inspected_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  inspected_by_name VARCHAR(255),
  inspected_at TIMESTAMPTZ,
  inspection_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_housekeeping_room UNIQUE (tenant_id, room_id)
);

CREATE INDEX IF NOT EXISTS idx_housekeeping_tenant_room ON public.housekeeping_tasks (tenant_id, room_id);
CREATE INDEX IF NOT EXISTS idx_housekeeping_status ON public.housekeeping_tasks (tenant_id, status);

-- 2. Create public.maintenance_tickets table
CREATE TABLE IF NOT EXISTS public.maintenance_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL DEFAULT 'general', -- plumbing, electrical, hvac, carpentry, appliances, general
  severity VARCHAR(30) NOT NULL DEFAULT 'normal', -- minor, normal, urgent, block_unit
  status VARCHAR(30) NOT NULL DEFAULT 'open', -- open, in_progress, resolved, closed
  reported_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_by_name VARCHAR(255),
  assigned_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to_name VARCHAR(255),
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_tenant_room ON public.maintenance_tickets (tenant_id, room_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON public.maintenance_tickets (tenant_id, status);

-- 3. Row Level Security Policies
ALTER TABLE public.housekeeping_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_tickets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'housekeeping_tasks' AND policyname = 'housekeeping_tenant_isolation'
  ) THEN
    CREATE POLICY housekeeping_tenant_isolation ON public.housekeeping_tasks
      FOR ALL
      USING (
        tenant_id IN (
          SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'maintenance_tickets' AND policyname = 'maintenance_tenant_isolation'
  ) THEN
    CREATE POLICY maintenance_tenant_isolation ON public.maintenance_tickets
      FOR ALL
      USING (
        tenant_id IN (
          SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;
