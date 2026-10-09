'use server';

import { revalidatePath } from 'next/cache';
import { getAuthenticatedAdminContext } from '@/lib/auth/admin-guard';
import { createAdminClient } from '@/lib/supabase';
import {
  Booking,
  RestaurantOrder,
  ActivityBooking,
  IncidentalCharge,
  ModuleEntitlements,
  UserRole,
  Gstr1AccountingSupportExport,
  Gstr1B2BInvoiceEntry,
  Gstr1B2CSmallEntry,
  Gstr1HsnSacEntry,
  Gstr1DocIssuedEntry,
  SalesRegisterEntry,
  SalesRegisterExport,
} from '@/types';
import { DEFAULT_TAX_SCHEDULES, getActiveTaxSchedule } from '@/lib/tax-engine';
import {
  ACCOUNTING_SUPPORT_EXPORT_DISCLAIMER,
  DEFAULT_MODULE_ENTITLEMENTS,
} from '@/lib/constants';

/**
 * Roles authorized to generate financial and tax exports
 */
const AUTHORIZED_EXPORT_ROLES: UserRole[] = [
  'superadmin',
  'tenant_admin',
  'resort_manager',
  'accountant',
];

/**
 * Validates whether the caller has sufficient role permissions to export financial data
 */
function isRoleAuthorizedForExports(role: UserRole): boolean {
  return AUTHORIZED_EXPORT_ROLES.includes(role);
}

/**
 * 1. GET TENANT MODULE ENTITLEMENTS
 * Retrieves the module flags (restaurant, housekeeping, etc.) for a resort.
 */
export async function getTenantModuleEntitlements(
  tenantId: string
): Promise<{ success: boolean; entitlements: ModuleEntitlements; error?: string }> {
  try {
    if (!tenantId) {
      return { success: false, entitlements: DEFAULT_MODULE_ENTITLEMENTS, error: 'Missing tenant ID.' };
    }

    const adminDb = createAdminClient();
    const { data: tenant, error: fetchErr } = await adminDb
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .maybeSingle();

    if (fetchErr || !tenant) {
      return {
        success: false,
        entitlements: DEFAULT_MODULE_ENTITLEMENTS,
        error: fetchErr?.message || 'Tenant not found.',
      };
    }

    const settings = (tenant.settings as Record<string, unknown>) || {};
    const configuredEntitlements = (settings.module_entitlements as Partial<ModuleEntitlements>) || {};

    const entitlements: ModuleEntitlements = {
      restaurant: configuredEntitlements.restaurant ?? DEFAULT_MODULE_ENTITLEMENTS.restaurant,
      activities: configuredEntitlements.activities ?? DEFAULT_MODULE_ENTITLEMENTS.activities,
      housekeeping: configuredEntitlements.housekeeping ?? DEFAULT_MODULE_ENTITLEMENTS.housekeeping,
      guest_services: configuredEntitlements.guest_services ?? DEFAULT_MODULE_ENTITLEMENTS.guest_services,
      reviews: configuredEntitlements.reviews ?? DEFAULT_MODULE_ENTITLEMENTS.reviews,
      accounting_exports: configuredEntitlements.accounting_exports ?? DEFAULT_MODULE_ENTITLEMENTS.accounting_exports,
      digital_guest_portal: configuredEntitlements.digital_guest_portal ?? DEFAULT_MODULE_ENTITLEMENTS.digital_guest_portal,
    };

    return { success: true, entitlements };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error retrieving module entitlements.';
    return { success: false, entitlements: DEFAULT_MODULE_ENTITLEMENTS, error: message };
  }
}

/**
 * 2. UPDATE TENANT MODULE ENTITLEMENTS
 * Toggles feature modules (accounting exports, restaurant POS, housekeeping desk, etc.)
 * Strictly limited to superadmin and tenant_admin roles.
 */
export async function updateTenantModuleEntitlements(
  tenantId: string,
  updatedEntitlements: Partial<ModuleEntitlements>
): Promise<{ success: boolean; message?: string; error?: string; entitlements?: ModuleEntitlements }> {
  try {
    const auth = await getAuthenticatedAdminContext();

    if (!auth.authorized || !auth.user) {
      return { success: false, error: 'Unauthorized: Authentication required.' };
    }

    // Role Guard: Only superadmin or tenant_admin can update module entitlements
    if (auth.role !== 'superadmin' && auth.role !== 'tenant_admin') {
      return {
        success: false,
        error: `Forbidden: Only resort administrators can configure module entitlements. Current role: ${auth.role}`,
      };
    }

    // Multi-tenant Tenant Guard
    if (auth.role !== 'superadmin' && auth.tenantId !== tenantId) {
      return { success: false, error: 'Forbidden: Cannot configure another resort.' };
    }

    const adminDb = createAdminClient();
    const { data: tenant, error: fetchErr } = await adminDb
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    if (fetchErr || !tenant) {
      return { success: false, error: 'Resort record not found.' };
    }

    const existingSettings = (tenant.settings as Record<string, unknown>) || {};
    const existingEntitlements = (existingSettings.module_entitlements as Partial<ModuleEntitlements>) || {};

    const newEntitlements: ModuleEntitlements = {
      restaurant: updatedEntitlements.restaurant ?? existingEntitlements.restaurant ?? DEFAULT_MODULE_ENTITLEMENTS.restaurant,
      activities: updatedEntitlements.activities ?? existingEntitlements.activities ?? DEFAULT_MODULE_ENTITLEMENTS.activities,
      housekeeping: updatedEntitlements.housekeeping ?? existingEntitlements.housekeeping ?? DEFAULT_MODULE_ENTITLEMENTS.housekeeping,
      guest_services: updatedEntitlements.guest_services ?? existingEntitlements.guest_services ?? DEFAULT_MODULE_ENTITLEMENTS.guest_services,
      reviews: updatedEntitlements.reviews ?? existingEntitlements.reviews ?? DEFAULT_MODULE_ENTITLEMENTS.reviews,
      accounting_exports: updatedEntitlements.accounting_exports ?? existingEntitlements.accounting_exports ?? DEFAULT_MODULE_ENTITLEMENTS.accounting_exports,
      digital_guest_portal: updatedEntitlements.digital_guest_portal ?? existingEntitlements.digital_guest_portal ?? DEFAULT_MODULE_ENTITLEMENTS.digital_guest_portal,
    };

    const newSettings = {
      ...existingSettings,
      module_entitlements: newEntitlements,
      updated_at: new Date().toISOString(),
    };

    const { error: updateErr } = await adminDb
      .from('tenants')
      .update({ settings: newSettings, updated_at: new Date().toISOString() })
      .eq('id', tenantId);

    if (updateErr) {
      throw updateErr;
    }

    revalidatePath('/dashboard');
    revalidatePath('/reports');
    revalidatePath('/settings');

    return {
      success: true,
      message: 'Module entitlements updated successfully.',
      entitlements: newEntitlements,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error updating module entitlements.';
    return { success: false, error: message };
  }
}

/**
 * 3. AUTHORITATIVE GSTR-1 ACCOUNTING-SUPPORT EXPORT
 * Compiles B2B (Table 4), B2C (Table 7), HSN/SAC Summary (Table 12), and Documents Summary (Table 13)
 * strictly formatted for Chartered Accountant review and working papers.
 */
export async function exportGstr1AccountingSupportData(
  tenantId: string,
  startDate?: string,
  endDate?: string
): Promise<{
  success: boolean;
  error?: string;
  data?: Gstr1AccountingSupportExport;
  csv?: string;
}> {
  try {
    const auth = await getAuthenticatedAdminContext();

    if (!auth.authorized || !auth.user) {
      return { success: false, error: 'Unauthorized: Session required to export tax data.' };
    }

    // Role check invariant: ONLY superadmin, tenant_admin, resort_manager, and accountant
    if (!isRoleAuthorizedForExports(auth.role)) {
      return {
        success: false,
        error: `Forbidden: Insufficient role permissions for tax exports. Your role (${auth.role}) does not have accounting export clearance. Only administrators and accountants can export GSTR-1 working papers.`,
      };
    }

    // Multi-tenant barrier
    if (auth.role !== 'superadmin' && auth.tenantId !== tenantId) {
      return { success: false, error: 'Forbidden: Access to specified resort tenant denied.' };
    }

    const adminDb = createAdminClient();

    // Fetch tenant details and settings
    const { data: tenantData, error: tenantErr } = await adminDb
      .from('tenants')
      .select('name, settings')
      .eq('id', tenantId)
      .maybeSingle();

    if (tenantErr || !tenantData) {
      return { success: false, error: 'Resort record not found.' };
    }

    const settings = (tenantData.settings as Record<string, unknown>) || {};
    const moduleEntitlements = (settings.module_entitlements as Partial<ModuleEntitlements>) || {};

    // Entitlement Check: accounting_exports must not be explicitly disabled
    if (moduleEntitlements.accounting_exports === false) {
      return {
        success: false,
        error: 'Accounting Exports module is currently disabled for this property in tenant settings.',
      };
    }

    const resortLegalName = (settings.legal_name as string) || tenantData.name || 'Resort Property';
    const resortGstin = (settings.gstin as string) || 'UNREGISTERED';
    const resortStateCode = (settings.state_code as string) || '27'; // Default Maharashtra (27)
    const resortStateName = (settings.state_name as string) || 'Maharashtra';

    // Date range bounds
    const defaultStart = new Date();
    defaultStart.setDate(defaultStart.getDate() - 90);
    const filterStart = startDate ? new Date(startDate).toISOString() : defaultStart.toISOString();
    const filterEnd = endDate ? new Date(endDate).toISOString() : new Date().toISOString();

    // 1. Fetch Bookings
    const bookingsQuery = adminDb
      .from('bookings')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('created_at', filterStart)
      .lte('created_at', filterEnd);

    const { data: rawBookings, error: bError } = await bookingsQuery;
    if (bError) throw bError;
    const bookings = (rawBookings as unknown as Booking[]) || [];

    // 2. Fetch Restaurant Orders
    const { data: rawOrders } = await adminDb
      .from('restaurant_orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('created_at', filterStart)
      .lte('created_at', filterEnd);
    const orders = (rawOrders as unknown as RestaurantOrder[]) || [];

    // 3. Fetch Activity Bookings
    const { data: rawActivities } = await adminDb
      .from('activity_bookings')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('created_at', filterStart)
      .lte('created_at', filterEnd);
    const activities = (rawActivities as unknown as ActivityBooking[]) || [];

    // Tax Schedules
    const customSchedules = Array.isArray(settings.tax_schedules) && settings.tax_schedules.length > 0
      ? settings.tax_schedules
      : DEFAULT_TAX_SCHEDULES;

    const accSchedule = getActiveTaxSchedule('accommodation', filterStart, customSchedules);
    const fnbSchedule = getActiveTaxSchedule('restaurant', filterStart, customSchedules);
    const actSchedule = getActiveTaxSchedule('activities', filterStart, customSchedules);

    // Filter out cancelled bookings
    const activeBookings = bookings.filter((b) => b.booking_status !== 'cancelled');

    // =========================================================================
    // TABLE 4: B2B SUPPLIES (Supplies to registered persons with GSTIN)
    // =========================================================================
    const b2bSupplies: Gstr1B2BInvoiceEntry[] = [];

    activeBookings
      .filter((b) => b.guest_gstin && b.guest_gstin.trim().length === 15)
      .forEach((b) => {
        const total = Number(b.total_amount_inr || 0);
        const rate = accSchedule.rate_percent || 12;
        // In inclusive pricing: Taxable = Gross / (1 + Rate / 100)
        const taxable = Math.round((total / (1 + rate / 100)) * 100) / 100;
        const totalTax = Math.round((total - taxable) * 100) / 100;

        // Intra-state vs Inter-state determination (First 2 digits of GSTIN)
        const guestStateCode = b.guest_gstin!.substring(0, 2);
        const isInterState = guestStateCode !== resortStateCode;

        const cgst = isInterState ? 0 : Math.round((totalTax / 2) * 100) / 100;
        const sgst = isInterState ? 0 : Math.round((totalTax / 2) * 100) / 100;
        const igst = isInterState ? totalTax : 0;

        const invoiceNo = b.invoice_number || `INV-${b.id.slice(0, 8).toUpperCase()}`;
        const invoiceDate = (b.actual_check_out_at || b.created_at || '').slice(0, 10);

        b2bSupplies.push({
          gstin: b.guest_gstin!.trim().toUpperCase(),
          receiver_name: b.company_name || b.guest_name || 'B2B Corporate Client',
          invoice_number: invoiceNo,
          invoice_date: invoiceDate,
          invoice_value_inr: total,
          place_of_supply: `${guestStateCode}-${isInterState ? 'Inter-State' : resortStateName}`,
          reverse_charge: 'N',
          applicable_tax_rate_percent: rate,
          taxable_value_inr: taxable,
          cess_amount_inr: 0,
          cgst_inr: cgst,
          sgst_inr: sgst,
          igst_inr: igst,
        });
      });

    // =========================================================================
    // TABLE 7: B2C (SMALL) SUPPLIES (Unregistered consumers)
    // =========================================================================
    const b2cBookings = activeBookings.filter(
      (b) => !b.guest_gstin || b.guest_gstin.trim().length !== 15
    );

    // Aggregate B2C accommodation
    const b2cAccTotal = b2cBookings.reduce((sum, b) => sum + Number(b.total_amount_inr || 0), 0);
    const b2cAccRate = accSchedule.rate_percent || 12;
    const b2cAccTaxable = Math.round((b2cAccTotal / (1 + b2cAccRate / 100)) * 100) / 100;
    const b2cAccTax = Math.round((b2cAccTotal - b2cAccTaxable) * 100) / 100;

    // Aggregate B2C direct dining
    const directOrders = orders.filter((o) => o.status !== 'CANCELLED' && !o.charged_to_folio);
    const b2cDiningTotal = directOrders.reduce((sum, o) => sum + Number(o.total_inr || 0), 0);
    const b2cDiningRate = fnbSchedule.rate_percent || 5;
    const b2cDiningTaxable = Math.round((b2cDiningTotal / (1 + b2cDiningRate / 100)) * 100) / 100;
    const b2cDiningTax = Math.round((b2cDiningTotal - b2cDiningTaxable) * 100) / 100;

    // Aggregate B2C direct activities
    const directActivities = activities.filter((a) => a.status !== 'cancelled' && !a.charged_to_folio);
    const b2cActivitiesTotal = directActivities.reduce((sum, a) => sum + Number(a.total_amount_inr || 0), 0);
    const b2cActivitiesRate = actSchedule.rate_percent || 18;
    const b2cActivitiesTaxable = Math.round((b2cActivitiesTotal / (1 + b2cActivitiesRate / 100)) * 100) / 100;
    const b2cActivitiesTax = Math.round((b2cActivitiesTotal - b2cActivitiesTaxable) * 100) / 100;

    const b2cSupplies: Gstr1B2CSmallEntry[] = [];

    if (b2cAccTotal > 0) {
      b2cSupplies.push({
        place_of_supply: `${resortStateCode}-${resortStateName}`,
        rate_percent: b2cAccRate,
        taxable_value_inr: b2cAccTaxable,
        cess_amount_inr: 0,
        cgst_inr: Math.round((b2cAccTax / 2) * 100) / 100,
        sgst_inr: Math.round((b2cAccTax / 2) * 100) / 100,
        igst_inr: 0,
        type: 'OE',
      });
    }

    if (b2cDiningTotal > 0) {
      b2cSupplies.push({
        place_of_supply: `${resortStateCode}-${resortStateName}`,
        rate_percent: b2cDiningRate,
        taxable_value_inr: b2cDiningTaxable,
        cess_amount_inr: 0,
        cgst_inr: Math.round((b2cDiningTax / 2) * 100) / 100,
        sgst_inr: Math.round((b2cDiningTax / 2) * 100) / 100,
        igst_inr: 0,
        type: 'OE',
      });
    }

    if (b2cActivitiesTotal > 0) {
      b2cSupplies.push({
        place_of_supply: `${resortStateCode}-${resortStateName}`,
        rate_percent: b2cActivitiesRate,
        taxable_value_inr: b2cActivitiesTaxable,
        cess_amount_inr: 0,
        cgst_inr: Math.round((b2cActivitiesTax / 2) * 100) / 100,
        sgst_inr: Math.round((b2cActivitiesTax / 2) * 100) / 100,
        igst_inr: 0,
        type: 'OE',
      });
    }

    // =========================================================================
    // TABLE 12: HSN/SAC SUMMARY
    // =========================================================================
    const b2bTaxableSum = b2bSupplies.reduce((sum, s) => sum + s.taxable_value_inr, 0);
    const b2bGrossSum = b2bSupplies.reduce((sum, s) => sum + s.invoice_value_inr, 0);
    const b2bCgstSum = b2bSupplies.reduce((sum, s) => sum + s.cgst_inr, 0);
    const b2bSgstSum = b2bSupplies.reduce((sum, s) => sum + s.sgst_inr, 0);
    const b2bIgstSum = b2bSupplies.reduce((sum, s) => sum + s.igst_inr, 0);

    const totalAccTaxable = b2cAccTaxable + b2bTaxableSum;
    const totalAccGross = b2cAccTotal + b2bGrossSum;
    const totalAccCgst = Math.round((b2cAccTax / 2) * 100) / 100 + b2bCgstSum;
    const totalAccSgst = Math.round((b2cAccTax / 2) * 100) / 100 + b2bSgstSum;
    const totalAccIgst = b2bIgstSum;

    const hsnSacSummary: Gstr1HsnSacEntry[] = [
      {
        hsn_sac_code: accSchedule.sac_code || '996311',
        description: 'Hotel & Resort Room Accommodation Services',
        uqc: 'UNT',
        total_quantity: activeBookings.length,
        total_value_inr: totalAccGross,
        taxable_value_inr: totalAccTaxable,
        cgst_inr: totalAccCgst,
        sgst_inr: totalAccSgst,
        igst_inr: totalAccIgst,
        cess_inr: 0,
      },
    ];

    if (b2cDiningTotal > 0) {
      hsnSacSummary.push({
        hsn_sac_code: fnbSchedule.sac_code || '996331',
        description: 'Restaurant, Dining & Food & Beverage Services',
        uqc: 'NOS',
        total_quantity: directOrders.length,
        total_value_inr: b2cDiningTotal,
        taxable_value_inr: b2cDiningTaxable,
        cgst_inr: Math.round((b2cDiningTax / 2) * 100) / 100,
        sgst_inr: Math.round((b2cDiningTax / 2) * 100) / 100,
        igst_inr: 0,
        cess_inr: 0,
      });
    }

    if (b2cActivitiesTotal > 0) {
      hsnSacSummary.push({
        hsn_sac_code: actSchedule.sac_code || '996322',
        description: 'Guest Recreation, Tour & Resort Experiences',
        uqc: 'NOS',
        total_quantity: directActivities.length,
        total_value_inr: b2cActivitiesTotal,
        taxable_value_inr: b2cActivitiesTaxable,
        cgst_inr: Math.round((b2cActivitiesTax / 2) * 100) / 100,
        sgst_inr: Math.round((b2cActivitiesTax / 2) * 100) / 100,
        igst_inr: 0,
        cess_inr: 0,
      });
    }

    // =========================================================================
    // TABLE 13: DOCUMENTS ISSUED SUMMARY
    // =========================================================================
    const totalInvoices = bookings.length;
    const cancelledCount = bookings.filter((b) => b.booking_status === 'cancelled').length;
    const netIssued = totalInvoices - cancelledCount;

    const firstSerial = bookings[bookings.length - 1]?.invoice_number || `INV-${bookings[bookings.length - 1]?.id.slice(0, 6).toUpperCase() || '001'}`;
    const lastSerial = bookings[0]?.invoice_number || `INV-${bookings[0]?.id.slice(0, 6).toUpperCase() || '999'}`;

    const docSummary: Gstr1DocIssuedEntry[] = [
      {
        doc_type: 'Tax Invoices for Outward Supply',
        from_serial: firstSerial,
        to_serial: lastSerial,
        total_number: totalInvoices,
        cancelled_number: cancelledCount,
        net_issued_number: netIssued,
      },
    ];

    // =========================================================================
    // SUMMARY TOTALS
    // =========================================================================
    const totalTaxable = hsnSacSummary.reduce((sum, h) => sum + h.taxable_value_inr, 0);
    const totalCgst = hsnSacSummary.reduce((sum, h) => sum + h.cgst_inr, 0);
    const totalSgst = hsnSacSummary.reduce((sum, h) => sum + h.sgst_inr, 0);
    const totalIgst = hsnSacSummary.reduce((sum, h) => sum + h.igst_inr, 0);
    const totalTaxLiability = totalCgst + totalSgst + totalIgst;
    const grossTurnover = hsnSacSummary.reduce((sum, h) => sum + h.total_value_inr, 0);

    const exportData: Gstr1AccountingSupportExport = {
      export_disclaimer: ACCOUNTING_SUPPORT_EXPORT_DISCLAIMER,
      tenant_id: tenantId,
      resort_legal_name: resortLegalName,
      resort_gstin: resortGstin,
      resort_state_code: resortStateCode,
      period_start: filterStart.slice(0, 10),
      period_end: filterEnd.slice(0, 10),
      generated_at: new Date().toISOString(),
      generated_by_role: auth.role,
      b2b_supplies: b2bSupplies,
      b2c_supplies: b2cSupplies,
      hsn_sac_summary: hsnSacSummary,
      doc_summary: docSummary,
      summary_totals: {
        total_invoices: netIssued,
        total_taxable_value_inr: Math.round(totalTaxable * 100) / 100,
        total_cgst_inr: Math.round(totalCgst * 100) / 100,
        total_sgst_inr: Math.round(totalSgst * 100) / 100,
        total_igst_inr: Math.round(totalIgst * 100) / 100,
        total_cess_inr: 0,
        total_tax_liability_inr: Math.round(totalTaxLiability * 100) / 100,
        gross_turnover_inr: Math.round(grossTurnover * 100) / 100,
      },
    };

    // =========================================================================
    // GENERATE ACCOUNTING SUPPORT CSV (With prominent disclaimer header)
    // =========================================================================
    const csvLines: string[] = [];
    csvLines.push(`"${ACCOUNTING_SUPPORT_EXPORT_DISCLAIMER}"`);
    csvLines.push(`"Property: ${resortLegalName}","GSTIN: ${resortGstin}","State Code: ${resortStateCode}","Period: ${exportData.period_start} to ${exportData.period_end}","Generated: ${exportData.generated_at}"`);
    csvLines.push('');

    // Table 4
    csvLines.push('"--- GSTR-1 TABLE 4: B2B TAXABLE SUPPLIES (REGISTERED PERSONS) ---"');
    csvLines.push('"GSTIN of Recipient","Receiver Name","Invoice Number","Invoice Date","Invoice Value (INR)","Place Of Supply","Reverse Charge","Tax Rate (%)","Taxable Value (INR)","Cess Amount","CGST (INR)","SGST (INR)","IGST (INR)"');
    b2bSupplies.forEach((s) => {
      csvLines.push(
        `"${s.gstin}","${s.receiver_name.replace(/"/g, '""')}","${s.invoice_number}","${s.invoice_date}",${s.invoice_value_inr},"${s.place_of_supply}","${s.reverse_charge}",${s.applicable_tax_rate_percent},${s.taxable_value_inr},${s.cess_amount_inr},${s.cgst_inr},${s.sgst_inr},${s.igst_inr}`
      );
    });
    csvLines.push('');

    // Table 7
    csvLines.push('"--- GSTR-1 TABLE 7: B2C (SMALL) TAXABLE SUPPLIES (UNREGISTERED) ---"');
    csvLines.push('"Place Of Supply","Tax Rate (%)","Taxable Value (INR)","Cess Amount","CGST (INR)","SGST (INR)","IGST (INR)","Supply Type"');
    b2cSupplies.forEach((s) => {
      csvLines.push(
        `"${s.place_of_supply}",${s.rate_percent},${s.taxable_value_inr},${s.cess_amount_inr},${s.cgst_inr},${s.sgst_inr},${s.igst_inr},"${s.type}"`
      );
    });
    csvLines.push('');

    // Table 12
    csvLines.push('"--- GSTR-1 TABLE 12: HSN/SAC SUMMARY OF OUTWARD SUPPLIES ---"');
    csvLines.push('"HSN/SAC Code","Description","UQC","Total Quantity","Total Value (INR)","Taxable Value (INR)","CGST (INR)","SGST (INR)","IGST (INR)","Cess Amount"');
    hsnSacSummary.forEach((s) => {
      csvLines.push(
        `"${s.hsn_sac_code}","${s.description}","${s.uqc}",${s.total_quantity},${s.total_value_inr},${s.taxable_value_inr},${s.cgst_inr},${s.sgst_inr},${s.igst_inr},${s.cess_inr}`
      );
    });
    csvLines.push('');

    // Table 13
    csvLines.push('"--- GSTR-1 TABLE 13: DOCUMENTS ISSUED SUMMARY ---"');
    csvLines.push('"Nature of Document","From Serial No","To Serial No","Total Number","Cancelled","Net Issued"');
    docSummary.forEach((s) => {
      csvLines.push(
        `"${s.doc_type}","${s.from_serial}","${s.to_serial}",${s.total_number},${s.cancelled_number},${s.net_issued_number}`
      );
    });
    csvLines.push('');

    // Grand Totals
    csvLines.push('"--- SUMMARY TOTALS ---"');
    csvLines.push(`"Gross Turnover (INR)",${exportData.summary_totals.gross_turnover_inr}`);
    csvLines.push(`"Total Taxable Value (INR)",${exportData.summary_totals.total_taxable_value_inr}`);
    csvLines.push(`"Total CGST (INR)",${exportData.summary_totals.total_cgst_inr}`);
    csvLines.push(`"Total SGST (INR)",${exportData.summary_totals.total_sgst_inr}`);
    csvLines.push(`"Total IGST (INR)",${exportData.summary_totals.total_igst_inr}`);
    csvLines.push(`"Total GST Liability (INR)",${exportData.summary_totals.total_tax_liability_inr}`);

    const csvOutput = csvLines.join('\n');

    return {
      success: true,
      data: exportData,
      csv: csvOutput,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error generating GSTR-1 accounting-support export.';
    return { success: false, error: message };
  }
}

/**
 * 4. DETAILED SALES REGISTER CSV EXPORT
 * Full line-item ledger of all bookings, incidentals, restaurant folios, and split settlements.
 */
export async function exportSalesRegisterCsv(
  tenantId: string,
  startDate?: string,
  endDate?: string
): Promise<{
  success: boolean;
  error?: string;
  csv?: string;
  exportData?: SalesRegisterExport;
}> {
  try {
    const auth = await getAuthenticatedAdminContext();

    if (!auth.authorized || !auth.user) {
      return { success: false, error: 'Unauthorized: Session required.' };
    }

    // Role check invariant: ONLY superadmin, tenant_admin, resort_manager, and accountant
    if (!isRoleAuthorizedForExports(auth.role)) {
      return {
        success: false,
        error: `Forbidden: Insufficient role permissions for sales register export. Role '${auth.role}' is not authorized.`,
      };
    }

    // Multi-tenant check
    if (auth.role !== 'superadmin' && auth.tenantId !== tenantId) {
      return { success: false, error: 'Forbidden: Access to specified resort tenant denied.' };
    }

    const adminDb = createAdminClient();

    const { data: tenantData } = await adminDb
      .from('tenants')
      .select('name, settings')
      .eq('id', tenantId)
      .maybeSingle();

    const settings = (tenantData?.settings as Record<string, unknown>) || {};
    const moduleEntitlements = (settings.module_entitlements as Partial<ModuleEntitlements>) || {};

    if (moduleEntitlements.accounting_exports === false) {
      return {
        success: false,
        error: 'Accounting Exports module is disabled for this property in tenant settings.',
      };
    }

    const resortLegalName = (settings.legal_name as string) || tenantData?.name || 'Resort Property';
    const resortGstin = (settings.gstin as string) || 'UNREGISTERED';
    const resortStateCode = (settings.state_code as string) || '27';
    const resortStateName = (settings.state_name as string) || 'Maharashtra';

    // Date range bounds
    const defaultStart = new Date();
    defaultStart.setDate(defaultStart.getDate() - 90);
    const filterStart = startDate ? new Date(startDate).toISOString() : defaultStart.toISOString();
    const filterEnd = endDate ? new Date(endDate).toISOString() : new Date().toISOString();

    // 1. Fetch bookings
    const { data: rawBookings, error: bError } = await adminDb
      .from('bookings')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('created_at', filterStart)
      .lte('created_at', filterEnd)
      .order('created_at', { ascending: false });

    if (bError) throw bError;
    const bookings = (rawBookings as unknown as Booking[]) || [];

    // 2. Fetch Incidentals
    const { data: rawIncidentals } = await adminDb
      .from('incidental_charges')
      .select('*')
      .eq('tenant_id', tenantId);
    const incidentals = (rawIncidentals as unknown as IncidentalCharge[]) || [];

    // Group incidentals by booking ID
    const incidentalsByBooking = new Map<string, IncidentalCharge[]>();
    incidentals.forEach((inc) => {
      const list = incidentalsByBooking.get(inc.booking_id) || [];
      list.push(inc);
      incidentalsByBooking.set(inc.booking_id, list);
    });

    const customSchedules = Array.isArray(settings.tax_schedules) && settings.tax_schedules.length > 0
      ? settings.tax_schedules
      : DEFAULT_TAX_SCHEDULES;

    const accSchedule = getActiveTaxSchedule('accommodation', filterStart, customSchedules);
    const accRate = accSchedule.rate_percent || 12;

    const entries: SalesRegisterEntry[] = [];

    bookings.forEach((b) => {
      const isB2B = Boolean(b.guest_gstin && b.guest_gstin.trim().length === 15);
      const isCancelled = b.booking_status === 'cancelled';
      const guestStateCode = isB2B ? b.guest_gstin!.substring(0, 2) : resortStateCode;
      const isInterState = guestStateCode !== resortStateCode;

      const totalGross = Number(b.total_amount_inr || 0);
      const mealCharge = Number(b.meal_plan_charge_inr || 0);

      // Incidental breakdowns
      const bIncidentals = incidentalsByBooking.get(b.id) || [];
      const diningSum = bIncidentals
        .filter((i) => i.category === 'restaurant' || i.category === 'room_service')
        .reduce((sum, i) => sum + Number(i.amount_inr || 0) * (i.quantity || 1), 0);
      const activitiesSum = bIncidentals
        .filter((i) => i.category === 'spa' || i.category === 'laundry')
        .reduce((sum, i) => sum + Number(i.amount_inr || 0) * (i.quantity || 1), 0);
      const otherSum = bIncidentals
        .filter((i) => !['restaurant', 'room_service', 'spa', 'laundry'].includes(i.category))
        .reduce((sum, i) => sum + Number(i.amount_inr || 0) * (i.quantity || 1), 0);

      // Taxable value
      const totalTaxable = Math.round((totalGross / (1 + accRate / 100)) * 100) / 100;
      const totalTax = Math.round((totalGross - totalTaxable) * 100) / 100;
      const cgst = isInterState ? 0 : Math.round((totalTax / 2) * 100) / 100;
      const sgst = isInterState ? 0 : Math.round((totalTax / 2) * 100) / 100;
      const igst = isInterState ? totalTax : 0;

      const paid = Number(b.paid_amount_inr || (b.payment_status === 'paid' ? totalGross : 0));
      const balance = Math.max(0, totalGross - paid);

      const invRef = b.invoice_number || `INV-${b.id.slice(0, 8).toUpperCase()}`;

      entries.push({
        booking_id: b.id,
        invoice_or_ref_number: invRef,
        booking_status: b.booking_status,
        booking_date: b.created_at.slice(0, 10),
        check_in_date: b.check_in_date,
        check_out_date: b.check_out_date,
        guest_name: b.guest_name,
        guest_mobile: b.guest_mobile_number,
        guest_gstin: b.guest_gstin || undefined,
        company_name: b.company_name || undefined,
        is_b2b: isB2B,
        place_of_supply: `${guestStateCode}-${isInterState ? 'Inter-State' : resortStateName}`,
        room_tariff_taxable_inr: Math.round((totalGross - mealCharge) / (1 + accRate / 100) * 100) / 100,
        meal_plan_taxable_inr: Math.round(mealCharge / (1 + accRate / 100) * 100) / 100,
        dining_taxable_inr: diningSum,
        activities_taxable_inr: activitiesSum,
        other_taxable_inr: otherSum,
        total_taxable_value_inr: isCancelled ? 0 : totalTaxable,
        cgst_inr: isCancelled ? 0 : cgst,
        sgst_inr: isCancelled ? 0 : sgst,
        igst_inr: isCancelled ? 0 : igst,
        total_tax_inr: isCancelled ? 0 : totalTax,
        total_invoice_value_inr: isCancelled ? 0 : totalGross,
        paid_amount_inr: isCancelled ? 0 : paid,
        balance_amount_inr: isCancelled ? 0 : balance,
        payment_status: b.payment_status,
        payment_method: b.razorpay_payment_id ? 'Razorpay/UPI' : 'Direct / Pay at Hotel',
      });
    });

    const activeEntries = entries.filter((e) => e.booking_status !== 'cancelled');
    const summaryTotals = {
      total_entries: activeEntries.length,
      total_room_tariff_inr: activeEntries.reduce((sum, e) => sum + e.room_tariff_taxable_inr, 0),
      total_dining_inr: activeEntries.reduce((sum, e) => sum + e.dining_taxable_inr, 0),
      total_activities_inr: activeEntries.reduce((sum, e) => sum + e.activities_taxable_inr, 0),
      total_taxable_value_inr: activeEntries.reduce((sum, e) => sum + e.total_taxable_value_inr, 0),
      total_cgst_inr: activeEntries.reduce((sum, e) => sum + e.cgst_inr, 0),
      total_sgst_inr: activeEntries.reduce((sum, e) => sum + e.sgst_inr, 0),
      total_igst_inr: activeEntries.reduce((sum, e) => sum + e.igst_inr, 0),
      total_tax_inr: activeEntries.reduce((sum, e) => sum + e.total_tax_inr, 0),
      total_gross_inr: activeEntries.reduce((sum, e) => sum + e.total_invoice_value_inr, 0),
      total_collected_inr: activeEntries.reduce((sum, e) => sum + e.paid_amount_inr, 0),
      total_pending_inr: activeEntries.reduce((sum, e) => sum + e.balance_amount_inr, 0),
    };

    const exportRecord: SalesRegisterExport = {
      export_disclaimer: ACCOUNTING_SUPPORT_EXPORT_DISCLAIMER,
      tenant_id: tenantId,
      resort_legal_name: resortLegalName,
      resort_gstin: resortGstin,
      period_start: filterStart.slice(0, 10),
      period_end: filterEnd.slice(0, 10),
      generated_at: new Date().toISOString(),
      generated_by_role: auth.role,
      entries,
      summary_totals: summaryTotals,
    };

    // CSV format
    const csvLines: string[] = [];
    csvLines.push(`"${ACCOUNTING_SUPPORT_EXPORT_DISCLAIMER}"`);
    csvLines.push(`"Property: ${resortLegalName}","GSTIN: ${resortGstin}","Period: ${exportRecord.period_start} to ${exportRecord.period_end}","Generated: ${exportRecord.generated_at}"`);
    csvLines.push('');
    csvLines.push(
      '"Invoice / Ref","Booking Date","Check-in","Check-out","Guest Name","Mobile","GSTIN","Supply Type","Company Name","Place Of Supply","Taxable Tariff (INR)","Dining (INR)","Activities (INR)","Total Taxable (INR)","CGST (INR)","SGST (INR)","IGST (INR)","Total Tax (INR)","Total Invoice (INR)","Paid (INR)","Balance Due (INR)","Payment Status","Payment Mode","Booking Status"'
    );

    entries.forEach((e) => {
      csvLines.push(
        `"${e.invoice_or_ref_number}","${e.booking_date}","${e.check_in_date}","${e.check_out_date}","${e.guest_name.replace(/"/g, '""')}","${e.guest_mobile}","${e.guest_gstin || '—'}","${e.is_b2b ? 'B2B' : 'B2C'}","${(e.company_name || '—').replace(/"/g, '""')}","${e.place_of_supply}",${e.room_tariff_taxable_inr},${e.dining_taxable_inr},${e.activities_taxable_inr},${e.total_taxable_value_inr},${e.cgst_inr},${e.sgst_inr},${e.igst_inr},${e.total_tax_inr},${e.total_invoice_value_inr},${e.paid_amount_inr},${e.balance_amount_inr},"${e.payment_status}","${e.payment_method}","${e.booking_status}"`
      );
    });

    csvLines.push('');
    csvLines.push(
      `"TOTAL ACTIVE ENTRIES: ${summaryTotals.total_entries}","","","","","","","","","",${Math.round(summaryTotals.total_room_tariff_inr)},${Math.round(summaryTotals.total_dining_inr)},${Math.round(summaryTotals.total_activities_inr)},${Math.round(summaryTotals.total_taxable_value_inr)},${Math.round(summaryTotals.total_cgst_inr)},${Math.round(summaryTotals.total_sgst_inr)},${Math.round(summaryTotals.total_igst_inr)},${Math.round(summaryTotals.total_tax_inr)},${Math.round(summaryTotals.total_gross_inr)},${Math.round(summaryTotals.total_collected_inr)},${Math.round(summaryTotals.total_pending_inr)},"","",""`
    );

    return {
      success: true,
      csv: csvLines.join('\n'),
      exportData: exportRecord,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error generating sales register export.';
    return { success: false, error: message };
  }
}
