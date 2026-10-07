process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function checkRoute(url) {
  try {
    const res = await fetch(url, { redirect: 'manual' });
    console.log(`[ROUTE CHECK] ${url} -> Status: ${res.status}`);
  } catch (err) {
    console.error(`[ROUTE CHECK ERROR] ${url} ->`, err.message);
  }
}

async function verifyAll() {
  await checkRoute('http://localhost:3000/');
  await checkRoute('http://localhost:3000/login');
  await checkRoute('http://localhost:3000/raigad-tropical');
  await checkRoute('http://localhost:3000/raigad-tropical/book');
  await checkRoute('http://localhost:3000/inventory');
  await checkRoute('http://localhost:3000/calendar');
  await checkRoute('http://localhost:3000/dashboard');
  await checkRoute('http://localhost:3000/bookings');
}

verifyAll();
