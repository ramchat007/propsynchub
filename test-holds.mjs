import { createAdminClient } from './lib/supabase.ts';
async function test() {
  const db = createAdminClient();
  const { data: h, error: hErr } = await db.from('booking_holds').select('*').limit(1);
  console.log('booking_holds:', hErr?.message || 'EXISTS');
  const { data: n, error: nErr } = await db.from('notifications').select('*').limit(1);
  console.log('notifications:', nErr?.message || 'EXISTS');
}
test().catch(console.error);
