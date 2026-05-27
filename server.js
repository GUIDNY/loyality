const http = require('http');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const PORT      = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// ── IP ──────────────────────────────────────────────────
function localIP() {
  for (const ifaces of Object.values(os.networkInterfaces()))
    for (const i of ifaces)
      if (i.family === 'IPv4' && !i.internal) return i.address;
  return 'localhost';
}
const IP = localIP();
const BASE = `http://${IP}:${PORT}`;

// ── DATA ────────────────────────────────────────────────
function defaultData() {
  return {
    template: {
      businessName: 'Café Third Place',
      cardTitle: 'קפה 10 חינם',
      description: 'צבור 10 ניקובים וקבל קפה מתנה',
      reward: 'קפה חינם',
      goal: 10,
      color: '#6B46C1',
      expiry: '2025-12-31'
    },
    customers: {},
    nextSerial: 1
  };
}
function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return defaultData(); }
}
function save(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }

// ── HELPERS ─────────────────────────────────────────────
function serial(n) { return 'PC-' + String(n).padStart(4, '0'); }
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function body(req) {
  return new Promise(res => {
    let s = '';
    req.on('data', c => s += c);
    req.on('end', () => {
      try { res(JSON.parse(s)); } catch { res(Object.fromEntries(new URLSearchParams(s))); }
    });
  });
}
function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}
function html(res, content, status = 200) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(content);
}
function redirect(res, url) {
  res.writeHead(302, { Location: url });
  res.end();
}

// ── SHARED CSS ──────────────────────────────────────────
const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>`;
const BASE_CSS = `
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Heebo',system-ui,sans-serif}
:root{--p:#6B46C1;--pl:#9F7AEA;--bg:#f4f4fa}
body{background:var(--bg);color:#1a202c;min-height:100dvh}
input,select,textarea{font-family:inherit}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--p)!important;box-shadow:0 0 0 3px rgba(107,70,193,.15)}
.btn{display:inline-flex;align-items:center;gap:6px;padding:10px 20px;border-radius:12px;font-weight:800;font-size:14px;cursor:pointer;border:none;transition:all .15s}
.btn:active{transform:scale(.97)}
.btn-primary{background:var(--p);color:#fff}
.btn-primary:hover{opacity:.9}
.btn-ghost{background:rgba(107,70,193,.08);color:var(--p)}
.btn-ghost:hover{background:rgba(107,70,193,.15)}
.btn-sm{padding:6px 14px;font-size:12px;border-radius:9px}
.card{background:#fff;border-radius:20px;box-shadow:0 2px 16px rgba(0,0,0,.07);border:1px solid rgba(0,0,0,.05)}
.tag{display:inline-block;padding:3px 10px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
</style>`;

// ── PUNCH CARD COMPONENT ─────────────────────────────────
function punchCardHTML(tpl, punches, serial, forAdmin = false) {
  const { cardTitle, description, goal, color, expiry } = tpl;
  const cols = goal <= 5 ? goal : goal <= 8 ? 4 : 5;
  let circles = '';
  for (let i = 0; i < goal; i++) {
    if (i === goal - 1) {
      circles += `<div class="circle ${i < punches ? 'gift-filled' : 'gift-empty'}">🎁</div>`;
    } else if (i < punches) {
      circles += `<div class="circle filled">☕</div>`;
    } else {
      circles += `<div class="circle empty">${i + 1}</div>`;
    }
  }
  const pct = Math.round((punches / goal) * 100);
  const expiryFmt = expiry ? expiry.split('-').reverse().join('.') : '—';
  return `
<div class="punch-card" style="--c:${color}">
  <div class="pc-header">
    <div>
      <div class="pc-title">${esc(cardTitle)}</div>
      <div class="pc-desc">${esc(description)}</div>
    </div>
    <span class="tag" style="background:color-mix(in srgb,var(--c) 12%,#fff);color:var(--c)">STAMP CARD</span>
  </div>
  <div class="pc-grid" style="grid-template-columns:repeat(${cols},1fr)">${circles}</div>
  <div class="pc-footer">
    <div>
      <div class="pc-flabel">סטטוס</div>
      <div class="pc-fval">${punches} / ${goal} ניקובים</div>
    </div>
    <div class="pc-progress"><div class="pc-bar" style="width:${pct}%;background:var(--c)"></div></div>
    <div style="text-align:left">
      <div class="pc-flabel">תוקף</div>
      <div class="pc-fval">${expiryFmt}</div>
    </div>
  </div>
  ${serial ? `<div class="pc-serial">מס׳ ${esc(serial)}</div>` : ''}
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

// ── QR SCRIPT ────────────────────────────────────────────
const QR_SCRIPT = `<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>`;
function qrBlock(id, url, label, size = 130) {
  return `
<div class="qr-wrap">
  <div class="qr-box" id="${id}"></div>
  <p class="qr-label">${label}</p>
</div>
<script>
  new QRCode(document.getElementById('${id}'), {
    text: '${url}', width: ${size}, height: ${size},
    colorDark: '#6B46C1', colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });
<\/script>`;
}

// ══════════════════════════════════════════════════════════
// ADMIN PAGE
// ══════════════════════════════════════════════════════════
function adminPage(req, res) {
  const d = load();
  const t = d.template;
  const customers = Object.values(d.customers).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

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
          <td>${full ? '<span class="tag" style="background:#dcfce7;color:#16a34a">מלא 🎉</span>' : '<span class="tag" style="background:#f4f4fa;color:#9ca3af">פעיל</span>'}</td>
          <td>
            <div style="display:flex;gap:6px">
              <a href="/card/${c.serial}" target="_blank" class="btn btn-ghost btn-sm">כרטיס ↗</a>
              <button onclick="resetCustomer('${c.serial}')" class="btn btn-sm" style="background:#fef2f2;color:#dc2626">אפס</button>
            </div>
          </td>
        </tr>`;
      }).join('');

  html(res, `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>ניהול — PunchCard</title>
${FONTS}
${QR_SCRIPT}
${BASE_CSS}
<style>
/* Layout */
.topbar{background:linear-gradient(135deg,#5B21B6,#7C3AED);color:#fff;padding:0 32px;height:64px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;box-shadow:0 2px 16px rgba(91,33,182,.3)}
.topbar h1{font-size:20px;font-weight:900;display:flex;align-items:center;gap:10px}
.topbar .biz{font-size:13px;opacity:.7;font-weight:500}
.container{max-width:1100px;margin:0 auto;padding:32px 24px}
.section-title{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:14px}

/* Grid layout */
.main-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px}
@media(max-width:760px){.main-grid{grid-template-columns:1fr}}

/* Form */
.form-group{margin-bottom:14px}
.form-group label{display:block;font-size:12px;font-weight:800;color:#6b7280;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em}
.form-group input,.form-group select{width:100%;border:2px solid #e5e7eb;border-radius:12px;padding:10px 14px;font-size:14px;font-weight:600;color:#374151;transition:border-color .15s}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.color-row{display:flex;align-items:center;gap:10px}
.color-row input[type=color]{width:44px;height:44px;border:2px solid #e5e7eb;border-radius:10px;padding:3px;cursor:pointer}
.color-val{font-size:13px;font-weight:700;color:#6b7280}

/* Preview */
.preview-wrap{padding:20px;background:#f8f6ff;border-radius:16px;border:2px dashed rgba(107,70,193,.2)}
.preview-label{font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;text-align:center;margin-bottom:14px}

/* QR section */
.qr-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:500px){.qr-grid{grid-template-columns:1fr}}
.qr-wrap{display:flex;flex-direction:column;align-items:center;gap:10px;background:#f8f6ff;border-radius:16px;padding:20px;border:1px solid rgba(107,70,193,.12)}
.qr-box{padding:10px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;box-shadow:0 2px 8px rgba(0,0,0,.05)}
.qr-label{font-size:12px;font-weight:700;color:#6b7280;text-align:center;line-height:1.5}
.qr-url{font-size:10px;color:#9ca3af;word-break:break-all;text-align:center;font-family:monospace}

/* Table */
.tbl-wrap{overflow-x:auto;border-radius:16px;border:1px solid #e5e7eb}
table{width:100%;border-collapse:collapse}
thead th{background:#faf8ff;padding:12px 16px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;text-align:right;border-bottom:1px solid #e5e7eb}
tbody tr{border-bottom:1px solid #f0f0f8;transition:background .1s}
tbody tr:hover{background:#faf8ff}
tbody tr:last-child{border-bottom:none}
tbody td{padding:12px 16px;font-size:13px;vertical-align:middle}

/* Toast */
.toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#1a202c;color:#fff;padding:10px 22px;border-radius:999px;font-size:13px;font-weight:700;z-index:9999;opacity:0;transition:opacity .25s;pointer-events:none;white-space:nowrap}
.toast.show{opacity:1}
</style>
</head>
<body>

<div class="topbar">
  <h1>☕ PunchCard <span class="biz" id="biz-name-header">${esc(t.businessName)}</span></h1>
  <div style="display:flex;align-items:center;gap:8px">
    <span style="font-size:12px;opacity:.7">${customers.length} לקוחות</span>
    <span style="width:8px;height:8px;background:#4ade80;border-radius:50%;display:inline-block"></span>
  </div>
</div>

<div class="container">

  <!-- MAIN GRID -->
  <div class="main-grid">

    <!-- LEFT: Card Designer -->
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
            <label>מס׳ ניקובים למטרה</label>
            <input id="f-goal" type="number" min="3" max="20" value="${t.goal}" oninput="livePreview()"/>
          </div>
          <div class="form-group">
            <label>תוקף</label>
            <input id="f-expiry" type="date" value="${t.expiry}" dir="ltr" oninput="livePreview()"/>
          </div>
        </div>
        <div class="form-group">
          <label>צבע הכרטיס</label>
          <div class="color-row">
            <input id="f-color" type="color" value="${t.color}" oninput="livePreview()"/>
            <span class="color-val" id="color-val">${t.color}</span>
          </div>
        </div>
        <button onclick="saveTemplate()" class="btn btn-primary" style="width:100%;justify-content:center;padding:12px">
          💾 שמור כרטיסייה
        </button>
      </div>
    </div>

    <!-- RIGHT: Preview + QR -->
    <div style="display:flex;flex-direction:column;gap:20px">

      <!-- Live Preview -->
      <div>
        <p class="section-title">👁️ תצוגה מקדימה</p>
        <div class="preview-wrap">
          <div class="preview-label">כך ייראה הכרטיס ללקוח</div>
          <div id="card-preview">${punchCardHTML(t, 6, null)}</div>
        </div>
      </div>

      <!-- QR Codes -->
      <div>
        <p class="section-title">📲 ברקודים</p>
        <div class="qr-grid">
          ${qrBlock('qr-join', `${BASE}/join`, 'לחץ לשתף — לקוח סורק ומקבל כרטיס אישי', 130)}
          ${qrBlock('qr-punch-demo', `${BASE}/punch/demo`, 'QR לדוגמה — כזה יהיה לכל לקוח', 130)}
        </div>
        <p style="font-size:11px;color:#9ca3af;margin-top:10px;text-align:center;line-height:1.6">
          כל לקוח מקבל QR אישי עם מספר סידורי · כשהפקיד סורק את ה-QR של הלקוח — ניקוב נרשם
        </p>
      </div>

    </div>
  </div>

  <!-- CUSTOMERS TABLE -->
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <p class="section-title" style="margin-bottom:0">👥 לקוחות (${customers.length})</p>
      <button onclick="location.reload()" class="btn btn-ghost btn-sm">↻ רענן</button>
    </div>
    <div class="tbl-wrap card">
      <table>
        <thead>
          <tr>
            <th>שם לקוח</th>
            <th>מס׳ סידורי</th>
            <th>התקדמות</th>
            <th>סטטוס</th>
            <th>פעולות</th>
          </tr>
        </thead>
        <tbody id="cust-tbody">${custRows}</tbody>
      </table>
    </div>
  </div>

</div>

<div class="toast" id="toast"></div>

<script>
const BASE = '${BASE}';
const GOAL_INIT = ${t.goal};

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
    cardTitle: document.getElementById('f-title').value,
    description: document.getElementById('f-desc').value,
    goal: parseInt(document.getElementById('f-goal').value) || 10,
    expiry: document.getElementById('f-expiry').value,
    color: document.getElementById('f-color').value,
  };
  const r = await fetch('/api/template', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
  if (r.ok) {
    document.getElementById('biz-name-header').textContent = data.businessName;
    toast('✅ כרטיסייה נשמרה!');
  } else toast('שגיאה בשמירה', false);
}

function livePreview() {
  const color   = document.getElementById('f-color').value;
  const title   = document.getElementById('f-title').value || 'כותרת';
  const desc    = document.getElementById('f-desc').value || 'תיאור';
  const goal    = Math.min(20, Math.max(3, parseInt(document.getElementById('f-goal').value) || 10));
  const expiry  = document.getElementById('f-expiry').value;
  document.getElementById('color-val').textContent = color;

  const cols = goal <= 5 ? goal : goal <= 8 ? 4 : 5;
  const filled = Math.ceil(goal * 0.55);
  let circles = '';
  for (let i = 0; i < goal; i++) {
    if (i === goal-1) circles += \`<div class="circle gift-empty">🎁</div>\`;
    else if (i < filled) circles += \`<div class="circle filled">☕</div>\`;
    else circles += \`<div class="circle empty">\${i+1}</div>\`;
  }
  const pct = Math.round((filled/goal)*100);
  const expiryFmt = expiry ? expiry.split('-').reverse().join('.') : '—';

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
    <div style="text-align:left"><div class="pc-flabel">תוקף</div><div class="pc-fval">\${expiryFmt}</div></div>
  </div>
</div>\`;
}

async function resetCustomer(serial) {
  if (!confirm('לאפס את הכרטיס של ' + serial + '?')) return;
  const r = await fetch('/api/reset/' + serial, { method:'POST' });
  if (r.ok) { toast('✅ כרטיס אופס'); setTimeout(() => location.reload(), 800); }
  else toast('שגיאה', false);
}
</script>
</body>
</html>`);
}

// ══════════════════════════════════════════════════════════
// JOIN PAGE  (customer opens this on their phone)
// ══════════════════════════════════════════════════════════
function joinPage(req, res) {
  const d = load();
  const t = d.template;
  html(res, `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>הצטרף — ${esc(t.businessName)}</title>
${FONTS}
${BASE_CSS}
<style>
body{background:linear-gradient(160deg,#5B21B6,#4338CA);display:flex;align-items:flex-end;min-height:100dvh}
.sheet{background:#f5f5fa;border-radius:28px 28px 0 0;width:100%;padding:28px 24px 40px;animation:slideUp .4s cubic-bezier(.16,1,.3,1)}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
.handle{width:36px;height:4px;background:#d1d5db;border-radius:999px;margin:0 auto 24px}
.logo{text-align:center;font-size:48px;margin-bottom:8px}
h1{text-align:center;font-size:22px;font-weight:900;margin-bottom:4px}
.sub{text-align:center;font-size:13px;color:#9ca3af;margin-bottom:22px;font-weight:500}
.mini-card{background:rgba(107,70,193,.06);border:1.5px solid rgba(107,70,193,.15);border-radius:16px;padding:14px 16px;display:flex;align-items:center;gap:12px;margin-bottom:22px}
.mini-icon{width:44px;height:44px;background:#6B46C1;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0}
.mini-title{font-size:15px;font-weight:900;color:#6B46C1}
.mini-desc{font-size:12px;color:#9ca3af;margin-top:1px}
.form-group{margin-bottom:12px}
.form-group label{display:block;font-size:12px;font-weight:800;color:#6b7280;margin-bottom:6px}
.form-group input{width:100%;border:2px solid #e5e7eb;border-radius:14px;padding:13px 16px;font-size:16px;font-weight:600;background:#fff;color:#374151;transition:border-color .15s}
.submit-btn{width:100%;padding:15px;background:#6B46C1;color:#fff;border:none;border-radius:16px;font-size:17px;font-weight:900;cursor:pointer;margin-top:6px;transition:opacity .15s;box-shadow:0 8px 24px rgba(107,70,193,.35)}
.submit-btn:active{opacity:.9}
.footer-note{text-align:center;font-size:11px;color:#9ca3af;margin-top:14px}
</style>
</head>
<body>
<div class="sheet">
  <div class="handle"></div>
  <div class="logo">☕</div>
  <h1>הצטרף לכרטיסיית הניקוב!</h1>
  <p class="sub">מלא פרטים וקבל כרטיסייה דיגיטלית</p>

  <div class="mini-card">
    <div class="mini-icon">☕</div>
    <div>
      <div class="mini-title">${esc(t.cardTitle)}</div>
      <div class="mini-desc">${esc(t.description)}</div>
    </div>
  </div>

  <form method="POST" action="/api/register">
    <div class="form-group">
      <label>שמך המלא</label>
      <input type="text" name="name" placeholder="ישראל ישראלי" required autocomplete="name"/>
    </div>
    <div class="form-group">
      <label>מספר טלפון</label>
      <input type="tel" name="phone" placeholder="050-0000000" dir="ltr" autocomplete="tel"/>
    </div>
    <button type="submit" class="submit-btn">קבל את הכרטיס שלי ✨</button>
  </form>
  <p class="footer-note">אין ספאם, רק קפה ☕ · ${esc(t.businessName)}</p>
</div>
</body>
</html>`);
}

// ══════════════════════════════════════════════════════════
// CUSTOMER CARD PAGE
// ══════════════════════════════════════════════════════════
function customerCardPage(req, res, ser) {
  const d = load();
  const c = d.customers[ser];
  if (!c) return html(res, `<h1 style="padding:40px;font-family:sans-serif">כרטיס לא נמצא 😕</h1>`, 404);

  const t   = d.template;
  const full = c.punches >= t.goal;
  const remaining = t.goal - c.punches;
  const punchQR = `${BASE}/punch/${c.serial}`;

  html(res, `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>הכרטיס של ${esc(c.name)}</title>
${FONTS}
${QR_SCRIPT}
${BASE_CSS}
<style>
body{background:linear-gradient(160deg,#5B21B6,#4338CA);display:flex;flex-direction:column;min-height:100dvh}
.top{padding:32px 20px 12px;color:#fff;display:flex;justify-content:space-between;align-items:center}
.top-biz{font-size:18px;font-weight:900;display:flex;align-items:center;gap:8px}
.top-chip{background:rgba(255,255,255,.15);padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700}
.sheet{flex:1;background:#f5f5fa;border-radius:28px 28px 0 0;padding:8px 16px 40px;overflow-y:auto;animation:slideUp .4s cubic-bezier(.16,1,.3,1)}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
.handle{width:36px;height:4px;background:#d1d5db;border-radius:999px;margin:10px auto 18px}
.my-name{font-size:22px;font-weight:900;margin-bottom:2px}
.my-sub{font-size:13px;color:#9ca3af;margin-bottom:18px;font-weight:500}
.qr-section{background:#fff;border-radius:20px;border:1px solid #e5e7eb;padding:20px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.06)}
.qr-section h3{font-size:15px;font-weight:800;color:#374151;margin-bottom:4px}
.qr-section p{font-size:12px;color:#9ca3af;margin-bottom:14px;line-height:1.5}
.qr-box{display:inline-block;padding:12px;background:#fff;border-radius:14px;border:1.5px solid #e5e7eb;box-shadow:inset 0 2px 8px rgba(0,0,0,.04)}
.qr-serial{margin-top:12px;font-size:12px;font-weight:700;color:#9ca3af;letter-spacing:.06em}
.action-btn{display:block;width:100%;padding:15px;border-radius:16px;font-size:17px;font-weight:900;text-align:center;border:none;cursor:pointer;margin-top:4px;transition:all .15s}
.action-btn:active{transform:scale(.97)}
.action-btn.ready{background:#22c55e;color:#fff;box-shadow:0 8px 24px rgba(34,197,94,.35)}
.action-btn.waiting{background:rgba(107,70,193,.08);color:rgba(107,70,193,.45);border:2px solid rgba(107,70,193,.15);cursor:not-allowed}
.action-note{text-align:center;font-size:13px;color:#9ca3af;margin-top:10px;font-weight:500}
.pop{animation:pop .4s cubic-bezier(.34,1.56,.64,1)}
@keyframes pop{0%{transform:scale(.5);opacity:0}100%{transform:scale(1);opacity:1}}
</style>
</head>
<body>

<div class="top">
  <div class="top-biz">☕ ${esc(t.businessName)}</div>
  <div class="top-chip">${esc(c.name)}</div>
</div>

<div class="sheet">
  <div class="handle"></div>
  <div class="my-name">הכרטיס שלי 👋</div>
  <div class="my-sub">מס׳ סידורי: ${esc(c.serial)}</div>

  <!-- Punch Card -->
  <div id="card-render">${punchCardHTML(t, c.punches, c.serial)}</div>

  <div style="height:16px"></div>

  <!-- My QR -->
  <div class="qr-section">
    <h3>הברקוד שלי</h3>
    <p>הצג לפקיד בכל קנייה לצבירת ניקוב</p>
    <div class="qr-box"><div id="my-qr"></div></div>
    <div class="qr-serial">${esc(c.serial)}</div>
  </div>

  <div style="height:16px"></div>

  <!-- Action -->
  <div id="action-section">
    ${full
      ? `<button class="action-btn ready" onclick="alert('הצג לפקיד למימוש ✅')">🎁 מימוש הטבה — ${esc(t.reward)}</button>
         <p class="action-note">הגעת! הצג לפקיד כדי לממש 🎉</p>`
      : `<button class="action-btn waiting" disabled>🎁 מימוש הטבה</button>
         <p class="action-note">חסרים עוד ${remaining} ניקובים ל${esc(t.reward)}</p>`
    }
  </div>
</div>

<script>
new QRCode(document.getElementById('my-qr'), {
  text: '${punchQR}', width: 160, height: 160,
  colorDark: '#6B46C1', colorLight: '#ffffff',
  correctLevel: QRCode.CorrectLevel.M
});

// Poll for punch updates
let last = ${c.punches};
async function poll() {
  try {
    const r = await fetch('/card-state/${c.serial}');
    const d = await r.json();
    if (d.punches !== last) {
      last = d.punches;
      location.reload(); // simple: reload to re-render
    }
  } catch(e) {}
}
setInterval(poll, 1500);
</script>
</body>
</html>`);
}

// ══════════════════════════════════════════════════════════
// PUNCH ENDPOINT  (cashier scans customer QR)
// ══════════════════════════════════════════════════════════
function punchCustomer(req, res, ser) {
  const d = load();
  if (ser === 'demo') {
    return html(res, `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>דמו</title>${FONTS}<style>*{margin:0;padding:0;box-sizing:border-box;font-family:'Heebo',sans-serif}body{min-height:100dvh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#6B46C1,#7C3AED)}.card{background:#fff;border-radius:24px;padding:40px;text-align:center;margin:24px;max-width:320px}.emoji{font-size:64px;display:block;margin-bottom:16px}h1{font-size:22px;font-weight:900;color:#6B46C1;margin-bottom:8px}p{color:#9ca3af;font-size:14px;line-height:1.6}</style></head><body><div class="card"><span class="emoji">📋</span><h1>זהו QR לדוגמה</h1><p>כל לקוח מקבל QR אישי עם מספר סידורי.<br/>סריקה שלו תנקב את הכרטיס שלו.</p></div></body></html>`);
  }

  const c = d.customers[ser];
  if (!c) return html(res, '<h2 style="padding:40px;font-family:sans-serif">לקוח לא נמצא</h2>', 404);

  const t    = d.template;
  const was  = c.punches;
  const full = was >= t.goal;
  if (!full) c.punches++;
  save(d);

  const nowFull = c.punches >= t.goal;
  const bg      = nowFull ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'linear-gradient(135deg,#6B46C1,#7C3AED)';

  html(res, `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>${nowFull ? '🎉 כרטיס מלא!' : '☕ ניקוב נרשם'}</title>
${FONTS}
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Heebo',system-ui,sans-serif}
body{min-height:100dvh;display:flex;align-items:center;justify-content:center;background:${bg}}
.card{background:#fff;border-radius:28px;padding:48px 36px;text-align:center;margin:24px;max-width:340px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.25);animation:pop .4s cubic-bezier(.34,1.56,.64,1)}
@keyframes pop{from{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}}
.emoji{font-size:80px;display:block;margin-bottom:20px}
h1{font-size:28px;font-weight:900;color:${nowFull?'#16a34a':'#6B46C1'};margin-bottom:10px}
.count{font-size:56px;font-weight:900;color:${nowFull?'#16a34a':'#6B46C1'};line-height:1;margin:12px 0}
.sub{font-size:14px;color:#6b7280;line-height:1.6;font-weight:500}
.name{font-size:16px;font-weight:800;color:#374151;margin-bottom:4px}
</style>
</head>
<body>
<div class="card">
  <span class="emoji">${nowFull ? '🎉' : '☕'}</span>
  <div class="name">${esc(c.name)}</div>
  <h1>${nowFull ? 'כרטיס מלא!' : 'ניקוב נרשם!'}</h1>
  <div class="count">${c.punches}<span style="font-size:28px;opacity:.35"> / ${t.goal}</span></div>
  <p class="sub">${nowFull
    ? `מגיע לך ${esc(t.reward)}! 🎁<br/>הצג לפקיד למימוש`
    : `עוד ${t.goal - c.punches} ניקובים ל${esc(t.reward)}`}</p>
</div>
</body>
</html>`);
}

// ══════════════════════════════════════════════════════════
// API ROUTES
// ══════════════════════════════════════════════════════════
async function apiSaveTemplate(req, res) {
  const data = await body(req);
  const d    = load();
  Object.assign(d.template, {
    businessName: String(data.businessName || d.template.businessName),
    cardTitle:    String(data.cardTitle    || d.template.cardTitle),
    description:  String(data.description || d.template.description),
    reward:       String(data.reward       || d.template.reward || data.cardTitle),
    goal:         Math.min(20, Math.max(3, parseInt(data.goal) || 10)),
    expiry:       String(data.expiry       || d.template.expiry),
    color:        String(data.color        || d.template.color),
  });
  save(d);
  json(res, { ok: true });
}

async function apiRegister(req, res) {
  const data = await body(req);
  const name = String(data.name || '').trim();
  if (!name) return json(res, { error: 'שם חסר' }, 400);

  const d   = load();
  const ser = serial(d.nextSerial++);
  d.customers[ser] = {
    serial: ser,
    name,
    phone:     String(data.phone || '').trim(),
    punches:   0,
    redeemed:  0,
    createdAt: new Date().toISOString(),
  };
  save(d);
  redirect(res, `/card/${ser}`);
}

function apiCardState(req, res, ser) {
  const d = load();
  const c = d.customers[ser];
  if (!c) return json(res, { error: 'not found' }, 404);
  json(res, { punches: c.punches, goal: d.template.goal });
}

async function apiReset(req, res, ser) {
  const d = load();
  if (!d.customers[ser]) return json(res, { error: 'not found' }, 404);
  d.customers[ser].punches = 0;
  save(d);
  json(res, { ok: true });
}

// ══════════════════════════════════════════════════════════
// ROUTER
// ══════════════════════════════════════════════════════════
http.createServer(async (req, res) => {
  const u   = req.url.split('?')[0];
  const m   = req.method;

  if (m === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }); return res.end(); }

  if (m === 'GET'  && u === '/')                      return adminPage(req, res);
  if (m === 'GET'  && u === '/join')                  return joinPage(req, res);
  if (m === 'POST' && u === '/api/template')          return apiSaveTemplate(req, res);
  if (m === 'GET'  && u === '/api/template')          return json(res, load().template);
  if (m === 'GET'  && u === '/api/customers')         return json(res, Object.values(load().customers));
  if (m === 'POST' && u === '/api/register')          return apiRegister(req, res);

  const cardMatch  = u.match(/^\/card\/([^/]+)$/);
  if (m === 'GET'  && cardMatch)                      return customerCardPage(req, res, cardMatch[1]);

  const punchMatch = u.match(/^\/punch\/([^/]+)$/);
  if (m === 'GET'  && punchMatch)                     return punchCustomer(req, res, punchMatch[1]);

  const stateMatch = u.match(/^\/card-state\/([^/]+)$/);
  if (m === 'GET'  && stateMatch)                     return apiCardState(req, res, stateMatch[1]);

  const resetMatch = u.match(/^\/api\/reset\/([^/]+)$/);
  if (m === 'POST' && resetMatch)                     return apiReset(req, res, resetMatch[1]);

  res.writeHead(404); res.end('not found');

}).listen(PORT, '0.0.0.0', () => {
  console.log('\n☕  PunchCard — ממשק ניהול\n');
  console.log(`   ניהול (עסק):    http://${IP}:${PORT}`);
  console.log(`   הצטרפות לקוח:  http://${IP}:${PORT}/join`);
  console.log('\n   לקוח סורק QR הצטרפות → ממלא שם → מקבל כרטיס אישי עם QR');
  console.log('   פקיד סורק QR של לקוח → ניקוב נרשם ✓\n');
});
