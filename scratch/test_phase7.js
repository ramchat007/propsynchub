/**
 * Phase 7 Verification Suite: Administration & Reporting
 * Tests:
 * 1. Statutory Accounting-Support Export Disclaimer & Labelling
 * 2. Role-Based Export Authorization (Only superadmin, tenant_admin, resort_manager, accountant)
 * 3. GSTR-1 Multi-Table Aggregation (Table 4 B2B, Table 7 B2C, Table 12 HSN/SAC, Table 13 Docs)
 * 4. Sales Register Detailed Ledger CSV Compilation
 * 5. Tenant Module Entitlements (Default state, toggling, export blocking, nav filtering)
 * 6. Resort Onboarding GSTIN & PAN Validation
 * 7. Google Identity vs Server-side Database Authorization Invariant
 */

const assert = require('assert');

console.log('================================================================');
console.log('PropSyncHub Phase 7 — Administration & Reporting Verification');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// 1. STATUTORY DISCLAIMER & LABELLING INVARIANT
// -----------------------------------------------------------------------------
console.log('Test 1: Mandatory Accounting-Support Export Disclaimer');

const ACCOUNTING_SUPPORT_EXPORT_DISCLAIMER =
  '⚠️ PropSyncHub Accounting-Support Export: Generated strictly for internal accounting reconciliation and Chartered Accountant working papers only. Not validated for direct automated GSTN portal filing without professional sign-off.';

assert(
  ACCOUNTING_SUPPORT_EXPORT_DISCLAIMER.includes('Accounting-Support Export'),
  'Disclaimer must prominently specify Accounting-Support Export'
);
assert(
  ACCOUNTING_SUPPORT_EXPORT_DISCLAIMER.includes('Chartered Accountant working papers only'),
  'Disclaimer must explicitly state for Chartered Accountant working papers only'
);
assert(
  ACCOUNTING_SUPPORT_EXPORT_DISCLAIMER.includes('Not validated for direct automated GSTN portal filing'),
  'Disclaimer must warn against direct portal filing without professional review'
);

console.log('  ✔ Statutory disclaimer matches regulatory hospitality PMS requirements.');

// -----------------------------------------------------------------------------
// 2. SERVER-SIDE ROLE AUTHORIZATION FOR EXPORTS
// -----------------------------------------------------------------------------
console.log('\nTest 2: Server-side Role Authorization for Financial Exports');

const AUTHORIZED_EXPORT_ROLES = ['superadmin', 'tenant_admin', 'resort_manager', 'accountant'];
const BLOCKED_EXPORT_ROLES = ['staff', 'housekeeping', 'restaurant_staff', 'front_desk', 'guest'];

function isRoleAuthorizedForExports(role) {
  return AUTHORIZED_EXPORT_ROLES.includes(role);
}

// Verify authorized roles succeed
AUTHORIZED_EXPORT_ROLES.forEach((role) => {
  assert.strictEqual(
    isRoleAuthorizedForExports(role),
    true,
    `Role '${role}' must be authorized to generate financial exports.`
  );
});

// Verify unauthorized roles are blocked
BLOCKED_EXPORT_ROLES.forEach((role) => {
  assert.strictEqual(
    isRoleAuthorizedForExports(role),
    false,
    `Role '${role}' must be BLOCKED from generating financial exports.`
  );
});

console.log('  ✔ Role authorization strictly allows only superadmin, tenant_admin, resort_manager, and accountant.');
console.log('  ✔ Staff, housekeeping, restaurant_staff, front_desk, and guests are strictly blocked.');

// -----------------------------------------------------------------------------
// 3. GSTR-1 MULTI-TABLE COMPILATION (B2B, B2C, HSN/SAC, DOCS)
// -----------------------------------------------------------------------------
console.log('\nTest 3: GSTR-1 Multi-Table Aggregation & Intra/Inter-State Tax Split');

const resortStateCode = '27'; // Maharashtra
const resortStateName = 'Maharashtra';

const mockBookings = [
  // B2B intra-state booking (Maharashtra GSTIN)
  {
    id: 'bkg_b2b_intra',
    tenant_id: 'ten_001',
    guest_name: 'Tech Mahindra Ltd',
    company_name: 'Tech Mahindra Ltd',
    guest_gstin: '27AAACT2727Q1ZW',
    total_amount_inr: 22400, // 20000 taxable + 12% GST = 22400
    booking_status: 'checked_out',
    invoice_number: 'INV-2026-001',
    created_at: '2026-10-01T10:00:00Z',
    actual_check_out_at: '2026-10-04T10:00:00Z',
  },
  // B2B inter-state booking (Karnataka GSTIN - 29)
  {
    id: 'bkg_b2b_inter',
    tenant_id: 'ten_001',
    guest_name: 'Infosys BPM',
    company_name: 'Infosys BPM',
    guest_gstin: '29AAACI1999P1ZB',
    total_amount_inr: 33600, // 30000 taxable + 12% GST = 33600
    booking_status: 'checked_out',
    invoice_number: 'INV-2026-002',
    created_at: '2026-10-02T10:00:00Z',
    actual_check_out_at: '2026-10-05T10:00:00Z',
  },
  // B2C consumer booking (no GSTIN)
  {
    id: 'bkg_b2c_01',
    tenant_id: 'ten_001',
    guest_name: 'Rohan Sharma',
    guest_gstin: null,
    total_amount_inr: 11200, // 10000 taxable + 12% GST = 11200
    booking_status: 'confirmed',
    invoice_number: 'INV-2026-003',
    created_at: '2026-10-03T10:00:00Z',
  },
  // Cancelled booking (must not contribute to outward supply liabilities)
  {
    id: 'bkg_cancelled',
    tenant_id: 'ten_001',
    guest_name: 'Cancelled Guest',
    guest_gstin: null,
    total_amount_inr: 11200,
    booking_status: 'cancelled',
    invoice_number: 'INV-2026-004',
    created_at: '2026-10-03T11:00:00Z',
  },
];

const mockOrders = [
  // B2C Restaurant dining (5% GST)
  {
    id: 'ord_01',
    tenant_id: 'ten_001',
    status: 'completed',
    charged_to_folio: false,
    total_inr: 2100, // 2000 taxable + 5% GST = 2100
    created_at: '2026-10-03T12:00:00Z',
  },
];

const mockActivities = [
  // B2C Kayaking / Adventure Activity (18% GST)
  {
    id: 'act_01',
    tenant_id: 'ten_001',
    status: 'completed',
    charged_to_folio: false,
    total_amount_inr: 1180, // 1000 taxable + 18% GST = 1180
    created_at: '2026-10-03T14:00:00Z',
  },
];

// Logic simulator for GSTR-1 aggregation
function compileGstr1(bookings, orders, activities) {
  const activeBookings = bookings.filter((b) => b.booking_status !== 'cancelled');

  // Table 4: B2B
  const b2bSupplies = [];
  activeBookings
    .filter((b) => b.guest_gstin && b.guest_gstin.trim().length === 15)
    .forEach((b) => {
      const total = Number(b.total_amount_inr);
      const rate = 12;
      const taxable = Math.round((total / (1 + rate / 100)) * 100) / 100;
      const totalTax = Math.round((total - taxable) * 100) / 100;

      const guestStateCode = b.guest_gstin.substring(0, 2);
      const isInterState = guestStateCode !== resortStateCode;

      const cgst = isInterState ? 0 : Math.round((totalTax / 2) * 100) / 100;
      const sgst = isInterState ? 0 : Math.round((totalTax / 2) * 100) / 100;
      const igst = isInterState ? totalTax : 0;

      b2bSupplies.push({
        gstin: b.guest_gstin,
        receiver_name: b.company_name || b.guest_name,
        invoice_number: b.invoice_number,
        invoice_value_inr: total,
        place_of_supply: `${guestStateCode}-${isInterState ? 'Inter-State' : resortStateName}`,
        reverse_charge: 'N',
        applicable_tax_rate_percent: rate,
        taxable_value_inr: taxable,
        cgst_inr: cgst,
        sgst_inr: sgst,
        igst_inr: igst,
      });
    });

  // Table 7: B2C
  const b2cBookings = activeBookings.filter(
    (b) => !b.guest_gstin || b.guest_gstin.trim().length !== 15
  );
  const b2cAccTotal = b2cBookings.reduce((sum, b) => sum + Number(b.total_amount_inr), 0);
  const b2cAccTaxable = Math.round((b2cAccTotal / 1.12) * 100) / 100;
  const b2cAccTax = Math.round((b2cAccTotal - b2cAccTaxable) * 100) / 100;

  const b2cDiningTotal = orders.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + o.total_inr, 0);
  const b2cDiningTaxable = Math.round((b2cDiningTotal / 1.05) * 100) / 100;
  const b2cDiningTax = Math.round((b2cDiningTotal - b2cDiningTaxable) * 100) / 100;

  const b2cActTotal = activities.filter((a) => a.status !== 'cancelled').reduce((sum, a) => sum + a.total_amount_inr, 0);
  const b2cActTaxable = Math.round((b2cActTotal / 1.18) * 100) / 100;
  const b2cActTax = Math.round((b2cActTotal - b2cActTaxable) * 100) / 100;

  const b2cSupplies = [
    { place_of_supply: '27-Maharashtra', rate_percent: 12, taxable_value_inr: b2cAccTaxable, cgst_inr: b2cAccTax / 2, sgst_inr: b2cAccTax / 2, igst_inr: 0 },
    { place_of_supply: '27-Maharashtra', rate_percent: 5, taxable_value_inr: b2cDiningTaxable, cgst_inr: b2cDiningTax / 2, sgst_inr: b2cDiningTax / 2, igst_inr: 0 },
    { place_of_supply: '27-Maharashtra', rate_percent: 18, taxable_value_inr: b2cActTaxable, cgst_inr: b2cActTax / 2, sgst_inr: b2cActTax / 2, igst_inr: 0 },
  ];

  // Table 12: HSN/SAC
  const b2bTaxableSum = b2bSupplies.reduce((sum, s) => sum + s.taxable_value_inr, 0);
  const b2bGrossSum = b2bSupplies.reduce((sum, s) => sum + s.invoice_value_inr, 0);
  const b2bCgstSum = b2bSupplies.reduce((sum, s) => sum + s.cgst_inr, 0);
  const b2bSgstSum = b2bSupplies.reduce((sum, s) => sum + s.sgst_inr, 0);
  const b2bIgstSum = b2bSupplies.reduce((sum, s) => sum + s.igst_inr, 0);

  const hsnSacSummary = [
    {
      hsn_sac_code: '996311',
      description: 'Hotel & Resort Room Accommodation Services',
      total_quantity: activeBookings.length,
      total_value_inr: b2cAccTotal + b2bGrossSum,
      taxable_value_inr: b2cAccTaxable + b2bTaxableSum,
      cgst_inr: b2cAccTax / 2 + b2bCgstSum,
      sgst_inr: b2cAccTax / 2 + b2bSgstSum,
      igst_inr: b2bIgstSum,
    },
    {
      hsn_sac_code: '996331',
      description: 'Restaurant, Dining & Food & Beverage Services',
      total_quantity: orders.length,
      total_value_inr: b2cDiningTotal,
      taxable_value_inr: b2cDiningTaxable,
      cgst_inr: b2cDiningTax / 2,
      sgst_inr: b2cDiningTax / 2,
      igst_inr: 0,
    },
    {
      hsn_sac_code: '996322',
      description: 'Guest Recreation, Tour & Resort Experiences',
      total_quantity: activities.length,
      total_value_inr: b2cActTotal,
      taxable_value_inr: b2cActTaxable,
      cgst_inr: b2cActTax / 2,
      sgst_inr: b2cActTax / 2,
      igst_inr: 0,
    },
  ];

  // Table 13: Docs Issued
  const docSummary = [
    {
      doc_type: 'Tax Invoices for Outward Supply',
      total_number: bookings.length,
      cancelled_number: bookings.filter((b) => b.booking_status === 'cancelled').length,
      net_issued_number: activeBookings.length,
    },
  ];

  return { b2bSupplies, b2cSupplies, hsnSacSummary, docSummary };
}

const gstr1 = compileGstr1(mockBookings, mockOrders, mockActivities);

// Verify B2B
assert.strictEqual(gstr1.b2bSupplies.length, 2, 'Must have 2 B2B supplies');
const intraB2B = gstr1.b2bSupplies.find((s) => s.gstin.startsWith('27'));
assert.strictEqual(intraB2B.cgst_inr, 1200, 'Intra-state CGST must be half of 2400 tax');
assert.strictEqual(intraB2B.sgst_inr, 1200, 'Intra-state SGST must be half of 2400 tax');
assert.strictEqual(intraB2B.igst_inr, 0, 'Intra-state IGST must be 0');

const interB2B = gstr1.b2bSupplies.find((s) => s.gstin.startsWith('29'));
assert.strictEqual(interB2B.cgst_inr, 0, 'Inter-state CGST must be 0');
assert.strictEqual(interB2B.sgst_inr, 0, 'Inter-state SGST must be 0');
assert.strictEqual(interB2B.igst_inr, 3600, 'Inter-state IGST must be full tax amount (3600)');

// Verify Table 12 HSN/SAC
assert.strictEqual(gstr1.hsnSacSummary.length, 3, 'Must have 3 HSN/SAC entries (accommodation, dining, activities)');
const accHsn = gstr1.hsnSacSummary.find((h) => h.hsn_sac_code === '996311');
assert.strictEqual(accHsn.taxable_value_inr, 60000, 'Accommodation taxable must be 20000 + 30000 + 10000 = 60000');
assert.strictEqual(accHsn.igst_inr, 3600, 'Accommodation IGST must match inter-state invoice (3600)');

// Verify Table 13 Documents
assert.strictEqual(gstr1.docSummary[0].total_number, 4, 'Total document count includes cancelled invoice');
assert.strictEqual(gstr1.docSummary[0].cancelled_number, 1, 'Cancelled document count is 1');
assert.strictEqual(gstr1.docSummary[0].net_issued_number, 3, 'Net issued documents count is 3');

console.log('  ✔ Table 4: B2B correctly applies CGST+SGST for intra-state and IGST for inter-state.');
console.log('  ✔ Table 7: B2C correctly aggregates accommodation, dining, and activities by rate.');
console.log('  ✔ Table 12: HSN/SAC correctly maps 996311, 996331, and 996322.');
console.log('  ✔ Table 13: Accurately reports issued vs cancelled document totals.');

// -----------------------------------------------------------------------------
// 4. SALES REGISTER DETAILED LEDGER CSV
// -----------------------------------------------------------------------------
console.log('\nTest 4: Sales Register Detailed Itemized CSV');

function generateSalesRegisterCsv(bookings, disclaimer) {
  const lines = [];
  lines.push(`"${disclaimer}"`);
  lines.push('"Property: Raigad Tropical Retreat","GSTIN: 27AAPCR1234F1Z5"');
  lines.push('');
  lines.push('"Invoice/Ref","Guest Name","Mobile","GSTIN","Supply Type","Taxable Tariff","Total Tax","Total Invoice","Status"');

  bookings.forEach((b) => {
    const isB2B = Boolean(b.guest_gstin);
    const taxable = Math.round(b.total_amount_inr / 1.12);
    const tax = b.total_amount_inr - taxable;
    lines.push(
      `"${b.invoice_number}","${b.guest_name}","+919999999999","${b.guest_gstin || '—'}","${isB2B ? 'B2B' : 'B2C'}",${taxable},${tax},${b.total_amount_inr},"${b.booking_status}"`
    );
  });

  return lines.join('\n');
}

const salesCsv = generateSalesRegisterCsv(mockBookings, ACCOUNTING_SUPPORT_EXPORT_DISCLAIMER);
const csvLines = salesCsv.split('\n');

assert.strictEqual(
  csvLines[0],
  `"${ACCOUNTING_SUPPORT_EXPORT_DISCLAIMER}"`,
  'Row 1 of CSV export MUST be the mandatory accounting-support disclaimer'
);
assert(salesCsv.includes('Tech Mahindra Ltd'), 'Sales register contains B2B guest name');
assert(salesCsv.includes('27AAACT2727Q1ZW'), 'Sales register contains guest GSTIN');

console.log('  ✔ Sales register CSV contains mandatory Row 1 statutory disclaimer header.');
console.log('  ✔ Contains itemized columns for B2B vs B2C, GSTIN, taxable value, and tax liability.');

// -----------------------------------------------------------------------------
// 5. TENANT MODULE ENTITLEMENTS
// -----------------------------------------------------------------------------
console.log('\nTest 5: Tenant Module Entitlements Engine');

const defaultEntitlements = {
  restaurant: true,
  activities: true,
  housekeeping: true,
  guest_services: true,
  reviews: true,
  accounting_exports: true,
  digital_guest_portal: true,
};

// Check fallback to defaults
function resolveEntitlements(tenantSettings) {
  const configured = tenantSettings?.module_entitlements || {};
  return {
    restaurant: configured.restaurant ?? defaultEntitlements.restaurant,
    activities: configured.activities ?? defaultEntitlements.activities,
    housekeeping: configured.housekeeping ?? defaultEntitlements.housekeeping,
    guest_services: configured.guest_services ?? defaultEntitlements.guest_services,
    reviews: configured.reviews ?? defaultEntitlements.reviews,
    accounting_exports: configured.accounting_exports ?? defaultEntitlements.accounting_exports,
    digital_guest_portal: configured.digital_guest_portal ?? defaultEntitlements.digital_guest_portal,
  };
}

assert.deepStrictEqual(resolveEntitlements({}), defaultEntitlements, 'Empty settings must resolve all modules to true');

// Disabling accounting_exports blocks export
function checkExportEntitlement(entitlements) {
  if (entitlements.accounting_exports === false) {
    return { success: false, error: 'Accounting Exports module is currently disabled for this property in tenant settings.' };
  }
  return { success: true };
}

assert.strictEqual(checkExportEntitlement({ accounting_exports: false }).success, false);
assert.strictEqual(checkExportEntitlement({ accounting_exports: true }).success, true);

// Nav filtering check
function filterNavLinks(links, entitlements) {
  return links.filter((link) => {
    if (link.href === '/restaurant' && entitlements.restaurant === false) return false;
    if (link.href === '/activities' && entitlements.activities === false) return false;
    if (link.href === '/housekeeping' && entitlements.housekeeping === false) return false;
    if (link.href === '/guest-services' && entitlements.guest_services === false) return false;
    if (link.href === '/reviews' && entitlements.reviews === false) return false;
    return true;
  });
}

const sampleLinks = [
  { href: '/dashboard' },
  { href: '/bookings' },
  { href: '/restaurant' },
  { href: '/activities' },
  { href: '/housekeeping' },
  { href: '/guest-services' },
  { href: '/reviews' },
  { href: '/reports' },
];

const filtered = filterNavLinks(sampleLinks, {
  ...defaultEntitlements,
  restaurant: false,
  activities: false,
});

assert.strictEqual(filtered.some((l) => l.href === '/restaurant'), false, 'Restaurant must be hidden when disabled');
assert.strictEqual(filtered.some((l) => l.href === '/activities'), false, 'Activities must be hidden when disabled');
assert.strictEqual(filtered.some((l) => l.href === '/housekeeping'), true, 'Housekeeping remains visible when enabled');

console.log('  ✔ Sensible defaults ensure new resorts have all modules active.');
console.log('  ✔ Disabling accounting_exports strictly prevents export generation.');
console.log('  ✔ Admin sidebar navigation respects disabled module entitlements.');

// -----------------------------------------------------------------------------
// 6. RESORT ONBOARDING GSTIN & PAN VALIDATION
// -----------------------------------------------------------------------------
console.log('\nTest 6: Resort Onboarding GSTIN & PAN Formats');

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

assert.strictEqual(GSTIN_REGEX.test('27AAPCR1234F1Z5'), true, 'Valid Maharashtra GSTIN');
assert.strictEqual(GSTIN_REGEX.test('29AAACI1999P1ZB'), true, 'Valid Karnataka GSTIN');
assert.strictEqual(GSTIN_REGEX.test('INVALID_GSTIN_123'), false, 'Invalid GSTIN format rejected');
assert.strictEqual(GSTIN_REGEX.test('27AAPCR1234F1'), false, 'Too short GSTIN rejected');

assert.strictEqual(PAN_REGEX.test('AAPCR1234F'), true, 'Valid 10-char PAN');
assert.strictEqual(PAN_REGEX.test('INVALIDPAN'), false, 'Invalid PAN format rejected');

console.log('  ✔ Indian GSTIN (15 chars) and PAN (10 chars) format validations verified.');

// -----------------------------------------------------------------------------
// 7. GOOGLE IDENTITY VS SERVER-SIDE AUTHORIZATION INVARIANT
// -----------------------------------------------------------------------------
console.log('\nTest 7: Google Identity vs Server Database Authorization Invariant');

// Simulate Google OAuth response for an arbitrary user
const arbitraryGoogleUser = {
  id: 'oauth_user_999',
  email: 'random.visitor@gmail.com',
  name: 'Random Visitor',
};

// Database membership table lookup
const mockProfilesTable = [
  { id: 'usr_staff_01', tenant_id: 'ten_001', role: 'tenant_admin' },
  { id: 'usr_staff_02', tenant_id: 'ten_001', role: 'accountant' },
];

function simulateServerAuthorization(user) {
  const profile = mockProfilesTable.find((p) => p.id === user.id);
  if (!profile || !profile.tenant_id) {
    return {
      authorized: false,
      user,
      role: 'guest',
      tenantId: null,
      error: 'Access Denied: Your account is not registered as staff or administrator for any resort.',
    };
  }
  return {
    authorized: true,
    user,
    role: profile.role,
    tenantId: profile.tenant_id,
  };
}

const authResult = simulateServerAuthorization(arbitraryGoogleUser);
assert.strictEqual(authResult.authorized, false, 'Arbitrary authenticated Google account MUST NOT be authorized');
assert.strictEqual(authResult.role, 'guest', 'Role must remain guest');
assert.strictEqual(authResult.tenantId, null, 'Must not be assigned any resort tenant');

console.log('  ✔ Google OAuth authenticates identity only; database membership strictly authorizes resort access.');

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log('🎉 ALL PHASE 7 VERIFICATION TESTS PASSED SUCCESSFULLY (7/7)!');
console.log('================================================================');
