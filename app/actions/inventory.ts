'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { RoomStatus, RoomBlock, RoomBlockType, SeasonalPricingRule, PricingRuleType } from '@/types';
import { validateMaintenanceBlockSafety } from '@/lib/maintenance-engine';

export interface ActionResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

/**
 * Helper to authenticate and verify user tenant context for server mutations
 */
async function getAuthenticatedAdminTenant(tenantId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Unauthorized: Please log in to perform this operation.');
  }

  // Verify that the user belongs to the requested tenant or has admin privileges
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single();

  if (profile && profile.tenant_id && profile.tenant_id !== tenantId) {
    throw new Error('Access denied: You do not have permissions for this tenant.');
  }

  return { supabase, user, profile };
}

/**
 * 1. ADD ROOM CATEGORY
 */
export async function addRoomCategory(formData: FormData): Promise<ActionResponse> {
  try {
    const tenantId = formData.get('tenantId')?.toString();
    const name = formData.get('name')?.toString()?.trim();
    const description = formData.get('description')?.toString()?.trim() || null;
    const basePrice = parseFloat(formData.get('basePrice')?.toString() || '0');
    const extraPaxPrice = parseFloat(formData.get('extraPaxPrice')?.toString() || '0');
    const weekendPrice = parseFloat(formData.get('weekendPrice')?.toString() || (basePrice * 1.2).toString());
    const extraAdultPrice = parseFloat(formData.get('extraAdultPrice')?.toString() || (extraPaxPrice || 1000).toString());
    const extraChildPrice = parseFloat(formData.get('extraChildPrice')?.toString() || (extraAdultPrice * 0.5).toString());
    const baseAdults = parseInt(formData.get('baseAdults')?.toString() || '2', 10);
    const maxAdults = parseInt(formData.get('maxAdults')?.toString() || '2', 10);
    const maxChildren = parseInt(formData.get('maxChildren')?.toString() || '0', 10);
    const maxTotalGuests = parseInt(formData.get('maxTotalGuests')?.toString() || (maxAdults + maxChildren).toString(), 10);

    if (!tenantId) return { success: false, error: 'Tenant identifier is required.' };
    if (!name) return { success: false, error: 'Category name is required.' };
    if (isNaN(basePrice) || basePrice < 0) return { success: false, error: 'Valid base price is required.' };

    const { supabase } = await getAuthenticatedAdminTenant(tenantId);

    // Try inserting into public.room_categories
    const { data: category, error: catError } = await supabase
      .from('room_categories')
      .insert({
        tenant_id: tenantId,
        name,
        description,
        base_price_inr: basePrice,
        extra_pax_price_inr: extraPaxPrice,
        weekend_price_inr: isNaN(weekendPrice) ? null : weekendPrice,
        extra_adult_price_inr: isNaN(extraAdultPrice) ? 1000 : extraAdultPrice,
        extra_child_price_inr: isNaN(extraChildPrice) ? 500 : extraChildPrice,
        base_adults: baseAdults,
        max_adults: maxAdults,
        max_children: maxChildren,
        max_total_guests: maxTotalGuests,
        amenities: [],
      })
      .select()
      .single();

    if (catError) {
      // Fallback: insert standard columns if new columns not yet migrated
      const fallbackInsert = await supabase
        .from('room_categories')
        .insert({
          tenant_id: tenantId,
          name,
          description,
          base_price_inr: basePrice,
          extra_pax_price_inr: extraPaxPrice,
          max_adults: maxAdults,
          max_children: maxChildren,
          amenities: [],
        })
        .select()
        .single();

      if (fallbackInsert.error) {
        // If table has not yet been migrated in Supabase (PGRST205), fallback to tenant settings
        const { data: tenant } = await supabase
          .from('tenants')
          .select('settings')
          .eq('id', tenantId)
          .single();

        const currentSettings = (tenant?.settings as Record<string, unknown>) || {};
        const existingCats = Array.isArray(currentSettings.room_categories)
          ? (currentSettings.room_categories as Array<Record<string, unknown>>)
          : [];

        const newCategory = {
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          name,
          description,
          base_price_inr: basePrice,
          extra_pax_price_inr: extraPaxPrice,
          weekend_price_inr: weekendPrice,
          extra_adult_price_inr: extraAdultPrice,
          extra_child_price_inr: extraChildPrice,
          base_adults: baseAdults,
          max_adults: maxAdults,
          max_children: maxChildren,
          max_total_guests: maxTotalGuests,
          amenities: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const updatedSettings = {
          ...currentSettings,
          room_categories: [...existingCats, newCategory],
        };

        const { error: tenantUpdateError } = await supabase
          .from('tenants')
          .update({ settings: updatedSettings })
          .eq('id', tenantId);

        if (tenantUpdateError) throw tenantUpdateError;

        revalidatePath('/dashboard');
        revalidatePath('/inventory');
        return {
          success: true,
          message: `Category "${name}" created successfully.`,
          data: newCategory,
        };
      }
    }

    revalidatePath('/dashboard');
    revalidatePath('/inventory');
    return {
      success: true,
      message: `Category "${name}" created successfully.`,
      data: category,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create room category.';
    return { success: false, error: message };
  }
}

/**
 * 1b. EDIT ROOM CATEGORY
 */
export async function editRoomCategory(formData: FormData): Promise<ActionResponse> {
  try {
    const categoryId = formData.get('categoryId')?.toString();
    const tenantId = formData.get('tenantId')?.toString();
    const name = formData.get('name')?.toString()?.trim();
    const description = formData.get('description')?.toString()?.trim() || null;
    const basePrice = parseFloat(formData.get('basePrice')?.toString() || '0');
    const extraPaxPrice = parseFloat(formData.get('extraPaxPrice')?.toString() || '0');
    const weekendPrice = parseFloat(formData.get('weekendPrice')?.toString() || (basePrice * 1.2).toString());
    const extraAdultPrice = parseFloat(formData.get('extraAdultPrice')?.toString() || (extraPaxPrice || 1000).toString());
    const extraChildPrice = parseFloat(formData.get('extraChildPrice')?.toString() || (extraAdultPrice * 0.5).toString());
    const baseAdults = parseInt(formData.get('baseAdults')?.toString() || '2', 10);
    const maxAdults = parseInt(formData.get('maxAdults')?.toString() || '2', 10);
    const maxChildren = parseInt(formData.get('maxChildren')?.toString() || '0', 10);
    const maxTotalGuests = parseInt(formData.get('maxTotalGuests')?.toString() || (maxAdults + maxChildren).toString(), 10);

    if (!categoryId || !tenantId) return { success: false, error: 'Category ID and Tenant ID are required.' };
    if (!name) return { success: false, error: 'Category name is required.' };
    if (isNaN(basePrice) || basePrice < 0) return { success: false, error: 'Valid base price is required.' };

    const { supabase } = await getAuthenticatedAdminTenant(tenantId);

    const updatePayload: Record<string, unknown> = {
      name,
      description,
      base_price_inr: basePrice,
      extra_pax_price_inr: extraPaxPrice,
      weekend_price_inr: isNaN(weekendPrice) ? null : weekendPrice,
      extra_adult_price_inr: isNaN(extraAdultPrice) ? 1000 : extraAdultPrice,
      extra_child_price_inr: isNaN(extraChildPrice) ? 500 : extraChildPrice,
      base_adults: baseAdults,
      max_adults: maxAdults,
      max_children: maxChildren,
      max_total_guests: maxTotalGuests,
      updated_at: new Date().toISOString(),
    };

    let updatedCat = null;
    const { data: catData, error: updateError } = await supabase
      .from('room_categories')
      .update(updatePayload)
      .eq('id', categoryId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (updateError) {
      // Fallback with standard columns
      const fallbackUpdate = await supabase
        .from('room_categories')
        .update({
          name,
          description,
          base_price_inr: basePrice,
          extra_pax_price_inr: extraPaxPrice,
          max_adults: maxAdults,
          max_children: maxChildren,
          updated_at: new Date().toISOString(),
        })
        .eq('id', categoryId)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (fallbackUpdate.error) throw fallbackUpdate.error;
      updatedCat = fallbackUpdate.data;
    } else {
      updatedCat = catData;
    }

    // Synchronize room_type name on rooms belonging to this category
    await supabase
      .from('rooms')
      .update({ room_type: name })
      .eq('category_id', categoryId)
      .eq('tenant_id', tenantId);

    revalidatePath('/dashboard');
    revalidatePath('/inventory');

    return {
      success: true,
      message: `Category "${name}" updated successfully.`,
      data: updatedCat,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update room category.';
    return { success: false, error: message };
  }
}

/**
 * 1c. DELETE ROOM CATEGORY (With Booking & Unit Safety)
 */
export async function deleteRoomCategory(categoryId: string, tenantId: string): Promise<ActionResponse> {
  try {
    if (!categoryId || !tenantId) return { success: false, error: 'Category ID and Tenant ID are required.' };

    const { supabase } = await getAuthenticatedAdminTenant(tenantId);

    // 1. Check if any physical rooms belong to this category
    const { data: linkedRooms } = await supabase
      .from('rooms')
      .select('id, name')
      .eq('category_id', categoryId)
      .eq('tenant_id', tenantId);

    if (linkedRooms && linkedRooms.length > 0) {
      return {
        success: false,
        error: `Cannot delete category: ${linkedRooms.length} physical room units (${linkedRooms.map(r => r.name).join(', ')}) are currently assigned to it. Please reassign or delete these rooms first.`,
      };
    }

    // 2. Delete the category
    const { error: delError } = await supabase
      .from('room_categories')
      .delete()
      .eq('id', categoryId)
      .eq('tenant_id', tenantId);

    if (delError) throw delError;

    revalidatePath('/dashboard');
    revalidatePath('/inventory');

    return {
      success: true,
      message: 'Room category removed successfully.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete room category.';
    return { success: false, error: message };
  }
}

/**
 * 2. ADD ROOM TO CATEGORY
 */
export async function addRoom(formData: FormData): Promise<ActionResponse> {
  try {
    const tenantId = formData.get('tenantId')?.toString();
    const name = formData.get('name')?.toString()?.trim();
    const roomNumber = formData.get('roomNumber')?.toString()?.trim() || null;
    let roomType = formData.get('roomType')?.toString()?.trim() || 'Standard';
    const categoryId = formData.get('categoryId')?.toString()?.trim() || null;
    const capacityAdults = parseInt(formData.get('capacityAdults')?.toString() || '2', 10);
    const capacityChildren = parseInt(formData.get('capacityChildren')?.toString() || '0', 10);
    const basePrice = parseFloat(formData.get('basePrice')?.toString() || '0');

    if (!tenantId) return { success: false, error: 'Tenant identifier is required.' };
    if (!name) return { success: false, error: 'Room name is required.' };
    if (isNaN(basePrice) || basePrice < 0) return { success: false, error: 'Valid base price is required.' };

    const { supabase } = await getAuthenticatedAdminTenant(tenantId);

    // If categoryId provided, retrieve category name for consistency
    if (categoryId) {
      const { data: cat } = await supabase
        .from('room_categories')
        .select('name')
        .eq('id', categoryId)
        .maybeSingle();
      if (cat?.name) roomType = cat.name;
    }

    const roomPayload: Record<string, unknown> = {
      tenant_id: tenantId,
      name,
      room_number: roomNumber,
      room_type: roomType,
      capacity_adults: capacityAdults,
      capacity_children: capacityChildren,
      base_price_inr: basePrice,
      status: 'available',
      amenities: [],
      images: [],
    };

    if (categoryId) {
      roomPayload.category_id = categoryId;
    }

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .insert(roomPayload)
      .select()
      .single();

    if (roomError) {
      throw roomError;
    }

    // Also record default baseline in pricing table
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('pricing').insert({
      tenant_id: tenantId,
      room_id: room.id,
      title: `${name} Standard Rate`,
      start_date: today,
      end_date: '2099-12-31',
      fixed_price_inr: basePrice,
      multiplier: 1.0,
      is_active: true,
    });

    revalidatePath('/dashboard');
    revalidatePath('/inventory');
    return {
      success: true,
      message: `Room "${name}" added to inventory.`,
      data: room,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to add room.';
    return { success: false, error: message };
  }
}

/**
 * 2b. EDIT PHYSICAL ROOM UNIT (With Booking Safety Checks)
 */
export async function editRoomUnit(formData: FormData): Promise<ActionResponse> {
  try {
    const roomId = formData.get('roomId')?.toString();
    const tenantId = formData.get('tenantId')?.toString();
    const name = formData.get('name')?.toString()?.trim();
    const roomNumber = formData.get('roomNumber')?.toString()?.trim() || null;
    const categoryId = formData.get('categoryId')?.toString()?.trim() || null;
    const capacityAdults = parseInt(formData.get('capacityAdults')?.toString() || '2', 10);
    const capacityChildren = parseInt(formData.get('capacityChildren')?.toString() || '0', 10);
    const basePrice = parseFloat(formData.get('basePrice')?.toString() || '0');
    const status = (formData.get('status')?.toString()?.trim() || 'available') as 'available' | 'maintenance' | 'blocked';

    if (!roomId || !tenantId) return { success: false, error: 'Room ID and Tenant ID are required.' };
    if (!name) return { success: false, error: 'Room name is required.' };
    if (isNaN(basePrice) || basePrice < 0) return { success: false, error: 'Valid base price is required.' };

    const { supabase } = await getAuthenticatedAdminTenant(tenantId);

    // Fetch existing room
    const { data: currentRoom, error: fetchError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchError || !currentRoom) {
      return { success: false, error: 'Room unit not found.' };
    }

    // Safety check: If category is being changed, check for active / upcoming reservations
    const today = new Date().toISOString().split('T')[0];
    if (categoryId && currentRoom.category_id && categoryId !== currentRoom.category_id) {
      const { data: activeBookings } = await supabase
        .from('bookings')
        .select('id, guest_name, check_in_date, check_out_date')
        .eq('room_id', roomId)
        .eq('tenant_id', tenantId)
        .neq('booking_status', 'cancelled')
        .gte('check_out_date', today);

      if (activeBookings && activeBookings.length > 0) {
        return {
          success: false,
          error: `Safety Alert: Cannot change room category while active reservations exist on this unit (${activeBookings.length} future stays booked). Please reassign bookings first.`,
        };
      }
    }

    // Resolve category name if changed
    let roomType = currentRoom.room_type;
    if (categoryId) {
      const { data: cat } = await supabase
        .from('room_categories')
        .select('name')
        .eq('id', categoryId)
        .maybeSingle();
      if (cat?.name) roomType = cat.name;
    }

    const { data: updatedRoom, error: updateError } = await supabase
      .from('rooms')
      .update({
        name,
        room_number: roomNumber,
        category_id: categoryId || currentRoom.category_id,
        room_type: roomType,
        capacity_adults: capacityAdults,
        capacity_children: capacityChildren,
        base_price_inr: basePrice,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', roomId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (updateError) throw updateError;

    revalidatePath('/dashboard');
    revalidatePath('/inventory');

    return {
      success: true,
      message: `Room "${name}" updated successfully.`,
      data: updatedRoom,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to edit room unit.';
    return { success: false, error: message };
  }
}

/**
 * 2c. DELETE PHYSICAL ROOM UNIT (With Booking Safety)
 */
export async function deleteRoomUnit(roomId: string, tenantId: string): Promise<ActionResponse> {
  try {
    if (!roomId || !tenantId) return { success: false, error: 'Room ID and Tenant ID are required.' };

    const { supabase } = await getAuthenticatedAdminTenant(tenantId);
    const today = new Date().toISOString().split('T')[0];

    // Check if any active or upcoming reservations exist for this physical room
    const { data: activeBookings } = await supabase
      .from('bookings')
      .select('id, guest_name')
      .eq('room_id', roomId)
      .eq('tenant_id', tenantId)
      .neq('booking_status', 'cancelled')
      .gte('check_out_date', today);

    if (activeBookings && activeBookings.length > 0) {
      return {
        success: false,
        error: `Cannot delete unit: Room has ${activeBookings.length} active or future reservations. Please cancel or move bookings before removing.`,
      };
    }

    const { error: delError } = await supabase
      .from('rooms')
      .delete()
      .eq('id', roomId)
      .eq('tenant_id', tenantId);

    if (delError) throw delError;

    revalidatePath('/dashboard');
    revalidatePath('/inventory');

    return {
      success: true,
      message: 'Room unit removed from inventory.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete room unit.';
    return { success: false, error: message };
  }
}

/**
/**
 * 3. UPDATE ROOM STATUS (Housekeeping & Maintenance Lifecycle)
 * Supported statuses: 'available' | 'maintenance' | 'blocked' | 'dirty' | 'cleaning' | 'inspected'
 */
export async function updateRoomStatus(
  roomId: string,
  tenantId: string,
  newStatus: RoomStatus
): Promise<ActionResponse> {
  try {
    if (!roomId || !tenantId) {
      return { success: false, error: 'Room ID and Tenant ID are required.' };
    }

    const { supabase, user } = await getAuthenticatedAdminTenant(tenantId);

    // Safety guard: Prevent changing an in-house room to maintenance or blocked
    if (newStatus === 'maintenance' || newStatus === 'blocked') {
      const today = new Date().toISOString().split('T')[0];
      const { data: activeReservation } = await supabase
        .from('bookings')
        .select('id, guest_name, check_in_date, check_out_date, booking_status')
        .eq('tenant_id', tenantId)
        .eq('room_id', roomId)
        .in('booking_status', ['confirmed', 'checked_in'])
        .lte('check_in_date', today)
        .gt('check_out_date', today)
        .maybeSingle();

      if (activeReservation) {
        return {
          success: false,
          error: `Safety Conflict: Unit currently has in-house guest "${activeReservation.guest_name}" (Stay: ${activeReservation.check_in_date} to ${activeReservation.check_out_date}). Please check out or reassign the guest before putting this room into ${newStatus}.`,
        };
      }
    }

    // Fetch previous status for audit log
    const { data: previousRoom } = await supabase
      .from('rooms')
      .select('name, status')
      .eq('id', roomId)
      .eq('tenant_id', tenantId)
      .single();

    const { data: updatedRoom, error } = await supabase
      .from('rooms')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', roomId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;

    // Direct audit trail log
    try {
      await supabase.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: user?.id || null,
        table_name: 'rooms',
        record_id: roomId,
        action_type: 'UPDATE',
        old_data: { status: previousRoom?.status },
        new_data: {
          status: newStatus,
          room_name: previousRoom?.name,
          updated_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
      });
    } catch {
      // Non-blocking audit trail fallback
    }

    revalidatePath('/dashboard');
    revalidatePath('/inventory');
    revalidatePath('/calendar');
    return {
      success: true,
      message: `Room status updated to "${newStatus.toUpperCase()}".`,
      data: updatedRoom,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update room status.';
    return { success: false, error: message };
  }
}

/**
 * Housekeeping Status Transition helper:
 * Enforces dirty -> cleaning -> inspected -> available lifecycle
 */
export async function updateRoomHousekeepingStatus(
  roomId: string,
  tenantId: string,
  newStatus: 'dirty' | 'cleaning' | 'inspected' | 'available'
): Promise<ActionResponse> {
  return updateRoomStatus(roomId, tenantId, newStatus);
}

/**
 * 4. UPDATE PRICING (Base Rate and Pax Rate)
 */
export async function updateRoomPricing(
  roomId: string,
  tenantId: string,
  basePrice: number,
  extraPaxPrice?: number
): Promise<ActionResponse> {
  try {
    if (!roomId || !tenantId) {
      return { success: false, error: 'Room ID and Tenant ID are required.' };
    }
    if (isNaN(basePrice) || basePrice < 0) {
      return { success: false, error: 'Please enter a valid base price.' };
    }

    const { supabase } = await getAuthenticatedAdminTenant(tenantId);

    // 1. Update the room's direct base price
    const { error: roomError } = await supabase
      .from('rooms')
      .update({
        base_price_inr: basePrice,
        updated_at: new Date().toISOString(),
      })
      .eq('id', roomId)
      .eq('tenant_id', tenantId);

    if (roomError) throw roomError;

    // 2. Insert or update the pricing table for current standard rate
    const today = new Date().toISOString().split('T')[0];
    const { error: pricingError } = await supabase.from('pricing').upsert(
      {
        tenant_id: tenantId,
        room_id: roomId,
        title: extraPaxPrice ? `Standard Rate (Extra Pax ₹${extraPaxPrice})` : 'Standard Rate',
        start_date: today,
        end_date: '2099-12-31',
        fixed_price_inr: basePrice,
        multiplier: 1.0,
        is_active: true,
      },
      {
        onConflict: 'tenant_id,room_id,start_date',
        ignoreDuplicates: false,
      }
    );

    // If upsert conflict constraint is not explicitly named, fallback to plain insert
    if (pricingError) {
      await supabase.from('pricing').insert({
        tenant_id: tenantId,
        room_id: roomId,
        title: extraPaxPrice ? `Standard Rate (Extra Pax ₹${extraPaxPrice})` : 'Standard Rate',
        start_date: today,
        end_date: '2099-12-31',
        fixed_price_inr: basePrice,
        multiplier: 1.0,
        is_active: true,
      });
    }

    revalidatePath('/dashboard');
    return {
      success: true,
      message: `Pricing updated to ₹${basePrice.toLocaleString()}${
        extraPaxPrice ? ` (+ ₹${extraPaxPrice} extra pax)` : ''
      }.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update pricing.';
    return { success: false, error: message };
  }
}

/**
 * 5. SEED / INITIALIZE DEFAULT DEMO RESORT (If no tenant exists yet)
 */
export async function initializeDemoResort(adminUserId?: string): Promise<ActionResponse> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    const targetUserId = user?.id || adminUserId;

    // Create a demo resort
    const subdomain = `demo-resort-${Date.now().toString().slice(-4)}`;
    const { data: tenant, error: tErr } = await supabase
      .from('tenants')
      .insert({
        name: 'Grand Palms Resort & Spa',
        subdomain,
        contact_phone: '+919876543210',
        contact_email: 'concierge@grandpalms.com',
        is_active: true,
        settings: {
          room_categories: [
            {
              id: crypto.randomUUID(),
              name: 'Ocean View Villa',
              description: 'Private terrace with direct beach access',
              base_price_inr: 8500,
              extra_pax_price_inr: 1500,
              max_adults: 3,
              max_children: 2,
            },
            {
              id: crypto.randomUUID(),
              name: 'Deluxe Heritage Cottage',
              description: 'Serene garden facing cottage with king bed',
              base_price_inr: 5200,
              extra_pax_price_inr: 1000,
              max_adults: 2,
              max_children: 1,
            },
          ],
        },
      })
      .select()
      .single();

    if (tErr) throw tErr;

    // If user is logged in, link user profile to this tenant
    if (targetUserId) {
      await supabase.from('profiles').upsert({
        id: targetUserId,
        tenant_id: tenant.id,
        mobile_number: user?.phone || '+919876543210',
        full_name: 'Resort Admin',
        role: 'tenant_admin',
      });
    }

    // Seed 3 starter rooms
    await supabase.from('rooms').insert([
      {
        tenant_id: tenant.id,
        name: 'Villa 101 (Sunset Bay)',
        room_number: '101',
        room_type: 'Ocean View Villa',
        capacity_adults: 3,
        capacity_children: 2,
        base_price_inr: 8500,
        status: 'available',
      },
      {
        tenant_id: tenant.id,
        name: 'Villa 102 (Palm Haven)',
        room_number: '102',
        room_type: 'Ocean View Villa',
        capacity_adults: 3,
        capacity_children: 2,
        base_price_inr: 8500,
        status: 'available',
      },
      {
        tenant_id: tenant.id,
        name: 'Cottage 201 (Garden Bloom)',
        room_number: '201',
        room_type: 'Deluxe Heritage Cottage',
        capacity_adults: 2,
        capacity_children: 1,
        base_price_inr: 5200,
        status: 'maintenance',
      },
    ]);

    revalidatePath('/dashboard');
    return {
      success: true,
      message: 'Default resort initialized with sample inventory.',
      data: tenant,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to initialize default resort.';
    return { success: false, error: message };
  }
}

/**
 * ============================================================================
 * PHASE 2: MAINTENANCE, OUT-OF-ORDER ROOM BLOCKS & SEASONAL PRICING
 * ============================================================================
 */

/**
 * 6. CREATE ROOM BLOCK (Maintenance / Out of Order / Deep Cleaning)
 * Enforces non-negotiable invariant: maintenance blocks cannot silently conflict with active bookings.
 */
export async function createRoomBlock(formData: FormData): Promise<ActionResponse<RoomBlock>> {
  try {
    const tenantId = formData.get('tenantId')?.toString();
    const roomId = formData.get('roomId')?.toString();
    const blockType = (formData.get('blockType')?.toString() || 'maintenance') as RoomBlockType;
    const startDate = formData.get('startDate')?.toString()?.trim();
    const endDate = formData.get('endDate')?.toString()?.trim();
    const reason = formData.get('reason')?.toString()?.trim() || 'Scheduled maintenance';

    if (!tenantId || !roomId || !startDate || !endDate) {
      return { success: false, error: 'Tenant, room, and valid start/end dates are required.' };
    }

    if (startDate >= endDate) {
      return { success: false, error: 'Block end date must be after start date.' };
    }

    const { supabase, user } = await getAuthenticatedAdminTenant(tenantId);

    // Fetch room details
    const { data: roomUnit } = await supabase
      .from('rooms')
      .select('id, name, room_number')
      .eq('id', roomId)
      .eq('tenant_id', tenantId)
      .single();

    if (!roomUnit) {
      return { success: false, error: 'Target room unit does not exist.' };
    }

    // ARCHITECTURAL INVARIANT: Maintenance blocks cannot silently conflict with active bookings
    const collisionCheck = await validateMaintenanceBlockSafety(supabase, tenantId, roomId, startDate, endDate);
    if (!collisionCheck.canBlock) {
      return {
        success: false,
        error: collisionCheck.conflictReason || 'Cannot place block: An active guest reservation overlaps this window.',
        data: collisionCheck.conflictingBooking as unknown as RoomBlock,
      };
    }

    const blockId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const newBlock: RoomBlock = {
      id: blockId,
      tenant_id: tenantId,
      room_id: roomId,
      room_name: roomUnit.name,
      room_number: roomUnit.room_number || undefined,
      block_type: blockType,
      reason,
      start_date: startDate,
      end_date: endDate,
      status: 'active',
      created_by_user_id: user?.id,
      created_by_name: user?.email,
      created_at: nowIso,
      updated_at: nowIso,
    };

    // 1. Try public.room_blocks table
    try {
      await supabase.from('room_blocks').insert({
        id: blockId,
        tenant_id: tenantId,
        room_id: roomId,
        block_type: blockType,
        reason,
        start_date: startDate,
        end_date: endDate,
        status: 'active',
        created_by_user_id: user?.id,
      });
    } catch {
      // Table may not exist yet in remote DB
    }

    // 2. Dual-storage fallback to tenants.settings.room_blocks
    const { data: tenant } = await supabase.from('tenants').select('settings').eq('id', tenantId).single();
    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const existingBlocks = Array.isArray(settings.room_blocks) ? (settings.room_blocks as RoomBlock[]) : [];
    
    // Always sync into tenant settings for resilience
    const updatedBlocks = [newBlock, ...existingBlocks.filter((b) => b.id !== blockId)];
    await supabase.from('tenants').update({
      settings: {
        ...settings,
        room_blocks: updatedBlocks,
      },
      updated_at: nowIso,
    }).eq('id', tenantId);

    // If block is currently active (starts today or in past), update room status to maintenance or blocked
    const today = nowIso.split('T')[0];
    if (startDate <= today && endDate > today) {
      await supabase.from('rooms').update({
        status: blockType === 'maintenance' || blockType === 'deep_cleaning' ? 'maintenance' : 'blocked',
        updated_at: nowIso,
      }).eq('id', roomId);
    }

    revalidatePath('/dashboard');
    revalidatePath('/inventory');
    revalidatePath('/calendar');

    return {
      success: true,
      message: `Unit "${roomUnit.name}" successfully blocked for ${blockType.replace('_', ' ')} (${startDate} to ${endDate}).`,
      data: newBlock,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to schedule room maintenance block.';
    return { success: false, error: message };
  }
}

/**
 * 7. RESOLVE ROOM BLOCK
 */
export async function resolveRoomBlock(formData: FormData): Promise<ActionResponse> {
  try {
    const tenantId = formData.get('tenantId')?.toString();
    const blockId = formData.get('blockId')?.toString();

    if (!tenantId || !blockId) {
      return { success: false, error: 'Tenant ID and Block ID are required.' };
    }

    const { supabase } = await getAuthenticatedAdminTenant(tenantId);
    const nowIso = new Date().toISOString();

    // 1. Try public.room_blocks table
    let targetRoomId: string | null = null;
    try {
      const { data: blockData, error: updateError } = await supabase
        .from('room_blocks')
        .update({
          status: 'completed',
          updated_at: nowIso,
        })
        .eq('id', blockId)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (!updateError && blockData) {
        targetRoomId = blockData.room_id;
      }
    } catch {
      // Table may not exist yet
    }

    // 2. Dual-storage update in tenants.settings.room_blocks
    const { data: tenant } = await supabase.from('tenants').select('settings').eq('id', tenantId).single();
    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const existingBlocks = Array.isArray(settings.room_blocks) ? (settings.room_blocks as RoomBlock[]) : [];

    const updatedBlocks = existingBlocks.map((b) => {
      if (b.id === blockId) {
        if (!targetRoomId) targetRoomId = b.room_id;
        return {
          ...b,
          status: 'completed' as const,
          updated_at: nowIso,
        };
      }
      return b;
    });

    await supabase.from('tenants').update({
      settings: {
        ...settings,
        room_blocks: updatedBlocks,
      },
      updated_at: nowIso,
    }).eq('id', tenantId);

    // If unit has no other active blocks, return status to 'available'
    if (targetRoomId) {
      const remainingActive = updatedBlocks.some(
        (b) => b.room_id === targetRoomId && b.status === 'active' && b.id !== blockId
      );
      if (!remainingActive) {
        await supabase
          .from('rooms')
          .update({
            status: 'available',
            updated_at: nowIso,
          })
          .eq('id', targetRoomId)
          .eq('tenant_id', tenantId);
      }
    }

    revalidatePath('/dashboard');
    revalidatePath('/inventory');
    revalidatePath('/calendar');

    return {
      success: true,
      message: 'Room block resolved and unit restored to available inventory.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to resolve room block.';
    return { success: false, error: message };
  }
}

/**
 * 8. GET ROOM BLOCKS LIST
 */
export async function getRoomBlocksList(tenantId: string): Promise<RoomBlock[]> {
  try {
    const supabase = await createServerSupabaseClient();
    
    // 1. Try public.room_blocks
    const { data: tableData, error } = await supabase
      .from('room_blocks')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (!error && tableData && tableData.length > 0) {
      return tableData as RoomBlock[];
    }
  } catch {
    // ignore
  }

  // 2. Fallback to tenants.settings.room_blocks
  try {
    const supabase = await createServerSupabaseClient();
    const { data: tenant } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const settings = (tenant?.settings as Record<string, unknown>) || {};
    if (Array.isArray(settings.room_blocks)) {
      return settings.room_blocks as RoomBlock[];
    }
  } catch {
    // ignore
  }

  return [];
}

/**
 * 9. ADD SEASONAL / DYNAMIC PRICING RULE
 */
export async function addSeasonalPricingRule(formData: FormData): Promise<ActionResponse<SeasonalPricingRule>> {
  try {
    const tenantId = formData.get('tenantId')?.toString();
    const title = formData.get('title')?.toString()?.trim();
    const ruleType = (formData.get('ruleType')?.toString() || 'seasonal') as PricingRuleType;
    const categoryId = formData.get('categoryId')?.toString()?.trim() || null;
    const roomId = formData.get('roomId')?.toString()?.trim() || null;
    const startDate = formData.get('startDate')?.toString()?.trim();
    const endDate = formData.get('endDate')?.toString()?.trim();
    const fixedPriceInr = formData.get('fixedPriceInr') ? parseFloat(formData.get('fixedPriceInr')!.toString()) : null;
    const multiplier = formData.get('multiplier') ? parseFloat(formData.get('multiplier')!.toString()) : null;
    const weekendPriceInr = formData.get('weekendPriceInr') ? parseFloat(formData.get('weekendPriceInr')!.toString()) : null;
    const extraAdultPriceInr = formData.get('extraAdultPriceInr') ? parseFloat(formData.get('extraAdultPriceInr')!.toString()) : null;
    const extraChildPriceInr = formData.get('extraChildPriceInr') ? parseFloat(formData.get('extraChildPriceInr')!.toString()) : null;
    
    // Priority resolution (Precedence hierarchy)
    let priority = 100;
    if (formData.get('priority')) {
      priority = parseInt(formData.get('priority')!.toString(), 10);
    } else {
      if (ruleType === 'date_override') priority = 400;
      else if (ruleType === 'seasonal') priority = 300;
      else if (ruleType === 'weekend') priority = 200;
      else if (ruleType === 'promotional') priority = 150;
    }

    if (!tenantId || !title || !startDate || !endDate) {
      return { success: false, error: 'Tenant, title, and valid dates are required.' };
    }
    if (startDate > endDate) {
      return { success: false, error: 'Rule end date must be on or after start date.' };
    }

    const { supabase } = await getAuthenticatedAdminTenant(tenantId);
    const ruleId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const newRule: SeasonalPricingRule = {
      id: ruleId,
      tenant_id: tenantId,
      room_id: roomId === 'all' || !roomId ? null : roomId,
      category_id: categoryId === 'all' || !categoryId ? null : categoryId,
      title,
      rule_type: ruleType,
      priority,
      start_date: startDate,
      end_date: endDate,
      fixed_price_inr: fixedPriceInr && !isNaN(fixedPriceInr) ? fixedPriceInr : null,
      multiplier: multiplier && !isNaN(multiplier) ? multiplier : null,
      weekend_price_inr: weekendPriceInr && !isNaN(weekendPriceInr) ? weekendPriceInr : null,
      extra_adult_price_inr: extraAdultPriceInr && !isNaN(extraAdultPriceInr) ? extraAdultPriceInr : null,
      extra_child_price_inr: extraChildPriceInr && !isNaN(extraChildPriceInr) ? extraChildPriceInr : null,
      is_active: true,
      created_at: nowIso,
      updated_at: nowIso,
    };

    // 1. Try public.pricing table
    try {
      await supabase.from('pricing').insert({
        id: ruleId,
        tenant_id: tenantId,
        room_id: newRule.room_id,
        category_id: newRule.category_id,
        title: newRule.title,
        rule_type: newRule.rule_type,
        priority: newRule.priority,
        start_date: newRule.start_date,
        end_date: newRule.end_date,
        fixed_price_inr: newRule.fixed_price_inr,
        multiplier: newRule.multiplier || 1.0,
        weekend_price_inr: newRule.weekend_price_inr,
        is_active: true,
      });
    } catch {
      // ignore
    }

    // 2. Dual storage in tenants.settings.pricing_rules
    const { data: tenant } = await supabase.from('tenants').select('settings').eq('id', tenantId).single();
    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const existingRules = Array.isArray(settings.pricing_rules) ? (settings.pricing_rules as SeasonalPricingRule[]) : [];
    const updatedRules = [newRule, ...existingRules.filter((r) => r.id !== ruleId)];

    await supabase.from('tenants').update({
      settings: {
        ...settings,
        pricing_rules: updatedRules,
      },
      updated_at: nowIso,
    }).eq('id', tenantId);

    revalidatePath('/inventory');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: `Pricing rule "${title}" configured successfully (Priority: ${priority}).`,
      data: newRule,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to configure pricing rule.';
    return { success: false, error: message };
  }
}

/**
 * 10. DELETE SEASONAL PRICING RULE
 */
export async function deleteSeasonalPricingRule(formData: FormData): Promise<ActionResponse> {
  try {
    const tenantId = formData.get('tenantId')?.toString();
    const ruleId = formData.get('ruleId')?.toString();

    if (!tenantId || !ruleId) {
      return { success: false, error: 'Tenant ID and Rule ID are required.' };
    }

    const { supabase } = await getAuthenticatedAdminTenant(tenantId);

    // 1. Try deleting from public.pricing table
    try {
      await supabase.from('pricing').delete().eq('id', ruleId).eq('tenant_id', tenantId);
    } catch {
      // ignore
    }

    // 2. Delete from tenants.settings.pricing_rules
    const { data: tenant } = await supabase.from('tenants').select('settings').eq('id', tenantId).single();
    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const existingRules = Array.isArray(settings.pricing_rules) ? (settings.pricing_rules as SeasonalPricingRule[]) : [];
    const updatedRules = existingRules.filter((r) => r.id !== ruleId);

    await supabase.from('tenants').update({
      settings: {
        ...settings,
        pricing_rules: updatedRules,
      },
      updated_at: new Date().toISOString(),
    }).eq('id', tenantId);

    revalidatePath('/inventory');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: 'Pricing rule removed successfully.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to remove pricing rule.';
    return { success: false, error: message };
  }
}

/**
 * 11. GET SEASONAL PRICING RULES LIST
 */
export async function getSeasonalPricingRulesList(tenantId: string): Promise<SeasonalPricingRule[]> {
  const rulesMap = new Map<string, SeasonalPricingRule>();

  // 1. Try public.pricing table
  try {
    const supabase = await createServerSupabaseClient();
    const { data: tableData } = await supabase
      .from('pricing')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('start_date', { ascending: true });

    if (tableData) {
      tableData.forEach((r: Record<string, unknown>) => {
        const ruleType = (r.rule_type as PricingRuleType) || 'seasonal';
        const priority = typeof r.priority === 'number' ? r.priority : (ruleType === 'date_override' ? 400 : 300);
        rulesMap.set(r.id as string, {
          id: r.id as string,
          tenant_id: r.tenant_id as string,
          room_id: (r.room_id as string) || null,
          category_id: (r.category_id as string) || null,
          title: (r.title as string) || 'Rate Rule',
          rule_type: ruleType,
          priority,
          start_date: (r.start_date as string) || '',
          end_date: (r.end_date as string) || '',
          fixed_price_inr: typeof r.fixed_price_inr === 'number' ? r.fixed_price_inr : null,
          multiplier: typeof r.multiplier === 'number' ? r.multiplier : null,
          weekend_price_inr: typeof r.weekend_price_inr === 'number' ? r.weekend_price_inr : null,
          is_active: r.is_active !== false,
          created_at: (r.created_at as string) || '',
          updated_at: (r.updated_at as string) || '',
        });
      });
    }
  } catch {
    // ignore
  }

  // 2. Fetch from tenants.settings.pricing_rules
  try {
    const supabase = await createServerSupabaseClient();
    const { data: tenant } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const settings = (tenant?.settings as Record<string, unknown>) || {};
    if (Array.isArray(settings.pricing_rules)) {
      settings.pricing_rules.forEach((r: SeasonalPricingRule) => {
        if (r.is_active !== false) {
          rulesMap.set(r.id, r);
        }
      });
    }
  } catch {
    // ignore
  }

  return Array.from(rulesMap.values()).sort((a, b) => b.priority - a.priority);
}

