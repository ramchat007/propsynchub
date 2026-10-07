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

async function testManagement() {
  const ref = 'qqxctovvqrwllyanwglh';
  const url = `https://api.supabase.com/v1/projects/${ref}/database/query`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({ query: 'SELECT 1;' })
    });
    console.log('Management API status:', res.status, await res.text());
  } catch(e) {
    console.error('Err:', e.message);
  }
}
testManagement();
