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

// ── PUNCH CARD COMPONENT (kraft / stamp style) ────────
const BEAN_SVG = `<svg viewBox="0 0 26 36" width="20" height="28" fill="currentColor"><ellipse cx="13" cy="18" rx="11" ry="16"/><path d="M13 2 Q5 18 13 34" fill="none" stroke="#C4975A" stroke-width="2.2" stroke-linecap="round"/></svg>`;
const BEANS_HEADER = `<svg viewBox="0 0 74 58" width="58" height="46" fill="#1C0F00" style="flex-shrink:0"><g transform="rotate(-22,20,34)"><ellipse cx="20" cy="34" rx="11" ry="16"/><path d="M20 18Q12 34 20 50" fill="none" stroke="#C4975A" stroke-width="2" stroke-linecap="round"/></g><g transform="rotate(18,50,18)"><ellipse cx="50" cy="18" rx="11" ry="16"/><path d="M50 2Q42 18 50 34" fill="none" stroke="#C4975A" stroke-width="2" stroke-linecap="round"/></g><g transform="rotate(-4,54,44)"><ellipse cx="54" cy="44" rx="10" ry="14"/><path d="M54 30Q47 44 54 58" fill="none" stroke="#C4975A" stroke-width="2" stroke-linecap="round"/></g></svg>`;
const ORDS = ['1ST','2ND','3RD','4TH','5TH','6TH','7TH','8TH','9TH','10TH','11TH','12TH','13TH','14TH','15TH','16TH','17TH','18TH','19TH','20TH'];

function punchCardHTML(tpl, punches, ser) {
  const { cardTitle, goal, reward, expiry, businessName } = tpl;
  const cols    = goal <= 5 ? goal : goal <= 8 ? 4 : 5;
  const goalOrd = ORDS[goal - 1] || goal + 'TH';
  const stamps  = goal - 1;

  let circles = '';
  for (let i = 0; i < goal; i++) {
    const isLast    = i === goal - 1;
    const isStamped = i < punches;
    if (isLast) {
      const rw = (reward || 'FREE DRINK').toUpperCase().split(' ');
      circles += `<div class="kc ${isStamped ? 'kc-on' : 'kc-prize'}">
        ${isStamped ? BEAN_SVG : `<span class="kc-prize-txt">${rw.join('<br/>')}</span>`}
      </div>`;
    } else if (isStamped) {
      circles += `<div class="kc kc-on kc-pop">${BEAN_SVG}</div>`;
    } else {
      circles += `<div class="kc kc-off">${i + 1}</div>`;
    }
  }

  const exFmt = expiry ? expiry.split('-').reverse().join('/') : '';

  return `
<div class="kraft-card">
  <div class="kh">
    <div>
      <div class="kh-loyalty">LOYALTY</div>
      <div class="kh-card">CARD</div>
    </div>
    ${BEANS_HEADER}
  </div>
  <div class="k-rule"></div>
  <div class="k-headline">COLLECT ${stamps} STAMPS — GET THE ${goalOrd} FREE</div>
  <div class="k-grid" style="grid-template-columns:repeat(${cols},1fr)">${circles}</div>
  ${ser ? `<div class="k-serial"># ${esc(ser)}</div>` : ''}
  <div class="k-terms">${exFmt ? `VALID UNTIL ${exFmt} · ` : ''}TERMS &amp; CONDITIONS APPLY</div>
</div>
<style>
.kraft-card{background:#C4975A;border-radius:14px;padding:18px 20px 14px;color:#1C0F00;position:relative;overflow:hidden;box-shadow:0 6px 28px rgba(0,0,0,.2)}
.kraft-card::after{content:'';position:absolute;inset:0;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='250'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='250' height='250' filter='url(%23n)' opacity='.09'/%3E%3C/svg%3E");pointer-events:none;border-radius:14px}
.kh{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.kh-loyalty{font-size:12px;font-weight:900;letter-spacing:.22em;opacity:.75;font-family:Impact,'Arial Black',sans-serif;text-transform:uppercase}
.kh-card{font-size:30px;font-weight:900;letter-spacing:.06em;line-height:1;margin-top:-3px;font-family:Impact,'Arial Black',sans-serif}
.k-rule{height:2.5px;background:#1C0F00;border-radius:2px;opacity:.8;margin-bottom:5px}
.k-headline{font-size:10px;font-weight:900;letter-spacing:.07em;text-align:center;padding:4px 0 9px;opacity:.8;border-bottom:1.5px solid rgba(28,15,0,.35);margin-bottom:13px;font-family:Impact,'Arial Black',sans-serif}
.k-grid{display:grid;gap:8px;justify-items:center;margin-bottom:10px}
.kc{width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2.5px solid #1C0F00}
.kc-off{background:transparent;color:#1C0F00;font-size:15px;font-weight:900;opacity:.65;font-family:Impact,'Arial Black',sans-serif}
.kc-on{background:#1C0F00;color:#C4975A;border-color:#1C0F00}
.kc-pop{animation:kstamp .35s cubic-bezier(.34,1.56,.64,1) both}
@keyframes kstamp{from{transform:scale(.2) rotate(-20deg);opacity:0}to{transform:scale(1) rotate(0);opacity:1}}
.kc-prize{border-style:dashed;border-color:rgba(28,15,0,.55);background:transparent}
.kc-prize-txt{font-size:7px;font-weight:900;text-align:center;line-height:1.35;letter-spacing:.04em;opacity:.75;font-family:Impact,'Arial Black',sans-serif}
.k-serial{text-align:center;font-size:10px;opacity:.5;font-weight:900;letter-spacing:.12em;margin-bottom:5px;font-family:Impact,'Arial Black',sans-serif}
.k-terms{font-size:8px;text-align:center;opacity:.45;letter-spacing:.07em;font-weight:700;padding-top:7px;border-top:1px solid rgba(28,15,0,.22);font-family:Impact,'Arial Black',sans-serif}
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
          <label>שם ההטבה (פרס)</label>
          <input id="f-reward" type="text" value="${esc(t.reward)}" oninput="livePreview()"/>
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
    reward:       document.getElementById('f-reward').value,
    goal:         parseInt(document.getElementById('f-goal').value) || 10,
    expiry:       document.getElementById('f-expiry').value,
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

async function livePreview() {
  const data = {
    cardTitle:   document.getElementById('f-title').value,
    description: document.getElementById('f-desc').value,
    reward:      document.getElementById('f-reward').value,
    goal:        document.getElementById('f-goal').value,
    expiry:      document.getElementById('f-expiry').value,
  };
  try {
    const r = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    document.getElementById('card-preview').innerHTML = await r.text();
  } catch(e) {}
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

  <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px">
    <a href="/wallet/${c.serial}" style="display:flex;justify-content:center">
      <img src="https://pay.google.com/about/static_kv/partner/EN/iwallet_button.png"
           alt="Add to Google Wallet"
           style="height:48px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.12)"/>
    </a>
    <a href="/apple-wallet/${c.serial}" style="display:flex;justify-content:center">
      <img src="https://apple-resources.s3.amazonaws.com/media-services/images/en-us/apple-wallet-badge-sm.png"
           alt="Add to Apple Wallet"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
           style="height:48px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.12)"/>
      <div style="display:none;height:48px;background:#000;color:#fff;border-radius:8px;padding:0 20px;align-items:center;gap:8px;font-weight:700;font-size:14px;box-shadow:0 2px 10px rgba(0,0,0,.2)">
        🍎 Add to Apple Wallet
      </div>
    </a>
  </div>
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
app.post('/api/preview', (req, res) => {
  const d   = load();
  const tpl = { ...d.template, ...req.body, goal: Math.min(20, Math.max(3, parseInt(req.body.goal)||10)) };
  const filled = Math.ceil(tpl.goal * 0.55);
  res.send(punchCardHTML(tpl, filled, null));
});

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
// APPLE WALLET
// ══════════════════════════════════════════════════════
const PASS_TYPE_ID = 'pass.ZX5VG4RDTL.loyalty';
const TEAM_ID      = 'ZX5VG4RDTL';

// Minimal solid-colour PNG generator (no deps)
function solidPNG(size, r, g, b) {
  const zlib  = require('zlib');
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  function crc(buf) {
    let c = 0xFFFFFFFF;
    for (const b of buf) c = table[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (~c) >>> 0;
  }
  function chunk(type, data) {
    const t = Buffer.from(type), l = Buffer.allocUnsafe(4), cv = Buffer.allocUnsafe(4);
    l.writeUInt32BE(data.length);
    cv.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([l, t, data, cv]);
  }
  const raw = Buffer.allocUnsafe(size * (3 * size + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (3 * size + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (3 * size + 1) + 1 + x * 3;
      raw[i] = r; raw[i+1] = g; raw[i+2] = b;
    }
  }
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8]=8; ihdr[9]=2; ihdr[10]=ihdr[11]=ihdr[12]=0;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

async function buildApplePass(customer, template, B) {
  const { PKPass } = require('passkit-generator');
  const os         = require('os');

  const passJson = {
    formatVersion:      1,
    passTypeIdentifier: PASS_TYPE_ID,
    teamIdentifier:     TEAM_ID,
    serialNumber:       customer.serial,
    organizationName:   template.businessName,
    description:        template.cardTitle,
    backgroundColor:    'rgb(196,151,90)',
    foregroundColor:    'rgb(28,15,0)',
    labelColor:         'rgb(80,40,0)',
    storeCard: {
      primaryFields: [{
        key: 'stamps', label: 'STAMPS',
        value: `${customer.punches} / ${template.goal}`
      }],
      secondaryFields: [{
        key: 'reward', label: 'REWARD', value: template.reward
      },{
        key: 'left', label: 'REMAINING',
        value: `${Math.max(0, template.goal - customer.punches)} more`
      }],
      backFields: [{
        key: 'serial', label: 'Card Number', value: customer.serial
      },{
        key: 'terms', label: 'Terms', value: 'Terms and conditions apply.'
      }]
    },
    barcodes: [{
      message:         `${B}/punch/${customer.serial}`,
      format:          'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
      altText:         customer.serial
    }],
    barcode: {
      message:         `${B}/punch/${customer.serial}`,
      format:          'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
      altText:         customer.serial
    }
  };

  // Write model to a temp folder (passkit-generator requires folder path)
  const tmpDir = path.join(os.tmpdir(), 'pkpass_' + Date.now() + '.pass');
  fs.mkdirSync(tmpDir, { recursive: true });

  const icon = solidPNG(29, 196, 151, 90);
  const logo = solidPNG(58, 196, 151, 90);

  fs.writeFileSync(path.join(tmpDir, 'pass.json'),   JSON.stringify(passJson));
  fs.writeFileSync(path.join(tmpDir, 'icon.png'),    icon);
  fs.writeFileSync(path.join(tmpDir, 'icon@2x.png'), solidPNG(58, 196, 151, 90));
  fs.writeFileSync(path.join(tmpDir, 'logo.png'),    logo);
  fs.writeFileSync(path.join(tmpDir, 'logo@2x.png'), logo);

  try {
    const pass = await PKPass.from({
      model: tmpDir,
      certificates: {
        wwdr:       fs.readFileSync(path.join(__dirname, 'wwdr.pem')),
        signerCert: fs.readFileSync(path.join(__dirname, 'pass.pem')),
        signerKey:  fs.readFileSync(path.join(__dirname, 'pass.key')),
      }
    });
    return pass.getAsBuffer();
  } finally {
    // Cleanup temp folder
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

app.get('/apple-wallet/:serial', async (req, res) => {
  const d = load();
  const c = d.customers[req.params.serial];
  if (!c) return res.status(404).send('לקוח לא נמצא');
  try {
    const buf = await buildApplePass(c, d.template, base(req));
    res.set({
      'Content-Type':        'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="${c.serial}.pkpass"`,
      'Content-Length':      buf.length
    });
    res.send(buf);
  } catch(e) {
    console.error('Apple Wallet error:', e.message);
    res.status(500).send('שגיאה: ' + e.message);
  }
});

// ══════════════════════════════════════════════════════
// GOOGLE WALLET
// ══════════════════════════════════════════════════════
const ISSUER_ID = '3388000000023148997';

function getCreds() {
  if (process.env.GOOGLE_CREDENTIALS) {
    try { return JSON.parse(process.env.GOOGLE_CREDENTIALS); } catch {}
  }
  try { return require('./credentials.json'); } catch {}
  return null;
}

function buildWalletURL(customer, template, B) {
  const jwt   = require('jsonwebtoken');
  const creds = getCreds();
  if (!creds) throw new Error('credentials.json חסר');

  const classId  = `${ISSUER_ID}.loyalty_v1`;
  const objectId = `${ISSUER_ID}.${customer.serial.replace(/-/g,'_')}`;

  const loyaltyClass = {
    id: classId,
    issuerName: template.businessName,
    programName: template.cardTitle,
    rewardsTierLabel: 'הטבה',
    rewardsTier: template.reward,
    hexBackgroundColor: '#C4975A',
    countryCode: 'IL',
    reviewStatus: 'UNDER_REVIEW'
  };

  const loyaltyObject = {
    id: objectId,
    classId,
    state: 'ACTIVE',
    accountId: customer.serial,
    accountName: customer.name,
    loyaltyPoints: {
      label: 'ניקובים',
      balance: { int: customer.punches }
    },
    secondaryLoyaltyPoints: {
      label: 'נותרו',
      balance: { int: Math.max(0, template.goal - customer.punches) }
    },
    barcode: {
      type: 'QR_CODE',
      value: `${B}/punch/${customer.serial}`,
      alternateText: customer.serial
    },
    textModulesData: [
      { id: 'goal',   header: 'מטרה',  body: `${template.goal} ניקובים` },
      { id: 'reward', header: 'פרס',   body: template.reward },
      { id: 'left',   header: 'נותרו', body: `${Math.max(0, template.goal - customer.punches)} ניקובים` }
    ]
  };

  const token = jwt.sign(
    {
      iss: creds.client_email,
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      origins: [B],
      payload: { loyaltyClasses: [loyaltyClass], loyaltyObjects: [loyaltyObject] }
    },
    creds.private_key,
    { algorithm: 'RS256' }
  );

  return `https://pay.google.com/gp/v/save/${token}`;
}

app.get('/wallet/:serial', (req, res) => {
  const d = load();
  const c = d.customers[req.params.serial];
  if (!c) return res.status(404).send('לקוח לא נמצא');
  try {
    res.redirect(buildWalletURL(c, d.template, base(req)));
  } catch(e) {
    console.error('Wallet error:', e.message);
    res.status(500).send('שגיאה: ' + e.message);
  }
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
