process.chdir('/Users/idanguindy/punch-card-demo');
process.loadEnvFile('/Users/idanguindy/punch-card-demo/.env');
process.env.PORT = '0';
const app = require('/Users/idanguindy/punch-card-demo/server.js');
const db  = require('/Users/idanguindy/punch-card-demo/src/db');

let pass = 0, fail = 0;
const ok = (name, cond, extra='') => { cond ? (pass++, console.log('  ✔', name)) : (fail++, console.log('  ✘', name, extra)); };

const srv = app.listen(4123, async () => {
  const B = 'http://127.0.0.1:4123';
  let cookie = '';
  const jar = r => { const c = r.headers.getSetCookie?.() || []; const s = c.find(x=>x.startsWith('session=')); if (s) cookie = s.split(';')[0]; };
  const get  = (p, o={}) => fetch(B+p, { redirect:'manual', headers:{ cookie, ...(o.headers||{}) }, ...o });
  const form = (p, body) => fetch(B+p, { method:'POST', redirect:'manual', headers:{ 'content-type':'application/x-www-form-urlencoded', cookie }, body:new URLSearchParams(body) });
  const json = (p, body) => fetch(B+p, { method:'POST', redirect:'manual', headers:{ 'content-type':'application/json', cookie }, body: body===undefined?undefined:JSON.stringify(body) });

  const email = `e2e-${Date.now()}@test.local`;
  try {
    console.log('\nSIGNUP / LOGIN');
    let r = await form('/signup', { name:'קפה הבדיקה', email, password:'secret123' });
    jar(r); ok('signup redirects to dashboard', r.headers.get('location') === '/dashboard', r.status);
    ok('session cookie issued', cookie.startsWith('session='));

    r = await form('/signup', { name:'x', email, password:'secret123' });
    ok('duplicate email rejected', r.headers.get('location') === '/signup?err=exists', r.headers.get('location'));

    r = await form('/login', { email, password:'wrong' });
    ok('wrong password rejected', r.headers.get('location') === '/login?err=1');

    r = await get('/login?err=1');
    const html = await r.text();
    ok('login page now SHOWS the error', html.includes('אימייל או סיסמה שגויים'));

    r = await form('/login', { email, password:'secret123' });
    jar(r); ok('correct password logs in', r.headers.get('location') === '/dashboard');

    const biz = await db.getBusinessByEmail(email);
    ok('password stored as salted scrypt', biz.passwordHash.startsWith('scrypt$'), biz.passwordHash.slice(0,12));

    console.log('\nDASHBOARD / SCAN');
    r = await get('/dashboard'); const dash = await r.text();
    ok('dashboard renders', r.status === 200 && dash.includes('קפה הבדיקה'));
    r = await get('/scan'); ok('scan page renders', r.status === 200);

    console.log('\nCUSTOMER LIFECYCLE');
    r = await get(`/join/${biz.id}`);
    const loc = r.headers.get('location') || '';
    const serial = loc.replace('/card/','');
    ok('join creates customer + redirects', /^\/card\/PC-\d{4}$/.test(loc), loc);

    r = await get(`/card/${serial}`); ok('card page renders', r.status === 200);

    await json(`/api/customer/${serial}`, { name:'דני', phone:'0501234567' });
    let c = await db.getCustomer(serial);
    ok('customer details saved', c.name === 'דני' && c.phone === '0501234567');

    console.log('\nPUNCHING');
    for (let i = 1; i <= 3; i++) {
      const pr = await json(`/api/punch/${serial}`);
      const d = await pr.json();
      if (i === 3) ok('punch increments', d.punches === 3, JSON.stringify(d));
    }

    // the whole point of the migration
    const before = (await db.getCustomer(serial)).punches;
    const results = await Promise.all(Array.from({length:5}, () => json(`/api/punch/${serial}`).then(r=>r.json())));
    const after = (await db.getCustomer(serial)).punches;
    ok('5 CONCURRENT punches all land (no lost update)', after === before + 5, `${before} -> ${after}`);
    ok('concurrent punches return distinct counts', new Set(results.map(r=>r.punches)).size === 5);

    // fill to goal and check overflow guard
    const goal = biz.cardTemplate.goal;
    while ((await db.getCustomer(serial)).punches < goal) await json(`/api/punch/${serial}`);
    const over = await json(`/api/punch/${serial}`);
    ok('full card refuses extra punch', over.status === 400, over.status);
    ok('punches never exceed goal', (await db.getCustomer(serial)).punches === goal);

    console.log('\nREDEEM / RESET');
    const rd = await json(`/api/redeem/${serial}`);
    const rdj = await rd.json();
    ok('redeem succeeds once (no double res.json crash)', rd.status === 200 && rdj.redeemed === 1, JSON.stringify(rdj));
    ok('redeem zeroes punches', (await db.getCustomer(serial)).punches === 0);
    const rd2 = await json(`/api/redeem/${serial}`);
    ok('redeem on empty card rejected', rd2.status === 400);

    await json(`/api/punch/${serial}`);
    await json(`/api/reset/${serial}`);
    ok('reset zeroes punches', (await db.getCustomer(serial)).punches === 0);

    console.log('\nTENANT ISOLATION');
    const email2 = `e2e2-${Date.now()}@test.local`;
    const saveCookie = cookie; cookie = '';
    r = await form('/signup', { name:'עסק אחר', email: email2, password:'secret123' }); jar(r);
    const other = await json(`/api/punch/${serial}`);
    ok('other business cannot punch this customer', other.status === 404, other.status);
    const otherView = await get(`/punch/${serial}`);
    ok('other business blocked on /punch/:serial', otherView.status === 404, otherView.status);
    cookie = '';
    const anon = await get(`/punch/${serial}`);
    ok('anonymous blocked on /punch/:serial (was OPEN before)', anon.status === 302 && anon.headers.get('location') === '/login', anon.status);
    cookie = saveCookie;

    console.log('\nRATE LIMIT + PUBLIC STATE');
    const cs = await (await get(`/api/card-state/${serial}`)).json();
    ok('card-state public read works', typeof cs.punches === 'number' && cs.goal === goal);
    const p1 = await get(`/punch/${serial}`);
    const p2 = await get(`/punch/${serial}`);
    const t2 = await p2.text();
    ok('DB-backed 10s cooldown holds', t2.includes('המתן רגע'));

    console.log('\nSESSION');
    const auth = require('/Users/idanguindy/punch-card-demo/src/auth');
    const old = `${biz.id}.${Date.now() - 8*24*3600*1000}`;
    const crypto = require('crypto');
    const sig = crypto.createHmac('sha256', auth.SECRET).update(old).digest('hex');
    ok('expired session rejected (was valid forever)', auth.verifySession(`${old}.${sig}`) === null);
    ok('fresh session accepted', auth.verifySession(auth.makeSession(biz.id)) === biz.id);
    ok('tampered session rejected', auth.verifySession(`${biz.id}.${Date.now()}.deadbeef`) === null);

    // cleanup
    await db.q('delete from businesses where lower(email) in (lower($1), lower($2))', [email, email2]);
    console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`);
  } catch (e) {
    console.error('\nTEST CRASHED:', e.stack);
    fail++;
  } finally {
    srv.close(); await db.pool.end(); process.exit(fail ? 1 : 0);
  }
});
