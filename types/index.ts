/**
 * Foundational TypeScript Interfaces for PropSyncHub Multi-Tenant Architecture
 * Matching Supabase PostgreSQL Schema
 */

export type UserRole = 'superadmin' | 'tenant_admin' | 'staff' | 'guest';
export type RoomStatus = 'available' | 'maintenance' | 'blocked' | 'dirty' | 'cleaning' | 'inspected';
export type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'partially_paid' | 'failed' | 'refunded';
export type PaymentPolicy = 'FULL_PAYMENT' | 'ADVANCE' | 'PAY_AT_PROPERTY';

export interface TenantSettings {
  payment_policy?: PaymentPolicy;
  advance_percentage?: number; // e.g. 50 for 50% advance
  check_in_time?: string;
  check_out_time?: string;
  primary_color_hex?: string;
  subscription?: TenantSubscription;
  admin_emails?: string[];
  [key: string]: unknown;
}

export interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  custom_domain?: string | null;
  logo_url?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  is_active: boolean;
  settings: TenantSettings;
  razorpay_test_key_id?: string | null;
  razorpay_test_key_secret?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string; // References auth.users(id)
  tenant_id: string;
  mobile_number: string; // Primary identity for WhatsApp OTP
  full_name?: string | null;
  role: UserRole;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoomCategory {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  base_price_inr: number;
  extra_pax_price_inr: number;
  max_adults: number;
  max_children: number;
  amenities: string[];
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  tenant_id: string;
  category_id?: string | null;
  name: string;
  room_number?: string | null;
  room_type: string;
  capacity_adults: number;
  capacity_children: number;
  base_price_inr: number;
  status: RoomStatus;
  amenities: string[];
  images: string[];
  created_at: string;
  updated_at: string;
}

export interface Pricing {
  id: string;
  tenant_id: string;
  room_id?: string | null; // NULL applies to all rooms in the tenant
  title: string;
  start_date: string;
  end_date: string;
  multiplier: number;
  fixed_price_inr?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  tenant_id: string;
  room_id?: string | null; // Nullable when reserved by category before physical unit assignment
  category_id?: string | null;
  user_id?: string | null;
  guest_mobile_number: string;
  guest_name: string;
  guest_email?: string | null;
  check_in_date: string;
  check_out_date: string;
  num_adults: number;
  num_children: number;
  total_amount_inr: number;
  paid_amount_inr?: number;
  balance_amount_inr?: number;
  payment_policy?: PaymentPolicy;
  booking_status: BookingStatus;
  payment_status: PaymentStatus;
  hold_expires_at?: string | null;
  razorpay_order_id?: string | null;
  razorpay_payment_id?: string | null;
  razorpay_signature?: string | null;
  special_requests?: string | null;
  created_at: string;
  updated_at: string;
  room?: Room | null;
  category?: RoomCategory | null;
}

export interface EmailOtpRecord {
  id: string;
  tenant_id?: string | null;
  email: string;
  otp_hash: string;
  expires_at: string;
  attempts: number;
  used_at?: string | null;
  created_at: string;
}

export interface RazorpayPaymentMetadata {
  payment_id: string;
  order_id: string;
  signature: string;
  amount: number;
  currency: string;
  tenant_id: string;
}

export type AuditActionType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface AuditLog {
  id: string;
  tenant_id: string;
  user_id?: string | null;
  table_name: string;
  record_id: string;
  action_type: AuditActionType;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  created_at: string;
  user_profile?: {
    full_name?: string | null;
    mobile_number?: string | null;
    role?: UserRole | null;
  } | null;
}

export type IncidentalCategory =
  | 'restaurant'
  | 'spa'
  | 'room_service'
  | 'minibar'
  | 'laundry'
  | 'damage_fee'
  | 'activities'
  | 'other';

export interface IncidentalCharge {
  id: string;
  tenant_id: string;
  booking_id: string;
  item_name: string;
  category: IncidentalCategory;
  amount_inr: number;
  quantity: number;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface TeamMember {
  id: string;
  tenant_id: string;
  email: string;
  full_name?: string | null;
  mobile_number?: string | null;
  role: UserRole;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export type SubscriptionStatus = 'trial' | 'active' | 'pending_approval' | 'expired';
export type SubscriptionPlan = 'starter' | 'pro' | 'enterprise';
export type PlatformPaymentMode = 'free_trial' | 'offline_bank_transfer' | 'online_razorpay' | 'complimentary';

export interface TenantSubscriptionPaymentRecord {
  id: string;
  date: string;
  amount: number;
  plan: SubscriptionPlan;
  billing_cycle?: 'monthly' | 'yearly';
  mode: PlatformPaymentMode;
  reference?: string;
  status: 'approved' | 'pending' | 'rejected';
  notes?: string;
  approved_by?: string;
}

export interface TenantSubscription {
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  billing_cycle?: 'monthly' | 'yearly';
  trial_ends_at?: string;
  active_until?: string;
  payment_mode: PlatformPaymentMode;
  amount_inr?: number;
  offline_reference?: string;
  offline_notes?: string;
  submitted_at?: string;
  approved_at?: string;
  approved_by?: string;
  payment_history?: TenantSubscriptionPaymentRecord[];
}


