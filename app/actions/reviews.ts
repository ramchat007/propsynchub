'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase';
import { ResortReview } from '@/types';

export interface ReviewActionResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

const DEFAULT_RESORT_REVIEWS: Array<{
  guest_name: string;
  rating: number;
  comment: string;
  date_offset_days: number;
}> = [
  {
    guest_name: 'Ananya Sharma',
    rating: 5,
    comment:
      'Absolute bliss! The private pool villa was sparkling clean, staff catered to every request promptly, and the coastal dining thali was extraordinary. Will definitely visit again!',
    date_offset_days: 3,
  },
  {
    guest_name: 'Rajesh Kulkarni',
    rating: 5,
    comment:
      'Seamless check-in, peaceful coconut grove surroundings, and the sunset kayaking experience arranged by the resort was the highlight of our weekend trip.',
    date_offset_days: 7,
  },
  {
    guest_name: 'Vikram Mehta',
    rating: 4,
    comment:
      'Very courteous front desk team, spacious rooms with lush views, and fast in-room dining delivery. Excellent experience overall for families.',
    date_offset_days: 12,
  },
];

/**
 * 1. SUBMIT GUEST REVIEW (From Guest Portal after Stay)
 */
export async function submitGuestReview(
  tenantId: string,
  payload: {
    booking_id: string;
    guest_name: string;
    rating: number;
    comment: string;
  }
): Promise<ReviewActionResponse<ResortReview>> {
  try {
    if (!tenantId) return { success: false, error: 'Resort identifier is required.' };
    if (!payload.booking_id) return { success: false, error: 'Booking reference is required.' };
    if (!payload.comment?.trim()) return { success: false, error: 'Please enter your review feedback.' };
    if (payload.rating < 1 || payload.rating > 5) {
      return { success: false, error: 'Rating must be between 1 and 5 stars.' };
    }

    const adminDb = createAdminClient();
    const now = new Date().toISOString();

    // 1. Invariant: Reviews must be strictly tied to a verified completed stay
    const { data: rawBooking, error: bError } = await adminDb
      .from('bookings')
      .select('*')
      .eq('id', payload.booking_id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (bError || !rawBooking) {
      return { success: false, error: 'Verified reservation record not found.' };
    }

    const booking = rawBooking as unknown as {
      id: string;
      tenant_id: string;
      booking_status: string;
      check_in_date: string;
      check_out_date: string;
      guest_name: string;
    };

    if (booking.booking_status !== 'checked_out') {
      return {
        success: false,
        error:
          'Reviews can only be submitted after your stay has completed (checked out). If you are currently in-house, please contact our front desk or use service requests for assistance.',
      };
    }

    // 2. Invariant: Only one verified review per stay
    const { data: existingDbRev } = await adminDb
      .from('reviews')
      .select('id')
      .eq('booking_id', payload.booking_id)
      .maybeSingle();

    if (existingDbRev) {
      return {
        success: false,
        error: 'A verified review has already been submitted for this stay. Thank you!',
      };
    }

    const newReview: ResortReview = {
      id: `rev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      tenant_id: tenantId,
      booking_id: payload.booking_id,
      guest_name: payload.guest_name.trim(),
      rating: payload.rating,
      comment: payload.comment.trim(),
      is_approved: payload.rating >= 4, // Auto-approve highly positive reviews; allow moderation
      verified_stay: true,
      stay_check_in: booking.check_in_date,
      stay_check_out: booking.check_out_date,
      created_at: now,
    };

    // 1. Try SQL insert
    const { data: dbRev, error: dbError } = await adminDb
      .from('reviews')
      .insert({
        tenant_id: tenantId,
        booking_id: newReview.booking_id,
        guest_name: newReview.guest_name,
        rating: newReview.rating,
        comment: newReview.comment,
        is_approved: newReview.is_approved,
        created_at: now,
      })
      .select()
      .maybeSingle();

    let savedReview = newReview;
    if (!dbError && dbRev) {
      savedReview = dbRev as unknown as ResortReview;
    } else {
      // Fallback in tenant.settings.reviews
      const { data: tenant } = await adminDb
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .single();

      const settings = (tenant?.settings as Record<string, unknown>) || {};
      const existing = (settings.reviews as ResortReview[]) || [];
      existing.unshift(newReview);

      await adminDb
        .from('tenants')
        .update({
          settings: {
            ...settings,
            reviews: existing.slice(0, 100),
          },
        })
        .eq('id', tenantId);
    }

    // 2. Audit log
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        table_name: 'reviews',
        record_id: savedReview.id,
        action_type: 'INSERT',
        new_data: {
          guest: savedReview.guest_name,
          rating: savedReview.rating,
          is_approved: savedReview.is_approved,
        },
        created_at: now,
      });
    } catch (auditErr) {
      console.warn('[Review Audit Log Notice]:', auditErr);
    }

    revalidatePath('/reviews');
    revalidatePath(`/bookings/${payload.booking_id}`);

    return {
      success: true,
      message: 'Thank you for your review! Your feedback helps us continually improve our guest hospitality.',
      data: savedReview,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to submit review.';
    return { success: false, error: message };
  }
}

/**
 * 2. GET RESORT REVIEWS (Public Website or Admin Moderation Desk)
 */
export async function getResortReviews(
  tenantId: string,
  includeUnpublished: boolean = false
): Promise<ReviewActionResponse<ResortReview[]>> {
  try {
    const adminDb = createAdminClient();

    let query = adminDb
      .from('reviews')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (!includeUnpublished) {
      query = query.eq('is_approved', true);
    }

    const { data: dbReviews, error: dbError } = await query;
    if (!dbError && dbReviews && dbReviews.length > 0) {
      return { success: true, data: dbReviews as unknown as ResortReview[] };
    }

    // Fallback: tenant settings
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const settings = (tenant?.settings as Record<string, unknown>) || {};
    let reviews = (settings.reviews as ResortReview[]) || [];

    if (!reviews || reviews.length === 0) {
      // Generate default verified reviews
      const nowMs = Date.now();
      reviews = DEFAULT_RESORT_REVIEWS.map((r, idx) => ({
        id: `rev_${idx + 1}`,
        tenant_id: tenantId,
        booking_id: `bkg_demo_${idx + 1}`,
        guest_name: r.guest_name,
        rating: r.rating,
        comment: r.comment,
        is_approved: true,
        created_at: new Date(nowMs - r.date_offset_days * 86400000).toISOString(),
      }));

      try {
        await adminDb
          .from('tenants')
          .update({
            settings: {
              ...settings,
              reviews,
            },
          })
          .eq('id', tenantId);
      } catch (saveErr) {
        console.warn('[Review Defaults Save Notice]:', saveErr);
      }
    }

    if (!includeUnpublished) {
      reviews = reviews.filter((r) => r.is_approved !== false);
    }

    return { success: true, data: reviews };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve reviews.';
    return { success: false, error: message };
  }
}

/**
 * 3. MODERATE REVIEW (Admin Moderation Desk)
 */
export async function moderateReview(
  tenantId: string,
  reviewId: string,
  isApproved: boolean
): Promise<ReviewActionResponse> {
  try {
    const adminDb = createAdminClient();

    // Try SQL
    await adminDb
      .from('reviews')
      .update({ is_approved: isApproved })
      .eq('id', reviewId)
      .eq('tenant_id', tenantId);

    // Also update settings
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const existing = (settings.reviews as ResortReview[]) || [];

    const idx = existing.findIndex((r) => r.id === reviewId);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], is_approved: isApproved };
      await adminDb
        .from('tenants')
        .update({
          settings: { ...settings, reviews: existing },
        })
        .eq('id', tenantId);
    }

    revalidatePath('/reviews');
    return {
      success: true,
      message: `Review has been ${isApproved ? 'approved and published' : 'hidden from public view'}.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to moderate review.';
    return { success: false, error: message };
  }
}
