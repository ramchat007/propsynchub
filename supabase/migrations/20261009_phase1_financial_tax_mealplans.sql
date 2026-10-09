-- ==============================================================================
-- PropSyncHub: Phase 1 — Financial Core, Configurable GST & Meal Plans Migration
-- Migration: 20261009_phase1_financial_tax_mealplans.sql
-- ==============================================================================

-- 1. ADD BOOKING ENHANCEMENTS FOR PHASE 1
-- Support Meal Plan selection (EP, CP, MAP, AP) and B2B GST Invoicing details
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS meal_plan_code TEXT DEFAULT 'EP';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS meal_plan_charge_inr NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS guest_gstin TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS billing_address TEXT;

-- 2. ADD MEAL PLANS TO ROOM CATEGORIES
ALTER TABLE public.room_categories ADD COLUMN IF NOT EXISTS meal_plans JSONB DEFAULT '[]'::jsonb;

-- 3. CREATE DEDICATED PAYMENT RECORDS & RECEIPTS TABLE
CREATE TABLE IF NOT EXISTS public.payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'upi', 'bank_transfer', 'credit_card', 'debit_card', 'razorpay', 'cheque')),
  amount_inr NUMERIC(10, 2) NOT NULL CHECK (amount_inr > 0),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'voided', 'reconciled')),
  reference_number TEXT,
  payer_name TEXT NOT NULL,
  payer_phone TEXT,
  received_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  received_by_name TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  is_voided BOOLEAN NOT NULL DEFAULT false,
  voided_at TIMESTAMPTZ,
  voided_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  voided_by_name TEXT,
  void_reason TEXT,
  is_reconciled BOOLEAN NOT NULL DEFAULT false,
  reconciled_at TIMESTAMPTZ,
  reconciled_by_name TEXT,
  bank_statement_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on payment_records
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;

-- RLS: Tenant staff can view and manage their resort's payment records
DROP POLICY IF EXISTS "Staff can view tenant payment records" ON public.payment_records;
CREATE POLICY "Staff can view tenant payment records"
  ON public.payment_records
  FOR SELECT
  USING (
    tenant_id = public.auth_user_tenant_id()
    OR public.auth_user_role() = 'superadmin'
  );

DROP POLICY IF EXISTS "Staff can insert tenant payment records" ON public.payment_records;
CREATE POLICY "Staff can insert tenant payment records"
  ON public.payment_records
  FOR INSERT
  WITH CHECK (
    tenant_id = public.auth_user_tenant_id()
    OR public.auth_user_role() = 'superadmin'
  );

DROP POLICY IF EXISTS "Staff can update tenant payment records" ON public.payment_records;
CREATE POLICY "Staff can update tenant payment records"
  ON public.payment_records
  FOR UPDATE
  USING (
    tenant_id = public.auth_user_tenant_id()
    OR public.auth_user_role() = 'superadmin'
  );

-- Indexes for fast ledger lookups
CREATE INDEX IF NOT EXISTS idx_payment_records_booking 
  ON public.payment_records(booking_id, status);

CREATE INDEX IF NOT EXISTS idx_payment_records_tenant_date 
  ON public.payment_records(tenant_id, received_at DESC);
