// Admin area: three roles (owner > admin > client), CRM sections, permissions.
process.chdir('/Users/idanguindy/punch-card-demo');
process.loadEnvFile('/Users/idanguindy/punch-card-demo/.env');
const app  = require('../server.js');
const db   = require('../src/db');
const crm  = require('../src/crm');
const auth = require('../src/auth');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ✔', n)) : (fail++, console.log('  ✘', n, x)); };

const srv = app.listen(4130, async () => {
  const B = 'http://127.0.0.1:4130';
  let cookie = '';
  const as = id => { cookie = 'session=' + auth.makeSession(id); };
  const get  = p => fetch(B + p, { redirect: 'manual', headers: { cookie } });
  const post = (p, b) => fetch(B + p, { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie }, body: new URLSearchParams(b) });

  const mk = async (name, role) => {
    const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2,7)}@test.local`;
    const biz = await db.createBusiness({ name, email, passwordHash: auth.hashPassword('secret123'), cardTemplate: {} });
    await db.q('update businesses set role = $2 where id = $1', [biz.id, role]);
    return { ...biz, email };
  };

  let owner, mgr, client;
  try {
    owner  = await mk('בעלים',  'owner');
    mgr    = await mk('מנהל',   'admin');
    client = await mk('לקוח',   'client');

    console.log('\nROLE GATE');
    cookie = '';
    ok('anonymous -> /login', (await get('/admin')).headers.get('location') === '/login');
    as(client.id);
    ok('client -> /dashboard (area hidden)', (await get('/admin')).headers.get('location') === '/dashboard');
    ok('client blocked on POST too', (await post('/admin/clients', { name: 'x' })).headers.get('location') === '/dashboard');
    as(mgr.id);
    ok('admin gets in', (await get('/admin')).status === 200);
    as(owner.id);
    ok('owner gets in', (await get('/admin')).status === 200);

    console.log('\nWHAT EACH ROLE SEES');
    as(mgr.id);
    let page = await (await get('/admin')).text();
    ok('admin: no money tab',  !page.includes('tab=money'));
    ok('admin: no roles tab',  !page.includes('tab=roles'));
    ok('admin: has clients+tasks', page.includes('tab=clients') && page.includes('tab=tasks'));
    ok('admin: chip says ניהול', page.includes('>ניהול<'));
    as(owner.id);
    page = await (await get('/admin')).text();
    ok('owner: money tab',  page.includes('tab=money'));
    ok('owner: roles tab',  page.includes('tab=roles'));
    ok('owner: chip says ניהול על', page.includes('ניהול על'));

    console.log('\nADMIN CANNOT REACH OWNER POWERS');
    as(mgr.id);
    const before = Number((await crm.stats()).income);
    ok('admin blocked from money POST', (await post('/admin/finance', { kind: 'income', amount: '999' })).headers.get('location') === '/admin');
    ok('  ...and nothing was written', Number((await crm.stats()).income) === before);
    ok('admin blocked from role POST', (await post(`/admin/roles/${client.id}`, { role: 'owner' })).headers.get('location') === '/admin');
    ok('  ...and role unchanged', (await db.getBusiness(client.id)).role === 'client');
    ok('admin lands on clients when asking for money tab',
       (await (await get('/admin?tab=money')).text()).includes('tab=clients'));

    console.log('\nOWNER MANAGES ROLES');
    as(owner.id);
    await post(`/admin/roles/${client.id}`, { role: 'admin' });
    ok('owner promotes client -> admin', (await db.getBusiness(client.id)).role === 'admin');
    await post(`/admin/roles/${client.id}`, { role: 'client' });
    ok('owner demotes back to client', (await db.getBusiness(client.id)).role === 'client');
    await post(`/admin/roles/${client.id}`, { role: 'wizard' });
    ok('invalid role rejected', (await db.getBusiness(client.id)).role === 'client');

    console.log('\nLAST-OWNER PROTECTION');
    const owners = await crm.countOwners();
    const r = await post(`/admin/roles/${owner.id}`, { role: 'client' });
    if (owners <= 1) {
      ok('cannot demote the last owner', (await db.getBusiness(owner.id)).role === 'owner');
      ok('  ...and says why', decodeURIComponent(r.headers.get('location') || '').includes('מנהל העל האחרון'));
    } else {
      ok('demote allowed while another owner exists', (await db.getBusiness(owner.id)).role === 'client');
      await db.q('update businesses set role=$2 where id=$1', [owner.id, 'owner']);
      ok('  (restored for the rest of the run)', (await db.getBusiness(owner.id)).role === 'owner');
    }
    as(owner.id);

    console.log('\nCLIENTS');
    await post('/admin/clients', { name: 'קפה ברחוב', contact: 'דנה', phone: '050-1234567', status: 'active', notes: 'מנוי' });
    let cl = (await db.q("select * from admin_clients where name='קפה ברחוב'")).rows[0];
    ok('create client', cl && cl.status === 'active' && cl.contact === 'דנה');
    const n = (await db.q('select count(*)::int n from admin_clients')).rows[0].n;
    await post('/admin/clients', { name: '' });
    ok('empty name rejected', (await db.q('select count(*)::int n from admin_clients')).rows[0].n === n);
    ok('unlinked businesses offered', (await (await get('/admin?tab=clients')).text()).includes('משוך ל-CRM'));
    await post('/admin/clients', { name: 'לקוח מקושר', bizId: client.id, status: 'active' });
    ok('pull-in links to an account', !!(await db.q('select 1 from admin_clients where biz_id=$1', [client.id])).rows[0]);

    console.log('\nTASKS');
    await post('/admin/tasks', { title: 'להתקשר', clientId: String(cl.id), dueOn: '2020-01-01' });
    let t = (await db.q("select * from admin_tasks where title='להתקשר'")).rows[0];
    ok('create task linked to client', t && String(t.client_id) === String(cl.id));
    ok('overdue flagged', (await (await get('/admin?tab=tasks')).text()).includes('⚠'));
    await post(`/admin/tasks/${t.id}/toggle`);
    ok('toggle -> done', (await db.q('select done from admin_tasks where id=$1', [t.id])).rows[0].done === true);
    await post(`/admin/tasks/${t.id}/toggle`);
    ok('toggle -> open', (await db.q('select done from admin_tasks where id=$1', [t.id])).rows[0].done === false);

    console.log('\nMONEY (owner)');
    const today = new Date().toISOString().slice(0, 10);
    await post('/admin/finance', { kind: 'income',  amount: '1200', category: 'מנוי', clientId: String(cl.id), occurredOn: today });
    await post('/admin/finance', { kind: 'expense', amount: '300',  category: 'שרתים', occurredOn: today });
    let st = await crm.stats();
    ok('income counted',  Number(st.income) === 1200, st.income);
    ok('expense counted', Number(st.expense) === 300, st.expense);
    ok('month balance 900', Number(st.income_month) - Number(st.expense_month) === 900);
    await post('/admin/finance', { kind: 'income', amount: '-50' });
    ok('negative rejected', Number((await crm.stats()).income) === 1200);

    console.log('\nDELETION KEEPS HISTORY');
    await post(`/admin/clients/${cl.id}/delete`);
    ok('client deleted', (await db.q('select count(*)::int n from admin_clients where id=$1', [cl.id])).rows[0].n === 0);
    ok('task survives unlinked', (await db.q('select client_id from admin_tasks where id=$1', [t.id])).rows[0].client_id === null);
    ok('money entry survives unlinked', (await db.q("select client_id from admin_finance where category='מנוי'")).rows[0].client_id === null);

    console.log('\nDASHBOARD LINK');
    as(owner.id);
    ok('owner sees ניהול on dashboard',  (await (await get('/dashboard')).text()).includes('href="/admin"'));
    as(mgr.id);
    ok('admin sees it too',              (await (await get('/dashboard')).text()).includes('href="/admin"'));
    as(client.id);
    ok('client does not',               !(await (await get('/dashboard')).text()).includes('href="/admin"'));

  } catch (e) { console.error('CRASH', e.stack); fail++; }
  finally {
    await db.q("delete from businesses where email like '%@test.local'");
    await db.q('delete from admin_tasks'); await db.q('delete from admin_finance'); await db.q('delete from admin_clients');
    console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`);
    srv.close(); await db.pool.end(); process.exit(fail ? 1 : 0);
  }
});
