// ══════════════════════════════════════════════════════
// ADMIN AREA — clients / tasks / money, one page, three tabs
// Uses the app's existing design tokens so it feels like the same product.
// ══════════════════════════════════════════════════════
const { esc } = require('../util');
const { FONTS, BASE_CSS, LOGO_ICON, FAVICON } = require('./assets');

const ils = n => '₪' + Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 });
const day = d => d ? new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';

const STATUS_LABEL = { lead: 'ליד', active: 'פעיל', paused: 'מושהה', churned: 'נטש' };
const STATUS_STYLE = {
  lead:    'background:#eef2ff;border:1px solid #c7d2fe;color:#4338ca',
  active:  'background:#e8f5e9;border:1px solid #a5d6a7;color:#2e7d32',
  paused:  'background:#fff7ed;border:1px solid #fed7aa;color:#c2410c',
  churned: 'background:var(--bg-2);border:1px solid var(--border);color:var(--text-2)',
};

function statusTag(s) {
  return `<span class="tag" style="${STATUS_STYLE[s] || STATUS_STYLE.churned}">${STATUS_LABEL[s] || s}</span>`;
}

function statusOptions(sel) {
  return Object.entries(STATUS_LABEL)
    .map(([v, l]) => `<option value="${v}"${v === sel ? ' selected' : ''}>${l}</option>`).join('');
}

function clientOptions(clients, sel) {
  return `<option value="">— ללא לקוח —</option>` + clients
    .map(c => `<option value="${c.id}"${String(c.id) === String(sel) ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
}

function empty(msg) {
  return `<tr><td colspan="9" style="text-align:center;padding:36px 20px;color:var(--text-2);font-size:13px">${esc(msg)}</td></tr>`;
}

const ROLE_LABEL = { owner: 'מנהל על', admin: 'מנהל', client: 'לקוח' };
const ROLE_STYLE = {
  owner:  'background:#111;border:1px solid #111;color:#fff',
  admin:  'background:#eef2ff;border:1px solid #c7d2fe;color:#4338ca',
  client: 'background:var(--bg-2);border:1px solid var(--border);color:var(--text-2)',
};

function roleTag(r) {
  return `<span class="tag" style="${ROLE_STYLE[r] || ROLE_STYLE.client}">${ROLE_LABEL[r] || r}</span>`;
}

const IDEA_LABEL = { new: 'חדש', doing: 'בעבודה', done: 'בוצע', dropped: 'נזנח' };
const IDEA_STYLE = {
  new:     'background:#eef2ff;border:1px solid #c7d2fe;color:#4338ca',
  doing:   'background:#fff7ed;border:1px solid #fed7aa;color:#c2410c',
  done:    'background:#e8f5e9;border:1px solid #a5d6a7;color:#2e7d32',
  dropped: 'background:var(--bg-2);border:1px solid var(--border);color:var(--text-2)',
};
const who = n => n ? `<span style="font-size:12px;color:var(--text-2)">${esc(n)}</span>` : '<span style="color:#bbb;font-size:12px">—</span>';

function adminPage({ admin, stats, clients, tasks, ideas = [], finance, unlinked, accounts = [], split = { partners: [], unattributed: 0 }, tab = 'clients', notice = '' }) {
  const isOwner = admin.isOwner === true;
  const net = Number(stats.income) - Number(stats.expense);
  const netMonth = Number(stats.income_month) - Number(stats.expense_month);

  const clientRows = clients.length ? clients.map(c => `
    <tr>
      <td>
        <div style="font-weight:600">${esc(c.name)}</div>
        ${c.contact || c.phone ? `<div style="font-size:12px;color:var(--text-2);margin-top:2px">${esc(c.contact)}${c.contact && c.phone ? ' · ' : ''}<span dir="ltr">${esc(c.phone)}</span></div>` : ''}
      </td>
      <td>${statusTag(c.status)}</td>
      <td style="font-size:13px;color:var(--text-2)" dir="ltr">${esc(c.email || c.biz_email || '')}</td>
      <td>${c.biz_id ? `<span class="tag" style="background:var(--bg-2);border:1px solid var(--border);color:var(--text-2)">${esc(c.biz_id)}</span>` : '<span style="color:#bbb;font-size:12px">לא מקושר</span>'}</td>
      <td style="font-size:13px">${c.biz_id ? `${c.card_holders} כרטיסים · ${c.punches} ניקובים` : '—'}</td>
      <td>${who(c.added_by_name)}</td>
      <td style="font-size:13px;color:var(--text-2);max-width:220px">${esc(c.notes || '')}</td>
      <td>
        <form method="POST" action="/admin/clients/${c.id}/delete" onsubmit="return confirm('למחוק את ${esc(c.name)}? המשימות והתנועות שלו יישארו, בלי שיוך.')">
          <button class="btn btn-danger btn-sm">מחק</button>
        </form>
      </td>
    </tr>`).join('') : empty('אין לקוחות עדיין — הוסף אחד למעלה, או משוך עסק קיים מהרשימה שמתחת.');

  const unlinkedRows = unlinked.length ? `
    <div class="sec-label" style="margin-top:28px">עסקים רשומים שעדיין לא ב-CRM (${unlinked.length})</div>
    <div class="tbl-wrap">
      <table>
        <thead><tr><th>עסק</th><th>אימייל</th><th>כרטיסים</th><th>נרשם</th><th></th></tr></thead>
        <tbody>
          ${unlinked.map(b => `
          <tr>
            <td style="font-weight:600">${esc(b.name)}</td>
            <td dir="ltr" style="font-size:13px;color:var(--text-2)">${esc(b.email)}</td>
            <td style="font-size:13px">${b.card_holders}</td>
            <td style="font-size:13px;color:var(--text-2)">${day(b.created_at)}</td>
            <td>
              <form method="POST" action="/admin/clients">
                <input type="hidden" name="name" value="${esc(b.name)}"/>
                <input type="hidden" name="email" value="${esc(b.email)}"/>
                <input type="hidden" name="bizId" value="${esc(b.id)}"/>
                <input type="hidden" name="status" value="active"/>
                <button class="btn btn-secondary btn-sm">משוך ל-CRM</button>
              </form>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const today = new Date().toISOString().slice(0, 10);
  const taskRows = tasks.length ? tasks.map(t => {
    const overdue = !t.done && t.due_on && new Date(t.due_on).toISOString().slice(0,10) < today;
    return `
    <tr style="${t.done ? 'opacity:.5' : ''}">
      <td style="width:44px">
        <form method="POST" action="/admin/tasks/${t.id}/toggle">
          <button class="btn btn-sm ${t.done ? 'btn-primary' : 'btn-secondary'}" title="${t.done ? 'החזר לפתוח' : 'סמן כבוצע'}" style="width:32px;justify-content:center">${t.done ? '✓' : ''}</button>
        </form>
      </td>
      <td>
        <div style="font-weight:600;${t.done ? 'text-decoration:line-through' : ''}">${esc(t.title)}</div>
        ${t.notes ? `<div style="font-size:12px;color:var(--text-2);margin-top:2px">${esc(t.notes)}</div>` : ''}
      </td>
      <td style="font-size:13px">${t.client_name ? esc(t.client_name) : '<span style="color:#bbb">—</span>'}</td>
      <td style="font-size:13px;${overdue ? 'color:#D32F2F;font-weight:700' : 'color:var(--text-2)'}">${t.due_on ? day(t.due_on) + (overdue ? ' ⚠' : '') : '—'}</td>
      <td>${who(t.added_by_name)}</td>
      <td>
        <form method="POST" action="/admin/tasks/${t.id}/delete" onsubmit="return confirm('למחוק את המשימה?')">
          <button class="btn btn-danger btn-sm">מחק</button>
        </form>
      </td>
    </tr>`;
  }).join('') : empty('אין משימות. הוסף אחת למעלה.');

  const finRows = finance.length ? finance.map(f => `
    <tr>
      <td style="font-size:13px;color:var(--text-2)">${day(f.occurred_on)}</td>
      <td>${f.kind === 'income'
        ? '<span class="tag" style="background:#e8f5e9;border:1px solid #a5d6a7;color:#2e7d32">הכנסה</span>'
        : '<span class="tag" style="background:#fff5f5;border:1px solid #fecaca;color:#D32F2F">הוצאה</span>'}</td>
      <td style="font-weight:700;${f.kind === 'income' ? 'color:#2e7d32' : 'color:#D32F2F'}" dir="ltr">${f.kind === 'income' ? '+' : '−'}${ils(f.amount)}</td>
      <td style="font-size:13px">${esc(f.category || '')}</td>
      <td style="font-size:13px">${f.client_name ? esc(f.client_name) : '<span style="color:#bbb">—</span>'}</td>
      <td>${who(f.credited_to)}</td>
      <td style="font-size:13px;color:var(--text-2);max-width:240px">${esc(f.note || '')}</td>
      <td>
        <form method="POST" action="/admin/finance/${f.id}/delete" onsubmit="return confirm('למחוק את התנועה?')">
          <button class="btn btn-danger btn-sm">מחק</button>
        </form>
      </td>
    </tr>`).join('') : empty('אין תנועות כספיות. הוסף אחת למעלה.');

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>ניהול — Ten Dots</title>
${FAVICON}${FONTS}${BASE_CSS}
<style>
.topbar{background:#fff;border-bottom:1px solid var(--border);height:56px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50}
.container{max-width:1180px;margin:0 auto;padding:24px 20px 64px}
.admin-chip{background:#111;color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:var(--radius-sm);letter-spacing:.04em}
.stats{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:24px}
@media(max-width:900px){.stats{grid-template-columns:repeat(3,1fr)}}
@media(max-width:560px){.stats{grid-template-columns:repeat(2,1fr)}}
.stat{background:#fff;border-radius:var(--radius-md);padding:14px 16px;border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,.08)}
.stat-val{font-size:24px;font-weight:800;line-height:1.1}
.stat-lbl{font-size:11px;color:var(--text-2);font-weight:600;letter-spacing:.05em;margin-top:4px}
.tabs{display:flex;gap:6px;margin-bottom:18px;border-bottom:1px solid var(--border)}
.tab{padding:10px 16px;font-size:var(--text-sm);font-weight:700;color:var(--text-2);text-decoration:none;border-bottom:2px solid transparent;margin-bottom:-1px}
.tab.on{color:var(--text);border-bottom-color:#111}
.panel{background:#fff;border:1px solid var(--border);border-radius:var(--radius-md);padding:18px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.sec-label{font-size:11px;font-weight:700;letter-spacing:.08em;color:#999;margin-bottom:10px}
.grid{display:grid;gap:10px}
.g4{grid-template-columns:repeat(4,1fr)}.g5{grid-template-columns:repeat(5,1fr)}.g6{grid-template-columns:repeat(6,1fr)}
@media(max-width:820px){.g4,.g5,.g6{grid-template-columns:1fr 1fr}}
@media(max-width:480px){.g4,.g5,.g6{grid-template-columns:1fr}}
.tbl-wrap{border-radius:var(--radius-md);border:1px solid var(--border);background:#fff;overflow-x:auto}
table{width:100%;border-collapse:collapse;min-width:620px}
thead th{background:var(--bg-2);padding:10px 14px;font-size:11px;font-weight:700;letter-spacing:.06em;color:#999;text-align:right;border-bottom:1px solid var(--border);white-space:nowrap}
tbody tr{border-bottom:1px solid var(--bg-2)}
tbody tr:last-child{border-bottom:none}
tbody td{padding:10px 14px;font-size:var(--text-sm);vertical-align:middle}
tbody form{display:inline}
input,select,textarea{width:100%;border:1px solid var(--border);border-radius:var(--radius-sm);padding:0 10px;height:38px;font-size:13px;background:#fff}
textarea{height:38px;padding-top:9px;resize:vertical}
label span{display:block;font-size:11px;font-weight:600;color:var(--text-2);margin-bottom:4px}
</style>
</head>
<body>

<div class="topbar">
  <a href="/dashboard" style="display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--text)">
    ${LOGO_ICON}<span class="admin-chip">${isOwner ? 'ניהול על' : 'ניהול'}</span>
  </a>
  <div style="display:flex;align-items:center;gap:10px">
    <span style="font-size:13px;color:var(--text-2)">${esc(admin.name)}</span>
    ${roleTag(admin.role)}
    <a href="/dashboard" class="btn btn-secondary btn-sm">לדשבורד</a>
    <a href="/logout" class="btn btn-ghost btn-sm">התנתק</a>
  </div>
</div>

<div class="container">

  <div class="stats">
    <div class="stat"><div class="stat-val">${stats.businesses}</div><div class="stat-lbl">עסקים רשומים</div></div>
    <div class="stat"><div class="stat-val">${stats.active_clients}</div><div class="stat-lbl">לקוחות פעילים</div></div>
    <div class="stat"><div class="stat-val">${stats.card_holders}</div><div class="stat-lbl">מחזיקי כרטיס</div></div>
    <div class="stat"><div class="stat-val"${stats.overdue_tasks > 0 ? ' style="color:#D32F2F"' : ''}>${stats.open_tasks}</div><div class="stat-lbl">משימות פתוחות${stats.overdue_tasks > 0 ? ` · ${stats.overdue_tasks} באיחור` : ''}</div></div>
    <div class="stat"><div class="stat-val" style="color:${netMonth >= 0 ? '#2e7d32' : '#D32F2F'}" dir="ltr">${ils(netMonth)}</div><div class="stat-lbl">מאזן החודש</div></div>
    <div class="stat"><div class="stat-val" style="color:${net >= 0 ? '#2e7d32' : '#D32F2F'}" dir="ltr">${ils(net)}</div><div class="stat-lbl">מאזן כולל</div></div>
  </div>

  ${notice ? `<div style="background:#fff7ed;border:1px solid #fed7aa;color:#c2410c;border-radius:var(--radius-sm);padding:10px 14px;font-size:13px;font-weight:600;margin-bottom:16px">${esc(notice)}</div>` : ''}

  <div class="tabs">
    <a href="/admin?tab=clients" class="tab ${tab === 'clients' ? 'on' : ''}">לקוחות (${clients.length})</a>
    <a href="/admin?tab=tasks"   class="tab ${tab === 'tasks'   ? 'on' : ''}">משימות (${stats.open_tasks})</a>
    <a href="/admin?tab=ideas" class="tab ${tab === 'ideas' ? 'on' : ''}">רעיונות (${ideas.filter(i => i.status === 'new' || i.status === 'doing').length})</a>
    ${isOwner ? `<a href="/admin?tab=money" class="tab ${tab === 'money' ? 'on' : ''}">כספים</a>` : ''}
    ${isOwner ? `<a href="/admin?tab=roles" class="tab ${tab === 'roles' ? 'on' : ''}">הרשאות (${accounts.length})</a>` : ''}
  </div>

  <!-- ── clients ── -->
  <div ${tab === 'clients' ? '' : 'hidden'}>
    <div class="panel">
      <div class="sec-label">לקוח חדש</div>
      <form method="POST" action="/admin/clients">
        <div class="grid g6">
          <label><span>שם *</span><input name="name" required placeholder="קפה ברחוב"/></label>
          <label><span>איש קשר</span><input name="contact" placeholder="דנה"/></label>
          <label><span>טלפון</span><input name="phone" dir="ltr" placeholder="050-0000000"/></label>
          <label><span>אימייל</span><input name="email" type="email" dir="ltr"/></label>
          <label><span>סטטוס</span><select name="status">${statusOptions('lead')}</select></label>
          <label><span>&nbsp;</span><button class="btn btn-primary" style="width:100%;justify-content:center;height:38px">הוסף לקוח</button></label>
        </div>
        <div style="margin-top:10px"><input name="notes" placeholder="הערות..."/></div>
      </form>
    </div>

    <div class="sec-label">לקוחות (${clients.length})</div>
    <div class="tbl-wrap">
      <table>
        <thead><tr><th>לקוח</th><th>סטטוס</th><th>אימייל</th><th>חשבון</th><th>פעילות</th><th>מי הוסיף</th><th>הערות</th><th></th></tr></thead>
        <tbody>${clientRows}</tbody>
      </table>
    </div>
    ${unlinkedRows}
  </div>

  <!-- ── tasks ── -->
  <div ${tab === 'tasks' ? '' : 'hidden'}>
    <div class="panel">
      <div class="sec-label">משימה חדשה</div>
      <form method="POST" action="/admin/tasks">
        <div class="grid g5">
          <label style="grid-column:span 2"><span>מה צריך לעשות *</span><input name="title" required placeholder="להתקשר לקפה ברחוב"/></label>
          <label><span>לקוח</span><select name="clientId">${clientOptions(clients, '')}</select></label>
          <label><span>תאריך יעד</span><input name="dueOn" type="date"/></label>
          <label><span>&nbsp;</span><button class="btn btn-primary" style="width:100%;justify-content:center;height:38px">הוסף משימה</button></label>
        </div>
        <div style="margin-top:10px"><input name="notes" placeholder="הערות..."/></div>
      </form>
    </div>

    <div class="sec-label">משימות (${tasks.filter(t => !t.done).length} פתוחות מתוך ${tasks.length})</div>
    <div class="tbl-wrap">
      <table>
        <thead><tr><th></th><th>משימה</th><th>לקוח</th><th>יעד</th><th>מי הוסיף</th><th></th></tr></thead>
        <tbody>${taskRows}</tbody>
      </table>
    </div>
  </div>

  <!-- ── ideas — both partners ── -->
  <div ${tab === 'ideas' ? '' : 'hidden'}>
    <div class="panel">
      <div class="sec-label">רעיון חדש</div>
      <form method="POST" action="/admin/ideas">
        <div class="grid" style="grid-template-columns:2fr 3fr auto">
          <label><span>הרעיון *</span><input name="title" required placeholder="מועדון לקוחות לרשתות"/></label>
          <label><span>פירוט</span><input name="body" placeholder="איך זה עובד, למי זה מתאים..."/></label>
          <label><span>&nbsp;</span><button class="btn btn-primary" style="height:38px;justify-content:center">הוסף</button></label>
        </div>
      </form>
    </div>

    <div class="sec-label">רעיונות (${ideas.length})</div>
    <div class="tbl-wrap">
      <table>
        <thead><tr><th>רעיון</th><th>מי כתב</th><th>מתי</th><th>סטטוס</th><th></th></tr></thead>
        <tbody>
          ${ideas.length ? ideas.map(i => `
          <tr style="${i.status === 'done' || i.status === 'dropped' ? 'opacity:.55' : ''}">
            <td>
              <div style="font-weight:600">${esc(i.title)}</div>
              ${i.body ? `<div style="font-size:12px;color:var(--text-2);margin-top:2px">${esc(i.body)}</div>` : ''}
            </td>
            <td>${who(i.author_name)}</td>
            <td style="font-size:13px;color:var(--text-2)">${day(i.created_at)}</td>
            <td>
              <form method="POST" action="/admin/ideas/${i.id}/status" style="display:flex;gap:6px;align-items:center">
                <select name="status" style="width:110px;height:32px">
                  ${['new','doing','done','dropped'].map(v => `<option value="${v}"${v === i.status ? ' selected' : ''}>${IDEA_LABEL[v]}</option>`).join('')}
                </select>
                <button class="btn btn-secondary btn-sm">שמור</button>
              </form>
            </td>
            <td>
              <form method="POST" action="/admin/ideas/${i.id}/delete" onsubmit="return confirm('למחוק את הרעיון?')">
                <button class="btn btn-danger btn-sm">מחק</button>
              </form>
            </td>
          </tr>`).join('') : empty('אין רעיונות עדיין — כתוב את הראשון למעלה.')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- ── money — owner only ── -->
  ${!isOwner ? '' : `
  <div ${tab === 'money' ? '' : 'hidden'}>
    <div class="panel">
      <div class="sec-label">תנועה חדשה</div>
      <form method="POST" action="/admin/finance">
        <div class="grid g6">
          <label><span>סוג</span><select name="kind"><option value="income">הכנסה</option><option value="expense">הוצאה</option></select></label>
          <label><span>סכום ₪ *</span><input name="amount" type="number" step="0.01" min="0" required dir="ltr"/></label>
          <label><span>קטגוריה</span><input name="category" placeholder="מנוי חודשי"/></label>
          <label><span>לקוח</span><select name="clientId">${clientOptions(clients, '')}</select></label>
          <label><span>תאריך</span><input name="occurredOn" type="date" value="${today}"/></label>
          <label><span>&nbsp;</span><button class="btn btn-primary" style="width:100%;justify-content:center;height:38px">הוסף תנועה</button></label>
        </div>
        <div style="margin-top:10px"><input name="note" placeholder="הערה..."/></div>
      </form>
    </div>

    <div class="sec-label">חלוקה בין השותפים</div>
    <div class="panel" style="margin-bottom:20px">
      <div class="tbl-wrap" style="border:none">
        <table style="min-width:480px">
          <thead><tr><th>שותף</th><th>לקוחות שהביא</th><th>רעיונות</th><th>משימות פתוחות</th><th>הכנסות שנזקפו לו</th></tr></thead>
          <tbody>
            ${split.partners.length ? split.partners.map(p => `
            <tr${p.id === admin.id ? ' style="background:var(--bg-2)"' : ''}>
              <td style="font-weight:700">${esc(p.name)}${p.id === admin.id ? ' <span style="font-size:11px;color:var(--text-2);font-weight:400">(אתה)</span>' : ''}</td>
              <td>${p.clients_added}</td>
              <td>${p.ideas}</td>
              <td>${p.open_tasks}</td>
              <td style="font-weight:800;color:#2e7d32" dir="ltr">${ils(p.income)}</td>
            </tr>`).join('') : empty('אין עדיין שותפים — מנה מישהו כמנהל או מנהל על בלשונית ההרשאות.')}
            ${Number(split.unattributed) > 0 ? `
            <tr>
              <td style="color:var(--text-2)">לא משויך</td>
              <td colspan="3" style="font-size:12px;color:var(--text-2)">הכנסות בלי לקוח, או מלקוח שלא רשום מי הביא אותו</td>
              <td style="font-weight:800;color:var(--text-2)" dir="ltr">${ils(split.unattributed)}</td>
            </tr>` : ''}
          </tbody>
        </table>
      </div>
      <div style="font-size:12px;color:var(--text-2);margin-top:12px;line-height:1.6">
        הכנסה נזקפת למי שהוסיף את הלקוח שאליו היא מקושרת. הוצאות לא מחולקות כאן — הן מוצגות בנפרד, כי אין דרך לדעת איך אתם מחלקים אותן ביניכם.
      </div>
    </div>

    <div class="grid g4" style="margin-bottom:18px">
      <div class="stat"><div class="stat-val" style="color:#2e7d32" dir="ltr">${ils(stats.income_month)}</div><div class="stat-lbl">הכנסות החודש</div></div>
      <div class="stat"><div class="stat-val" style="color:#D32F2F" dir="ltr">${ils(stats.expense_month)}</div><div class="stat-lbl">הוצאות החודש</div></div>
      <div class="stat"><div class="stat-val" style="color:#2e7d32" dir="ltr">${ils(stats.income)}</div><div class="stat-lbl">סה"כ הכנסות</div></div>
      <div class="stat"><div class="stat-val" style="color:#D32F2F" dir="ltr">${ils(stats.expense)}</div><div class="stat-lbl">סה"כ הוצאות</div></div>
    </div>

    <div class="sec-label">תנועות אחרונות</div>
    <div class="tbl-wrap">
      <table>
        <thead><tr><th>תאריך</th><th>סוג</th><th>סכום</th><th>קטגוריה</th><th>לקוח</th><th>נזקף ל</th><th>הערה</th><th></th></tr></thead>
        <tbody>${finRows}</tbody>
      </table>
    </div>
  </div>

  <!-- ── roles — owner only ── -->
  <div ${tab === 'roles' ? '' : 'hidden'}>
    <div class="panel" style="background:var(--bg-2)">
      <div class="sec-label" style="margin-bottom:6px">שלוש רמות הרשאה</div>
      <div style="font-size:13px;color:var(--text-2);line-height:1.7">
        <b style="color:var(--text)">מנהל על</b> — אזור הניהול המלא, כספים, ומינוי הרשאות. זה אתה.<br/>
        <b style="color:var(--text)">מנהל</b> — לקוחות ומשימות בלבד. לא רואה כספים ולא יכול לשנות הרשאות.<br/>
        <b style="color:var(--text)">לקוח</b> — רק הדשבורד של העסק שלו. אזור הניהול לא קיים מבחינתו.
      </div>
    </div>

    <div class="sec-label">כל החשבונות (${accounts.length})</div>
    <div class="tbl-wrap">
      <table>
        <thead><tr><th>חשבון</th><th>אימייל</th><th>הרשאה</th><th>כרטיסים</th><th>נרשם</th><th>שנה ל…</th></tr></thead>
        <tbody>
          ${accounts.map(a => `
          <tr${a.id === admin.id ? ' style="background:var(--bg-2)"' : ''}>
            <td style="font-weight:600">${esc(a.name)}${a.id === admin.id ? ' <span style="font-size:11px;color:var(--text-2);font-weight:400">(אתה)</span>' : ''}</td>
            <td dir="ltr" style="font-size:13px;color:var(--text-2)">${esc(a.email)}</td>
            <td>${roleTag(a.role)}</td>
            <td style="font-size:13px">${a.card_holders}</td>
            <td style="font-size:13px;color:var(--text-2)">${day(a.created_at)}</td>
            <td>
              <form method="POST" action="/admin/roles/${esc(a.id)}" style="display:flex;gap:6px;align-items:center">
                <select name="role" style="width:120px;height:32px">
                  ${['owner','admin','client'].map(r => `<option value="${r}"${r === a.role ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}
                </select>
                <button class="btn btn-secondary btn-sm">שמור</button>
              </form>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`}

</div>
</body></html>`;
}

module.exports = { adminPage };
