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

async function inspect() {
  const { data: tenant, error: tErr } = await sb.from('tenants').select('*');
  console.log('--- TENANTS ---', tenant ? tenant.map(t => ({ id: t.id, name: t.name, subdomain: t.subdomain })) : tErr);

  const { data: categories, error: cErr } = await sb.from('room_categories').select('*');
  console.log('--- CATEGORIES ---', categories ? categories : cErr);

  const { data: rooms, error: rErr } = await sb.from('rooms').select('*');
  console.log('--- ROOMS ---', rooms ? rooms : rErr);

  const { data: bookings, error: bErr } = await sb.from('bookings').select('*');
  console.log('--- BOOKINGS FULL ---', bookings ? bookings : bErr);
}

inspect();
