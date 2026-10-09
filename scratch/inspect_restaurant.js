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

async function inspect() {
  for (const table of ['restaurant_categories', 'restaurant_items', 'restaurant_orders']) {
    const { data, error } = await sb.from(table).select('*').limit(1);
    console.log(`\nTable: ${table}`);
    if (error) {
      console.log(`  Error:`, error);
    } else {
      console.log(`  Data length: ${data.length}`);
      if (data.length > 0) console.log('  Sample keys:', Object.keys(data[0]));
    }
  }

  // Also check column names by inserting and rolling back or querying information_schema
  const { data: schemaData, error: schemaError } = await sb.rpc('get_table_columns', { table_name: 'restaurant_orders' });
  if (schemaError) {
    console.log('RPC not available, checking via OpenAPI or error details');
  } else {
    console.log('Columns:', schemaData);
  }
}

inspect();
