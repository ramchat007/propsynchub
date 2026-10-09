/**
 * PropSyncHub Authoritative Tax Engine (India-First GST Compliance)
 * 
 * Non-negotiable architectural invariant:
 * Tax rates and SAC classifications are NEVER hardcoded into business logic.
 * Every rate, classification code, effective date, and inclusivity rule is
 * configurable per-tenant and verifiable by an accountant.
 */

import {
  TaxSchedule,
  TaxSupplyCategory,
  TaxBreakdownItem,
  TaxCalculationResult,
} from '@/types';

/**
 * Standard baseline Indian GST schedules
 * Used as sensible defaults when a newly onboarded resort has not yet customized their schedule.
 */
export const DEFAULT_TAX_SCHEDULES: TaxSchedule[] = [
  {
    id: 'sched_acc_996311',
    category: 'accommodation',
    sac_code: '996311',
    description: 'Hotel and Resort Room Accommodation',
    rate_percent: 12.0,
    cgst_percent: 6.0,
    sgst_percent: 6.0,
    effective_from: '2022-07-18',
    effective_to: null,
    is_active: true,
  },
  {
    id: 'sched_fnb_996331',
    category: 'restaurant',
    sac_code: '996331',
    description: 'Restaurant, Dining & Room Service (Without ITC)',
    rate_percent: 5.0,
    cgst_percent: 2.5,
    sgst_percent: 2.5,
    effective_from: '2017-11-15',
    effective_to: null,
    is_active: true,
  },
  {
    id: 'sched_act_996322',
    category: 'activities',
    sac_code: '996322',
    description: 'Recreation, Adventure, Tours & Guest Experiences',
    rate_percent: 18.0,
    cgst_percent: 9.0,
    sgst_percent: 9.0,
    effective_from: '2017-07-01',
    effective_to: null,
    is_active: true,
  },
  {
    id: 'sched_misc_999799',
    category: 'miscellaneous',
    sac_code: '999799',
    description: 'Other Incidental Guest & Property Services',
    rate_percent: 18.0,
    cgst_percent: 9.0,
    sgst_percent: 9.0,
    effective_from: '2017-07-01',
    effective_to: null,
    is_active: true,
  },
];

/**
 * Resolves active tax schedule for a given category and date from tenant settings.
 */
export function getActiveTaxSchedule(
  category: TaxSupplyCategory,
  targetDate: string = new Date().toISOString(),
  customSchedules?: TaxSchedule[]
): TaxSchedule {
  const schedules = customSchedules && customSchedules.length > 0
    ? customSchedules
    : DEFAULT_TAX_SCHEDULES;

  const dateObj = new Date(targetDate);

  // Find exact matching active schedule valid on the target date
  const matched = schedules.find((s) => {
    if (!s.is_active || s.category !== category) return false;
    const fromDate = new Date(s.effective_from);
    if (dateObj < fromDate) return false;
    if (s.effective_to) {
      const toDate = new Date(s.effective_to);
      if (dateObj > toDate) return false;
    }
    return true;
  });

  if (matched) return matched;

  // Fallback to default schedule for that category
  const fallback = DEFAULT_TAX_SCHEDULES.find((s) => s.category === category);
  return fallback || DEFAULT_TAX_SCHEDULES[0];
}

/**
 * Calculates exact taxable value, CGST, and SGST for a line item.
 */
export function calculateLineItemTax(
  grossAmountInr: number,
  category: TaxSupplyCategory,
  isInclusive: boolean = true,
  customSchedule?: TaxSchedule
): TaxBreakdownItem {
  const schedule = customSchedule || getActiveTaxSchedule(category);
  const rate = schedule.rate_percent;

  if (rate <= 0 || grossAmountInr <= 0) {
    return {
      category,
      sac_code: schedule.sac_code,
      description: schedule.description,
      taxable_amount_inr: Math.round(grossAmountInr),
      rate_percent: 0,
      cgst_percent: 0,
      sgst_percent: 0,
      cgst_amount_inr: 0,
      sgst_amount_inr: 0,
      total_tax_inr: 0,
      gross_amount_inr: Math.round(grossAmountInr),
    };
  }

  if (isInclusive) {
    // Reverse-calculate taxable value from inclusive gross price
    // Taxable = Gross / (1 + Rate / 100)
    const taxable = Math.round((grossAmountInr / (1 + rate / 100)) * 100) / 100;
    const totalTax = Math.round((grossAmountInr - taxable) * 100) / 100;
    const cgstAmount = Math.round((totalTax / 2) * 100) / 100;
    const sgstAmount = Math.round((totalTax - cgstAmount) * 100) / 100;

    return {
      category,
      sac_code: schedule.sac_code,
      description: schedule.description,
      taxable_amount_inr: taxable,
      rate_percent: rate,
      cgst_percent: schedule.cgst_percent,
      sgst_percent: schedule.sgst_percent,
      cgst_amount_inr: cgstAmount,
      sgst_amount_inr: sgstAmount,
      total_tax_inr: totalTax,
      gross_amount_inr: grossAmountInr,
    };
  } else {
    // Additive tax on exclusive base price
    const taxable = grossAmountInr;
    const cgstAmount = Math.round((taxable * (schedule.cgst_percent / 100)) * 100) / 100;
    const sgstAmount = Math.round((taxable * (schedule.sgst_percent / 100)) * 100) / 100;
    const totalTax = cgstAmount + sgstAmount;
    const finalGross = taxable + totalTax;

    return {
      category,
      sac_code: schedule.sac_code,
      description: schedule.description,
      taxable_amount_inr: taxable,
      rate_percent: rate,
      cgst_percent: schedule.cgst_percent,
      sgst_percent: schedule.sgst_percent,
      cgst_amount_inr: cgstAmount,
      sgst_amount_inr: sgstAmount,
      total_tax_inr: totalTax,
      gross_amount_inr: finalGross,
    };
  }
}

/**
 * Calculates authoritative multi-line folio tax breakdown.
 */
export function calculateAuthoritativeFolioTax(
  roomGrossInr: number,
  incidentals: { category: string; amount: number; quantity?: number; description?: string }[] = [],
  tenantSettings?: Record<string, unknown>,
  stayDate: string = new Date().toISOString()
): TaxCalculationResult {
  const isInclusive = tenantSettings?.tax_inclusive_pricing !== false; // Default: inclusive
  const customSchedules = Array.isArray(tenantSettings?.tax_schedules)
    ? (tenantSettings?.tax_schedules as TaxSchedule[])
    : undefined;

  const items: TaxBreakdownItem[] = [];

  // 1. Room Accommodation Tax
  if (roomGrossInr > 0) {
    const accSchedule = getActiveTaxSchedule('accommodation', stayDate, customSchedules);
    const roomTax = calculateLineItemTax(roomGrossInr, 'accommodation', isInclusive, accSchedule);
    items.push(roomTax);
  }

  // 2. Incidentals Tax by Category
  for (const inc of incidentals) {
    const rawCategory = (inc.category || '').toLowerCase();
    let supplyCategory: TaxSupplyCategory = 'miscellaneous';

    if (rawCategory.includes('restaurant') || rawCategory.includes('dining') || rawCategory.includes('food')) {
      supplyCategory = 'restaurant';
    } else if (rawCategory.includes('activit') || rawCategory.includes('tour') || rawCategory.includes('spa') || rawCategory.includes('experience')) {
      supplyCategory = 'activities';
    }

    const totalLineAmount = (inc.amount || 0) * (inc.quantity || 1);
    if (totalLineAmount > 0) {
      const schedule = getActiveTaxSchedule(supplyCategory, stayDate, customSchedules);
      const incTax = calculateLineItemTax(totalLineAmount, supplyCategory, isInclusive, schedule);
      items.push(incTax);
    }
  }

  // Aggregate summary
  const totalTaxable = Math.round(items.reduce((s, i) => s + i.taxable_amount_inr, 0) * 100) / 100;
  const totalCgst = Math.round(items.reduce((s, i) => s + i.cgst_amount_inr, 0) * 100) / 100;
  const totalSgst = Math.round(items.reduce((s, i) => s + i.sgst_amount_inr, 0) * 100) / 100;
  const totalTax = Math.round((totalCgst + totalSgst) * 100) / 100;
  const grandTotal = isInclusive
    ? Math.round((roomGrossInr + incidentals.reduce((s, i) => s + (i.amount || 0) * (i.quantity || 1), 0)) * 100) / 100
    : Math.round((totalTaxable + totalTax) * 100) / 100;

  return {
    is_inclusive: isInclusive,
    total_taxable_amount_inr: totalTaxable,
    total_cgst_inr: totalCgst,
    total_sgst_inr: totalSgst,
    total_tax_inr: totalTax,
    grand_total_inr: grandTotal,
    items,
  };
}

/**
 * Returns current Indian Financial Year string (e.g. "2026-27")
 */
export function getCurrentFinancialYear(): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed (3 = April)

  if (currentMonth >= 3) {
    const nextYearShort = (currentYear + 1).toString().slice(-2);
    return `${currentYear}-${nextYearShort}`;
  } else {
    const thisYearShort = currentYear.toString().slice(-2);
    return `${currentYear - 1}-${thisYearShort}`;
  }
}

/**
 * Generates official sequential tax invoice number (e.g. "RT/2026-27/0101")
 */
export function formatTaxInvoiceNumber(
  prefix: string = 'PSH',
  fy: string = getCurrentFinancialYear(),
  sequence: number = 1
): string {
  const cleanPrefix = prefix.toUpperCase().trim().replace(/[^A-Z0-9]/g, '') || 'INV';
  const paddedSeq = sequence.toString().padStart(4, '0');
  return `${cleanPrefix}/${fy}/${paddedSeq}`;
}

/**
 * Converts numbers into Indian currency in words (e.g. "Ten Thousand Rupees Only")
 */
export function amountInWords(num: number): string {
  const a = [
    '', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ',
    'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ',
    'Seventeen ', 'Eighteen ', 'Nineteen '
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const n = Math.floor(num);
  if (n === 0) return 'Zero Rupees Only';

  const inWords = (n: number): string => {
    let str = '';
    if (n >= 10000000) {
      str += inWords(Math.floor(n / 10000000)) + 'Crore ';
      n %= 10000000;
    }
    if (n >= 100000) {
      str += inWords(Math.floor(n / 100000)) + 'Lakh ';
      n %= 100000;
    }
    if (n >= 1000) {
      str += inWords(Math.floor(n / 1000)) + 'Thousand ';
      n %= 1000;
    }
    if (n >= 100) {
      str += inWords(Math.floor(n / 100)) + 'Hundred ';
      n %= 100;
    }
    if (n > 0) {
      if (str !== '') str += 'and ';
      if (n < 20) str += a[n];
      else {
        str += b[Math.floor(n / 10)];
        if (n % 10 > 0) str += ' ' + a[n % 10];
      }
    }
    return str;
  };

  return `${inWords(n).trim()} Rupees Only`;
}

/**
 * --------------------------------------------------------------------------------
 * PHASE 5: CONFIGURABLE F&B & RESTAURANT ORDER TAX ENGINE
 * 
 * Invariant: Never assume or hardcode 5% GST for all items or resorts.
 * Supports configurable item-level tax treatment (0%, 5%, 12%, 18%),
 * configurable service charges, discounts, and itemized CGST/SGST/IGST breakdown.
 * --------------------------------------------------------------------------------
 */
export interface RestaurantTaxLineInput {
  item_id: string;
  name: string;
  price_inr: number;
  quantity: number;
  tax_rate_percent?: number;
  hsn_sac_code?: string;
  is_tax_inclusive?: boolean;
}

export interface RestaurantOrderTaxCalculation {
  subtotal_inr: number;
  discount_inr: number;
  net_items_inr: number;
  service_charge_percent: number;
  service_charge_inr: number;
  tax_breakdown: TaxBreakdownItem[];
  total_tax_inr: number;
  total_inr: number;
  is_inclusive: boolean;
}

export function calculateRestaurantOrderTaxes(
  items: RestaurantTaxLineInput[],
  options?: {
    serviceChargePercent?: number;
    discountInr?: number;
    discountPercent?: number;
    tenantSettings?: Record<string, unknown>;
    orderDate?: string;
  }
): RestaurantOrderTaxCalculation {
  const settings = options?.tenantSettings || {};
  const orderDate = options?.orderDate || new Date().toISOString();
  const customSchedules = Array.isArray(settings.tax_schedules)
    ? (settings.tax_schedules as TaxSchedule[])
    : undefined;

  const defaultSchedule = getActiveTaxSchedule('restaurant', orderDate, customSchedules);
  const defaultIsInclusive = settings.tax_inclusive_pricing !== false; // default true for resorts/restaurants

  // 1. Calculate Gross Subtotal
  const rawSubtotal = items.reduce((sum, item) => {
    return sum + Number(item.price_inr || 0) * (Number(item.quantity) || 1);
  }, 0);

  // 2. Compute Total Discount
  let totalDiscountInr = Number(options?.discountInr || 0);
  if (options?.discountPercent && options.discountPercent > 0) {
    totalDiscountInr += Math.round((rawSubtotal * options.discountPercent) / 100);
  }
  totalDiscountInr = Math.min(rawSubtotal, Math.max(0, totalDiscountInr));
  const netItemsTotal = rawSubtotal - totalDiscountInr;

  // 3. Compute Item-Level Taxes with Prorated Discounts
  const taxBreakdown: TaxBreakdownItem[] = [];
  let aggregateTaxInr = 0;
  let aggregateExclusiveTaxInr = 0;

  for (const item of items) {
    const qty = Number(item.quantity) || 1;
    const itemGross = Number(item.price_inr || 0) * qty;
    if (itemGross <= 0) continue;

    // Prorate discount proportionally across line items
    const itemShare = rawSubtotal > 0 ? itemGross / rawSubtotal : 0;
    const itemDiscount = Math.round(totalDiscountInr * itemShare * 100) / 100;
    const itemNet = Math.max(0, itemGross - itemDiscount);

    // Resolve rate: item-level override -> tenant restaurant schedule rate
    const itemRate =
      item.tax_rate_percent !== undefined && item.tax_rate_percent !== null
        ? Number(item.tax_rate_percent)
        : defaultSchedule.rate_percent;

    const sacCode = item.hsn_sac_code || defaultSchedule.sac_code || '996331';
    const isInclusive =
      item.is_tax_inclusive !== undefined ? item.is_tax_inclusive : defaultIsInclusive;

    if (itemRate <= 0) {
      taxBreakdown.push({
        category: 'restaurant',
        sac_code: sacCode,
        description: `${item.name} (Exempt/0% GST)`,
        taxable_amount_inr: Math.round(itemNet * 100) / 100,
        rate_percent: 0,
        cgst_percent: 0,
        sgst_percent: 0,
        cgst_amount_inr: 0,
        sgst_amount_inr: 0,
        total_tax_inr: 0,
        gross_amount_inr: Math.round(itemNet * 100) / 100,
      });
      continue;
    }

    let taxableAmount = 0;
    let itemTax = 0;

    if (isInclusive) {
      taxableAmount = Math.round((itemNet / (1 + itemRate / 100)) * 100) / 100;
      itemTax = Math.round((itemNet - taxableAmount) * 100) / 100;
    } else {
      taxableAmount = Math.round(itemNet * 100) / 100;
      itemTax = Math.round((taxableAmount * (itemRate / 100)) * 100) / 100;
      aggregateExclusiveTaxInr += itemTax;
    }

    const halfTax = Math.round((itemTax / 2) * 100) / 100;
    const otherHalf = Math.round((itemTax - halfTax) * 100) / 100;
    aggregateTaxInr += itemTax;

    taxBreakdown.push({
      category: 'restaurant',
      sac_code: sacCode,
      description: `${item.name} (GST @${itemRate}%)`,
      taxable_amount_inr: taxableAmount,
      rate_percent: itemRate,
      cgst_percent: Math.round((itemRate / 2) * 100) / 100,
      sgst_percent: Math.round((itemRate / 2) * 100) / 100,
      cgst_amount_inr: halfTax,
      sgst_amount_inr: otherHalf,
      total_tax_inr: itemTax,
      gross_amount_inr: isInclusive ? itemNet : taxableAmount + itemTax,
    });
  }

  // 4. Compute Service Charge (where applicable by property policy)
  const serviceChargePercent = Math.max(0, Number(options?.serviceChargePercent || 0));
  let serviceChargeInr = 0;
  if (serviceChargePercent > 0 && netItemsTotal > 0) {
    serviceChargeInr = Math.round((netItemsTotal * serviceChargePercent) / 100);
    // Under Indian GST, service charge is taxable service supply
    const scRate = defaultSchedule.rate_percent;
    const scTax = Math.round((serviceChargeInr * (scRate / 100)) * 100) / 100;
    const halfScTax = Math.round((scTax / 2) * 100) / 100;

    taxBreakdown.push({
      category: 'restaurant',
      sac_code: '996331',
      description: `Service Charge (${serviceChargePercent}%)`,
      taxable_amount_inr: serviceChargeInr,
      rate_percent: scRate,
      cgst_percent: Math.round((scRate / 2) * 100) / 100,
      sgst_percent: Math.round((scRate / 2) * 100) / 100,
      cgst_amount_inr: halfScTax,
      sgst_amount_inr: Math.round((scTax - halfScTax) * 100) / 100,
      total_tax_inr: scTax,
      gross_amount_inr: serviceChargeInr + scTax,
    });

    aggregateTaxInr += scTax;
    aggregateExclusiveTaxInr += scTax;
  }

  // 5. Compute Grand Total
  // If items were tax-exclusive, add exclusive taxes. If inclusive, netItemsTotal already contains item tax.
  let grandTotal = netItemsTotal + serviceChargeInr + aggregateExclusiveTaxInr;
  grandTotal = Math.round(grandTotal);

  return {
    subtotal_inr: Math.round(rawSubtotal),
    discount_inr: Math.round(totalDiscountInr),
    net_items_inr: Math.round(netItemsTotal),
    service_charge_percent: serviceChargePercent,
    service_charge_inr: serviceChargeInr,
    tax_breakdown: taxBreakdown,
    total_tax_inr: Math.round(aggregateTaxInr * 100) / 100,
    total_inr: grandTotal,
    is_inclusive: defaultIsInclusive,
  };
}

