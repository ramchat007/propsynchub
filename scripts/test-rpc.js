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

async function check() {
  // Query all RPCs or functions accessible
  const res = await sb.rpc('check_room_availability', {
    p_room_id: '1f85da52-b169-45a5-b274-f5ba83be905d',
    p_check_in: '2026-10-10',
    p_check_out: '2026-10-12'
  });
  console.log('check_room_availability RPC result:', res);
}
check();
