process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) env[match[1]] = (match[2]||'').replace(/['"]/g, '').trim();
});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function testCols() {
  const { data, error } = await sb.from('restaurant_orders').insert({
    tenant_id: '00000000-0000-0000-0000-000000000001',
    order_number: 'TEST-001',
    guest_name: 'Test Guest',
    kot_number: 'KOT-001',
    service_type: 'room_delivery',
    items: [],
    subtotal_inr: 100,
    tax_inr: 5,
    total_inr: 105,
    status: 'PLACED',
    payment_method: 'room_folio',
  }).select();
  
  console.log('Result:', { data, error });
  if (data && data[0]) {
    await sb.from('restaurant_orders').delete().eq('id', data[0].id);
  }
}

testCols();
