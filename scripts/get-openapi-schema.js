process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const env = {};
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = (m[2]||'').replace(/['"]/g, '').trim();
});

async function main() {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/?apikey=${env.SUPABASE_SERVICE_ROLE_KEY}`, {
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY
    }
  });
  if (res.ok) {
    const data = await res.json();
    console.log('Paths in OpenAPI spec:');
    console.log(Object.keys(data.paths || {}));
  } else {
    console.log('Failed to fetch OpenAPI spec:', res.status, await res.text());
  }
}
main();
