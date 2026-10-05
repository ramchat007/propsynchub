'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase-server';

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
    const maxAdults = parseInt(formData.get('maxAdults')?.toString() || '2', 10);
    const maxChildren = parseInt(formData.get('maxChildren')?.toString() || '0', 10);

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
        max_adults: maxAdults,
        max_children: maxChildren,
        amenities: [],
      })
      .select()
      .single();

    if (catError) {
      // If table has not yet been migrated in Supabase (PGRST205), fallback to tenant settings
      if (catError.code === 'PGRST205') {
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
          max_adults: maxAdults,
          max_children: maxChildren,
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
        return {
          success: true,
          message: `Category "${name}" created successfully.`,
          data: newCategory,
        };
      }

      throw catError;
    }

    revalidatePath('/dashboard');
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
 * 2. ADD ROOM TO CATEGORY
 */
export async function addRoom(formData: FormData): Promise<ActionResponse> {
  try {
    const tenantId = formData.get('tenantId')?.toString();
    const name = formData.get('name')?.toString()?.trim();
    const roomNumber = formData.get('roomNumber')?.toString()?.trim() || null;
    const roomType = formData.get('roomType')?.toString()?.trim() || 'standard';
    const categoryId = formData.get('categoryId')?.toString()?.trim() || null;
    const capacityAdults = parseInt(formData.get('capacityAdults')?.toString() || '2', 10);
    const capacityChildren = parseInt(formData.get('capacityChildren')?.toString() || '0', 10);
    const basePrice = parseFloat(formData.get('basePrice')?.toString() || '0');

    if (!tenantId) return { success: false, error: 'Tenant identifier is required.' };
    if (!name) return { success: false, error: 'Room name is required.' };
    if (isNaN(basePrice) || basePrice < 0) return { success: false, error: 'Valid base price is required.' };

    const { supabase } = await getAuthenticatedAdminTenant(tenantId);

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
 * 3. UPDATE ROOM STATUS (Toggle Availability)
 */
export async function updateRoomStatus(
  roomId: string,
  tenantId: string,
  newStatus: 'available' | 'maintenance' | 'blocked'
): Promise<ActionResponse> {
  try {
    if (!roomId || !tenantId) {
      return { success: false, error: 'Room ID and Tenant ID are required.' };
    }

    const { supabase } = await getAuthenticatedAdminTenant(tenantId);

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

    revalidatePath('/dashboard');
    return {
      success: true,
      message: `Room status updated to "${newStatus}".`,
      data: updatedRoom,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update room status.';
    return { success: false, error: message };
  }
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
