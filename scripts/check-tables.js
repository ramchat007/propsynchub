const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = (m[2] || '').trim().replace(/^['"]|['"]$/g, '');
});
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const tables = [
    'tenants', 'profiles', 'resort_memberships', 'tenant_members', 'roles', 'permissions',
    'room_categories', 'rooms', 'pricing', 'bookings', 'holds', 'payments', 
    'folios', 'folio_items', 'invoices', 'restaurant_categories', 'restaurant_items', 
    'restaurant_orders', 'service_requests', 'housekeeping_tasks', 'reviews', 
    'audit_logs', 'email_otps', 'invitations', 'activities'
  ];
  for (const t of tables) {
    const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
    console.log(t.padEnd(25), error ? 'MISSING/ERROR: ' + error.message : 'EXISTS (count: ' + count + ')');
  }
}
test();
