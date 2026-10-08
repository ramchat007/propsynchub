import { SubscriptionPlan } from '@/types';
import { AUTHORIZED_ADMIN_EMAILS } from '@/lib/constants';

export const PLATFORM_SUPERADMIN_EMAIL = 'ramchat007@gmail.com';

export interface PlanDefinition {
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  tagline: string;
  features: string[];
  maxRooms: number | 'Unlimited';
}

export interface PlatformBankDetails {
  accountName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branch: string;
  upiId: string;
  supportEmail: string;
}

export interface PlatformPricingConfig {
  plans: Record<SubscriptionPlan, PlanDefinition>;
  bankDetails: PlatformBankDetails;
  trialDurationDays: number;
  updatedAt?: string;
  updatedBy?: string;
}

// Default SaaS Pricing Tier Definitions (PropSyncHub)
export const DEFAULT_SAAS_PLANS: Record<SubscriptionPlan, PlanDefinition> = {
  starter: {
    name: 'Starter Resort',
    monthlyPrice: 1999,
    yearlyPrice: 19990,
    tagline: 'Ideal for boutique villas, homestays, and bed & breakfasts',
    features: [
      'Up to 10 Rooms / Cottages',
      'Direct Zero-Commission Booking Engine',
      'Guest WhatsApp Confirmation & Vouchers',
      'Staff Daily Arrival & Check-In Hub',
      'Razorpay Guest Payment Gateway Integration',
      'Daily Occupancy Calendar',
    ],
    maxRooms: 10,
  },
  pro: {
    name: 'Pro Resort & Spa',
    monthlyPrice: 4999,
    yearlyPrice: 49990,
    tagline: 'Complete operating system for full-scale resorts & luxury properties',
    features: [
      'Unlimited Rooms & Luxury Suites',
      'All Starter Features Included',
      'Dynamic Website CMS & Media Gallery',
      'Multi-Staff Role-Based Access Control',
      'Financial Folio, Taxes & Ledger Reports',
      'Guest Self-Service Concierge Portal',
      'Full Audit Trail & Security Logs',
      'Priority Phone & WhatsApp Support',
    ],
    maxRooms: 'Unlimited',
  },
  enterprise: {
    name: 'Enterprise Portfolio',
    monthlyPrice: 9999,
    yearlyPrice: 99990,
    tagline: 'For hotel chains, resort groups & multi-property owners',
    features: [
      'Multiple Properties / Resorts Management',
      'All Pro Features Included',
      'Custom Domain (e.g. yourbrand.com) Setup Assistance',
      'Custom PMS Integrations & Webhooks',
      'Dedicated Account Manager',
      '99.9% Uptime SLA & 24/7 Priority Emergency Line',
    ],
    maxRooms: 'Unlimited',
  },
};

// Default Platform Owner Offline Bank Details
export const DEFAULT_PLATFORM_BANK_DETAILS: PlatformBankDetails = {
  accountName: 'PropSyncHub SaaS (Rupesh Mestry)',
  bankName: 'HDFC Bank Ltd.',
  accountNumber: '50200088924156',
  ifscCode: 'HDFC0000123',
  branch: 'Mumbai, Maharashtra',
  upiId: 'ramchat007@okhdfcbank',
  supportEmail: 'ramchat007@gmail.com',
};

// Backwards compatibility aliases
export const SAAS_PLANS = DEFAULT_SAAS_PLANS;
export const PLATFORM_BANK_DETAILS = DEFAULT_PLATFORM_BANK_DETAILS;

/**
 * Helper to check if current user is platform superadmin
 */
export function isSuperadmin(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  return normalized === PLATFORM_SUPERADMIN_EMAIL || AUTHORIZED_ADMIN_EMAILS.includes(normalized);
}
