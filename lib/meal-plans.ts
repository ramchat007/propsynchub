/**
 * PropSyncHub Authoritative Meal Plans Engine
 * 
 * Supports the four standard Indian hospitality meal plans:
 * 1. EP  (European Plan) — Room Only
 * 2. CP  (Continental Plan) — Bed & Breakfast Included
 * 3. MAP (Modified American Plan / Half Board) — Room + Breakfast + Dinner (or Lunch)
 * 4. AP  (American Plan / Full Board) — Room + Breakfast + Lunch + Dinner
 */

import { MealPlanCode, MealPlanDefinition, SelectedMealPlan, RoomCategory } from '@/types';

/**
 * Standard baseline Indian resort meal plan definitions
 */
export const STANDARD_MEAL_PLANS: Record<MealPlanCode, MealPlanDefinition> = {
  EP: {
    code: 'EP',
    name: 'European Plan (Room Only)',
    short_label: 'Room Only',
    description: 'Accommodation only. Meals, beverages, and in-room dining ordered separately a la carte.',
    included_meals: [],
    adult_supplement_inr: 0,
    child_supplement_inr: 0,
    sac_code: '996311',
    is_available: true,
  },
  CP: {
    code: 'CP',
    name: 'Continental Plan (Bed & Breakfast)',
    short_label: 'Breakfast Included',
    description: 'Buffet breakfast at the resort restaurant or chef service included each morning.',
    included_meals: ['breakfast'],
    adult_supplement_inr: 350,
    child_supplement_inr: 200,
    sac_code: '996331',
    is_available: true,
  },
  MAP: {
    code: 'MAP',
    name: 'Modified American Plan (Half Board)',
    short_label: 'Breakfast + Dinner',
    description: 'Daily morning buffet breakfast plus chef-curated 3-course multi-cuisine dinner.',
    included_meals: ['breakfast', 'dinner'],
    adult_supplement_inr: 850,
    child_supplement_inr: 500,
    sac_code: '996331',
    is_available: true,
  },
  AP: {
    code: 'AP',
    name: 'American Plan (Full Board)',
    short_label: 'All Meals Included',
    description: 'Complete culinary experience: daily breakfast, hot afternoon lunch, and dinner.',
    included_meals: ['breakfast', 'lunch', 'dinner'],
    adult_supplement_inr: 1400,
    child_supplement_inr: 800,
    sac_code: '996331',
    is_available: true,
  },
};

/**
 * Retrieves all available meal plans for a resort or specific room category.
 */
export function getAvailableMealPlans(
  category?: RoomCategory | null,
  tenantSettings?: Record<string, unknown>
): MealPlanDefinition[] {
  // Check category-specific overrides
  if (category && Array.isArray((category as unknown as Record<string, unknown>).meal_plans)) {
    const catPlans = (category as unknown as Record<string, unknown>).meal_plans as MealPlanDefinition[];
    if (catPlans.length > 0) {
      return catPlans;
    }
  }

  // Check tenant-level custom pricing
  const tenantPlans = tenantSettings?.meal_plans as Record<MealPlanCode, Partial<MealPlanDefinition>> | undefined;
  if (tenantPlans) {
    return (['EP', 'CP', 'MAP', 'AP'] as MealPlanCode[]).map((code) => {
      const base = STANDARD_MEAL_PLANS[code];
      const custom = tenantPlans[code] || {};
      return {
        ...base,
        ...custom,
        code,
      };
    });
  }

  return Object.values(STANDARD_MEAL_PLANS);
}

/**
 * Calculates authoritative total meal plan supplement for a stay.
 */
export function calculateMealPlanCost(
  code: MealPlanCode = 'EP',
  numAdults: number = 2,
  numChildren: number = 0,
  nights: number = 1,
  availablePlans?: MealPlanDefinition[]
): SelectedMealPlan {
  const plans = availablePlans || Object.values(STANDARD_MEAL_PLANS);
  const matched = plans.find((p) => p.code === code) || STANDARD_MEAL_PLANS.EP;

  const validAdults = Math.max(1, numAdults);
  const validChildren = Math.max(0, numChildren);
  const validNights = Math.max(1, nights);

  const dailyAdultTotal = validAdults * matched.adult_supplement_inr;
  const dailyChildTotal = validChildren * matched.child_supplement_inr;
  const totalCharge = (dailyAdultTotal + dailyChildTotal) * validNights;

  return {
    code: matched.code,
    name: matched.name,
    adult_supplement_inr: matched.adult_supplement_inr,
    child_supplement_inr: matched.child_supplement_inr,
    total_plan_charge_inr: Math.round(totalCharge),
  };
}
