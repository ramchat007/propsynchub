process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value.trim();
  }
});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const TENANT_ID = '2f002373-c7f2-4127-842f-4bb20d7a1b64';

async function fixCategoryLinks() {
  console.log('Ensuring categories and linking physical rooms...');

  // 1. Fetch categories
  const { data: categories } = await sb.from('room_categories').select('*').eq('tenant_id', TENANT_ID);
  console.log('Existing categories:', categories);

  let cozyHouseCat = categories?.find(c => c.name.toLowerCase().includes('cozy'));
  let suiteCat = categories?.find(c => c.name.toLowerCase().includes('suite'));

  if (!suiteCat) {
    console.log('Inserting Ac Suite Rooms category...');
    const { data: newSuite, error: insErr } = await sb.from('room_categories').insert({
      tenant_id: TENANT_ID,
      name: 'Ac Suite Rooms',
      description: 'Air-conditioned luxury suites with garden view and modern amenities',
      base_price_inr: 5000,
      extra_pax_price_inr: 1000,
      max_adults: 2,
      max_children: 1,
      amenities: ['Air Conditioning', 'King Bed', 'Ensuite Bathroom', 'High-speed Wi-Fi', 'Room Service'],
    }).select().single();

    if (insErr) {
      console.error('Error inserting Ac Suite Rooms category:', insErr);
    } else {
      suiteCat = newSuite;
      console.log('Created Ac Suite Rooms category:', suiteCat.id);
    }
  }

  // 2. Link rooms and align price
  if (cozyHouseCat) {
    await sb.from('room_categories').update({ base_price_inr: 12000 }).eq('id', cozyHouseCat.id);
    const { error: err1 } = await sb
      .from('rooms')
      .update({ category_id: cozyHouseCat.id, room_type: cozyHouseCat.name })
      .eq('tenant_id', TENANT_ID)
      .ilike('name', '%cozy%');
    console.log('Linked Cozy House rooms result:', err1 || 'SUCCESS');
  }

  if (suiteCat) {
    const { error: err2 } = await sb
      .from('rooms')
      .update({ category_id: suiteCat.id, room_type: suiteCat.name })
      .eq('tenant_id', TENANT_ID)
      .ilike('name', '%suite%');
    console.log('Linked Suite rooms result:', err2 || 'SUCCESS');
  }

  // 3. Verify
  const { data: updatedRooms } = await sb.from('rooms').select('id, name, room_type, category_id, status').eq('tenant_id', TENANT_ID);
  console.log('Updated rooms verification:', updatedRooms);
}

fixCategoryLinks();
