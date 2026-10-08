'use server';

import { revalidatePath } from 'next/cache';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase';
import { getAuthenticatedAdminContext } from '@/lib/auth/admin-guard';
import {
  TenantSubscription,
  SubscriptionPlan,
  TenantSubscriptionPaymentRecord,
} from '@/types';

import {
  SAAS_PLANS,
  isSuperadmin,
} from '@/lib/subscription-plans';

/**
 * 1. GET TENANT SUBSCRIPTION STATUS
 */
export async function getTenantSubscription(tenantIdInput?: string) {
  try {
    const auth = await getAuthenticatedAdminContext();
    if (!auth.authorized || !auth.user) {
      return { success: false, error: 'Unauthorized: Please log in to view subscription.' };
    }

    const currentEmail = (auth.user.email || '').toLowerCase().trim();
    const userIsSuperadmin = isSuperadmin(currentEmail);

    const targetTenantId = tenantIdInput || auth.tenantId;
    if (!targetTenantId) {
      return { success: false, error: 'Tenant identifier not found.' };
    }

    const adminDb = createAdminClient();
    const { data: tenant, error: fetchError } = await adminDb
      .from('tenants')
      .select('id, name, subdomain, settings, created_at, is_active')
      .eq('id', targetTenantId)
      .maybeSingle();

    if (fetchError || !tenant) {
      return { success: false, error: 'Resort tenant not found.' };
    }

    const settings = (tenant.settings as Record<string, unknown>) || {};
    let rawSub = settings.subscription as TenantSubscription | undefined;

    // Default 14-day trial if no subscription record exists yet
    if (!rawSub) {
      const createdAt = new Date(tenant.created_at || Date.now());
      const trialEndsAt = new Date(createdAt.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const isPast = new Date() > new Date(trialEndsAt);

      rawSub = {
        status: isPast ? 'trial' : 'trial',
        plan: 'pro',
        billing_cycle: 'yearly',
        trial_ends_at: trialEndsAt,
        payment_mode: 'free_trial',
        amount_inr: 0,
        submitted_at: createdAt.toISOString(),
        payment_history: [],
      };
    }

    // Calculate days remaining
    let daysRemaining = 0;
    if (rawSub.status === 'trial' && rawSub.trial_ends_at) {
      const diffMs = new Date(rawSub.trial_ends_at).getTime() - Date.now();
      daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    } else if (rawSub.status === 'active' && rawSub.active_until) {
      const diffMs = new Date(rawSub.active_until).getTime() - Date.now();
      daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    return {
      success: true,
      subscription: rawSub,
      daysRemaining,
      isSuperadmin: userIsSuperadmin,
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSubdomain: tenant.subdomain,
      primaryColorHex: (settings.primary_color_hex as string) || '#059669',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve subscription.';
    return { success: false, error: message };
  }
}

/**
 * 2. SUBMIT OFFLINE BANK TRANSFER / UPI REFERENCE
 */
export async function submitOfflineSubscriptionPayment(formData: FormData) {
  try {
    const auth = await getAuthenticatedAdminContext();
    if (!auth.authorized || !auth.user) {
      return { success: false, error: 'Unauthorized: Please log in to submit payment.' };
    }

    const tenantId = formData.get('tenantId')?.toString()?.trim() || auth.tenantId;
    if (!tenantId) {
      return { success: false, error: 'Resort ID is required.' };
    }

    const plan = (formData.get('plan')?.toString() || 'pro') as SubscriptionPlan;
    const billingCycle = (formData.get('billingCycle')?.toString() || 'yearly') as 'monthly' | 'yearly';
    const amountInr = Number(formData.get('amountInr')) || (billingCycle === 'yearly' ? SAAS_PLANS[plan].yearlyPrice : SAAS_PLANS[plan].monthlyPrice);
    const utrReference = formData.get('utrReference')?.toString()?.trim();
    const notes = formData.get('notes')?.toString()?.trim() || '';

    if (!utrReference || utrReference.length < 5) {
      return { success: false, error: 'Please enter a valid Bank Transaction Reference / UTR Number (minimum 5 characters).' };
    }

    const adminDb = createAdminClient();
    const { data: tenant, error: fetchErr } = await adminDb
      .from('tenants')
      .select('settings, name')
      .eq('id', tenantId)
      .single();

    if (fetchErr || !tenant) {
      return { success: false, error: 'Resort not found.' };
    }

    const settings = (tenant.settings as Record<string, unknown>) || {};
    const existingSub = (settings.subscription as TenantSubscription) || {
      status: 'trial',
      plan: 'pro',
      payment_mode: 'free_trial',
    };

    const newPaymentRecord: TenantSubscriptionPaymentRecord = {
      id: `sub_pay_${Date.now()}`,
      date: new Date().toISOString(),
      amount: amountInr,
      plan,
      billing_cycle: billingCycle,
      mode: 'offline_bank_transfer',
      reference: utrReference,
      status: 'pending',
      notes,
    };

    const history = Array.isArray(existingSub.payment_history) ? [...existingSub.payment_history] : [];
    history.unshift(newPaymentRecord);

    const updatedSub: TenantSubscription = {
      ...existingSub,
      status: 'pending_approval',
      plan,
      billing_cycle: billingCycle,
      payment_mode: 'offline_bank_transfer',
      amount_inr: amountInr,
      offline_reference: utrReference,
      offline_notes: notes,
      submitted_at: new Date().toISOString(),
      payment_history: history,
    };

    const { error: updateErr } = await adminDb
      .from('tenants')
      .update({
        settings: {
          ...settings,
          subscription: updatedSub,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    if (updateErr) {
      return { success: false, error: `Failed to save payment reference: ${updateErr.message}` };
    }

    // Write audit trail entry
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: auth.user.id,
        user_name: auth.user.email || 'Admin',
        user_role: auth.role,
        action: 'SUBSCRIPTION_PAYMENT_SUBMITTED',
        entity_type: 'subscription',
        entity_id: tenantId,
        details: {
          plan,
          billing_cycle: billingCycle,
          amount_inr: amountInr,
          utr_reference: utrReference,
          notes,
        },
      });
    } catch (auditErr) {
      console.warn('[Audit Warning]:', auditErr);
    }

    revalidatePath('/settings/subscription');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: 'Offline payment reference submitted! The platform owner has been notified and will verify & activate your subscription shortly.',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error submitting payment reference.';
    return { success: false, error: message };
  }
}

/**
 * 3. SUPERADMIN MANUAL APPROVAL / ACTIVATION
 * Guarded strictly to platform owner / superadmin.
 */
export async function approveTenantSubscription(formData: FormData) {
  try {
    const auth = await getAuthenticatedAdminContext();
    if (!auth.authorized || !auth.user) {
      return { success: false, error: 'Unauthorized.' };
    }

    const currentEmail = (auth.user.email || '').toLowerCase().trim();
    if (!isSuperadmin(currentEmail)) {
      return { success: false, error: 'Unauthorized: Only platform owner (Superadmin) can approve subscriptions.' };
    }

    const tenantId = formData.get('tenantId')?.toString()?.trim();
    if (!tenantId) {
      return { success: false, error: 'Resort ID is required.' };
    }

    const durationMonths = Number(formData.get('durationMonths')) || 12; // Default 1 year
    const planOverride = formData.get('plan')?.toString() as SubscriptionPlan | undefined;
    const approvalNotes = formData.get('approvalNotes')?.toString()?.trim() || 'Approved by Platform Owner';

    const adminDb = createAdminClient();
    const { data: tenant, error: fetchErr } = await adminDb
      .from('tenants')
      .select('settings, name')
      .eq('id', tenantId)
      .single();

    if (fetchErr || !tenant) {
      return { success: false, error: 'Resort record not found.' };
    }

    const settings = (tenant.settings as Record<string, unknown>) || {};
    const existingSub = (settings.subscription as TenantSubscription) || {
      status: 'trial',
      plan: 'pro',
      payment_mode: 'offline_bank_transfer',
    };

    // Calculate active_until date
    let activeUntilDate: string;
    if (durationMonths >= 120) {
      // Lifetime complimentary
      activeUntilDate = '2099-12-31T23:59:59.999Z';
    } else {
      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() + durationMonths);
      activeUntilDate = targetDate.toISOString();
    }

    const targetPlan = planOverride || existingSub.plan || 'pro';

    // Update payment history records
    const history = Array.isArray(existingSub.payment_history) ? [...existingSub.payment_history] : [];
    if (history.length > 0 && history[0].status === 'pending') {
      history[0].status = 'approved';
      history[0].approved_by = currentEmail;
      history[0].notes = `${history[0].notes || ''} [Approved: ${approvalNotes}]`.trim();
    } else {
      // Create manual approval record
      history.unshift({
        id: `sub_pay_${Date.now()}`,
        date: new Date().toISOString(),
        amount: existingSub.amount_inr || (durationMonths >= 12 ? SAAS_PLANS[targetPlan].yearlyPrice : SAAS_PLANS[targetPlan].monthlyPrice),
        plan: targetPlan,
        billing_cycle: durationMonths >= 12 ? 'yearly' : 'monthly',
        mode: durationMonths >= 120 ? 'complimentary' : existingSub.payment_mode || 'offline_bank_transfer',
        reference: existingSub.offline_reference || 'MANUAL_APPROVAL',
        status: 'approved',
        notes: approvalNotes,
        approved_by: currentEmail,
      });
    }

    const updatedSub: TenantSubscription = {
      ...existingSub,
      status: 'active',
      plan: targetPlan,
      payment_mode: durationMonths >= 120 ? 'complimentary' : existingSub.payment_mode || 'offline_bank_transfer',
      active_until: activeUntilDate,
      approved_at: new Date().toISOString(),
      approved_by: currentEmail,
      payment_history: history,
    };

    const { error: updateErr } = await adminDb
      .from('tenants')
      .update({
        is_active: true,
        settings: {
          ...settings,
          subscription: updatedSub,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    if (updateErr) {
      return { success: false, error: `Failed to update subscription status: ${updateErr.message}` };
    }

    // Write audit log
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: auth.user.id,
        user_name: currentEmail,
        user_role: 'superadmin',
        action: 'SUBSCRIPTION_APPROVED',
        entity_type: 'subscription',
        entity_id: tenantId,
        details: {
          duration_months: durationMonths,
          active_until: activeUntilDate,
          plan: targetPlan,
          approved_by: currentEmail,
          notes: approvalNotes,
        },
      });
    } catch (auditErr) {
      console.warn('[Audit Warning]:', auditErr);
    }

    revalidatePath('/settings/subscription');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: `Subscription for ${tenant.name} successfully approved and activated until ${new Date(activeUntilDate).toLocaleDateString()}!`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error approving subscription.';
    return { success: false, error: message };
  }
}

/**
 * 4. SUPERADMIN REJECT SUBSCRIPTION
 */
export async function rejectTenantSubscription(formData: FormData) {
  try {
    const auth = await getAuthenticatedAdminContext();
    if (!auth.authorized || !auth.user) {
      return { success: false, error: 'Unauthorized.' };
    }

    const currentEmail = (auth.user.email || '').toLowerCase().trim();
    if (!isSuperadmin(currentEmail)) {
      return { success: false, error: 'Unauthorized: Only platform superadmin can reject subscriptions.' };
    }

    const tenantId = formData.get('tenantId')?.toString()?.trim();
    const rejectionReason = formData.get('reason')?.toString()?.trim() || 'Payment reference could not be verified.';

    if (!tenantId) {
      return { success: false, error: 'Resort ID is required.' };
    }

    const adminDb = createAdminClient();
    const { data: tenant, error: fetchErr } = await adminDb
      .from('tenants')
      .select('settings, name')
      .eq('id', tenantId)
      .single();

    if (fetchErr || !tenant) {
      return { success: false, error: 'Resort record not found.' };
    }

    const settings = (tenant.settings as Record<string, unknown>) || {};
    const existingSub = (settings.subscription as TenantSubscription) || {
      status: 'pending_approval',
      plan: 'pro',
      payment_mode: 'offline_bank_transfer',
    };

    const history = Array.isArray(existingSub.payment_history) ? [...existingSub.payment_history] : [];
    if (history.length > 0 && history[0].status === 'pending') {
      history[0].status = 'rejected';
      history[0].notes = `${history[0].notes || ''} [Rejected: ${rejectionReason}]`.trim();
    }

    const updatedSub: TenantSubscription = {
      ...existingSub,
      status: 'trial', // fallback to trial / requires new submission
      payment_history: history,
      offline_notes: `Rejected: ${rejectionReason}`,
    };

    await adminDb
      .from('tenants')
      .update({
        settings: {
          ...settings,
          subscription: updatedSub,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    revalidatePath('/settings/subscription');

    return {
      success: true,
      message: 'Subscription request marked as rejected. Resort admin can resubmit valid UTR.',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error rejecting subscription.';
    return { success: false, error: message };
  }
}

/**
 * 5. ONLINE RAZORPAY SUBSCRIPTION ORDER (BACKEND ENGINE)
 * Ready for automatic subscription checkout once platform keys are supplied in .env
 */
export async function createOnlineSubscriptionOrder(formData: FormData) {
  try {
    const auth = await getAuthenticatedAdminContext();
    if (!auth.authorized || !auth.user) {
      return { success: false, error: 'Unauthorized: Please log in.' };
    }

    const tenantId = formData.get('tenantId')?.toString()?.trim() || auth.tenantId;
    const plan = (formData.get('plan')?.toString() || 'pro') as SubscriptionPlan;
    const billingCycle = (formData.get('billingCycle')?.toString() || 'yearly') as 'monthly' | 'yearly';

    const platformKeyId = process.env.PLATFORM_RAZORPAY_KEY_ID;
    const platformKeySecret = process.env.PLATFORM_RAZORPAY_KEY_SECRET;

    // Graceful check if platform owner hasn't placed live API keys in .env yet
    if (!platformKeyId || !platformKeySecret) {
      return {
        success: false,
        code: 'GATEWAY_PENDING_CONFIG',
        message:
          'Online Razorpay SaaS checkout engine is fully structured and awaiting PLATFORM_RAZORPAY_KEY_ID & PLATFORM_RAZORPAY_KEY_SECRET in .env. Please use the "Offline Bank Transfer / UPI" option below, or submit transaction UTR for immediate verification.',
      };
    }

    const amountInr = billingCycle === 'yearly' ? SAAS_PLANS[plan].yearlyPrice : SAAS_PLANS[plan].monthlyPrice;
    const amountInPaise = Math.round(amountInr * 100);

    const authHeader = Buffer.from(`${platformKeyId}:${platformKeySecret}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `psh_sub_${Date.now()}`,
        notes: {
          tenant_id: tenantId,
          plan,
          billing_cycle: billingCycle,
          user_email: auth.user.email,
        },
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errData.error?.description || 'Failed to create Razorpay subscription order.',
      };
    }

    const orderData = await response.json();

    return {
      success: true,
      orderId: orderData.id,
      amount: orderData.amount,
      currency: orderData.currency,
      keyId: platformKeyId,
      plan,
      billingCycle,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error initiating online order.';
    return { success: false, error: message };
  }
}

/**
 * 6. VERIFY ONLINE RAZORPAY SUBSCRIPTION PAYMENT
 */
export async function verifyOnlineSubscriptionPayment(formData: FormData) {
  try {
    const auth = await getAuthenticatedAdminContext();
    if (!auth.authorized || !auth.user) {
      return { success: false, error: 'Unauthorized.' };
    }

    const tenantId = formData.get('tenantId')?.toString()?.trim() || auth.tenantId;
    const orderId = formData.get('orderId')?.toString()?.trim();
    const paymentId = formData.get('paymentId')?.toString()?.trim();
    const signature = formData.get('signature')?.toString()?.trim();
    const plan = (formData.get('plan')?.toString() || 'pro') as SubscriptionPlan;
    const billingCycle = (formData.get('billingCycle')?.toString() || 'yearly') as 'monthly' | 'yearly';

    const platformKeySecret = process.env.PLATFORM_RAZORPAY_KEY_SECRET;
    if (!platformKeySecret) {
      return { success: false, error: 'Platform payment gateway secret missing.' };
    }

    if (!orderId || !paymentId || !signature) {
      return { success: false, error: 'Incomplete payment verification payload.' };
    }

    // Verify HMAC SHA256 Signature
    const expectedSignature = crypto
      .createHmac('sha256', platformKeySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (expectedSignature !== signature) {
      return { success: false, error: 'Payment signature mismatch. Tampering detected.' };
    }

    // Payment is valid! Auto-activate subscription
    const adminDb = createAdminClient();
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('settings, name')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      return { success: false, error: 'Resort record not found.' };
    }

    const durationMonths = billingCycle === 'yearly' ? 12 : 1;
    const activeDate = new Date();
    activeDate.setMonth(activeDate.getMonth() + durationMonths);

    const amountInr = billingCycle === 'yearly' ? SAAS_PLANS[plan].yearlyPrice : SAAS_PLANS[plan].monthlyPrice;
    const settings = (tenant.settings as Record<string, unknown>) || {};
    const existingSub = (settings.subscription as TenantSubscription) || {
      status: 'trial',
      plan,
      payment_mode: 'online_razorpay',
    };

    const newRecord: TenantSubscriptionPaymentRecord = {
      id: `rzp_${paymentId}`,
      date: new Date().toISOString(),
      amount: amountInr,
      plan,
      billing_cycle: billingCycle,
      mode: 'online_razorpay',
      reference: paymentId,
      status: 'approved',
      approved_by: 'RAZORPAY_AUTOPROCESS',
    };

    const history = Array.isArray(existingSub.payment_history) ? [...existingSub.payment_history] : [];
    history.unshift(newRecord);

    const updatedSub: TenantSubscription = {
      ...existingSub,
      status: 'active',
      plan,
      billing_cycle: billingCycle,
      payment_mode: 'online_razorpay',
      amount_inr: amountInr,
      active_until: activeDate.toISOString(),
      approved_at: new Date().toISOString(),
      approved_by: 'RAZORPAY_AUTO_SYSTEM',
      payment_history: history,
    };

    await adminDb
      .from('tenants')
      .update({
        is_active: true,
        settings: {
          ...settings,
          subscription: updatedSub,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    revalidatePath('/settings/subscription');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: 'Payment verified successfully! Your resort subscription is now fully active.',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error verifying online payment.';
    return { success: false, error: message };
  }
}

/**
 * 7. SUPERADMIN: GET ALL PENDING APPROVAL REQUESTS ACROSS TENANTS
 */
export async function getPendingSubscriptionRequests() {
  try {
    const auth = await getAuthenticatedAdminContext();
    if (!auth.authorized || !auth.user || !isSuperadmin(auth.user.email)) {
      return { success: false, data: [] };
    }

    const adminDb = createAdminClient();
    const { data: tenants, error } = await adminDb
      .from('tenants')
      .select('id, name, subdomain, settings, created_at')
      .order('created_at', { ascending: false });

    if (error || !tenants) {
      return { success: false, data: [] };
    }

    const pending = tenants
      .filter((t) => {
        const sub = (t.settings as Record<string, unknown>)?.subscription as TenantSubscription | undefined;
        return sub?.status === 'pending_approval';
      })
      .map((t) => {
        const sub = (t.settings as Record<string, unknown>).subscription as TenantSubscription;
        return {
          tenantId: t.id,
          tenantName: t.name,
          subdomain: t.subdomain,
          plan: sub.plan,
          billingCycle: sub.billing_cycle || 'yearly',
          amountInr: sub.amount_inr,
          utrReference: sub.offline_reference,
          notes: sub.offline_notes,
          submittedAt: sub.submitted_at,
        };
      });

    return { success: true, data: pending };
  } catch {
    return { success: false, data: [] };
  }
}
