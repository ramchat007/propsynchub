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
  const { data: rooms } = await sb.from('rooms').select('id, name, status').limit(1);
  const roomId = rooms[0].id;
  console.log('Current room status:', rooms[0]);
  
  const res = await sb.from('rooms').update({ status: 'dirty' }).eq('id', roomId).select();
  console.log('Update to dirty result:', res.error ? res.error.message : 'OK');

  const bTest = await sb.from('bookings').select('id, hold_expires_at, category_id, paid_amount_inr, balance_amount_inr').limit(1);
  console.log('Bookings columns test:', bTest.error ? bTest.error.message : bTest.data);

  const otpTest = await sb.from('email_otps').select('*').limit(1);
  console.log('Email otps table test:', otpTest.error ? otpTest.error.message : otpTest.data);
}

test();
