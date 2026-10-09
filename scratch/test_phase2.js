/**
 * PropSyncHub Phase 2 Verification Script
 * Validates:
 * 1. Precedence Hierarchy: Date Override (400) > Seasonal Range (300) > Weekend (200) > Base (100)
 * 2. Adult / Child Occupancy & Extra-Bed supplement calculations
 * 3. Overcapacity rejection
 * 4. Maintenance block overlap collision safety
 */

function calculateAuthoritativeStayPricing(params) {
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
  const baseAdults = typeof category?.base_adults === 'number' ? category.base_adults : 2;
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
    typeof category?.max_total_guests === 'number'
      ? category.max_total_guests
      : maxAdults + maxChildren;

  // 2. Validate Occupancy Thresholds
  if (validAdults > maxAdults + 1) {
    return {
      is_available: false,
      unavailability_reason: `Guest count (${validAdults} adults) exceeds maximum adult capacity of ${maxAdults} for this unit/category.`,
      nights: 0,
      adults: validAdults,
      children: validChildren,
      total_guests: totalGuests,
      max_allowed_guests: maxTotalGuests,
      base_adults: baseAdults,
      extra_adults: 0,
      extra_children: 0,
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
      unavailability_reason: `Total party size of ${totalGuests} guests exceeds maximum allowed capacity of ${maxTotalGuests} for this unit/category.`,
      nights: 0,
      adults: validAdults,
      children: validChildren,
      total_guests: totalGuests,
      max_allowed_guests: maxTotalGuests,
      base_adults: baseAdults,
      extra_adults: 0,
      extra_children: 0,
      extra_adult_rate_inr: 0,
      extra_child_rate_inr: 0,
      nightly_breakdown: [],
      total_room_charges_inr: 0,
      total_extra_guest_charges_inr: 0,
      grand_total_inr: 0,
    };
  }

  // 3. Compute Extra-Bed & Extra-Guest Surcharges per Night
  const extraAdultsCount = Math.max(0, validAdults - baseAdults);
  const extraChildrenCount = validChildren;

  const extraAdultRate =
    typeof category?.extra_adult_price_inr === 'number'
      ? category.extra_adult_price_inr
      : typeof category?.extra_pax_price_inr === 'number'
      ? category.extra_pax_price_inr
      : 1000;

  const extraChildRate =
    typeof category?.extra_child_price_inr === 'number'
      ? category.extra_child_price_inr
      : Math.round(extraAdultRate * 0.5);

  const dailyExtraCharges =
    extraAdultsCount * extraAdultRate + extraChildrenCount * extraChildRate;

  // 4. Night-by-Night Pricing Hierarchy Calculation
  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);
  const diffMs = checkOutDate.getTime() - checkInDate.getTime();
  const nights = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));

  const baseRate =
    typeof params.basePriceInr === 'number' && params.basePriceInr > 0
      ? params.basePriceInr
      : typeof category?.base_price_inr === 'number'
      ? category.base_price_inr
      : 5000;

  const weekendPrice =
    typeof category?.weekend_price_inr === 'number'
      ? category.weekend_price_inr
      : Math.round(baseRate * 1.2);

  const activeRules = (pricingRules || []).filter(r => r.is_active !== false);

  const nightlyBreakdown = [];
  let totalRoomCharges = 0;
  let totalExtraGuestCharges = 0;

  for (let i = 0; i < nights; i++) {
    const currentNight = new Date(checkInDate.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = currentNight.toISOString().split('T')[0];
    const dayOfWeek = currentNight.getDay(); // 0 = Sun, 5 = Fri, 6 = Sat
    const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;

    // Filter matching rules for this specific night
    const matchingRules = activeRules.filter(r => {
      if (r.start_date > dateStr || r.end_date < dateStr) return false;
      if (r.room_id && room?.id && r.room_id !== room.id) return false;
      if (r.category_id && category?.id && r.category_id !== category.id) return false;
      return true;
    });

    // Sort by priority descending (Precedence Hierarchy)
    matchingRules.sort((a, b) => (b.priority || 100) - (a.priority || 100));

    let effectiveRoomRate = baseRate;
    let appliedRuleId;
    let appliedRuleTitle = 'Standard Base Tariff';
    let appliedRuleType = 'base';

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
      effectiveRoomRate = weekendPrice;
      appliedRuleTitle = 'Weekend Tariff (Fri-Sat)';
      appliedRuleType = 'weekend';
    }

    const nightTotal = effectiveRoomRate + dailyExtraCharges;

    nightlyBreakdown.push({
      date: dateStr,
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

  return {
    is_available: true,
    category_id: category?.id,
    category_name: category?.name,
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
    grand_total_inr: totalRoomCharges + totalExtraGuestCharges,
  };
}

function isRoomBlockedForDates(roomId, checkIn, checkOut, activeBlocks) {
  const match = activeBlocks.find((b) => {
    if (b.room_id !== roomId) return false;
    if (b.status !== 'active') return false;
    return b.start_date < checkOut && b.end_date > checkIn;
  });

  return {
    isBlocked: !!match,
    block: match,
  };
}

console.log('================================================================');
console.log('PROPSYNCHUB PHASE 2: AUTOMATED VERIFICATION');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${message}`);
  }
}

// -----------------------------------------------------------------
// TEST GROUP 1: Pricing Precedence (Override > Seasonal > Weekend > Base)
// -----------------------------------------------------------------
console.log('--- TEST GROUP 1: Pricing Precedence Hierarchy ---');

const sampleCategory = {
  id: 'cat-ocean-villa',
  name: 'Ocean View Villa',
  base_price_inr: 8000,
  weekend_price_inr: 10000,
  extra_adult_price_inr: 1500,
  extra_child_price_inr: 750,
  base_adults: 2,
  max_adults: 4,
  max_children: 2,
  max_total_guests: 5,
};

// Case 1A: Base Rate on Weekdays (Mon-Tue night, 2 nights)
const weekdayRes = calculateAuthoritativeStayPricing({
  checkIn: '2026-10-12', // Monday
  checkOut: '2026-10-14', // Wednesday (2 nights: Mon, Tue)
  adults: 2,
  children: 0,
  category: sampleCategory,
});

assert(weekdayRes.is_available === true, 'Weekday booking is available');
assert(weekdayRes.total_room_charges_inr === 16000, `Weekday 2 nights base rate = 16,000 (got ${weekdayRes.total_room_charges_inr})`);
assert(weekdayRes.nightly_breakdown[0].room_rate_inr === 8000, 'Monday night uses standard base rate 8,000');

// Case 1B: Weekend Surcharge on Friday & Saturday nights (2 nights)
const weekendRes = calculateAuthoritativeStayPricing({
  checkIn: '2026-10-16', // Friday
  checkOut: '2026-10-18', // Sunday (2 nights: Fri, Sat)
  adults: 2,
  children: 0,
  category: sampleCategory,
});

assert(weekendRes.is_available === true, 'Weekend booking is available');
assert(weekendRes.total_room_charges_inr === 20000, `Weekend 2 nights = 20,000 (got ${weekendRes.total_room_charges_inr})`);
assert(weekendRes.nightly_breakdown[0].applied_rule_type === 'weekend', 'Friday night applies weekend surcharge');

// Case 1C: Seasonal Date-Range Rule (Priority 300) overrides Weekend & Base Rate
const seasonalRule = {
  id: 'rule-monsoon-peak',
  title: 'Peak Monsoon Surge',
  rule_type: 'seasonal',
  priority: 300,
  start_date: '2026-10-15',
  end_date: '2026-10-25',
  fixed_price_inr: 12000,
  is_active: true,
};

const seasonalStayRes = calculateAuthoritativeStayPricing({
  checkIn: '2026-10-16', // Friday during seasonal rule
  checkOut: '2026-10-18', // Sunday
  adults: 2,
  children: 0,
  category: sampleCategory,
  pricingRules: [seasonalRule],
});

assert(
  seasonalStayRes.total_room_charges_inr === 24000,
  `Seasonal Rule (Priority 300) overrides weekend rate: 2 nights x 12,000 = 24,000 (got ${seasonalStayRes.total_room_charges_inr})`
);
assert(seasonalStayRes.nightly_breakdown[0].applied_rule_type === 'seasonal', 'Friday night marked as seasonal');

// Case 1D: Date Override (Priority 400 - Diwali/NYE) overrides Seasonal Rule (Priority 300)
const diwaliOverrideRule = {
  id: 'rule-diwali-eve',
  title: 'Diwali Eve Special',
  rule_type: 'date_override',
  priority: 400,
  start_date: '2026-10-17',
  end_date: '2026-10-17', // Saturday only
  fixed_price_inr: 18000,
  is_active: true,
};

const hierarchyRes = calculateAuthoritativeStayPricing({
  checkIn: '2026-10-16', // Friday (seasonal: 12,000)
  checkOut: '2026-10-18', // Sunday (Saturday night is Diwali override: 18,000)
  adults: 2,
  children: 0,
  category: sampleCategory,
  pricingRules: [seasonalRule, diwaliOverrideRule],
});

assert(
  hierarchyRes.nightly_breakdown[0].room_rate_inr === 12000,
  'Friday night receives seasonal rate 12,000'
);
assert(
  hierarchyRes.nightly_breakdown[1].room_rate_inr === 18000,
  'Saturday night Diwali override (Priority 400) wins over seasonal rule: rate = 18,000'
);
assert(
  hierarchyRes.total_room_charges_inr === 30000,
  `Total for 2 nights = 12,000 + 18,000 = 30,000 (got ${hierarchyRes.total_room_charges_inr})`
);

// -----------------------------------------------------------------
// TEST GROUP 2: Occupancy & Extra-Guest Supplements
// -----------------------------------------------------------------
console.log('\n--- TEST GROUP 2: Occupancy & Extra-Guest Supplements ---');

// Case 2A: 3 Adults, 1 Child (Base covers 2 adults -> 1 Extra Adult @ 1500, 1 Child @ 750)
const extraPaxRes = calculateAuthoritativeStayPricing({
  checkIn: '2026-10-12',
  checkOut: '2026-10-13', // 1 night
  adults: 3,
  children: 1,
  category: sampleCategory,
});

assert(extraPaxRes.is_available === true, '3 Adults + 1 Child is within 5 pax capacity');
assert(extraPaxRes.extra_adults === 1, 'Extra adult count = 1');
assert(extraPaxRes.extra_children === 1, 'Extra child count = 1');
assert(extraPaxRes.total_extra_guest_charges_inr === 2250, `Extra guest charge = 1500 + 750 = 2,250 (got ${extraPaxRes.total_extra_guest_charges_inr})`);
assert(extraPaxRes.grand_total_inr === 8000 + 2250, `Grand total = 10,250 (got ${extraPaxRes.grand_total_inr})`);

// Case 2B: Exceeding Max Capacity (Max Total Guests = 5, requesting 5 Adults + 2 Kids = 7)
const overcapacityRes = calculateAuthoritativeStayPricing({
  checkIn: '2026-10-12',
  checkOut: '2026-10-13',
  adults: 5,
  children: 2,
  category: sampleCategory,
});

assert(overcapacityRes.is_available === false, 'Overcapacity booking is rejected');
assert(overcapacityRes.unavailability_reason.includes('exceeds'), `Rejection message details occupancy constraint: "${overcapacityRes.unavailability_reason}"`);

// -----------------------------------------------------------------
// TEST GROUP 3: Maintenance Block Overlap Verification Logic
// -----------------------------------------------------------------
console.log('\n--- TEST GROUP 3: Maintenance Block Overlap Safety ---');

const testBlocks = [
  {
    id: 'block-1',
    tenant_id: 't-1',
    room_id: 'room-101',
    block_type: 'maintenance',
    reason: 'AC Repair',
    start_date: '2026-10-20',
    end_date: '2026-10-25',
    status: 'active',
  },
  {
    id: 'block-2',
    tenant_id: 't-1',
    room_id: 'room-102',
    block_type: 'deep_cleaning',
    reason: 'Pest Control',
    start_date: '2026-10-10',
    end_date: '2026-10-12',
    status: 'completed', // Resolved block
  },
];

// Block check overlapping room-101 (Oct 21 - Oct 23)
const overlapCheck1 = isRoomBlockedForDates('room-101', '2026-10-21', '2026-10-23', testBlocks);
assert(overlapCheck1.isBlocked === true, 'Active maintenance block on room-101 is detected during stay window');

// Block check non-overlapping room-101 (Oct 26 - Oct 28)
const nonOverlapCheck = isRoomBlockedForDates('room-101', '2026-10-26', '2026-10-28', testBlocks);
assert(nonOverlapCheck.isBlocked === false, 'Room-101 is free after maintenance end date');

// Block check on completed block room-102 (should be free)
const completedCheck = isRoomBlockedForDates('room-102', '2026-10-10', '2026-10-12', testBlocks);
assert(completedCheck.isBlocked === false, 'Completed/resolved block does not block room-102');

console.log('\n================================================================');
console.log(`VERIFICATION SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('================================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
