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

async function main() {
  const tables = ['tenants', 'profiles', 'room_categories', 'rooms', 'pricing', 'bookings', 'incidental_charges', 'audit_logs', 'email_otps'];
  for (const t of tables) {
    const { data, error } = await sb.from(t).select('*').limit(1);
    if (error) {
      console.log(`[${t}] error:`, error.message);
    } else {
      console.log(`[${t}] columns:`, data.length > 0 ? Object.keys(data[0]) : '(empty table - checking insert attempt)');
    }
  }
}
main();
