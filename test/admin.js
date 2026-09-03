process.chdir('/Users/idanguindy/punch-card-demo');
process.loadEnvFile('/Users/idanguindy/punch-card-demo/.env');
const app = require('/Users/idanguindy/punch-card-demo/server.js');
const db  = require('/Users/idanguindy/punch-card-demo/src/db');
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?(pass++,console.log('  ✔',n)):(fail++,console.log('  ✘',n,x)); };

const srv = app.listen(4130, async () => {
  const B='http://127.0.0.1:4130';
  let cookie='';
  const jar=r=>{const s=(r.headers.getSetCookie?.()||[]).find(c=>c.startsWith('session='));if(s)cookie=s.split(';')[0];};
  const get=p=>fetch(B+p,{redirect:'manual',headers:{cookie}});
  const post=(p,b)=>fetch(B+p,{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded',cookie},body:new URLSearchParams(b)});

  const nonAdminEmail=`plain-${Date.now()}@test.local`;
  try {
    console.log('\nACCESS CONTROL');
    let r = await get('/admin');
    ok('anonymous -> /login', r.status===302 && r.headers.get('location')==='/login', r.headers.get('location'));

    r = await post('/signup',{name:'עסק רגיל',email:nonAdminEmail,password:'secret123'}); jar(r);
    r = await get('/admin');
    ok('non-admin -> /dashboard (area not revealed)', r.status===302 && r.headers.get('location')==='/dashboard', r.headers.get('location'));
    r = await post('/admin/clients',{name:'חדירה'});
    ok('non-admin blocked from POST too', r.headers.get('location')==='/dashboard');
    const before = (await db.q('select count(*)::int n from admin_clients')).rows[0].n;

    // become the real admin
    cookie='';
    const adm = await db.getBusinessByEmail('bd12123@gmail.com');
    cookie = 'session=' + require('/Users/idanguindy/punch-card-demo/src/auth').makeSession(adm.id);
    ok('admin flag is set on B007', adm.isAdmin===true);

    r = await get('/admin');
    const html = await r.text();
    ok('admin sees the panel', r.status===200 && html.includes('ניהול'));
    ok('non-admin POST created nothing', (await db.q('select count(*)::int n from admin_clients')).rows[0].n === before);

    console.log('\nCLIENTS');
    r = await post('/admin/clients',{name:'קפה ברחוב',contact:'דנה',phone:'050-1234567',email:'cafe@x.com',status:'active',notes:'מנוי חודשי'});
    ok('create client', r.headers.get('location')==='/admin?tab=clients');
    let cl=(await db.q("select * from admin_clients where name='קפה ברחוב'")).rows[0];
    ok('client stored with fields', cl && cl.status==='active' && cl.contact==='דנה', JSON.stringify(cl&&cl.status));
    r = await post('/admin/clients',{name:''});
    ok('empty name rejected', (await db.q('select count(*)::int n from admin_clients')).rows[0].n === before+1);

    console.log('\nPULL EXISTING BUSINESS INTO CRM');
    let page = await (await get('/admin?tab=clients')).text();
    ok('unlinked businesses listed', page.includes('משוך ל-CRM'));
    r = await post('/admin/clients',{name:'העסק של עידן',email:'aiasafidan@gmail.com',bizId:'B006',status:'active'});
    const linked=(await db.q("select * from admin_clients where biz_id='B006'")).rows[0];
    ok('linked to account B006', !!linked);
    page = await (await get('/admin?tab=clients')).text();
    ok('linked client shows live card count', /B006/.test(page));

    console.log('\nTASKS');
    r = await post('/admin/tasks',{title:'להתקשר לקפה ברחוב',clientId:String(cl.id),dueOn:'2020-01-01',notes:'לגבי חידוש'});
    let t=(await db.q("select * from admin_tasks where title like 'להתקשר%'")).rows[0];
    ok('create task linked to client', t && String(t.client_id)===String(cl.id));
    page = await (await get('/admin?tab=tasks')).text();
    ok('overdue task flagged', page.includes('⚠'));
    await post(`/admin/tasks/${t.id}/toggle`);
    t=(await db.q('select * from admin_tasks where id=$1',[t.id])).rows[0];
    ok('toggle marks done', t.done===true);
    await post(`/admin/tasks/${t.id}/toggle`);
    ok('toggle back to open', (await db.q('select done from admin_tasks where id=$1',[t.id])).rows[0].done===false);

    console.log('\nMONEY');
    await post('/admin/finance',{kind:'income',amount:'1200',category:'מנוי חודשי',clientId:String(cl.id),occurredOn:new Date().toISOString().slice(0,10)});
    await post('/admin/finance',{kind:'expense',amount:'300',category:'שרתים',occurredOn:new Date().toISOString().slice(0,10)});
    const st = await require('/Users/idanguindy/punch-card-demo/src/crm').stats();
    ok('income counted', Number(st.income)===1200, st.income);
    ok('expense counted', Number(st.expense)===300, st.expense);
    ok('month balance = 900', Number(st.income_month)-Number(st.expense_month)===900);
    await post('/admin/finance',{kind:'income',amount:'-50'});
    ok('negative amount rejected', Number((await require('/Users/idanguindy/punch-card-demo/src/crm').stats()).income)===1200);

    console.log('\nCLEANUP BEHAVIOUR');
    await post(`/admin/clients/${cl.id}/delete`);
    ok('client deleted', (await db.q('select count(*)::int n from admin_clients where id=$1',[cl.id])).rows[0].n===0);
    ok('its task survives, unlinked', (await db.q('select client_id from admin_tasks where id=$1',[t.id])).rows[0].client_id===null);

    console.log('\nDASHBOARD LINK');
    page = await (await get('/dashboard')).text();
    ok('admin sees ניהול button on dashboard', page.includes('href="/admin"'));
    cookie=''; await post('/login',{email:nonAdminEmail,password:'secret123'}).then(jar);
    page = await (await get('/dashboard')).text();
    ok('non-admin does NOT see it', !page.includes('href="/admin"'));

  } catch(e){ console.error('CRASH', e.stack); fail++; }
  finally {
    await db.q("delete from businesses where email like '%@test.local'");
    await db.q('delete from admin_tasks'); await db.q('delete from admin_finance'); await db.q('delete from admin_clients');
    console.log(`\n${fail===0?'ALL PASS':'FAILURES'} — ${pass} passed, ${fail} failed`);
    srv.close(); await db.pool.end(); process.exit(fail?1:0);
  }
});
