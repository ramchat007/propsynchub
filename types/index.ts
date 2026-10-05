/**
 * Foundational TypeScript Interfaces for PropSyncHub Multi-Tenant Architecture
 * Matching Supabase PostgreSQL Schema
 */

export type UserRole = 'superadmin' | 'tenant_admin' | 'staff' | 'guest';
export type RoomStatus = 'available' | 'maintenance' | 'blocked';
export type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'partially_paid' | 'failed' | 'refunded';

export interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  custom_domain?: string | null;
  logo_url?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  is_active: boolean;
  settings: Record<string, unknown>;
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
  room_id: string;
  user_id?: string | null;
  guest_mobile_number: string; // Primary identity
  guest_name: string;
  guest_email?: string | null;
  check_in_date: string;
  check_out_date: string;
  num_adults: number;
  num_children: number;
  total_amount_inr: number;
  booking_status: BookingStatus;
  payment_status: PaymentStatus;
  razorpay_order_id?: string | null;
  razorpay_payment_id?: string | null;
  razorpay_signature?: string | null;
  special_requests?: string | null;
  created_at: string;
  updated_at: string;
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
