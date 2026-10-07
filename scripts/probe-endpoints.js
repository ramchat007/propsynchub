process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
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

const endpoints = [
  '/pg',
  '/pg/query',
  '/database/query',
  '/sql',
  '/api/sql',
  '/rest/v1/rpc/exec',
  '/rest/v1/rpc/execute',
  '/rest/v1/rpc/execute_sql',
  '/rest/v1/rpc/run_sql',
  '/rest/v1/rpc/exec_sql'
];

async function testAll() {
  for (const ep of endpoints) {
    const url = `${env.NEXT_PUBLIC_SUPABASE_URL}${ep}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({ query: 'SELECT 1;', sql: 'SELECT 1;' })
      });
      console.log(ep, res.status);
    } catch(e) {
      console.log(ep, e.message);
    }
  }
}
testAll();
