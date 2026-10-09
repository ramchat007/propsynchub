const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const vars = {};
env.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
    const idx = trimmed.indexOf('=');
    vars[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
  }
});
const url = vars.NEXT_PUBLIC_SUPABASE_URL;
const key = vars.SUPABASE_SERVICE_ROLE_KEY || vars.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function check() {
  const headers = { 'apikey': key, 'Authorization': `Bearer ${key}` };
  const res = await fetch(`${url}/rest/v1/tenants?select=id,name,settings`, { headers });
  const tenants = await res.json();
  console.log('Tenants settings:', JSON.stringify(tenants, null, 2));
}
check();
