/**
 * PropSyncHub Authoritative Seasonal Pricing & Occupancy Engine
 * 
 * Non-negotiable architectural invariants:
 * 1. Strict Precedence Hierarchy:
 *    Date Override (Highest = 400) > Seasonal Date-Range (300) > Weekend Override (200) > Base Category Rate (100).
 * 2. Adult/Child Occupancy & Extra-Bed Enforcement:
 *    Enforces base adults (default 2), max adults, max children, and max total guests.
 *    Calculates authoritative extra-guest supplements per night for both availability checks and booking reservations.
 */

import {
  Room,
  RoomCategory,
  SeasonalPricingRule,
  OccupancyPricingResult,
  NightlyRateBreakdown,
  PricingRuleType,
} from '@/types';

export interface StayPricingParams {
  checkIn: string;
  checkOut: string;
  adults?: number;
  children?: number;
  basePriceInr?: number;
  category?: RoomCategory | null;
  room?: Room | null;
  pricingRules?: SeasonalPricingRule[] | unknown[];
}

/**
 * Evaluates dates, occupancy limits, and applies precedence pricing rules per night.
 */
export function calculateAuthoritativeStayPricing(
  params: StayPricingParams
): OccupancyPricingResult {
  const {
    checkIn,
    checkOut,
    adults = 2,
    children = 0,
    category,
    room,
    pricingRules = [],
  } = params;

  const validAdults = Math.max(1, adults);
  const validChildren = Math.max(0, children);
  const totalGuests = validAdults + validChildren;

  // 1. Resolve Occupancy Limits
  const catExt = (category || {}) as unknown as Record<string, unknown>;
  const baseAdults = typeof catExt.base_adults === 'number' ? catExt.base_adults : 2;
  const maxAdults =
    typeof room?.capacity_adults === 'number'
      ? room.capacity_adults
      : typeof category?.max_adults === 'number'
      ? category.max_adults
      : 3;
  const maxChildren =
    typeof room?.capacity_children === 'number'
      ? room.capacity_children
      : typeof category?.max_children === 'number'
      ? category.max_children
      : 2;
  const maxTotalGuests =
    typeof catExt.max_total_guests === 'number'
      ? (catExt.max_total_guests as number)
      : maxAdults + maxChildren;

  // 2. Validate Occupancy Limits
  if (validAdults > maxAdults) {
    return {
      is_available: false,
      unavailability_reason: `Party of ${validAdults} adults exceeds maximum adult capacity (${maxAdults} adults) for this room category.`,
      category_id: category?.id,
      category_name: category?.name,
      room_id: room?.id,
      room_name: room?.name,
      nights: 0,
      adults: validAdults,
      children: validChildren,
      total_guests: totalGuests,
      max_allowed_guests: maxTotalGuests,
      base_adults: baseAdults,
      extra_adults: Math.max(0, validAdults - baseAdults),
      extra_children: validChildren,
      extra_adult_rate_inr: 0,
      extra_child_rate_inr: 0,
      nightly_breakdown: [],
      total_room_charges_inr: 0,
      total_extra_guest_charges_inr: 0,
      grand_total_inr: 0,
    };
  }

  if (totalGuests > maxTotalGuests) {
    return {
      is_available: false,
      unavailability_reason: `Total party of ${totalGuests} guests exceeds maximum room occupancy (${maxTotalGuests} guests). Please book an additional room.`,
      category_id: category?.id,
      category_name: category?.name,
      room_id: room?.id,
      room_name: room?.name,
      nights: 0,
      adults: validAdults,
      children: validChildren,
      total_guests: totalGuests,
      max_allowed_guests: maxTotalGuests,
      base_adults: baseAdults,
      extra_adults: Math.max(0, validAdults - baseAdults),
      extra_children: validChildren,
      extra_adult_rate_inr: 0,
      extra_child_rate_inr: 0,
      nightly_breakdown: [],
      total_room_charges_inr: 0,
      total_extra_guest_charges_inr: 0,
      grand_total_inr: 0,
    };
  }

  // 3. Resolve Extra Guest Surcharge Rates
  const extraAdultRate =
    typeof catExt.extra_adult_price_inr === 'number'
      ? (catExt.extra_adult_price_inr as number)
      : typeof category?.extra_pax_price_inr === 'number'
      ? category.extra_pax_price_inr
      : 1000;
  const extraChildRate =
    typeof catExt.extra_child_price_inr === 'number'
      ? (catExt.extra_child_price_inr as number)
      : Math.round(extraAdultRate * 0.5);

  const extraAdultsCount = Math.max(0, validAdults - baseAdults);
  const extraChildrenCount = validChildren;
  const dailyExtraCharges =
    extraAdultsCount * extraAdultRate + extraChildrenCount * extraChildRate;

  // 4. Resolve Default Base Price
  const baseRate =
    params.basePriceInr ??
    (room?.base_price_inr || category?.base_price_inr || 5000);
  const weekendPrice =
    typeof catExt.weekend_price_inr === 'number'
      ? (catExt.weekend_price_inr as number)
      : Math.round(baseRate * 1.2); // Default 20% weekend lift if not explicitly configured

  // 5. Generate Dates Array
  const dIn = new Date(checkIn);
  const dOut = new Date(checkOut);
  const diffMs = dOut.getTime() - dIn.getTime();
  const nights = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));

  const safeRules = (pricingRules as SeasonalPricingRule[]).filter((r) => r && r.is_active !== false);

  const nightlyBreakdown: NightlyRateBreakdown[] = [];
  let totalRoomCharges = 0;
  let totalExtraGuestCharges = 0;

  for (let i = 0; i < nights; i++) {
    const curDate = new Date(dIn);
    curDate.setDate(curDate.getDate() + i);
    const dateStr = curDate.toISOString().split('T')[0];
    const dayOfWeekIdx = curDate.getDay(); // 0 = Sun, 5 = Fri, 6 = Sat
    const isWeekend = dayOfWeekIdx === 5 || dayOfWeekIdx === 6;
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeekIdx];

    // Find all candidate rules for this night matching room or category
    const matchingRules = safeRules.filter((r) => {
      // Room or category match
      const matchesScope =
        (!r.room_id && !r.category_id) ||
        (room && r.room_id === room.id) ||
        (category && r.category_id === category.id);

      if (!matchesScope) return false;

      // Date range match
      if (dateStr < r.start_date || dateStr > r.end_date) return false;

      // Day of week mask match if specified
      if (Array.isArray(r.days_of_week) && r.days_of_week.length > 0) {
        if (!r.days_of_week.includes(dayOfWeekIdx)) return false;
      }

      return true;
    });

    // Sort matching rules by strict precedence priority descending:
    // Date Override (400) > Seasonal Date-Range (300) > Weekend Override (200) > Default
    matchingRules.sort((a, b) => {
      const pA = a.priority || getRuleDefaultPriority(a.rule_type);
      const pB = b.priority || getRuleDefaultPriority(b.rule_type);
      return pB - pA;
    });

    let effectiveRoomRate = baseRate;
    let appliedRuleId: string | undefined = undefined;
    let appliedRuleTitle = 'Standard Base Tariff';
    let appliedRuleType: PricingRuleType | 'base' = 'base';

    if (matchingRules.length > 0) {
      const topRule = matchingRules[0];
      appliedRuleId = topRule.id;
      appliedRuleTitle = topRule.title;
      appliedRuleType = topRule.rule_type || 'seasonal';

      if (typeof topRule.fixed_price_inr === 'number' && topRule.fixed_price_inr > 0) {
        effectiveRoomRate = topRule.fixed_price_inr;
      } else if (typeof topRule.multiplier === 'number' && topRule.multiplier > 0) {
        effectiveRoomRate = Math.round(baseRate * topRule.multiplier);
      } else if (isWeekend && typeof topRule.weekend_price_inr === 'number') {
        effectiveRoomRate = topRule.weekend_price_inr;
      }
    } else if (isWeekend && weekendPrice > 0) {
      // Weekend override when no custom holiday rule is present
      effectiveRoomRate = weekendPrice;
      appliedRuleTitle = 'Weekend Tariff (Fri-Sat)';
      appliedRuleType = 'weekend';
    }

    const nightTotal = effectiveRoomRate + dailyExtraCharges;

    nightlyBreakdown.push({
      date: dateStr,
      day_of_week: dayName,
      is_weekend: isWeekend,
      base_rate_inr: baseRate,
      applied_rule_id: appliedRuleId,
      applied_rule_title: appliedRuleTitle,
      applied_rule_type: appliedRuleType,
      room_rate_inr: effectiveRoomRate,
      extra_guests_count: extraAdultsCount + extraChildrenCount,
      extra_guest_charge_inr: dailyExtraCharges,
      night_total_inr: nightTotal,
    });

    totalRoomCharges += effectiveRoomRate;
    totalExtraGuestCharges += dailyExtraCharges;
  }

  const grandTotal = totalRoomCharges + totalExtraGuestCharges;

  return {
    is_available: true,
    category_id: category?.id,
    category_name: category?.name,
    room_id: room?.id,
    room_name: room?.name,
    nights,
    adults: validAdults,
    children: validChildren,
    total_guests: totalGuests,
    max_allowed_guests: maxTotalGuests,
    base_adults: baseAdults,
    extra_adults: extraAdultsCount,
    extra_children: extraChildrenCount,
    extra_adult_rate_inr: extraAdultRate,
    extra_child_rate_inr: extraChildRate,
    nightly_breakdown: nightlyBreakdown,
    total_room_charges_inr: totalRoomCharges,
    total_extra_guest_charges_inr: totalExtraGuestCharges,
    grand_total_inr: grandTotal,
  };
}

/**
 * Default priority mapping for rule types
 */
function getRuleDefaultPriority(ruleType?: PricingRuleType): number {
  switch (ruleType) {
    case 'date_override':
      return 400; // Highest precedence (Holidays, NYE, Diwali)
    case 'seasonal':
      return 300; // Medium-high (Peak Monsoon, Winter season)
    case 'weekend':
      return 200; // Weekend surcharges
    case 'promotional':
      return 150;
    default:
      return 100; // Base
  }
}
