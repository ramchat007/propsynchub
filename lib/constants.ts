export const PREDEFINED_TEST_OTP = '123456';
export const DEFAULT_TEST_PHONE = '9999999999';

/**
 * Platform-wide Superadmin Accounts
 * Only users in this list who are authenticated and have role 'superadmin'
 * are granted cross-tenant platform administration privileges (/admin-master).
 */
export const PLATFORM_SUPERADMIN_EMAILS: string[] = [
  'ramchat007@gmail.com',
];

/**
 * Platform admin emails alias for system compatibility
 */
export const AUTHORIZED_ADMIN_EMAILS: string[] = [
  ...PLATFORM_SUPERADMIN_EMAILS,
];

export const PRIMARY_DEMO_TENANT_ID = '2f002373-c7f2-4127-842f-4bb20d7a1b64';

export const PRIMARY_ROOT_DOMAIN = 'propsynchub.in';

/**
 * MANDATORY REGULATORY & ACCOUNTING NOTICE
 * Under statutory guidelines for hospitality PMS software, exports provided
 * for tax reconciliation must never masquerade as certified GST filings.
 */
export const ACCOUNTING_SUPPORT_EXPORT_DISCLAIMER =
  '⚠️ PropSyncHub Accounting-Support Export: Generated strictly for internal accounting reconciliation and Chartered Accountant working papers only. Not validated for direct automated GSTN portal filing without professional sign-off.';

/**
 * Default module entitlements (enabled by default for all resorts unless explicitly disabled)
 */
export const DEFAULT_MODULE_ENTITLEMENTS: import('@/types').ModuleEntitlements = {
  restaurant: true,
  activities: true,
  housekeeping: true,
  guest_services: true,
  reviews: true,
  accounting_exports: true,
  digital_guest_portal: true,
};

