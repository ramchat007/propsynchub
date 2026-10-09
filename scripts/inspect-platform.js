process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local
const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.trim().split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspect() {
  console.log('--- SUPABASE AUTH USERS ---');
  const { data: users, error: uErr } = await sb.auth.admin.listUsers();
  if (uErr) console.error('Users error:', uErr);
  else console.log('Users count:', users?.users?.length, users?.users?.map(u => ({ id: u.id, email: u.email })));

  console.log('\n--- PROFILES ---');
  const { data: profiles, error: pErr } = await sb.from('profiles').select('*');
  if (pErr) console.error('Profiles error:', pErr);
  else console.log('Profiles:', profiles);

  console.log('\n--- TENANTS ---');
  const { data: tenants, error: tErr } = await sb.from('tenants').select('id, name, subdomain, custom_domain, is_active, settings');
  if (tErr) console.error('Tenants error:', tErr);
  else console.log('Tenants:', tenants);
}

inspect();
