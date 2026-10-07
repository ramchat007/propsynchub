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
  const res = await sb.from('rooms').update({ status: 'maintenance' }).eq('id', 'dd042b7f-554a-4fb5-a4ed-83c9c1a3282f').select();
  console.log('Update to maintenance result:', res.error ? res.error.message : 'OK');
  const resBack = await sb.from('rooms').update({ status: 'available' }).eq('id', 'dd042b7f-554a-4fb5-a4ed-83c9c1a3282f').select();
  console.log('Update back to available result:', resBack.error ? resBack.error.message : 'OK');
}

test();
