const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// On Vercel the filesystem is read-only except /tmp
const DATA_FILE = process.env.VERCEL
  ? '/tmp/data.json'
  : path.join(__dirname, 'data.json');

// ── BASE URL (works locally + on Vercel) ──────────────
function base(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// ── DATA ──────────────────────────────────────────────
function defaultData() {
  return {
    template: {
      businessName: 'Café Third Place',
      cardTitle:    'קפה 10 חינם',
      description:  'צבור 10 ניקובים וקבל קפה מתנה',
      reward:       'קפה חינם',
      goal:         10,
      color:        '#6B46C1',
      expiry:       '2025-12-31'
    },
    customers:  {},
    nextSerial: 1
  };
}
function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return defaultData(); }
}
function save(d) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }
  catch(e) { console.error('save error', e.message); }
}

// ── HELPERS ───────────────────────────────────────────
function serial(n)  { return 'PC-' + String(n).padStart(4, '0'); }
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ── SHARED STYLES ─────────────────────────────────────
const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>`;
const QR_JS = `<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>`;
const BASE_CSS = `<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Heebo',system-ui,sans-serif}
:root{--p:#6B46C1}
body{background:#f4f4fa;color:#1a202c;min-height:100dvh}
input:focus,select:focus{outline:none;border-color:var(--p)!important;box-shadow:0 0 0 3px rgba(107,70,193,.15)}
.btn{display:inline-flex;align-items:center;gap:6px;padding:10px 20px;border-radius:12px;font-weight:800;font-size:14px;cursor:pointer;border:none;transition:all .15s}
.btn:active{transform:scale(.97)}
.btn-primary{background:var(--p);color:#fff}.btn-primary:hover{opacity:.9}
.btn-ghost{background:rgba(107,70,193,.08);color:var(--p)}.btn-ghost:hover{background:rgba(107,70,193,.15)}
.btn-sm{padding:6px 14px;font-size:12px;border-radius:9px}
.card{background:#fff;border-radius:20px;box-shadow:0 2px 16px rgba(0,0,0,.07);border:1px solid rgba(0,0,0,.05)}
.tag{display:inline-block;padding:3px 10px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#1a202c;color:#fff;padding:10px 22px;border-radius:999px;font-size:13px;font-weight:700;z-index:9999;opacity:0;transition:opacity .25s;pointer-events:none;white-space:nowrap}
.toast.show{opacity:1}
</style>`;

// ── PUNCH CARD COMPONENT ──────────────────────────────
function punchCardHTML(tpl, punches, ser) {
  const { cardTitle, description, goal, color, expiry } = tpl;
  const cols = goal <= 5 ? goal : goal <= 8 ? 4 : 5;
  let circles = '';
  for (let i = 0; i < goal; i++) {
    if (i === goal - 1)   circles += `<div class="circle ${i < punches ? 'gift-filled' : 'gift-empty'}">🎁</div>`;
    else if (i < punches) circles += `<div class="circle filled">☕</div>`;
    else                  circles += `<div class="circle empty">${i + 1}</div>`;
  }
  const pct       = Math.round((punches / goal) * 100);
  const expiryFmt = expiry ? expiry.split('-').reverse().join('.') : '—';
  return `
<div class="punch-card" style="--c:${color}">
  <div class="pc-header">
    <div>
      <div class="pc-title">${esc(cardTitle)}</div>
      <div class="pc-desc">${esc(description)}</div>
    </div>
    <span class="tag" style="background:color-mix(in srgb,${color} 12%,#fff);color:${color}">STAMP CARD</span>
  </div>
  <div class="pc-grid" style="grid-template-columns:repeat(${cols},1fr)">${circles}</div>
  <div class="pc-footer">
    <div><div class="pc-flabel">סטטוס</div><div class="pc-fval">${punches} / ${goal}</div></div>
    <div class="pc-progress"><div class="pc-bar" style="width:${pct}%;background:${color}"></div></div>
    <div style="text-align:left"><div class="pc-flabel">תוקף</div><div class="pc-fval">${expiryFmt}</div></div>
  </div>
  ${ser ? `<div class="pc-serial">מס׳ ${esc(ser)}</div>` : ''}
</div>
<style>
.punch-card{background:#fff;border-radius:24px;padding:22px;border:1px solid rgba(0,0,0,.06);box-shadow:0 4px 24px rgba(0,0,0,.1)}
.pc-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;gap:8px}
.pc-title{font-size:18px;font-weight:900;color:var(--c)}
.pc-desc{font-size:12px;color:#9ca3af;margin-top:2px;font-weight:500}
.pc-grid{display:grid;gap:8px;justify-items:center;margin-bottom:16px}
.circle{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;transition:all .3s cubic-bezier(.34,1.56,.64,1)}
.circle.filled{background:var(--c);box-shadow:0 3px 12px color-mix(in srgb,var(--c) 40%,transparent)}
.circle.empty{border:2px dashed color-mix(in srgb,var(--c) 30%,transparent);color:color-mix(in srgb,var(--c) 35%,transparent);font-size:11px;font-weight:800}
.circle.gift-empty{background:color-mix(in srgb,var(--c) 7%,#fff);border:2px solid color-mix(in srgb,var(--c) 20%,transparent)}
.circle.gift-filled{background:#f59e0b;box-shadow:0 3px 12px rgba(245,158,11,.4)}
.pc-footer{display:flex;align-items:center;gap:10px;padding-top:14px;border-top:2px dashed #f0f0f8}
.pc-flabel{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:2px}
.pc-fval{font-size:14px;font-weight:900;color:var(--c)}
.pc-progress{flex:1;height:6px;background:#f0f0f8;border-radius:999px;overflow:hidden}
.pc-bar{height:100%;border-radius:999px;transition:width .5s ease}
.pc-serial{margin-top:10px;text-align:center;font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:.05em}
</style>`;
}

function qrBlock(elId, url, label, size = 130) {
  return `
<div class="qr-wrap">
  <div class="qr-box" id="${elId}"></div>
  <p class="qr-label">${label}</p>
  <p class="qr-url">${esc(url)}</p>
</div>
<script>new QRCode(document.getElementById('${elId}'),{text:'${url}',width:${size},height:${size},colorDark:'#6B46C1',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});<\/script>`;
}

// ══════════════════════════════════════════════════════
// ADMIN PAGE
// ══════════════════════════════════════════════════════
app.get('/', (req, res) => {
  const d  = load();
  const t  = d.template;
  const B  = base(req);
  const customers = Object.values(d.customers)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const custRows = customers.length === 0
    ? `<tr><td colspan="5" style="text-align:center;padding:32px;color:#9ca3af;font-size:14px">אין לקוחות עדיין — שתף את ה-QR לרישום</td></tr>`
    : customers.map(c => {
        const full = c.punches >= t.goal;
        const pct  = Math.round((c.punches / t.goal) * 100);
        return `<tr>
          <td><strong>${esc(c.name)}</strong><br/><span style="font-size:11px;color:#9ca3af">${esc(c.phone||'—')}</span></td>
          <td><span class="tag" style="background:#f4f4fa;color:#6b7280">${esc(c.serial)}</span></td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div style="flex:1;height:6px;background:#f0f0f8;border-radius:999px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:${full?'#22c55e':'var(--p)'};border-radius:999px"></div>
              </div>
              <span style="font-size:12px;font-weight:800;color:${full?'#22c55e':'var(--p)'};white-space:nowrap">${c.punches}/${t.goal}</span>
            </div>
          </td>
          <td>${full
            ? '<span class="tag" style="background:#dcfce7;color:#16a34a">מלא 🎉</span>'
            : '<span class="tag" style="background:#f4f4fa;color:#9ca3af">פעיל</span>'}</td>
          <td>
            <div style="display:flex;gap:6px">
              <a href="/card/${c.serial}" target="_blank" class="btn btn-ghost btn-sm">כרטיס ↗</a>
              <button onclick="resetCustomer('${c.serial}')" class="btn btn-sm" style="background:#fef2f2;color:#dc2626">אפס</button>
            </div>
          </td>
        </tr>`;
      }).join('');

  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>ניהול — PunchCard</title>
${FONTS}${QR_JS}${BASE_CSS}
<style>
.topbar{background:linear-gradient(135deg,#5B21B6,#7C3AED);color:#fff;padding:0 32px;height:64px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;box-shadow:0 2px 16px rgba(91,33,182,.3)}
.topbar h1{font-size:20px;font-weight:900;display:flex;align-items:center;gap:10px}
.biz{font-size:13px;opacity:.7;font-weight:500}
.container{max-width:1100px;margin:0 auto;padding:32px 24px}
.section-title{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:14px}
.main-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px}
@media(max-width:760px){.main-grid{grid-template-columns:1fr}}
.form-group{margin-bottom:14px}
.form-group label{display:block;font-size:12px;font-weight:800;color:#6b7280;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em}
.form-group input,.form-group select{width:100%;border:2px solid #e5e7eb;border-radius:12px;padding:10px 14px;font-size:14px;font-weight:600;color:#374151;transition:border-color .15s}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.color-row{display:flex;align-items:center;gap:10px}
.color-row input[type=color]{width:44px;height:44px;border:2px solid #e5e7eb;border-radius:10px;padding:3px;cursor:pointer}
.preview-wrap{padding:20px;background:#f8f6ff;border-radius:16px;border:2px dashed rgba(107,70,193,.2)}
.preview-label{font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;text-align:center;margin-bottom:14px}
.qr-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:500px){.qr-grid{grid-template-columns:1fr}}
.qr-wrap{display:flex;flex-direction:column;align-items:center;gap:10px;background:#f8f6ff;border-radius:16px;padding:20px;border:1px solid rgba(107,70,193,.12)}
.qr-box{padding:10px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;box-shadow:0 2px 8px rgba(0,0,0,.05)}
.qr-label{font-size:12px;font-weight:700;color:#6b7280;text-align:center;line-height:1.5}
.qr-url{font-size:10px;color:#9ca3af;word-break:break-all;text-align:center;font-family:monospace;direction:ltr}
.tbl-wrap{overflow-x:auto;border-radius:16px;border:1px solid #e5e7eb}
table{width:100%;border-collapse:collapse}
thead th{background:#faf8ff;padding:12px 16px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;text-align:right;border-bottom:1px solid #e5e7eb}
tbody tr{border-bottom:1px solid #f0f0f8;transition:background .1s}
tbody tr:hover{background:#faf8ff}
tbody tr:last-child{border-bottom:none}
tbody td{padding:12px 16px;font-size:13px;vertical-align:middle}
</style>
</head>
<body>

<div class="topbar">
  <h1>☕ PunchCard <span class="biz" id="biz-header">${esc(t.businessName)}</span></h1>
  <div style="display:flex;align-items:center;gap:8px">
    <span style="font-size:12px;opacity:.7">${customers.length} לקוחות</span>
    <span style="width:8px;height:8px;background:#4ade80;border-radius:50%;display:inline-block"></span>
  </div>
</div>

<div class="container">
  <div class="main-grid">

    <!-- LEFT: Designer -->
    <div>
      <p class="section-title">✏️ עצב כרטיס</p>
      <div class="card" style="padding:22px">
        <div class="form-group">
          <label>שם העסק</label>
          <input id="f-biz" type="text" value="${esc(t.businessName)}" oninput="livePreview()"/>
        </div>
        <div class="form-group">
          <label>כותרת הכרטיס</label>
          <input id="f-title" type="text" value="${esc(t.cardTitle)}" oninput="livePreview()"/>
        </div>
        <div class="form-group">
          <label>תיאור קצר</label>
          <input id="f-desc" type="text" value="${esc(t.description)}" oninput="livePreview()"/>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>מס׳ ניקובים</label>
            <input id="f-goal" type="number" min="3" max="20" value="${t.goal}" oninput="livePreview()"/>
          </div>
          <div class="form-group">
            <label>תוקף</label>
            <input id="f-expiry" type="date" value="${t.expiry}" dir="ltr" oninput="livePreview()"/>
          </div>
        </div>
        <div class="form-group">
          <label>צבע</label>
          <div class="color-row">
            <input id="f-color" type="color" value="${t.color}" oninput="livePreview()"/>
            <span id="color-val" style="font-size:13px;font-weight:700;color:#6b7280">${t.color}</span>
          </div>
        </div>
        <button onclick="saveTemplate()" class="btn btn-primary" style="width:100%;justify-content:center;padding:12px">
          💾 שמור כרטיסייה
        </button>
      </div>
    </div>

    <!-- RIGHT: Preview + QR -->
    <div style="display:flex;flex-direction:column;gap:20px">
      <div>
        <p class="section-title">👁️ תצוגה מקדימה</p>
        <div class="preview-wrap">
          <div class="preview-label">כך ייראה הכרטיס ללקוח</div>
          <div id="card-preview">${punchCardHTML(t, 6, null)}</div>
        </div>
      </div>
      <div>
        <p class="section-title">📲 ברקודים</p>
        <div class="qr-grid">
          ${qrBlock('qr-join',  `${B}/join`,        'לקוח סורק → מקבל כרטיס אישי', 130)}
          ${qrBlock('qr-demo',  `${B}/punch/demo`,  'QR לדוגמה — כזה יש לכל לקוח', 130)}
        </div>
        <p style="font-size:11px;color:#9ca3af;margin-top:10px;text-align:center;line-height:1.6">
          כל לקוח מקבל QR אישי · פקיד סורק → ניקוב נרשם
        </p>
      </div>
    </div>
  </div>

  <!-- TABLE -->
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <p class="section-title" style="margin-bottom:0">👥 לקוחות (${customers.length})</p>
      <button onclick="location.reload()" class="btn btn-ghost btn-sm">↻ רענן</button>
    </div>
    <div class="tbl-wrap card">
      <table>
        <thead>
          <tr>
            <th>שם</th><th>מס׳ סידורי</th><th>התקדמות</th><th>סטטוס</th><th>פעולות</th>
          </tr>
        </thead>
        <tbody>${custRows}</tbody>
      </table>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
function toast(msg, ok=true) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = ok ? '#1a202c' : '#dc2626';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

async function saveTemplate() {
  const data = {
    businessName: document.getElementById('f-biz').value,
    cardTitle:    document.getElementById('f-title').value,
    description:  document.getElementById('f-desc').value,
    goal:         parseInt(document.getElementById('f-goal').value) || 10,
    expiry:       document.getElementById('f-expiry').value,
    color:        document.getElementById('f-color').value,
  };
  const r = await fetch('/api/template', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (r.ok) {
    document.getElementById('biz-header').textContent = data.businessName;
    toast('✅ כרטיסייה נשמרה!');
  } else toast('שגיאה בשמירה', false);
}

function livePreview() {
  const color  = document.getElementById('f-color').value;
  const title  = document.getElementById('f-title').value || 'כותרת';
  const desc   = document.getElementById('f-desc').value || 'תיאור';
  const goal   = Math.min(20, Math.max(3, parseInt(document.getElementById('f-goal').value)||10));
  const expiry = document.getElementById('f-expiry').value;
  document.getElementById('color-val').textContent = color;

  const cols   = goal<=5?goal:goal<=8?4:5;
  const filled = Math.ceil(goal*.55);
  let circles  = '';
  for (let i=0;i<goal;i++) {
    if (i===goal-1) circles += \`<div class="circle gift-empty">🎁</div>\`;
    else if (i<filled) circles += \`<div class="circle filled">☕</div>\`;
    else circles += \`<div class="circle empty">\${i+1}</div>\`;
  }
  const pct = Math.round((filled/goal)*100);
  const ef  = expiry ? expiry.split('-').reverse().join('.') : '—';
  document.getElementById('card-preview').innerHTML = \`
<div class="punch-card" style="--c:\${color}">
  <div class="pc-header">
    <div><div class="pc-title">\${title}</div><div class="pc-desc">\${desc}</div></div>
    <span class="tag" style="background:color-mix(in srgb,\${color} 12%,#fff);color:\${color}">STAMP CARD</span>
  </div>
  <div class="pc-grid" style="grid-template-columns:repeat(\${cols},1fr)">\${circles}</div>
  <div class="pc-footer">
    <div><div class="pc-flabel">סטטוס</div><div class="pc-fval">6 / \${goal}</div></div>
    <div class="pc-progress"><div class="pc-bar" style="width:\${pct}%;background:\${color}"></div></div>
    <div style="text-align:left"><div class="pc-flabel">תוקף</div><div class="pc-fval">\${ef}</div></div>
  </div>
</div>\`;
}

async function resetCustomer(ser) {
  if (!confirm('לאפס כרטיס ' + ser + '?')) return;
  const r = await fetch('/api/reset/' + ser, { method: 'POST' });
  if (r.ok) { toast('✅ אופס'); setTimeout(() => location.reload(), 800); }
  else toast('שגיאה', false);
}
</script>
</body>
</html>`);
});

// ══════════════════════════════════════════════════════
// JOIN PAGE
// ══════════════════════════════════════════════════════
app.get('/join', (req, res) => {
  const t = load().template;
  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>הצטרף — ${esc(t.businessName)}</title>
${FONTS}${BASE_CSS}
<style>
body{background:linear-gradient(160deg,#5B21B6,#4338CA);display:flex;align-items:flex-end;min-height:100dvh}
.sheet{background:#f5f5fa;border-radius:28px 28px 0 0;width:100%;padding:28px 24px 40px;animation:up .4s cubic-bezier(.16,1,.3,1)}
@keyframes up{from{transform:translateY(100%)}to{transform:translateY(0)}}
.handle{width:36px;height:4px;background:#d1d5db;border-radius:999px;margin:0 auto 24px}
.mini-card{background:rgba(107,70,193,.06);border:1.5px solid rgba(107,70,193,.15);border-radius:16px;padding:14px 16px;display:flex;align-items:center;gap:12px;margin-bottom:22px}
.mini-icon{width:44px;height:44px;background:#6B46C1;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0}
.fg{margin-bottom:12px}
.fg label{display:block;font-size:12px;font-weight:800;color:#6b7280;margin-bottom:6px}
.fg input{width:100%;border:2px solid #e5e7eb;border-radius:14px;padding:13px 16px;font-size:16px;font-weight:600;background:#fff;color:#374151;transition:border-color .15s}
.submit-btn{width:100%;padding:15px;background:#6B46C1;color:#fff;border:none;border-radius:16px;font-size:17px;font-weight:900;cursor:pointer;margin-top:6px;box-shadow:0 8px 24px rgba(107,70,193,.35)}
.submit-btn:active{opacity:.9;transform:scale(.98)}
</style>
</head>
<body>
<div class="sheet">
  <div class="handle"></div>
  <div style="text-align:center;font-size:48px;margin-bottom:8px">☕</div>
  <h1 style="text-align:center;font-size:22px;font-weight:900;margin-bottom:4px">הצטרף לכרטיסיית הניקוב!</h1>
  <p style="text-align:center;font-size:13px;color:#9ca3af;margin-bottom:22px">מלא פרטים וקבל כרטיסייה דיגיטלית</p>
  <div class="mini-card">
    <div class="mini-icon">☕</div>
    <div>
      <div style="font-size:15px;font-weight:900;color:#6B46C1">${esc(t.cardTitle)}</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:2px">${esc(t.description)}</div>
    </div>
  </div>
  <form method="POST" action="/api/register">
    <div class="fg"><label>שמך המלא</label><input type="text" name="name" placeholder="ישראל ישראלי" required autocomplete="name"/></div>
    <div class="fg"><label>מספר טלפון</label><input type="tel" name="phone" placeholder="050-0000000" dir="ltr" autocomplete="tel"/></div>
    <button type="submit" class="submit-btn">קבל את הכרטיס שלי ✨</button>
  </form>
  <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:14px">אין ספאם, רק קפה ☕ · ${esc(t.businessName)}</p>
</div>
</body>
</html>`);
});

// ══════════════════════════════════════════════════════
// CUSTOMER CARD
// ══════════════════════════════════════════════════════
app.get('/card/:serial', (req, res) => {
  const d   = load();
  const c   = d.customers[req.params.serial];
  if (!c) return res.status(404).send('<h2 style="padding:40px;font-family:sans-serif">כרטיס לא נמצא 😕</h2>');

  const t        = d.template;
  const B        = base(req);
  const full     = c.punches >= t.goal;
  const remaining = t.goal - c.punches;
  const punchURL = `${B}/punch/${c.serial}`;

  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>הכרטיס של ${esc(c.name)}</title>
${FONTS}${QR_JS}${BASE_CSS}
<style>
body{background:linear-gradient(160deg,#5B21B6,#4338CA);display:flex;flex-direction:column;min-height:100dvh}
.top{padding:32px 20px 12px;color:#fff;display:flex;justify-content:space-between;align-items:center}
.sheet{flex:1;background:#f5f5fa;border-radius:28px 28px 0 0;padding:8px 16px 40px;overflow-y:auto;animation:up .4s cubic-bezier(.16,1,.3,1)}
@keyframes up{from{transform:translateY(100%)}to{transform:translateY(0)}}
.handle{width:36px;height:4px;background:#d1d5db;border-radius:999px;margin:10px auto 18px}
.qr-section{background:#fff;border-radius:20px;border:1px solid #e5e7eb;padding:20px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.06)}
.qr-box{display:inline-block;padding:12px;background:#fff;border-radius:14px;border:1.5px solid #e5e7eb;box-shadow:inset 0 2px 8px rgba(0,0,0,.04)}
.action-btn{display:block;width:100%;padding:15px;border-radius:16px;font-size:17px;font-weight:900;text-align:center;border:none;cursor:pointer;transition:all .15s}
.action-btn:active{transform:scale(.97)}
.ready{background:#22c55e;color:#fff;box-shadow:0 8px 24px rgba(34,197,94,.35)}
.waiting{background:rgba(107,70,193,.08);color:rgba(107,70,193,.4);border:2px solid rgba(107,70,193,.15);cursor:not-allowed}
</style>
</head>
<body>
<div class="top">
  <div style="font-size:18px;font-weight:900;display:flex;align-items:center;gap:8px">☕ ${esc(t.businessName)}</div>
  <div style="background:rgba(255,255,255,.15);padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700">${esc(c.name)}</div>
</div>
<div class="sheet">
  <div class="handle"></div>
  <div style="font-size:22px;font-weight:900;margin-bottom:2px">הכרטיס שלי 👋</div>
  <div style="font-size:13px;color:#9ca3af;margin-bottom:18px">מס׳ סידורי: ${esc(c.serial)}</div>

  ${punchCardHTML(t, c.punches, c.serial)}

  <div style="height:16px"></div>

  <div class="qr-section">
    <div style="font-size:15px;font-weight:800;color:#374151;margin-bottom:4px">הברקוד שלי</div>
    <div style="font-size:12px;color:#9ca3af;margin-bottom:14px;line-height:1.5">הצג לפקיד בכל קנייה לצבירת ניקוב</div>
    <div class="qr-box"><div id="my-qr"></div></div>
    <div style="margin-top:12px;font-size:12px;font-weight:700;color:#9ca3af">${esc(c.serial)}</div>
  </div>

  <div style="height:16px"></div>

  ${full
    ? `<button class="action-btn ready">🎁 מימוש הטבה — ${esc(t.reward)}</button>
       <p style="text-align:center;font-size:13px;color:#9ca3af;margin-top:10px">הצג לפקיד למימוש 🎉</p>`
    : `<button class="action-btn waiting" disabled>🎁 מימוש הטבה</button>
       <p style="text-align:center;font-size:13px;color:#9ca3af;margin-top:10px">חסרים עוד ${remaining} ניקובים ל${esc(t.reward)}</p>`
  }
</div>

<script>
new QRCode(document.getElementById('my-qr'),{
  text:'${punchURL}',width:160,height:160,
  colorDark:'#6B46C1',colorLight:'#ffffff',
  correctLevel:QRCode.CorrectLevel.M
});
let last=${c.punches};
setInterval(async()=>{
  try{
    const r=await fetch('/card-state/${c.serial}');
    const d=await r.json();
    if(d.punches!==last){location.reload();}
  }catch(e){}
},1500);
</script>
</body>
</html>`);
});

// ══════════════════════════════════════════════════════
// PUNCH  (cashier scans customer QR)
// ══════════════════════════════════════════════════════
app.get('/punch/:serial', (req, res) => {
  const ser = req.params.serial;
  const d   = load();

  if (ser === 'demo') {
    return res.send(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>דמו</title>${FONTS}<style>*{margin:0;padding:0;box-sizing:border-box;font-family:'Heebo',sans-serif}body{min-height:100dvh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#6B46C1,#7C3AED)}.card{background:#fff;border-radius:24px;padding:40px;text-align:center;margin:24px;max-width:320px}</style></head><body><div class="card"><div style="font-size:64px;margin-bottom:16px">📋</div><h1 style="font-size:22px;font-weight:900;color:#6B46C1;margin-bottom:8px">זהו QR לדוגמה</h1><p style="color:#9ca3af;font-size:14px;line-height:1.6">כל לקוח מקבל QR אישי עם מספר סידורי.<br/>סריקה שלו תנקב את הכרטיס שלו.</p></div></body></html>`);
  }

  const c = d.customers[ser];
  if (!c) return res.status(404).send('<h2 style="padding:40px;font-family:sans-serif">לקוח לא נמצא</h2>');

  const t    = d.template;
  const full = c.punches >= t.goal;
  if (!full) c.punches++;
  save(d);

  const nowFull = c.punches >= t.goal;
  const bg      = nowFull ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'linear-gradient(135deg,#6B46C1,#7C3AED)';
  const clr     = nowFull ? '#16a34a' : '#6B46C1';

  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>${nowFull?'🎉 כרטיס מלא!':'☕ ניקוב נרשם'}</title>
${FONTS}
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Heebo',system-ui,sans-serif}
body{min-height:100dvh;display:flex;align-items:center;justify-content:center;background:${bg}}
.card{background:#fff;border-radius:28px;padding:48px 36px;text-align:center;margin:24px;max-width:340px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.25);animation:pop .4s cubic-bezier(.34,1.56,.64,1)}
@keyframes pop{from{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}}
h1{font-size:28px;font-weight:900;color:${clr};margin:12px 0 8px}
.count{font-size:56px;font-weight:900;color:${clr};line-height:1;margin:8px 0}
p{font-size:14px;color:#6b7280;line-height:1.6}
.name{font-size:15px;font-weight:800;color:#374151;margin-bottom:2px}
</style>
</head>
<body>
<div class="card">
  <div style="font-size:80px;margin-bottom:8px">${nowFull?'🎉':'☕'}</div>
  <div class="name">${esc(c.name)}</div>
  <h1>${nowFull?'כרטיס מלא!':'ניקוב נרשם!'}</h1>
  <div class="count">${c.punches}<span style="font-size:28px;opacity:.35"> / ${t.goal}</span></div>
  <p>${nowFull
    ? `מגיע לך ${esc(t.reward)}! 🎁<br/>הצג לפקיד למימוש`
    : `עוד ${t.goal - c.punches} ניקובים ל${esc(t.reward)}`}</p>
</div>
</body>
</html>`);
});

// ══════════════════════════════════════════════════════
// API ROUTES
// ══════════════════════════════════════════════════════
app.post('/api/template', (req, res) => {
  const data = req.body;
  const d    = load();
  Object.assign(d.template, {
    businessName: String(data.businessName || d.template.businessName),
    cardTitle:    String(data.cardTitle    || d.template.cardTitle),
    description:  String(data.description || d.template.description),
    reward:       String(data.reward       || data.cardTitle || d.template.reward),
    goal:         Math.min(20, Math.max(3, parseInt(data.goal) || 10)),
    expiry:       String(data.expiry       || d.template.expiry),
    color:        String(data.color        || d.template.color),
  });
  save(d);
  res.json({ ok: true });
});

app.post('/api/register', (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'שם חסר' });
  const d   = load();
  const ser = serial(d.nextSerial++);
  d.customers[ser] = {
    serial:    ser,
    name,
    phone:     String(req.body.phone || '').trim(),
    punches:   0,
    redeemed:  0,
    createdAt: new Date().toISOString(),
  };
  save(d);
  res.redirect(`/card/${ser}`);
});

app.get('/card-state/:serial', (req, res) => {
  const d = load();
  const c = d.customers[req.params.serial];
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json({ punches: c.punches, goal: d.template.goal });
});

app.post('/api/reset/:serial', (req, res) => {
  const d = load();
  if (!d.customers[req.params.serial]) return res.status(404).json({ error: 'not found' });
  d.customers[req.params.serial].punches = 0;
  save(d);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════
if (!process.env.VERCEL) {
  const os   = require('os');
  function localIP() {
    for (const ifaces of Object.values(os.networkInterfaces()))
      for (const i of ifaces)
        if (i.family === 'IPv4' && !i.internal) return i.address;
    return 'localhost';
  }
  const PORT = 3000;
  const IP   = localIP();
  app.listen(PORT, '0.0.0.0', () => {
    console.log('\n☕  PunchCard\n');
    console.log(`   ניהול:         http://${IP}:${PORT}`);
    console.log(`   הצטרפות לקוח: http://${IP}:${PORT}/join`);
    console.log('');
  });
}

module.exports = app;
