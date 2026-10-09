process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach((l) => {
  const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = (m[2] || '').replace(/['"]/g, '').trim();
});
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const tables = ['room_blocks', 'maintenance_blocks', 'housekeeping_tasks', 'room_maintenance', 'pricing'];
  for (const t of tables) {
    try {
      const { data, error } = await sb.from(t).select('*').limit(1);
      if (error) {
        console.log(t, 'ERROR:', error.message, error.code);
      } else {
        console.log(t, 'EXISTS, rows:', data.length);
      }
    } catch (e) {
      console.log(t, 'EXCEPTION:', e.message);
    }
  }
}
main();
