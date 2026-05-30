const express      = require('express');
const fs           = require('fs');
const path         = require('path');
const crypto       = require('crypto');
const cookieParser = require('cookie-parser');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.set('trust proxy', 1);

// ══════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════
const DATA_FILE   = process.env.VERCEL ? '/tmp/data.json' : path.join(__dirname, 'data.json');
const ADMIN_PASS  = process.env.ADMIN_PASSWORD || 'admin123';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// ══════════════════════════════════════════════════════
// PERSISTENT STORAGE  (Vercel KV → /tmp → local file)
// ══════════════════════════════════════════════════════
let kv = null;
if (process.env.KV_REST_API_URL) {
  try { kv = require('@vercel/kv').kv; } catch {}
}

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

async function loadData() {
  if (kv) {
    try {
      const d = await kv.get('punchcard');
      return d || defaultData();
    } catch(e) { console.error('KV load error:', e.message); }
  }
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return defaultData(); }
}

async function saveData(d) {
  if (kv) {
    try { await kv.set('punchcard', d); return; }
    catch(e) { console.error('KV save error:', e.message); }
  }
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }
  catch(e) { console.error('file save error:', e.message); }
}

// ══════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════
function makeToken(pass) {
  return crypto.createHmac('sha256', 'punchcard_v1').update(pass).digest('hex');
}
const VALID_TOKEN = makeToken(ADMIN_PASS);

function isAdmin(req) {
  return req.cookies?.at === VALID_TOKEN;
}
function requireAdmin(req, res, next) {
  next(); // open access
}

// ══════════════════════════════════════════════════════
// RATE LIMIT  (in-memory, resets on cold start)
// ══════════════════════════════════════════════════════
const punchCooldown = new Map(); // serial → timestamp

function checkRate(serial) {
  const last = punchCooldown.get(serial);
  if (last && Date.now() - last < 10000) return false; // 10s cooldown
  punchCooldown.set(serial, Date.now());
  return true;
}

// ══════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════
function base(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}
function serial(n) { return 'PC-' + String(n).padStart(4, '0'); }
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function sanitize(s, max = 80) {
  return String(s ?? '').trim().slice(0, max);
}

// ══════════════════════════════════════════════════════
// SHARED HTML PARTS
// ══════════════════════════════════════════════════════
const FONTS  = `<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>`;
const QR_JS  = `<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>`;
const BASE_CSS = `<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Heebo',system-ui,sans-serif}
:root{--p:#6B46C1;--bg:#f4f4fa}
body{background:var(--bg);color:#1a202c;min-height:100dvh}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--p)!important;box-shadow:0 0 0 3px rgba(107,70,193,.15)}
.btn{display:inline-flex;align-items:center;gap:6px;padding:10px 20px;border-radius:12px;font-weight:800;font-size:14px;cursor:pointer;border:none;transition:all .15s}
.btn:active{transform:scale(.97)}
.btn-p{background:var(--p);color:#fff}.btn-p:hover{opacity:.9}
.btn-g{background:rgba(107,70,193,.08);color:var(--p)}.btn-g:hover{background:rgba(107,70,193,.15)}
.btn-sm{padding:6px 14px;font-size:12px;border-radius:9px}
.btn-red{background:#fef2f2;color:#dc2626}
.card{background:#fff;border-radius:20px;box-shadow:0 2px 16px rgba(0,0,0,.07);border:1px solid rgba(0,0,0,.05)}
.tag{display:inline-block;padding:3px 10px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#1a202c;color:#fff;padding:10px 22px;border-radius:999px;font-size:13px;font-weight:700;z-index:9999;opacity:0;transition:opacity .25s;pointer-events:none;white-space:nowrap}
.toast.show{opacity:1}
</style>`;

// ══════════════════════════════════════════════════════
// KRAFT CARD COMPONENT
// ══════════════════════════════════════════════════════
const BEAN_SVG   = `<svg viewBox="0 0 26 36" width="20" height="28" fill="currentColor"><ellipse cx="13" cy="18" rx="11" ry="16"/><path d="M13 2 Q5 18 13 34" fill="none" stroke="#C4975A" stroke-width="2.2" stroke-linecap="round"/></svg>`;
const BEANS_HEAD = `<svg viewBox="0 0 74 58" width="58" height="46" fill="#1C0F00" style="flex-shrink:0"><g transform="rotate(-22,20,34)"><ellipse cx="20" cy="34" rx="11" ry="16"/><path d="M20 18Q12 34 20 50" fill="none" stroke="#C4975A" stroke-width="2" stroke-linecap="round"/></g><g transform="rotate(18,50,18)"><ellipse cx="50" cy="18" rx="11" ry="16"/><path d="M50 2Q42 18 50 34" fill="none" stroke="#C4975A" stroke-width="2" stroke-linecap="round"/></g><g transform="rotate(-4,54,44)"><ellipse cx="54" cy="44" rx="10" ry="14"/><path d="M54 30Q47 44 54 58" fill="none" stroke="#C4975A" stroke-width="2" stroke-linecap="round"/></g></svg>`;
const ORDS = ['1ST','2ND','3RD','4TH','5TH','6TH','7TH','8TH','9TH','10TH','11TH','12TH','13TH','14TH','15TH','16TH','17TH','18TH','19TH','20TH'];

function kraftCard(tpl, punches, ser) {
  const { cardTitle, goal, reward, expiry, businessName } = tpl;
  const cols    = goal <= 5 ? goal : goal <= 8 ? 4 : 5;
  const goalOrd = ORDS[goal - 1] || goal + 'TH';

  let circles = '';
  for (let i = 0; i < goal; i++) {
    const last = i === goal - 1, stamped = i < punches;
    if (last) {
      const rw = (reward || 'FREE DRINK').toUpperCase().split(' ');
      circles += `<div class="kc ${stamped ? 'kc-on' : 'kc-prize'}">${stamped ? BEAN_SVG : `<span class="kc-pt">${rw.join('<br/>')}</span>`}</div>`;
    } else if (stamped) {
      circles += `<div class="kc kc-on kc-pop">${BEAN_SVG}</div>`;
    } else {
      circles += `<div class="kc kc-off">${i + 1}</div>`;
    }
  }

  const exFmt = expiry ? expiry.split('-').reverse().join('/') : '';
  return `
<div class="kraft-card">
  <div class="kh">
    <div><div class="kh-l">LOYALTY</div><div class="kh-c">CARD</div></div>
    ${BEANS_HEAD}
  </div>
  <div class="k-rule"></div>
  <div class="k-hl">COLLECT ${goal - 1} STAMPS — GET THE ${goalOrd} FREE</div>
  <div class="k-grid" style="grid-template-columns:repeat(${cols},1fr)">${circles}</div>
  ${ser ? `<div class="k-ser"># ${esc(ser)}</div>` : ''}
  <div class="k-terms">${exFmt ? `VALID UNTIL ${exFmt} · ` : ''}TERMS &amp; CONDITIONS APPLY</div>
</div>
<style>
.kraft-card{background:#C4975A;border-radius:14px;padding:18px 20px 14px;color:#1C0F00;position:relative;overflow:hidden;box-shadow:0 6px 28px rgba(0,0,0,.2)}
.kraft-card::after{content:'';position:absolute;inset:0;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='250'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='250' height='250' filter='url(%23n)' opacity='.09'/%3E%3C/svg%3E");pointer-events:none;border-radius:14px}
.kh{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.kh-l{font-size:12px;font-weight:900;letter-spacing:.22em;opacity:.75;font-family:Impact,'Arial Black',sans-serif}
.kh-c{font-size:30px;font-weight:900;letter-spacing:.06em;line-height:1;margin-top:-3px;font-family:Impact,'Arial Black',sans-serif}
.k-rule{height:2.5px;background:#1C0F00;border-radius:2px;opacity:.8;margin-bottom:5px}
.k-hl{font-size:10px;font-weight:900;letter-spacing:.07em;text-align:center;padding:4px 0 9px;opacity:.8;border-bottom:1.5px solid rgba(28,15,0,.35);margin-bottom:13px;font-family:Impact,'Arial Black',sans-serif}
.k-grid{display:grid;gap:8px;justify-items:center;margin-bottom:10px}
.kc{width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2.5px solid #1C0F00}
.kc-off{background:transparent;color:#1C0F00;font-size:15px;font-weight:900;opacity:.65;font-family:Impact,'Arial Black',sans-serif}
.kc-on{background:#1C0F00;color:#C4975A;border-color:#1C0F00}
.kc-pop{animation:kst .35s cubic-bezier(.34,1.56,.64,1) both}
@keyframes kst{from{transform:scale(.2) rotate(-20deg);opacity:0}to{transform:scale(1) rotate(0);opacity:1}}
.kc-prize{border-style:dashed;border-color:rgba(28,15,0,.55)}
.kc-pt{font-size:7px;font-weight:900;text-align:center;line-height:1.35;letter-spacing:.04em;opacity:.75;font-family:Impact,'Arial Black',sans-serif}
.k-ser{text-align:center;font-size:10px;opacity:.5;font-weight:900;letter-spacing:.12em;margin-bottom:5px;font-family:Impact,'Arial Black',sans-serif}
.k-terms{font-size:8px;text-align:center;opacity:.45;letter-spacing:.07em;padding-top:7px;border-top:1px solid rgba(28,15,0,.22);font-family:Impact,'Arial Black',sans-serif}
</style>`;
}

function qrBlock(id, url, label, size = 130) {
  return `<div class="qr-wrap">
  <div class="qr-box" id="${id}"></div>
  <p class="qr-label">${label}</p>
  <p class="qr-url">${esc(url)}</p>
</div>
<script>new QRCode(document.getElementById('${id}'),{text:'${url}',width:${size},height:${size},colorDark:'#6B46C1',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});<\/script>`;
}

// ══════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════
app.get('/login', (req, res) => {
  const next = req.query.next || '/';
  const err  = req.query.err  || '';
  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>כניסה — PunchCard</title>
${FONTS}${BASE_CSS}
<style>
body{background:linear-gradient(135deg,#5B21B6,#7C3AED);display:flex;align-items:center;justify-content:center}
.box{background:#fff;border-radius:24px;padding:36px 32px;width:min(92vw,380px);box-shadow:0 24px 60px rgba(0,0,0,.25)}
.logo{text-align:center;font-size:48px;margin-bottom:6px}
h1{text-align:center;font-size:22px;font-weight:900;color:#1a202c;margin-bottom:4px}
.sub{text-align:center;font-size:13px;color:#9ca3af;margin-bottom:24px}
.fg{margin-bottom:14px}
.fg label{display:block;font-size:12px;font-weight:800;color:#6b7280;margin-bottom:6px;text-transform:uppercase}
.fg input{width:100%;border:2px solid #e5e7eb;border-radius:12px;padding:12px 16px;font-size:15px;font-weight:600;transition:border-color .15s}
.err{background:#fef2f2;border:1px solid #fecaca;color:#dc2626;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;margin-bottom:14px;text-align:center}
</style>
</head>
<body>
<div class="box">
  <div class="logo">☕</div>
  <h1>PunchCard</h1>
  <p class="sub">כניסה לממשק הניהול</p>
  ${err ? `<div class="err">סיסמה שגויה — נסה שוב</div>` : ''}
  <form method="POST" action="/login">
    <input type="hidden" name="next" value="${esc(next)}"/>
    <div class="fg">
      <label>סיסמה</label>
      <input type="password" name="password" autofocus autocomplete="current-password" placeholder="הכנס סיסמה"/>
    </div>
    <button type="submit" class="btn btn-p" style="width:100%;justify-content:center;padding:13px;font-size:15px">כניסה</button>
  </form>
</div>
</body></html>`);
});

app.post('/login', (req, res) => {
  const pass = req.body.password || '';
  const next = sanitize(req.body.next || '/', 200);
  if (makeToken(pass) === VALID_TOKEN) {
    res.cookie('at', VALID_TOKEN, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: SESSION_TTL });
    return res.redirect(next.startsWith('/') ? next : '/');
  }
  res.redirect('/login?err=1&next=' + encodeURIComponent(next));
});

app.get('/logout', (req, res) => {
  res.clearCookie('at');
  res.redirect('/login');
});

// ══════════════════════════════════════════════════════
// ADMIN PAGE
// ══════════════════════════════════════════════════════
app.get('/' (req, res) => {
  const d  = await loadData();
  const t  = d.template;
  const B  = base(req);
  const customers = Object.values(d.customers).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const custRows = customers.length === 0
    ? `<tr><td colspan="5" style="text-align:center;padding:32px;color:#9ca3af;font-size:14px">אין לקוחות עדיין — שתף את ה-QR</td></tr>`
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
              <a href="/card/${c.serial}" target="_blank" class="btn btn-g btn-sm">כרטיס ↗</a>
              <button onclick="punchCustomer('${c.serial}')" class="btn btn-sm" style="background:#eff6ff;color:#3b82f6">+ ניקוב</button>
              <button onclick="resetCustomer('${c.serial}')" class="btn btn-sm btn-red">אפס</button>
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
.container{max-width:1100px;margin:0 auto;padding:32px 24px}
.sec-title{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:14px}
.main-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px}
@media(max-width:760px){.main-grid{grid-template-columns:1fr}}
.fg{margin-bottom:14px}
.fg label{display:block;font-size:12px;font-weight:800;color:#6b7280;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em}
.fg input{width:100%;border:2px solid #e5e7eb;border-radius:12px;padding:10px 14px;font-size:14px;font-weight:600;color:#374151;transition:border-color .15s}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.preview-wrap{padding:20px;background:#f8f6ff;border-radius:16px;border:2px dashed rgba(107,70,193,.2)}
.qr-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:500px){.qr-grid{grid-template-columns:1fr}}
.qr-wrap{display:flex;flex-direction:column;align-items:center;gap:10px;background:#f8f6ff;border-radius:16px;padding:20px;border:1px solid rgba(107,70,193,.12)}
.qr-box{padding:10px;background:#fff;border-radius:12px;border:1px solid #e5e7eb}
.qr-label{font-size:12px;font-weight:700;color:#6b7280;text-align:center;line-height:1.5}
.qr-url{font-size:10px;color:#9ca3af;word-break:break-all;text-align:center;font-family:monospace;direction:ltr}
.tbl-wrap{overflow-x:auto;border-radius:16px;border:1px solid #e5e7eb}
table{width:100%;border-collapse:collapse}
thead th{background:#faf8ff;padding:12px 16px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;text-align:right;border-bottom:1px solid #e5e7eb}
tbody tr{border-bottom:1px solid #f0f0f8;transition:background .1s}
tbody tr:hover{background:#faf8ff}
tbody tr:last-child{border-bottom:none}
tbody td{padding:12px 16px;font-size:13px;vertical-align:middle}
.stat-pill{background:rgba(255,255,255,.15);padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700}
</style>
</head>
<body>

<div class="topbar">
  <h1>☕ <span id="biz-h">${esc(t.businessName)}</span></h1>
  <div style="display:flex;align-items:center;gap:10px">
    <span class="stat-pill">${customers.length} לקוחות</span>
    <a href="/logout" style="color:rgba(255,255,255,.7);font-size:12px;font-weight:700;text-decoration:none">יציאה →</a>
  </div>
</div>

<div class="container">
  <div class="main-grid">

    <!-- Designer -->
    <div>
      <p class="sec-title">✏️ עצב כרטיס</p>
      <div class="card" style="padding:22px">
        <div class="fg"><label>שם העסק</label><input id="f-biz" value="${esc(t.businessName)}" oninput="livePreview()"/></div>
        <div class="fg"><label>כותרת הכרטיס</label><input id="f-title" value="${esc(t.cardTitle)}" oninput="livePreview()"/></div>
        <div class="fg"><label>תיאור</label><input id="f-desc" value="${esc(t.description)}" oninput="livePreview()"/></div>
        <div class="fg"><label>שם ההטבה</label><input id="f-reward" value="${esc(t.reward)}" oninput="livePreview()"/></div>
        <div class="form-row">
          <div class="fg"><label>מס׳ ניקובים</label><input id="f-goal" type="number" min="3" max="20" value="${t.goal}" oninput="livePreview()"/></div>
          <div class="fg"><label>תוקף</label><input id="f-expiry" type="date" value="${t.expiry}" dir="ltr" oninput="livePreview()"/></div>
        </div>
        <button onclick="saveTemplate()" class="btn btn-p" style="width:100%;justify-content:center;padding:12px">💾 שמור</button>
      </div>
    </div>

    <!-- Preview + QR -->
    <div style="display:flex;flex-direction:column;gap:20px">
      <div>
        <p class="sec-title">👁️ תצוגה מקדימה</p>
        <div class="preview-wrap">
          <div style="font-size:11px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;text-align:center;margin-bottom:14px">כך ייראה הכרטיס ללקוח</div>
          <div id="card-preview">${kraftCard(t, 6, null)}</div>
        </div>
      </div>
      <div>
        <p class="sec-title">📲 ברקודים</p>
        <div class="qr-grid">
          ${qrBlock('qr-join', `${B}/join`, 'לקוח סורק → מקבל כרטיס אישי', 130)}
          ${qrBlock('qr-demo', `${B}/punch/demo`, 'QR לדוגמה — כזה יש לכל לקוח', 130)}
        </div>
      </div>
    </div>
  </div>

  <!-- Customers -->
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <p class="sec-title" style="margin-bottom:0">👥 לקוחות (${customers.length})</p>
      <div style="display:flex;gap:8px">
        <input id="search" type="text" placeholder="חיפוש..." oninput="filterTable(this.value)"
               style="border:2px solid #e5e7eb;border-radius:10px;padding:6px 12px;font-size:13px;font-weight:600;width:160px"/>
        <button onclick="location.reload()" class="btn btn-g btn-sm">↻ רענן</button>
      </div>
    </div>
    <div class="tbl-wrap card">
      <table id="cust-table">
        <thead><tr><th>שם</th><th>מס׳ סידורי</th><th>התקדמות</th><th>סטטוס</th><th>פעולות</th></tr></thead>
        <tbody id="cust-tbody">${custRows}</tbody>
      </table>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
function toast(msg, ok=true){
  const el=document.getElementById('toast');
  el.textContent=msg; el.style.background=ok?'#1a202c':'#dc2626';
  el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2600);
}
async function saveTemplate(){
  const data={
    businessName: document.getElementById('f-biz').value,
    cardTitle:    document.getElementById('f-title').value,
    description:  document.getElementById('f-desc').value,
    reward:       document.getElementById('f-reward').value,
    goal:         parseInt(document.getElementById('f-goal').value)||10,
    expiry:       document.getElementById('f-expiry').value,
  };
  const r=await fetch('/api/template',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  if(r.ok){document.getElementById('biz-h').textContent=data.businessName;toast('✅ נשמר!');}
  else toast('שגיאה',false);
}
async function livePreview(){
  const data={
    cardTitle:   document.getElementById('f-title').value,
    description: document.getElementById('f-desc').value,
    reward:      document.getElementById('f-reward').value,
    goal:        document.getElementById('f-goal').value,
    expiry:      document.getElementById('f-expiry').value,
  };
  try{
    const r=await fetch('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    document.getElementById('card-preview').innerHTML=await r.text();
  }catch(e){}
}
async function punchCustomer(serial){
  const r=await fetch('/api/admin-punch/'+serial,{method:'POST'});
  const d=await r.json();
  if(r.ok){toast('✅ ניקוב נרשם ל-'+serial);setTimeout(()=>location.reload(),800);}
  else toast(d.error||'שגיאה',false);
}
async function resetCustomer(serial){
  if(!confirm('לאפס כרטיס '+serial+'?'))return;
  const r=await fetch('/api/reset/'+serial,{method:'POST'});
  if(r.ok){toast('✅ אופס');setTimeout(()=>location.reload(),800);}
  else toast('שגיאה',false);
}
function filterTable(q){
  document.querySelectorAll('#cust-tbody tr').forEach(tr=>{
    tr.style.display=tr.textContent.toLowerCase().includes(q.toLowerCase())?'':'none';
  });
}
</script>
</body></html>`);
});

// ══════════════════════════════════════════════════════
// JOIN PAGE
// ══════════════════════════════════════════════════════
app.get('/join', async (req, res) => {
  const t = (await loadData()).template;
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
.mc{background:rgba(107,70,193,.06);border:1.5px solid rgba(107,70,193,.15);border-radius:16px;padding:14px 16px;display:flex;align-items:center;gap:12px;margin-bottom:22px}
.mi{width:44px;height:44px;background:#6B46C1;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0}
.fg{margin-bottom:12px}
.fg label{display:block;font-size:12px;font-weight:800;color:#6b7280;margin-bottom:6px}
.fg input{width:100%;border:2px solid #e5e7eb;border-radius:14px;padding:13px 16px;font-size:16px;font-weight:600;background:#fff;transition:border-color .15s}
.sbtn{width:100%;padding:15px;background:#6B46C1;color:#fff;border:none;border-radius:16px;font-size:17px;font-weight:900;cursor:pointer;margin-top:6px;box-shadow:0 8px 24px rgba(107,70,193,.35)}
.sbtn:active{opacity:.9;transform:scale(.98)}
</style>
</head>
<body>
<div class="sheet">
  <div class="handle"></div>
  <div style="text-align:center;font-size:48px;margin-bottom:8px">☕</div>
  <h1 style="text-align:center;font-size:22px;font-weight:900;margin-bottom:4px">הצטרף לכרטיסיית הניקוב!</h1>
  <p style="text-align:center;font-size:13px;color:#9ca3af;margin-bottom:22px">מלא פרטים וקבל כרטיסייה דיגיטלית</p>
  <div class="mc">
    <div class="mi">☕</div>
    <div>
      <div style="font-size:15px;font-weight:900;color:#6B46C1">${esc(t.cardTitle)}</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:2px">${esc(t.description)}</div>
    </div>
  </div>
  <form method="POST" action="/api/register">
    <div class="fg"><label>שמך המלא</label><input type="text" name="name" placeholder="ישראל ישראלי" required autocomplete="name"/></div>
    <div class="fg"><label>מספר טלפון</label><input type="tel" name="phone" placeholder="050-0000000" dir="ltr" autocomplete="tel"/></div>
    <button type="submit" class="sbtn">קבל את הכרטיס שלי ✨</button>
  </form>
  <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:14px">אין ספאם, רק קפה ☕</p>
</div>
</body></html>`);
});

// ══════════════════════════════════════════════════════
// CUSTOMER CARD
// ══════════════════════════════════════════════════════
app.get('/card/:serial', async (req, res) => {
  const d   = await loadData();
  const c   = d.customers[req.params.serial];
  if (!c) return res.status(404).send(notFound());

  const t        = d.template;
  const B        = base(req);
  const full     = c.punches >= t.goal;
  const remaining = t.goal - c.punches;

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
.qr-sec{background:#fff;border-radius:20px;border:1px solid #e5e7eb;padding:20px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.06)}
.qr-box{display:inline-block;padding:12px;background:#fff;border-radius:14px;border:1.5px solid #e5e7eb}
.ab{display:block;width:100%;padding:15px;border-radius:16px;font-size:17px;font-weight:900;text-align:center;border:none;cursor:pointer;transition:all .15s}
.ab:active{transform:scale(.97)}
.ab-ready{background:#22c55e;color:#fff;box-shadow:0 8px 24px rgba(34,197,94,.35)}
.ab-wait{background:rgba(107,70,193,.08);color:rgba(107,70,193,.4);border:2px solid rgba(107,70,193,.15);cursor:not-allowed}
.wallet-btns{display:flex;flex-direction:column;gap:10px;margin-top:14px}
.wallet-btns a{display:flex;justify-content:center}
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

  ${kraftCard(t, c.punches, c.serial)}

  <div style="height:16px"></div>

  <div class="qr-sec">
    <div style="font-size:15px;font-weight:800;color:#374151;margin-bottom:4px">הברקוד שלי</div>
    <div style="font-size:12px;color:#9ca3af;margin-bottom:14px">הצג לפקיד בכל קנייה לצבירת ניקוב</div>
    <div class="qr-box"><div id="my-qr"></div></div>
    <div style="margin-top:10px;font-size:12px;font-weight:700;color:#9ca3af">${esc(c.serial)}</div>
  </div>

  <div style="height:16px"></div>

  ${full
    ? `<button class="ab ab-ready">🎁 מימוש הטבה — ${esc(t.reward)}</button>
       <p style="text-align:center;font-size:13px;color:#9ca3af;margin-top:10px">הצג לפקיד למימוש 🎉</p>`
    : `<button class="ab ab-wait" disabled>🎁 מימוש הטבה</button>
       <p style="text-align:center;font-size:13px;color:#9ca3af;margin-top:10px">חסרים עוד ${remaining} ניקובים ל${esc(t.reward)}</p>`
  }

  <div class="wallet-btns">
    <a href="/wallet/${c.serial}">
      <img src="https://pay.google.com/about/static_kv/partner/EN/iwallet_button.png" alt="Add to Google Wallet"
           style="height:48px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.12)"/>
    </a>
    <a href="/apple-wallet/${c.serial}">
      <div style="height:48px;background:#000;color:#fff;border-radius:8px;padding:0 24px;display:flex;align-items:center;gap:8px;font-weight:800;font-size:15px;box-shadow:0 2px 10px rgba(0,0,0,.2);width:fit-content">
         Add to <svg viewBox="0 0 814 1000" width="18" height="22" fill="white"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 790.7 0 663 0 541.8c0-207.5 135.4-317.5 269-317.5 70.1 0 128.4 46.4 172.5 46.4 42.8 0 109.6-50.1 190.2-50.1 30.6 0 111.3 2.6 168.3 74.9zm-234.5-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/></svg> Wallet
      </div>
    </a>
  </div>
</div>

<script>
new QRCode(document.getElementById('my-qr'),{
  text:'${B}/punch/${c.serial}',width:160,height:160,
  colorDark:'#6B46C1',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M
});
let last=${c.punches};
setInterval(async()=>{
  try{const r=await fetch('/card-state/${c.serial}');const d=await r.json();if(d.punches!==last){location.reload();}}
  catch(e){}
},2000);
</script>
</body></html>`);
});

// ══════════════════════════════════════════════════════
// PUNCH  (customer QR scan)
// ══════════════════════════════════════════════════════
app.get('/punch/:serial', async (req, res) => {
  const ser = req.params.serial;
  const d   = await loadData();

  if (ser === 'demo') return res.send(punchPage(null, null, 'demo'));

  const c = d.customers[ser];
  if (!c) return res.status(404).send(notFound());

  const t    = d.template;
  const full = c.punches >= t.goal;

  if (!full) {
    if (!checkRate(ser)) {
      return res.send(punchPage(c.name, c.punches, 'rate', t));
    }
    c.punches++;
    d.transactions = d.transactions || [];
    d.transactions.push({ id: 'tx' + Date.now(), customerId: ser, ts: new Date().toISOString(), type: 'punch' });
    if (typeof d.todayPunches === 'number') d.todayPunches++;
    await saveData(d);
  }

  const nowFull = c.punches >= t.goal;
  res.send(punchPage(c.name, c.punches, nowFull ? 'full' : 'ok', t));
});

function punchPage(name, punches, state, t) {
  const goal = t?.goal || 10;
  const configs = {
    ok:    { bg: 'linear-gradient(135deg,#6B46C1,#7C3AED)', emoji: '☕', title: 'ניקוב נרשם!',   clr: '#6B46C1' },
    full:  { bg: 'linear-gradient(135deg,#16a34a,#15803d)', emoji: '🎉', title: 'כרטיס מלא!',    clr: '#16a34a' },
    rate:  { bg: 'linear-gradient(135deg,#f59e0b,#d97706)', emoji: '⏳', title: 'המתן רגע',      clr: '#f59e0b' },
    demo:  { bg: 'linear-gradient(135deg,#6B46C1,#7C3AED)', emoji: '📋', title: 'QR לדוגמה',     clr: '#6B46C1' },
  };
  const { bg, emoji, title, clr } = configs[state] || configs.ok;
  const sub = state === 'full'  ? `מגיע לך ${esc(t?.reward||'פרס')}! 🎁<br/>הצג לפקיד למימוש`
            : state === 'rate'  ? 'ניקוב נרשם לאחרונה — נסה בעוד רגע'
            : state === 'demo'  ? 'כל לקוח מקבל QR אישי עם מספר סידורי.<br/>סריקה שלו תנקב את הכרטיס שלו.'
            : `עוד ${goal - (punches||0)} ניקובים ל${esc(t?.reward||'פרס')}`;

  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/><title>${title}</title>${FONTS}<style>*{margin:0;padding:0;box-sizing:border-box;font-family:'Heebo',system-ui,sans-serif}body{min-height:100dvh;display:flex;align-items:center;justify-content:center;background:${bg}}.card{background:#fff;border-radius:28px;padding:48px 36px;text-align:center;margin:24px;max-width:340px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.25);animation:pop .4s cubic-bezier(.34,1.56,.64,1)}@keyframes pop{from{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}}.name{font-size:15px;font-weight:800;color:#374151;margin-bottom:4px}h1{font-size:28px;font-weight:900;color:${clr};margin-bottom:10px}.count{font-size:56px;font-weight:900;color:${clr};line-height:1;margin:8px 0}p{font-size:14px;color:#6b7280;line-height:1.6}</style></head><body><div class="card">${name?`<div class="name">${esc(name)}</div>`:''}<div style="font-size:80px;margin-bottom:8px">${emoji}</div><h1>${title}</h1>${punches!=null?`<div class="count">${punches}<span style="font-size:28px;opacity:.35"> / ${goal}</span></div>`:''}<p>${sub}</p></div></body></html>`;
}

// ══════════════════════════════════════════════════════
// API
// ══════════════════════════════════════════════════════
app.post('/api/preview', async (req, res) => {
  const d   = await loadData();
  const tpl = { ...d.template, ...req.body, goal: Math.min(20, Math.max(3, parseInt(req.body.goal)||10)) };
  res.send(kraftCard(tpl, Math.ceil(tpl.goal * 0.55), null));
});

app.post('/api/template', requireAdmin, async (req, res) => {
  const data = req.body;
  const d    = await loadData();
  Object.assign(d.template, {
    businessName: sanitize(data.businessName || d.template.businessName),
    cardTitle:    sanitize(data.cardTitle    || d.template.cardTitle),
    description:  sanitize(data.description || d.template.description),
    reward:       sanitize(data.reward       || d.template.reward),
    goal:         Math.min(20, Math.max(3, parseInt(data.goal) || 10)),
    expiry:       sanitize(data.expiry       || d.template.expiry, 20),
  });
  await saveData(d);
  res.json({ ok: true });
});

app.post('/api/register', async (req, res) => {
  const name = sanitize(req.body.name || '', 60);
  if (!name) return res.status(400).send('שם חסר');
  const d   = await loadData();
  const ser = serial(d.nextSerial++);
  d.customers[ser] = {
    serial: ser, name,
    phone:     sanitize(req.body.phone || '', 20),
    punches:   0, redeemed: 0,
    createdAt: new Date().toISOString()
  };
  await saveData(d);
  res.redirect(`/card/${ser}`);
});

app.get('/card-state/:serial', async (req, res) => {
  const d = await loadData();
  const c = d.customers[req.params.serial];
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json({ punches: c.punches, goal: d.template.goal });
});

app.post('/api/reset/:serial', requireAdmin, async (req, res) => {
  const d = await loadData();
  if (!d.customers[req.params.serial]) return res.status(404).json({ error: 'not found' });
  d.customers[req.params.serial].punches = 0;
  await saveData(d);
  res.json({ ok: true });
});

app.post('/api/admin-punch/:serial', requireAdmin, async (req, res) => {
  const d = await loadData();
  const c = d.customers[req.params.serial];
  if (!c) return res.status(404).json({ error: 'לקוח לא נמצא' });
  if (c.punches >= d.template.goal) return res.status(400).json({ error: 'כרטיס מלא — יש למממש קודם' });
  c.punches++;
  if (typeof d.todayPunches === 'number') d.todayPunches++;
  await saveData(d);
  res.json({ ok: true, punches: c.punches });
});

// ══════════════════════════════════════════════════════
// APPLE WALLET
// ══════════════════════════════════════════════════════
const PASS_TYPE_ID = 'pass.ZX5VG4RDTL.loyalty';
const TEAM_ID      = 'ZX5VG4RDTL';

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
    l.writeUInt32BE(data.length); cv.writeUInt32BE(crc(Buffer.concat([t, data])));
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
  ihdr.writeUInt32BE(size,0); ihdr.writeUInt32BE(size,4);
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
    formatVersion: 1, passTypeIdentifier: PASS_TYPE_ID, teamIdentifier: TEAM_ID,
    serialNumber: customer.serial, organizationName: template.businessName,
    description: template.cardTitle,
    backgroundColor: 'rgb(196,151,90)', foregroundColor: 'rgb(28,15,0)', labelColor: 'rgb(80,40,0)',
    storeCard: {
      primaryFields:   [{ key:'stamps', label:'STAMPS',    value:`${customer.punches} / ${template.goal}` }],
      secondaryFields: [{ key:'reward', label:'REWARD',    value: template.reward },
                        { key:'left',   label:'REMAINING', value:`${Math.max(0,template.goal-customer.punches)} more` }],
      backFields:      [{ key:'serial', label:'Card Number', value: customer.serial },
                        { key:'terms',  label:'Terms',       value:'Terms and conditions apply.' }]
    },
    barcodes: [{ message:`${B}/punch/${customer.serial}`, format:'PKBarcodeFormatQR', messageEncoding:'iso-8859-1', altText: customer.serial }],
    barcode:  { message:`${B}/punch/${customer.serial}`, format:'PKBarcodeFormatQR', messageEncoding:'iso-8859-1', altText: customer.serial }
  };

  function getCert(envKey, filePath) {
    if (process.env[envKey]) return Buffer.from(process.env[envKey], 'base64');
    return fs.readFileSync(path.join(__dirname, filePath));
  }

  const tmpDir = path.join(os.tmpdir(), 'pkpass_' + Date.now() + '.pass');
  fs.mkdirSync(tmpDir, { recursive: true });
  const ico = solidPNG(29, 196, 151, 90), logo = solidPNG(58, 196, 151, 90);
  fs.writeFileSync(path.join(tmpDir,'pass.json'),   JSON.stringify(passJson));
  fs.writeFileSync(path.join(tmpDir,'icon.png'),    ico);
  fs.writeFileSync(path.join(tmpDir,'icon@2x.png'), solidPNG(58, 196, 151, 90));
  fs.writeFileSync(path.join(tmpDir,'logo.png'),    logo);
  fs.writeFileSync(path.join(tmpDir,'logo@2x.png'), logo);

  try {
    const pass = await PKPass.from({
      model: tmpDir,
      certificates: {
        wwdr:       getCert('APPLE_WWDR',      'wwdr.pem'),
        signerCert: getCert('APPLE_PASS_CERT', 'pass.pem'),
        signerKey:  getCert('APPLE_PASS_KEY',  'pass.key'),
      }
    });
    return pass.getAsBuffer();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

app.get('/apple-wallet/:serial', async (req, res) => {
  const d = await loadData();
  const c = d.customers[req.params.serial];
  if (!c) return res.status(404).send(notFound());
  try {
    const buf = await buildApplePass(c, d.template, base(req));
    res.set({ 'Content-Type':'application/vnd.apple.pkpass', 'Content-Disposition':`attachment; filename="${c.serial}.pkpass"`, 'Content-Length': buf.length });
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
  if (!creds) throw new Error('credentials חסר');

  const classId  = `${ISSUER_ID}.loyalty_v1`;
  const objectId = `${ISSUER_ID}.${customer.serial.replace(/-/g,'_')}`;

  const loyaltyClass = {
    id: classId, issuerName: template.businessName, programName: template.cardTitle,
    rewardsTierLabel: 'הטבה', rewardsTier: template.reward,
    hexBackgroundColor: '#C4975A', countryCode: 'IL', reviewStatus: 'UNDER_REVIEW'
  };
  const loyaltyObject = {
    id: objectId, classId, state: 'ACTIVE',
    accountId: customer.serial, accountName: customer.name,
    loyaltyPoints:          { label: 'ניקובים',  balance: { int: customer.punches } },
    secondaryLoyaltyPoints: { label: 'נותרו',    balance: { int: Math.max(0, template.goal - customer.punches) } },
    barcode: { type:'QR_CODE', value:`${B}/punch/${customer.serial}`, alternateText: customer.serial },
    textModulesData: [
      { id:'goal',   header:'מטרה',  body:`${template.goal} ניקובים` },
      { id:'reward', header:'פרס',   body: template.reward },
      { id:'left',   header:'נותרו', body:`${Math.max(0,template.goal-customer.punches)} ניקובים` }
    ]
  };

  const token = jwt.sign(
    { iss: creds.client_email, aud: 'google', typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000), origins: [B],
      payload: { loyaltyClasses: [loyaltyClass], loyaltyObjects: [loyaltyObject] } },
    creds.private_key, { algorithm: 'RS256' }
  );
  return `https://pay.google.com/gp/v/save/${token}`;
}

app.get('/wallet/:serial', async (req, res) => {
  const d = await loadData();
  const c = d.customers[req.params.serial];
  if (!c) return res.status(404).send(notFound());
  try { res.redirect(buildWalletURL(c, d.template, base(req))); }
  catch(e) { console.error('Wallet error:', e.message); res.status(500).send('שגיאה: ' + e.message); }
});

// ══════════════════════════════════════════════════════
// ERROR PAGES
// ══════════════════════════════════════════════════════
function notFound() {
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>לא נמצא</title>${FONTS}<style>*{margin:0;padding:0;box-sizing:border-box;font-family:'Heebo',sans-serif}body{min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#f4f4fa}.box{text-align:center;padding:48px 32px}.icon{font-size:64px;margin-bottom:16px}h1{font-size:24px;font-weight:900;color:#1a202c;margin-bottom:8px}p{color:#6b7280;font-size:14px}</style></head><body><div class="box"><div class="icon">🔍</div><h1>עמוד לא נמצא</h1><p>הקישור אינו תקף או שהכרטיס לא קיים</p></div></body></html>`;
}

app.use((req, res) => res.status(404).send(notFound()));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(notFound());
});

// ══════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════
if (!process.env.VERCEL) {
  const os = require('os');
  function localIP() {
    for (const ifaces of Object.values(os.networkInterfaces()))
      for (const i of ifaces)
        if (i.family === 'IPv4' && !i.internal) return i.address;
    return 'localhost';
  }
  const PORT = 3000, IP = localIP();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n☕  PunchCard\n`);
    console.log(`   ניהול:   http://${IP}:${PORT}  (סיסמה: ${ADMIN_PASS})`);
    console.log(`   לקוחות: http://${IP}:${PORT}/join\n`);
  });
}

module.exports = app;
