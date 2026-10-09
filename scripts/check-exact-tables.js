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

async function test() {
  const tables = [
    'tenants', 'profiles', 'resort_memberships', 'tenant_members',
    'room_categories', 'rooms', 'pricing', 'bookings', 'payments', 
    'folios', 'folio_items', 'invoices', 'restaurant_categories', 'restaurant_items', 
    'restaurant_orders', 'service_requests', 'housekeeping_tasks', 'reviews', 
    'audit_logs', 'email_otps', 'activities'
  ];
  for (const t of tables) {
    const { data, error } = await sb.from(t).select('id').limit(1);
    if (error) {
      console.log(`[TABLE] ${t}: ERROR -> ${error.code} - ${error.message}`);
    } else {
      console.log(`[TABLE] ${t}: OK (records found: ${data.length})`);
    }
  }
}
test();
