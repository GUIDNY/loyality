// Partner workspace: shared ideas, who-added-what attribution, income split.
process.chdir('/Users/idanguindy/punch-card-demo');
process.loadEnvFile('/Users/idanguindy/punch-card-demo/.env');
const app  = require('../server.js');
const db   = require('../src/db');
const crm  = require('../src/crm');
const auth = require('../src/auth');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ✔', n)) : (fail++, console.log('  ✘', n, x)); };

const srv = app.listen(4131, async () => {
  const B = 'http://127.0.0.1:4131';
  let cookie = '';
  const as = id => { cookie = 'session=' + auth.makeSession(id); };
  const get  = p => fetch(B + p, { redirect: 'manual', headers: { cookie } });
  const post = (p, b) => fetch(B + p, { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie }, body: new URLSearchParams(b) });

  const mk = async (name, role) => {
    const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2,7)}@test.local`;
    const biz = await db.createBusiness({ name, email, passwordHash: auth.hashPassword('secret123'), cardTemplate: {} });
    await db.q('update businesses set role = $2 where id = $1', [biz.id, role]);
    return biz;
  };

  try {
    const me      = await mk('עידן',  'owner');
    const partner = await mk('השותף', 'admin');

    console.log('\nIDEAS — SHARED SCRATCHPAD');
    as(me.id);
    await post('/admin/ideas', { title: 'מועדון לרשתות', body: 'כמה סניפים' });
    as(partner.id);
    await post('/admin/ideas', { title: 'אינטגרציה לקופות' });
    let ideas = await crm.listIdeas();
    ok('both partners can write', ideas.length === 2);
    ok('each idea keeps its author',
       ideas.find(i => i.title === 'מועדון לרשתות').author_name === 'עידן' &&
       ideas.find(i => i.title === 'אינטגרציה לקופות').author_name === 'השותף');
    ok('admin (not owner) may reach the ideas tab', (await get('/admin?tab=ideas')).status === 200);
    ok('ideas tab visible to admin', (await (await get('/admin')).text()).includes('tab=ideas'));

    const idea = ideas[0];
    await post(`/admin/ideas/${idea.id}/status`, { status: 'doing' });
    ok('status change works', (await db.q('select status from admin_ideas where id=$1', [idea.id])).rows[0].status === 'doing');
    await post(`/admin/ideas/${idea.id}/status`, { status: 'nonsense' });
    ok('invalid status rejected', (await db.q('select status from admin_ideas where id=$1', [idea.id])).rows[0].status === 'doing');
    await post('/admin/ideas', { title: '' });
    ok('empty idea rejected', (await crm.listIdeas()).length === 2);

    console.log('\nATTRIBUTION — WHO ADDED WHAT');
    as(me.id);
    await post('/admin/clients', { name: 'לקוח שלי', status: 'active' });
    as(partner.id);
    await post('/admin/clients', { name: 'לקוח של השותף', status: 'active' });
    const cls = await crm.listClients();
    const mine  = cls.find(c => c.name === 'לקוח שלי');
    const yours = cls.find(c => c.name === 'לקוח של השותף');
    ok('client records who added it', mine.added_by_name === 'עידן' && yours.added_by_name === 'השותף');
    as(me.id);
    ok('clients table shows the column', (await (await get('/admin?tab=clients')).text()).includes('מי הוסיף'));

    await post('/admin/tasks', { title: 'משימה שלי' });
    ok('task records who added it', (await crm.listTasks())[0].added_by_name === 'עידן');

    console.log('\nINCOME SPLIT');
    const today = new Date().toISOString().slice(0, 10);
    await post('/admin/finance', { kind: 'income',  amount: '1000', clientId: String(mine.id),  occurredOn: today });
    await post('/admin/finance', { kind: 'income',  amount: '600',  clientId: String(yours.id), occurredOn: today });
    await post('/admin/finance', { kind: 'income',  amount: '250',  occurredOn: today });          // no client
    await post('/admin/finance', { kind: 'expense', amount: '400',  occurredOn: today });

    const split = await crm.partnerSplit();
    const p1 = split.partners.find(p => p.name === 'עידן');
    const p2 = split.partners.find(p => p.name === 'השותף');
    ok('my income credited to me',       Number(p1.income) === 1000, p1.income);
    ok('partner income credited to them', Number(p2.income) === 600, p2.income);
    ok('clientless income unattributed',  Number(split.unattributed) === 250, split.unattributed);
    ok('expenses not split into anyone',  Number(p1.income) + Number(p2.income) + Number(split.unattributed) === 1850);
    ok('client counts per partner',       p1.clients_added === 1 && p2.clients_added === 1);
    ok('idea counts per partner',         p1.ideas === 1 && p2.ideas === 1);

    const page = await (await get('/admin?tab=money')).text();
    ok('split panel rendered',      page.includes('חלוקה בין השותפים'));
    ok('both partners listed',      page.includes('עידן') && page.includes('השותף'));
    ok('unattributed row shown',    page.includes('לא משויך'));
    ok('money table credits rows',  page.includes('נזקף ל'));

    console.log('\nATTRIBUTION SURVIVES DELETION');
    await post(`/admin/clients/${mine.id}/delete`);
    const after = await crm.partnerSplit();
    ok('income moves to unattributed, not lost',
       Number(after.unattributed) === 1250 && Number(after.partners.find(p => p.name === 'עידן').income) === 0,
       JSON.stringify({ un: after.unattributed }));

    console.log('\nSTILL PRIVATE');
    const outsider = await mk('לקוח רגיל', 'client');
    as(outsider.id);
    ok('a client cannot see ideas', (await get('/admin?tab=ideas')).headers.get('location') === '/dashboard');
    ok('a client cannot post ideas', (await post('/admin/ideas', { title: 'חדירה' })).headers.get('location') === '/dashboard');
    ok('  ...and nothing was written', (await crm.listIdeas()).length === 2);

  } catch (e) { console.error('CRASH', e.stack); fail++; }
  finally {
    await db.q("delete from businesses where email like '%@test.local'");
    await db.q('delete from admin_ideas'); await db.q('delete from admin_tasks');
    await db.q('delete from admin_finance'); await db.q('delete from admin_clients');
    console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`);
    srv.close(); await db.pool.end(); process.exit(fail ? 1 : 0);
  }
});
