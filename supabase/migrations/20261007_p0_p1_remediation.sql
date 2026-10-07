-- ==============================================================================
-- PropSyncHub: P0 + P1 Core Resort Workflow Remediation Migration
-- Migration: 20261007_p0_p1_remediation.sql
-- ==============================================================================

-- 1. P0.1 ROOM STATUS LIFECYCLE EXTENSION
-- Add 'dirty', 'cleaning', and 'inspected' to the room_status enum
ALTER TYPE room_status ADD VALUE IF NOT EXISTS 'dirty';
ALTER TYPE room_status ADD VALUE IF NOT EXISTS 'cleaning';
ALTER TYPE room_status ADD VALUE IF NOT EXISTS 'inspected';

-- 2. P0.2 & P1.1 & P1.2 BOOKINGS SCHEMA ENHANCEMENTS
-- Add hold_expires_at for 15-minute booking hold lifecycle
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMPTZ;

-- Add category_id referencing room_categories (Category-first booking model)
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.room_categories(id) ON DELETE SET NULL;

-- Allow room_id to be nullable for reservations pending front-desk room unit assignment
ALTER TABLE public.bookings ALTER COLUMN room_id DROP NOT NULL;

-- Add payment balance tracking columns
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS paid_amount_inr NUMERIC(10, 2) DEFAULT 0.00 CHECK (paid_amount_inr >= 0);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS balance_amount_inr NUMERIC(10, 2) DEFAULT 0.00 CHECK (balance_amount_inr >= 0);

-- Backfill category_id for existing bookings from their currently assigned room
UPDATE public.bookings b
SET category_id = r.category_id
FROM public.rooms r
WHERE b.room_id = r.id AND b.category_id IS NULL;

-- Backfill paid_amount_inr and balance_amount_inr for existing bookings
UPDATE public.bookings
SET 
  paid_amount_inr = CASE WHEN payment_status = 'paid' THEN total_amount_inr ELSE 0 END,
  balance_amount_inr = CASE WHEN payment_status = 'paid' THEN 0 ELSE total_amount_inr END
WHERE balance_amount_inr = 0 AND paid_amount_inr = 0 AND total_amount_inr > 0;

-- Performance indexes for holds and category-level availability lookups
CREATE INDEX IF NOT EXISTS idx_bookings_hold_expires 
  ON public.bookings(booking_status, hold_expires_at);

CREATE INDEX IF NOT EXISTS idx_bookings_category_dates 
  ON public.bookings(tenant_id, category_id, check_in_date, check_out_date);

-- 3. P0.3 DATABASE-BACKED EMAIL OTP TABLE
CREATE TABLE IF NOT EXISTS public.email_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for Email OTP lookups
CREATE INDEX IF NOT EXISTS idx_email_otps_email_expires 
  ON public.email_otps(email, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_otps_tenant 
  ON public.email_otps(tenant_id);

-- Enable RLS (Service role handles OTP generation and verification)
ALTER TABLE public.email_otps ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.email_otps TO service_role;
