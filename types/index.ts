/**
 * Foundational TypeScript Interfaces for PropSyncHub Multi-Tenant Architecture
 * Matching Supabase PostgreSQL Schema
 */

export type UserRole =
  | 'superadmin'        // Platform administrator
  | 'tenant_admin'      // Resort owner / administrator
  | 'resort_manager'    // Resort manager
  | 'front_desk'        // Front desk
  | 'housekeeping'      // Housekeeping
  | 'restaurant_staff'  // Restaurant staff
  | 'accountant'        // Accountant
  | 'staff'             // Legacy general staff
  | 'guest';            // Guest / customer

export type RoomStatus = 'available' | 'maintenance' | 'blocked' | 'dirty' | 'cleaning' | 'inspected';
export type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'partially_paid' | 'failed' | 'refunded';
export type PaymentPolicy = 'FULL_PAYMENT' | 'ADVANCE' | 'PAY_AT_PROPERTY';

export interface ModuleEntitlements {
  restaurant: boolean;
  activities: boolean;
  housekeeping: boolean;
  guest_services: boolean;
  reviews: boolean;
  accounting_exports: boolean;
  digital_guest_portal: boolean;
}

export interface TenantSettings {
  payment_policy?: PaymentPolicy;
  advance_percentage?: number; // e.g. 50 for 50% advance
  check_in_time?: string;
  check_out_time?: string;
  primary_color_hex?: string;
  subscription?: TenantSubscription;
  admin_emails?: string[];
  module_entitlements?: ModuleEntitlements;
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
  meal_plan_code?: MealPlanCode;
  meal_plan_charge_inr?: number;
  guest_gstin?: string | null;
  company_name?: string | null;
  billing_address?: string | null;
  razorpay_order_id?: string | null;
  razorpay_payment_id?: string | null;
  razorpay_signature?: string | null;
  special_requests?: string | null;
  actual_check_in_at?: string | null;
  actual_check_out_at?: string | null;
  room_key_number?: string | null;
  invoice_number?: string | null;
  guest_identity_data?: Record<string, unknown> | null;
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

// ==========================================
// RESTAURANT & FOOD ORDERING
// ==========================================
export interface RestaurantCategory {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  sort_order?: number;
  is_active: boolean;
  created_at: string;
}

export interface RestaurantItem {
  id: string;
  tenant_id: string;
  category_id?: string;
  category_name?: string;
  name: string;
  description?: string;
  price_inr: number;
  is_veg: boolean;
  is_jain?: boolean;
  is_available: boolean;
  image_url?: string;
  prep_time_minutes?: number;
  hsn_sac_code?: string; // SAC 996331 for restaurant/dining, 2202 for beverages, etc.
  tax_rate_percent?: number; // Configurable per-item GST (0%, 5%, 12%, 18%)
  is_tax_inclusive?: boolean;
  created_at: string;
}

export type RestaurantOrderStatus =
  | 'PLACED'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'SERVED'
  | 'DELIVERED'
  | 'CANCELLED';

export type RestaurantServiceType = 'room_delivery' | 'dining' | 'takeaway';
export type RestaurantPaymentMethod = 'room_folio' | 'online_razorpay' | 'pay_at_restaurant';

export interface RestaurantOrderItem {
  item_id: string;
  name: string;
  price_inr: number;
  quantity: number;
  special_notes?: string;
  preparation_notes?: string;
  hsn_sac_code?: string;
  tax_rate_percent?: number;
  is_veg?: boolean;
  is_jain?: boolean;
  tax_inr?: number;
}

export interface RestaurantOrder {
  id: string;
  tenant_id: string;
  booking_id?: string;
  order_number: string;
  kot_number?: string;
  guest_name: string;
  guest_room?: string;
  guest_phone?: string;
  service_type: RestaurantServiceType;
  items: RestaurantOrderItem[];
  subtotal_inr: number;
  tax_inr: number;
  service_charge_percent?: number;
  service_charge_inr?: number;
  discount_percent?: number;
  discount_inr?: number;
  tax_breakdown?: TaxBreakdownItem[];
  total_inr: number;
  status: RestaurantOrderStatus;
  payment_method: RestaurantPaymentMethod;
  is_paid: boolean;
  charged_to_folio?: boolean;
  folio_charge_id?: string;
  folio_posted_at?: string;
  cancellation_reason?: string;
  cancelled_at?: string;
  cancelled_by?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// ==========================================
// GUEST SERVICE REQUESTS
// ==========================================
export type ServiceRequestStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type ServiceRequestCategory =
  | 'housekeeping'
  | 'extra_towels'
  | 'extra_bed'
  | 'maintenance'
  | 'room_service'
  | 'concierge'
  | 'other';

export interface ServiceRequest {
  id: string;
  tenant_id: string;
  booking_id: string;
  guest_name: string;
  room_number?: string;
  category: ServiceRequestCategory;
  title: string;
  description?: string;
  status: ServiceRequestStatus;
  staff_notes?: string;
  assigned_to?: string;
  created_at: string;
  updated_at: string;
}

// ==========================================
// HOUSEKEEPING & ROOM READINESS
// ==========================================
export type HousekeepingStatus = 'dirty' | 'cleaning' | 'inspected' | 'ready';
export type InspectionStatus = 'pending' | 'approved' | 'rejected';

export interface HousekeepingTask {
  id: string;
  tenant_id: string;
  room_id: string;
  room_number: string;
  category_name?: string;
  status: HousekeepingStatus;
  assigned_staff_id?: string;
  assigned_staff_name?: string;
  assigned_at?: string;
  cleaning_started_at?: string;
  cleaning_completed_at?: string;
  turnaround_minutes?: number;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  notes?: string;
  inspected_by?: string;
  inspected_by_user_id?: string;
  inspected_by_name?: string;
  inspected_at?: string;
  inspection_status?: InspectionStatus;
  rejection_reason?: string;
  has_active_maintenance?: boolean;
  maintenance_issue?: string;
  created_at: string;
  updated_at: string;
}

// ==========================================
// MAINTENANCE TICKETS & UNIT REPAIRS
// ==========================================
export type MaintenanceCategory =
  | 'plumbing'
  | 'electrical'
  | 'hvac'
  | 'carpentry'
  | 'housekeeping'
  | 'appliances'
  | 'general';

export type MaintenanceSeverity = 'minor' | 'normal' | 'urgent' | 'block_unit';

export type MaintenanceTicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface MaintenanceTicket {
  id: string;
  tenant_id: string;
  room_id?: string | null;
  room_number?: string | null;
  title: string;
  description?: string;
  category: MaintenanceCategory;
  severity: MaintenanceSeverity;
  status: MaintenanceTicketStatus;
  reported_by_user_id?: string | null;
  reported_by_name?: string | null;
  assigned_to_user_id?: string | null;
  assigned_to_name?: string | null;
  resolution_notes?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
}

// ==========================================
// ACTIVITIES & ADD-ONS
// ==========================================
export interface ResortActivity {
  id: string;
  tenant_id: string;
  title: string;
  description: string;
  price_inr: number;
  duration_minutes?: number;
  timing?: string;
  max_participants?: number;
  is_active: boolean;
  image_url?: string;
  created_at: string;
}

export interface ActivityBooking {
  id: string;
  tenant_id: string;
  booking_id: string;
  activity_id: string;
  activity_title: string;
  guest_name: string;
  participants: number;
  scheduled_date: string;
  total_amount_inr: number;
  status: 'confirmed' | 'completed' | 'cancelled';
  charged_to_folio: boolean;
  created_at: string;
}

// ==========================================
// REVIEWS & FEEDBACK
// ==========================================
export interface ResortReview {
  id: string;
  tenant_id: string;
  booking_id: string;
  guest_name: string;
  rating: number; // 1 to 5
  comment: string;
  is_approved: boolean;
  verified_stay?: boolean; // strictly tied to completed stays
  stay_check_in?: string;
  stay_check_out?: string;
  room_category_name?: string;
  created_at: string;
}

export interface GuestPortalTokenPayload {
  bookingId: string;
  tenantId: string;
  expiresAt: number;
  version: number;
  roomNumber?: string;
  createdAt: number;
}

// ==========================================
// FOLIOS, INVOICES & SETTLEMENT
// ==========================================
export type FolioItemType =
  | 'room_charge'
  | 'food_beverage'
  | 'extra_bed'
  | 'activity'
  | 'transport'
  | 'late_checkout'
  | 'tax'
  | 'discount'
  | 'payment'
  | 'refund'
  | 'other';

export interface FolioItem {
  id: string;
  tenant_id: string;
  booking_id: string;
  type: FolioItemType;
  description: string;
  amount_inr: number; // positive for charges, negative for payments/discounts
  reference_id?: string;
  created_by?: string;
  created_at: string;
}

export interface BookingFolio {
  booking_id: string;
  tenant_id: string;
  guest_name: string;
  room_number?: string;
  check_in_date: string;
  check_out_date: string;
  items: FolioItem[];
  total_charges_inr: number;
  total_payments_inr: number;
  outstanding_balance_inr: number;
}

export type DocumentType =
  | 'booking_confirmation'
  | 'advance_receipt'
  | 'tax_invoice'
  | 'checkout_bill';

export interface IssuedDocument {
  id: string;
  tenant_id: string;
  booking_id: string;
  document_type: DocumentType;
  document_number: string;
  issued_at: string;
  total_amount_inr: number;
  paid_amount_inr: number;
  balance_amount_inr: number;
  tax_amount_inr?: number;
  pdf_url?: string;
}

// ==========================================
// RESORT MEMBERSHIPS & PLATFORM ADMIN
// ==========================================
export interface ResortMembership {
  id: string;
  user_id: string;
  tenant_id: string;
  role: UserRole;
  is_active: boolean;
  invited_by?: string;
  created_at: string;
  updated_at: string;
  resort?: Tenant;
}

export interface StaffInvitation {
  id: string;
  tenant_id: string;
  email: string;
  role: UserRole;
  full_name?: string;
  token: string;
  status: 'pending' | 'accepted' | 'revoked';
  expires_at: string;
  created_at: string;
}

// ==========================================
// PHASE 1: FINANCIAL CORE, TAXES & MEAL PLANS
// ==========================================

export type TaxSupplyCategory = 'accommodation' | 'restaurant' | 'activities' | 'miscellaneous';

export interface TaxSchedule {
  id: string;
  tenant_id?: string;
  category: TaxSupplyCategory;
  sac_code: string; // e.g. "996311" for rooms, "996331" for food, "996322" for activities
  description: string;
  rate_percent: number; // e.g. 12.0 or 5.0 or 18.0 (fully configurable)
  cgst_percent: number; // e.g. 6.0
  sgst_percent: number; // e.g. 6.0
  igst_percent?: number; // e.g. 12.0
  effective_from: string; // YYYY-MM-DD
  effective_to?: string | null; // YYYY-MM-DD or null
  is_active: boolean;
}

export interface TaxBreakdownItem {
  category: TaxSupplyCategory;
  sac_code: string;
  description: string;
  taxable_amount_inr: number;
  rate_percent: number;
  cgst_percent: number;
  sgst_percent: number;
  cgst_amount_inr: number;
  sgst_amount_inr: number;
  igst_amount_inr?: number;
  total_tax_inr: number;
  gross_amount_inr: number;
}

export interface TaxCalculationResult {
  is_inclusive: boolean;
  total_taxable_amount_inr: number;
  total_cgst_inr: number;
  total_sgst_inr: number;
  total_tax_inr: number;
  grand_total_inr: number;
  items: TaxBreakdownItem[];
}

export type MealPlanCode = 'EP' | 'CP' | 'MAP' | 'AP';

export interface MealPlanDefinition {
  code: MealPlanCode;
  name: string;
  short_label: string;
  description: string;
  included_meals: ('breakfast' | 'lunch' | 'dinner')[];
  adult_supplement_inr: number;
  child_supplement_inr: number;
  sac_code: string;
  is_available?: boolean;
}

export interface SelectedMealPlan {
  code: MealPlanCode;
  name: string;
  adult_supplement_inr: number;
  child_supplement_inr: number;
  total_plan_charge_inr: number;
}

export type PaymentMethodType =
  | 'cash'
  | 'upi'
  | 'bank_transfer'
  | 'credit_card'
  | 'debit_card'
  | 'razorpay'
  | 'cheque';

export type PaymentRecordStatus = 'completed' | 'voided' | 'reconciled';

export interface PaymentReceipt {
  id: string;
  tenant_id: string;
  booking_id: string;
  receipt_number: string;
  payment_method: PaymentMethodType;
  amount_inr: number;
  status: PaymentRecordStatus;
  reference_number?: string;
  payer_name: string;
  payer_phone?: string;
  received_by_user_id?: string;
  received_by_name?: string;
  received_at: string;
  notes?: string;
  is_voided: boolean;
  voided_at?: string;
  voided_by_user_id?: string;
  voided_by_name?: string;
  void_reason?: string;
  is_reconciled: boolean;
  reconciled_at?: string;
  reconciled_by_name?: string;
  bank_statement_ref?: string;
  created_at: string;
  updated_at: string;
}

export interface TaxInvoiceDocument {
  invoice_number: string;
  invoice_date: string;
  financial_year: string;
  tenant: {
    name: string;
    legal_name: string;
    gstin: string;
    address: string;
    state_code: string;
    state_name: string;
    phone?: string;
    email?: string;
  };
  guest: {
    name: string;
    phone: string;
    email?: string;
    gstin?: string;
    company_name?: string;
    billing_address?: string;
  };
  stay: {
    booking_ref: string;
    check_in: string;
    check_out: string;
    nights: number;
    room_name?: string;
    meal_plan?: string;
    pax: string;
  };
  tax_summary: TaxCalculationResult;
  paid_amount_inr: number;
  balance_amount_inr: number;
  payment_records: PaymentReceipt[];
}

// ============================================================================
// PHASE 2: INVENTORY, ROOM MAINTENANCE & SEASONAL PRICING INTERFACES
// ============================================================================

export type RoomBlockType =
  | 'maintenance'
  | 'renovation'
  | 'deep_cleaning'
  | 'owner_stay'
  | 'out_of_order'
  | 'blocked';

export type RoomBlockStatus = 'active' | 'completed' | 'cancelled';

export interface RoomBlock {
  id: string;
  tenant_id: string;
  room_id: string;
  room_name?: string;
  room_number?: string;
  block_type: RoomBlockType;
  reason: string;
  start_date: string;
  end_date: string;
  status: RoomBlockStatus;
  created_by_user_id?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export type PricingRuleType =
  | 'date_override' // Highest precedence: exact holiday/event dates (Diwali, New Year's Eve)
  | 'seasonal'      // Medium precedence: peak monsoon / winter season
  | 'weekend'       // Lower precedence: Friday & Saturday surcharges
  | 'promotional';  // Special rate promotions

export interface SeasonalPricingRule {
  id: string;
  tenant_id: string;
  room_id?: string | null;
  category_id?: string | null;
  title: string;
  rule_type: PricingRuleType;
  priority: number; // e.g. 400 for date_override, 300 for seasonal, 200 for weekend, 100 for base
  start_date: string;
  end_date: string;
  fixed_price_inr?: number | null;
  multiplier?: number | null; // e.g. 1.25 for 25% surge
  weekend_price_inr?: number | null;
  extra_adult_price_inr?: number | null;
  extra_child_price_inr?: number | null;
  days_of_week?: number[]; // [0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat]
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NightlyRateBreakdown {
  date: string;
  day_of_week: string;
  is_weekend: boolean;
  base_rate_inr: number;
  applied_rule_id?: string;
  applied_rule_title: string;
  applied_rule_type: PricingRuleType | 'base';
  room_rate_inr: number;
  extra_guests_count: number;
  extra_guest_charge_inr: number;
  night_total_inr: number;
}

export interface OccupancyPricingResult {
  is_available: boolean;
  unavailability_reason?: string;
  category_id?: string;
  category_name?: string;
  room_id?: string;
  room_name?: string;
  nights: number;
  adults: number;
  children: number;
  total_guests: number;
  max_allowed_guests: number;
  base_adults: number;
  extra_adults: number;
  extra_children: number;
  extra_adult_rate_inr: number;
  extra_child_rate_inr: number;
  nightly_breakdown: NightlyRateBreakdown[];
  total_room_charges_inr: number;
  total_extra_guest_charges_inr: number;
  grand_total_inr: number;
}

// ============================================================================
// PHASE 3: FRONT DESK, CHECK-IN/OUT & FOLIO SETTLEMENT INTERFACES
// ============================================================================

export type GuestIdType = 'aadhaar' | 'passport' | 'driving_license' | 'voter_id' | 'other';

export interface ForeignGuestFormC {
  passport_number: string;
  visa_number: string;
  visa_valid_until: string;
  place_of_issue?: string;
  arrived_from?: string;
  next_destination?: string;
}

export interface GuestIdentityRecord {
  id: string;
  tenant_id: string;
  booking_id: string;
  id_type: GuestIdType;
  id_number_masked: string; // e.g. "•••• •••• 4589" (Strict privacy: NEVER store 12 digits!)
  holder_name: string;
  nationality: string;
  is_foreign_guest: boolean;
  form_c_data?: ForeignGuestFormC | null;
  verified_by_user_id?: string | null;
  verified_by_name?: string | null;
  verified_at: string;
  retention_consent: boolean;
  is_redacted: boolean;
  redacted_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface CheckInPayload {
  tenantId: string;
  bookingId: string;
  roomId?: string; // Optional reassigned unit
  roomKeyNumber?: string;
  idType: GuestIdType;
  idNumber: string; // Will be masked authoritatively if Aadhaar
  holderName: string;
  nationality?: string;
  isForeignGuest?: boolean;
  formC?: ForeignGuestFormC;
  depositAmountInr?: number;
  depositPaymentMethod?: PaymentMethodType;
  depositRef?: string;
  notes?: string;
}

export interface SplitPaymentEntry {
  amount_inr: number;
  payment_method: PaymentMethodType;
  reference_number?: string;
  notes?: string;
}

export interface CheckOutSettlementPayload {
  tenantId: string;
  bookingId: string;
  splitPayments: SplitPaymentEntry[];
  keysReturned: boolean;
  settlementNotes?: string;
  allowLedgerCredit?: boolean; // For authorized company/corporate accounts
}

// ============================================================================
// PHASE 7: ADMINISTRATION, MODULE ENTITLEMENTS & ACCOUNTING-SUPPORT EXPORTS
// ============================================================================

export interface Gstr1B2BInvoiceEntry {
  gstin: string;
  receiver_name: string;
  invoice_number: string;
  invoice_date: string;
  invoice_value_inr: number;
  place_of_supply: string;
  reverse_charge: 'Y' | 'N';
  applicable_tax_rate_percent: number;
  taxable_value_inr: number;
  cess_amount_inr: number;
  cgst_inr: number;
  sgst_inr: number;
  igst_inr: number;
}

export interface Gstr1B2CSmallEntry {
  place_of_supply: string;
  rate_percent: number;
  taxable_value_inr: number;
  cess_amount_inr: number;
  cgst_inr: number;
  sgst_inr: number;
  igst_inr: number;
  type: string; // e.g. 'OE'
}

export interface Gstr1HsnSacEntry {
  hsn_sac_code: string;
  description: string;
  uqc: string;
  total_quantity: number;
  total_value_inr: number;
  taxable_value_inr: number;
  cgst_inr: number;
  sgst_inr: number;
  igst_inr: number;
  cess_inr: number;
}

export interface Gstr1DocIssuedEntry {
  doc_type: string;
  from_serial: string;
  to_serial: string;
  total_number: number;
  cancelled_number: number;
  net_issued_number: number;
}

export interface Gstr1AccountingSupportExport {
  export_disclaimer: string;
  tenant_id: string;
  resort_legal_name: string;
  resort_gstin: string;
  resort_state_code: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  generated_by_role: UserRole;
  b2b_supplies: Gstr1B2BInvoiceEntry[];
  b2c_supplies: Gstr1B2CSmallEntry[];
  hsn_sac_summary: Gstr1HsnSacEntry[];
  doc_summary: Gstr1DocIssuedEntry[];
  summary_totals: {
    total_invoices: number;
    total_taxable_value_inr: number;
    total_cgst_inr: number;
    total_sgst_inr: number;
    total_igst_inr: number;
    total_cess_inr: number;
    total_tax_liability_inr: number;
    gross_turnover_inr: number;
  };
}

export interface SalesRegisterEntry {
  booking_id: string;
  invoice_or_ref_number: string;
  booking_status: string;
  booking_date: string;
  check_in_date: string;
  check_out_date: string;
  guest_name: string;
  guest_mobile: string;
  guest_gstin?: string;
  company_name?: string;
  is_b2b: boolean;
  place_of_supply: string;
  room_tariff_taxable_inr: number;
  meal_plan_taxable_inr: number;
  dining_taxable_inr: number;
  activities_taxable_inr: number;
  other_taxable_inr: number;
  total_taxable_value_inr: number;
  cgst_inr: number;
  sgst_inr: number;
  igst_inr: number;
  total_tax_inr: number;
  total_invoice_value_inr: number;
  paid_amount_inr: number;
  balance_amount_inr: number;
  payment_status: string;
  payment_method: string;
}

export interface SalesRegisterExport {
  export_disclaimer: string;
  tenant_id: string;
  resort_legal_name: string;
  resort_gstin: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  generated_by_role: UserRole;
  entries: SalesRegisterEntry[];
  summary_totals: {
    total_entries: number;
    total_room_tariff_inr: number;
    total_dining_inr: number;
    total_activities_inr: number;
    total_taxable_value_inr: number;
    total_cgst_inr: number;
    total_sgst_inr: number;
    total_igst_inr: number;
    total_tax_inr: number;
    total_gross_inr: number;
    total_collected_inr: number;
    total_pending_inr: number;
  };
}

