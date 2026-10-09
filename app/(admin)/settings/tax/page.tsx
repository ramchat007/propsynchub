import React from 'react';
import { redirect } from 'next/navigation';
import { requireAdminAuth } from '@/lib/auth/admin-guard';
import TaxSettingsClient from '@/components/admin/TaxSettingsClient';
import { getResortTaxAndMealSettings } from '@/app/actions/tenant';
import { TaxSchedule, MealPlanCode, MealPlanDefinition } from '@/types';
import { DEFAULT_TAX_SCHEDULES } from '@/lib/tax-engine';
import { STANDARD_MEAL_PLANS } from '@/lib/meal-plans';

export const dynamic = 'force-dynamic';

export default async function TaxSettingsPage() {
  const auth = await requireAdminAuth('/settings/tax');

  // Operational staff cannot modify statutory tax or meal rates
  const allowedRoles = ['superadmin', 'tenant_admin', 'resort_manager', 'accountant'];
  if (!allowedRoles.includes(auth.role)) {
    redirect('/dashboard');
  }

  const tenantId = auth.tenantId!;
  const resortName = auth.tenant?.name || 'Resort Administration';

  const res = await getResortTaxAndMealSettings(tenantId);
  const data = res.data;

  return (
    <TaxSettingsClient
      tenantId={tenantId}
      resortName={resortName}
      initialLegalName={data?.legalName || resortName}
      initialGstin={data?.gstin || ''}
      initialStateCode={data?.stateCode || '27'}
      initialStateName={data?.stateName || 'Maharashtra'}
      initialInvoicePrefix={data?.invoicePrefix || 'INV'}
      initialPricingMode={data?.pricingMode || 'inclusive'}
      initialTaxSchedules={(data?.taxSchedules as TaxSchedule[]) || DEFAULT_TAX_SCHEDULES}
      initialMealPlans={
        (data?.mealPlans as Record<MealPlanCode, MealPlanDefinition>) || STANDARD_MEAL_PLANS
      }
    />
  );
}
