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
// STORAGE
// ══════════════════════════════════════════════════════
const DATA_FILE = process.env.VERCEL ? '/tmp/data.json' : path.join(__dirname, 'data.json');
let redis = null;
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try {
    const { Redis } = require('@upstash/redis');
    redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
  } catch(e) {}
}

function emptyDB() {
  return { businesses: {}, customers: {}, nextBiz: 1, nextSerial: 1 };
}
async function loadDB() {
  if (redis) { try { return (await redis.get('db')) || emptyDB(); } catch(e) {} }
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return emptyDB(); }
}
async function saveDB(d) {
  if (redis) { try { await redis.set('db', d); return; } catch(e) {} }
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); } catch(e) {}
}

// ══════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════
const SECRET = process.env.SESSION_SECRET || 'punchcard_secret_2024';

function hashPass(pass) {
  return crypto.createHmac('sha256', SECRET).update(pass).digest('hex');
}
function makeSession(bizId) {
  const payload = bizId + '.' + Date.now();
  const sig     = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return payload + '.' + sig;
}
function verifySession(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = parts[0] + '.' + parts[1];
  const sig     = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  if (sig !== parts[2]) return null;
  return parts[0]; // bizId
}

async function authMiddleware(req, res, next) {
  const bizId = verifySession(req.cookies?.session);
  if (!bizId) return res.redirect('/login');
  const db = await loadDB();
  if (!db.businesses[bizId]) return res.redirect('/login');
  req.biz   = db.businesses[bizId];
  req.bizId = bizId;
  req.db    = db;
  next();
}

// ══════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════
function base(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function sanitize(s, max = 80) { return String(s ?? '').trim().slice(0, max); }
function bizSerial(n) { return 'B' + String(n).padStart(3, '0'); }
function custSerial(n) { return 'PC-' + String(n).padStart(4, '0'); }

const punchCooldown = new Map();
function checkRate(serial) {
  const last = punchCooldown.get(serial);
  if (last && Date.now() - last < 10000) return false;
  punchCooldown.set(serial, Date.now());
  return true;
}

// ══════════════════════════════════════════════════════
// SHARED STYLES
// ══════════════════════════════════════════════════════
const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet"/>`;
const QR_JS = `<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>`;
const BASE_CSS = `<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Heebo',system-ui,sans-serif}
:root{--p:#6B46C1;--pl:#9F7AEA;--bg:#f5f4ff}
body{background:var(--bg);color:#1a202c;min-height:100dvh}
input:focus,select:focus{outline:none;border-color:var(--p)!important;box-shadow:0 0 0 3px rgba(107,70,193,.12)}
.btn{display:inline-flex;align-items:center;gap:6px;padding:11px 22px;border-radius:12px;font-weight:800;font-size:14px;cursor:pointer;border:none;transition:all .15s;text-decoration:none}
.btn:active{transform:scale(.97)}
.btn-p{background:var(--p);color:#fff}.btn-p:hover{opacity:.9;box-shadow:0 4px 16px rgba(107,70,193,.35)}
.btn-w{background:#fff;color:var(--p);border:2px solid rgba(107,70,193,.2)}.btn-w:hover{border-color:var(--p)}
.btn-g{background:rgba(107,70,193,.08);color:var(--p)}.btn-g:hover{background:rgba(107,70,193,.15)}
.btn-red{background:#fef2f2;color:#dc2626;border:none}
.btn-sm{padding:7px 14px;font-size:12px;border-radius:9px}
.btn-lg{padding:14px 32px;font-size:16px;border-radius:14px}
.card{background:#fff;border-radius:20px;box-shadow:0 2px 20px rgba(107,70,193,.08);border:1px solid rgba(107,70,193,.08)}
.tag{display:inline-block;padding:3px 10px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#1a202c;color:#fff;padding:10px 22px;border-radius:999px;font-size:13px;font-weight:700;z-index:9999;opacity:0;transition:opacity .25s;pointer-events:none;white-space:nowrap}
.toast.show{opacity:1}
.fg{margin-bottom:14px}
.fg label{display:block;font-size:12px;font-weight:800;color:#6b7280;margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em}
.fg input{width:100%;border:2px solid #e5e7eb;border-radius:12px;padding:11px 16px;font-size:14px;font-weight:600;color:#1a202c;background:#fff;transition:border-color .15s}
</style>`;

// ══════════════════════════════════════════════════════
// KRAFT CARD
// ══════════════════════════════════════════════════════
const BEAN = `<svg viewBox="0 0 26 36" width="19" height="26" fill="currentColor"><ellipse cx="13" cy="18" rx="11" ry="16"/><path d="M13 2Q5 18 13 34" fill="none" stroke="#C4975A" stroke-width="2.2" stroke-linecap="round"/></svg>`;
const BEANS3 = `<svg viewBox="0 0 74 58" width="54" height="43" fill="#1C0F00"><g transform="rotate(-22,20,34)"><ellipse cx="20" cy="34" rx="11" ry="16"/><path d="M20 18Q12 34 20 50" fill="none" stroke="#C4975A" stroke-width="2" stroke-linecap="round"/></g><g transform="rotate(18,50,18)"><ellipse cx="50" cy="18" rx="11" ry="16"/><path d="M50 2Q42 18 50 34" fill="none" stroke="#C4975A" stroke-width="2" stroke-linecap="round"/></g><g transform="rotate(-4,54,44)"><ellipse cx="54" cy="44" rx="10" ry="14"/><path d="M54 30Q47 44 54 58" fill="none" stroke="#C4975A" stroke-width="2" stroke-linecap="round"/></g></svg>`;
const ORDS = ['1ST','2ND','3RD','4TH','5TH','6TH','7TH','8TH','9TH','10TH','11TH','12TH','13TH','14TH','15TH','16TH','17TH','18TH','19TH','20TH'];

function kraftCard(tpl, punches, ser) {
  const { cardTitle = 'Loyalty Card', goal = 10, reward = 'Free Item', expiry, businessName } = tpl;
  const cols    = goal <= 5 ? goal : goal <= 8 ? 4 : 5;
  const goalOrd = ORDS[goal - 1] || goal + 'TH';
  let circles = '';
  for (let i = 0; i < goal; i++) {
    const last = i === goal - 1, stamped = i < punches;
    if (last) {
      const rw = (reward || 'FREE').toUpperCase().split(' ').slice(0, 3);
      circles += `<div class="kc ${stamped ? 'kc-on' : 'kc-prize'}">${stamped ? BEAN : `<span class="kc-pt">${rw.join('<br/>')}</span>`}</div>`;
    } else if (stamped) {
      circles += `<div class="kc kc-on kc-pop">${BEAN}</div>`;
    } else {
      circles += `<div class="kc kc-off">${i + 1}</div>`;
    }
  }
  const exFmt = expiry ? expiry.split('-').reverse().join('/') : '';
  return `<div class="kc-card">
  <div class="kc-hd">
    <div><div class="kc-lo">LOYALTY</div><div class="kc-ca">CARD</div></div>${BEANS3}
  </div>
  <div class="kc-rule"></div>
  <div class="kc-hl">COLLECT ${goal-1} STAMPS — GET THE ${goalOrd} FREE</div>
  <div class="kc-grid" style="grid-template-columns:repeat(${cols},1fr)">${circles}</div>
  ${ser ? `<div class="kc-ser"># ${esc(ser)}</div>` : ''}
  <div class="kc-ft">${exFmt ? `VALID UNTIL ${exFmt} · ` : ''}TERMS &amp; CONDITIONS APPLY</div>
</div>
<style>
.kc-card{background:#C4975A;border-radius:16px;padding:18px 20px 14px;color:#1C0F00;position:relative;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.18)}
.kc-card::after{content:'';position:absolute;inset:0;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='.08'/%3E%3C/svg%3E");pointer-events:none;border-radius:16px}
.kc-hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.kc-lo{font-size:11px;font-weight:900;letter-spacing:.22em;opacity:.75;font-family:Impact,'Arial Black',sans-serif}
.kc-ca{font-size:28px;font-weight:900;letter-spacing:.06em;line-height:1;margin-top:-3px;font-family:Impact,'Arial Black',sans-serif}
.kc-rule{height:2.5px;background:#1C0F00;border-radius:2px;opacity:.8;margin-bottom:5px}
.kc-hl{font-size:9.5px;font-weight:900;letter-spacing:.07em;text-align:center;padding:4px 0 9px;opacity:.8;border-bottom:1.5px solid rgba(28,15,0,.35);margin-bottom:13px;font-family:Impact,'Arial Black',sans-serif}
.kc-grid{display:grid;gap:7px;justify-items:center;margin-bottom:10px}
.kc{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2.5px solid #1C0F00}
.kc-off{background:transparent;color:#1C0F00;font-size:14px;font-weight:900;opacity:.65;font-family:Impact,'Arial Black',sans-serif}
.kc-on{background:#1C0F00;color:#C4975A;border-color:#1C0F00}
.kc-pop{animation:ks .35s cubic-bezier(.34,1.56,.64,1) both}
@keyframes ks{from{transform:scale(.2) rotate(-20deg);opacity:0}to{transform:scale(1) rotate(0);opacity:1}}
.kc-prize{border-style:dashed;border-color:rgba(28,15,0,.55)}
.kc-pt{font-size:6.5px;font-weight:900;text-align:center;line-height:1.35;opacity:.75;font-family:Impact,'Arial Black',sans-serif}
.kc-ser{text-align:center;font-size:9px;opacity:.5;font-weight:900;letter-spacing:.12em;margin-bottom:4px;font-family:Impact,'Arial Black',sans-serif}
.kc-ft{font-size:7.5px;text-align:center;opacity:.45;letter-spacing:.07em;padding-top:7px;border-top:1px solid rgba(28,15,0,.22);font-family:Impact,'Arial Black',sans-serif}
</style>`;
}

// ══════════════════════════════════════════════════════
// LANDING PAGE
// ══════════════════════════════════════════════════════
app.get('/', (req, res) => {
  const bizId = verifySession(req.cookies?.session);
  if (bizId) return res.redirect('/dashboard');

  const cardPreview = kraftCard({ cardTitle:'Coffee 10 Free', goal:10, reward:'Free Coffee', businessName:'Your Café' }, 6, null);

  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>PunchCard — כרטיסיית ניקוב דיגיטלית</title>
${FONTS}${BASE_CSS}
<style>
/* NAV */
nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:16px 32px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.85);backdrop-filter:blur(16px);border-bottom:1px solid rgba(107,70,193,.1)}
.nav-logo{font-size:20px;font-weight:900;color:var(--p);display:flex;align-items:center;gap:8px;text-decoration:none}
.nav-links{display:flex;align-items:center;gap:10px}

/* HERO */
.hero{min-height:100dvh;display:flex;align-items:center;padding:100px 32px 60px;background:linear-gradient(135deg,#faf8ff 0%,#f0ecff 50%,#e8e3ff 100%);position:relative;overflow:hidden}
.hero::before{content:'';position:absolute;top:-200px;right:-200px;width:600px;height:600px;background:radial-gradient(circle,rgba(107,70,193,.12),transparent 70%);border-radius:50%}
.hero-inner{max-width:1100px;margin:0 auto;width:100%;display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center}
@media(max-width:768px){.hero-inner{grid-template-columns:1fr}.hero-card{display:none}}
.hero-tag{display:inline-flex;align-items:center;gap:6px;background:rgba(107,70,193,.1);color:var(--p);padding:6px 14px;border-radius:999px;font-size:13px;font-weight:700;margin-bottom:20px}
.hero h1{font-size:clamp(32px,5vw,52px);font-weight:900;line-height:1.15;color:#1a202c;margin-bottom:20px}
.hero h1 span{color:var(--p)}
.hero p{font-size:17px;color:#4a5568;line-height:1.7;margin-bottom:32px;font-weight:400}
.hero-cta{display:flex;gap:12px;flex-wrap:wrap}

/* FEATURES */
.features{padding:96px 32px;background:#fff}
.features-inner{max-width:1100px;margin:0 auto}
.section-label{text-align:center;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--p);margin-bottom:12px}
.section-title{text-align:center;font-size:clamp(24px,4vw,38px);font-weight:900;color:#1a202c;margin-bottom:48px;line-height:1.2}
.features-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
@media(max-width:768px){.features-grid{grid-template-columns:1fr}}
.feat{padding:28px;border-radius:20px;background:var(--bg);border:1px solid rgba(107,70,193,.1)}
.feat-icon{font-size:36px;margin-bottom:14px}
.feat h3{font-size:18px;font-weight:800;color:#1a202c;margin-bottom:8px}
.feat p{font-size:14px;color:#4a5568;line-height:1.6}

/* HOW IT WORKS */
.how{padding:96px 32px;background:linear-gradient(135deg,#faf8ff,#f0ecff)}
.how-inner{max-width:800px;margin:0 auto}
.steps{display:flex;flex-direction:column;gap:24px;margin-top:48px}
.step{display:flex;align-items:flex-start;gap:20px;background:#fff;border-radius:20px;padding:24px;box-shadow:0 2px 16px rgba(107,70,193,.08);border:1px solid rgba(107,70,193,.08)}
.step-num{width:44px;height:44px;background:var(--p);color:#fff;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;flex-shrink:0}
.step h3{font-size:17px;font-weight:800;margin-bottom:4px}
.step p{font-size:13px;color:#4a5568;line-height:1.5}

/* CTA SECTION */
.cta-sec{padding:96px 32px;background:linear-gradient(135deg,#5B21B6,#7C3AED);text-align:center;color:#fff}
.cta-sec h2{font-size:clamp(24px,4vw,40px);font-weight:900;margin-bottom:16px}
.cta-sec p{font-size:16px;opacity:.8;margin-bottom:36px}

/* FOOTER */
footer{background:#1a202c;color:#9ca3af;padding:32px;text-align:center;font-size:13px}
footer span{color:var(--pl)}
</style>
</head>
<body>

<nav>
  <a href="/" class="nav-logo">☕ PunchCard</a>
  <div class="nav-links">
    <a href="/login" class="btn btn-w btn-sm">כניסה</a>
    <a href="/signup" class="btn btn-p btn-sm">הצטרף בחינם</a>
  </div>
</nav>

<!-- HERO -->
<section class="hero">
  <div class="hero-inner">
    <div class="hero-text">
      <div class="hero-tag">✨ חינמי לחלוטין</div>
      <h1>כרטיסיית ניקוב<br/><span>דיגיטלית</span><br/>לעסק שלך</h1>
      <p>הפוך לקוחות חוזרים ללקוחות נאמנים.<br/>ללא נייר, ללא אפליקציה.<br/>עם Google Wallet ו-Apple Wallet.</p>
      <div class="hero-cta">
        <a href="/signup" class="btn btn-p btn-lg">התחל בחינם ←</a>
        <a href="/login" class="btn btn-w btn-lg">כניסה לחשבון</a>
      </div>
    </div>
    <div class="hero-card">
      ${cardPreview}
    </div>
  </div>
</section>

<!-- FEATURES -->
<section class="features">
  <div class="features-inner">
    <div class="section-label">למה PunchCard?</div>
    <h2 class="section-title">כל מה שצריך לנאמנות לקוחות</h2>
    <div class="features-grid">
      <div class="feat">
        <div class="feat-icon">📱</div>
        <h3>Wallet מובנה</h3>
        <p>לקוחות שומרים את הכרטיס ב-Google Wallet או Apple Wallet — תמיד נגיש, לא נאבד.</p>
      </div>
      <div class="feat">
        <div class="feat-icon">⚡</div>
        <h3>סריקה בשנייה</h3>
        <p>הפקיד סורק QR של הלקוח — ניקוב נרשם מיד. לא צריך אפליקציה מיוחדת.</p>
      </div>
      <div class="feat">
        <div class="feat-icon">📊</div>
        <h3>CRM פשוט</h3>
        <p>ראה כמה לקוחות יש לך, מי קרוב לפרס, ומה הפעילות שלהם — הכל במקום אחד.</p>
      </div>
    </div>
  </div>
</section>

<!-- HOW IT WORKS -->
<section class="how">
  <div class="how-inner">
    <div class="section-label">איך זה עובד</div>
    <h2 class="section-title">3 דקות להקמה, שנים של נאמנות</h2>
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <div>
          <h3>הירשם עם שם העסק שלך</h3>
          <p>פותח חשבון בחינם, מגדיר את הכרטיסייה — כמה ניקובים, מה ההטבה, מתי פג התוקף.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div>
          <h3>שתף QR להצטרפות לקוחות</h3>
          <p>לקוח מגיע לקופה, סורק QR, ממלא שם — ומקבל כרטיסייה אישית עם מספר סידורי.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div>
          <h3>סרוק בכל קנייה ← ניקוב אוטומטי</h3>
          <p>הפקיד פותח את דף הסריקה, מכוון מצלמה לQR של הלקוח — ניקוב נרשם ושניהם רואים את זה.</p>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="cta-sec">
  <h2>מוכן להתחיל?</h2>
  <p>הצטרף לאלפי עסקים שכבר משתמשים ב-PunchCard</p>
  <a href="/signup" class="btn btn-lg" style="background:#fff;color:var(--p)">צור חשבון בחינם ☕</a>
</section>

<footer>
  <p>PunchCard © 2024 · נבנה עם ❤️ ל<span>עסקים ישראלים</span></p>
</footer>

</body></html>`);
});

// ══════════════════════════════════════════════════════
// SIGNUP
// ══════════════════════════════════════════════════════
app.get('/signup', (req, res) => {
  res.send(authPage('signup'));
});
app.post('/signup', async (req, res) => {
  const name  = sanitize(req.body.name || '');
  const email = sanitize(req.body.email || '').toLowerCase();
  const pass  = req.body.password || '';
  if (!name || !email || pass.length < 6) return res.redirect('/signup?err=missing');

  const db = await loadDB();
  const existing = Object.values(db.businesses).find(b => b.email === email);
  if (existing) return res.redirect('/signup?err=exists');

  const bizId = bizSerial(db.nextBiz++);
  db.businesses[bizId] = {
    id: bizId, name, email,
    passwordHash: hashPass(pass),
    cardTemplate: {
      businessName: name,
      cardTitle:    name + ' Loyalty Card',
      description:  'Collect stamps and earn rewards!',
      reward:       'Free Item',
      goal:         10,
      expiry:       new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0]
    },
    createdAt: new Date().toISOString()
  };
  await saveDB(db);

  const token = makeSession(bizId);
  res.cookie('session', token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 7*24*60*60*1000 });
  res.redirect('/dashboard');
});

// ══════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════
app.get('/login', (req, res) => {
  res.send(authPage('login'));
});
app.post('/login', async (req, res) => {
  const email = sanitize(req.body.email || '').toLowerCase();
  const pass  = req.body.password || '';
  const db    = await loadDB();
  const biz   = Object.values(db.businesses).find(b => b.email === email);
  if (!biz || biz.passwordHash !== hashPass(pass)) return res.redirect('/login?err=1');

  const token = makeSession(biz.id);
  res.cookie('session', token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 7*24*60*60*1000 });
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  res.clearCookie('session');
  res.redirect('/');
});

function authPage(mode) {
  const isLogin = mode === 'login';
  const urlParams = ''; // for error
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${isLogin ? 'כניסה' : 'הרשמה'} — PunchCard</title>
${FONTS}${BASE_CSS}
<style>
body{background:linear-gradient(135deg,#5B21B6,#4338CA);display:flex;align-items:center;justify-content:center;padding:20px}
.box{background:#fff;border-radius:24px;padding:36px 32px;width:min(92vw,420px);box-shadow:0 24px 60px rgba(0,0,0,.2)}
.logo{text-align:center;font-size:36px;margin-bottom:6px}
h1{text-align:center;font-size:22px;font-weight:900;margin-bottom:4px}
.sub{text-align:center;font-size:13px;color:#9ca3af;margin-bottom:24px}
.err{background:#fef2f2;border:1px solid #fecaca;color:#dc2626;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;margin-bottom:14px;text-align:center}
.divider{text-align:center;font-size:12px;color:#9ca3af;margin:16px 0}
.switch{text-align:center;font-size:13px;color:#6b7280;margin-top:18px}
.switch a{color:var(--p);font-weight:700;text-decoration:none}
</style>
</head>
<body>
<div class="box">
  <div class="logo">☕</div>
  <h1>${isLogin ? 'כניסה לחשבון' : 'צור חשבון חינם'}</h1>
  <p class="sub">${isLogin ? 'ברוך השב ל-PunchCard' : 'הצטרף לאלפי עסקים'}</p>
  <form method="POST" action="/${mode}">
    ${!isLogin ? `<div class="fg"><label>שם העסק</label><input type="text" name="name" placeholder="הקפה שלי" required autocomplete="organization"/></div>` : ''}
    <div class="fg"><label>אימייל</label><input type="email" name="email" placeholder="cafe@example.com" required dir="ltr" autocomplete="email"/></div>
    <div class="fg"><label>סיסמה</label><input type="password" name="password" placeholder="${isLogin ? 'הסיסמה שלך' : 'לפחות 6 תווים'}" required autocomplete="${isLogin ? 'current-password' : 'new-password'}"/></div>
    <button type="submit" class="btn btn-p" style="width:100%;justify-content:center;padding:13px;font-size:15px">
      ${isLogin ? 'כניסה ←' : 'צור חשבון ✨'}
    </button>
  </form>
  <p class="switch">${isLogin ? 'אין לך חשבון?' : 'כבר יש חשבון?'} <a href="/${isLogin ? 'signup' : 'login'}">${isLogin ? 'הצטרף בחינם' : 'כנס כאן'}</a></p>
</div>
</body></html>`;
}

// ══════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════
app.get('/dashboard', authMiddleware, async (req, res) => {
  const { biz, bizId, db } = req;
  const t = biz.cardTemplate;
  const B = base(req);
  const customers = Object.values(db.customers || {}).filter(c => c.bizId === bizId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const custRows = customers.length === 0
    ? `<tr><td colspan="5" style="text-align:center;padding:40px;color:#9ca3af;font-size:14px">אין לקוחות עדיין — שתף את ה-QR ←</td></tr>`
    : customers.map(c => {
        const full = c.punches >= t.goal;
        const pct  = Math.round((c.punches / t.goal) * 100);
        return `<tr>
          <td><strong>${esc(c.name)}</strong><br/><span style="font-size:11px;color:#9ca3af">${esc(c.phone||'—')}</span></td>
          <td><span class="tag" style="background:#f4f4fa;color:#6b7280">${esc(c.serial)}</span></td>
          <td><div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;height:5px;background:#f0f0f8;border-radius:999px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:${full?'#22c55e':'var(--p)'};border-radius:999px"></div>
            </div>
            <span style="font-size:12px;font-weight:800;color:${full?'#22c55e':'var(--p)'};white-space:nowrap">${c.punches}/${t.goal}</span>
          </div></td>
          <td>${full ? '<span class="tag" style="background:#dcfce7;color:#16a34a">מלא 🎉</span>' : '<span class="tag" style="background:#f4f4fa;color:#9ca3af">פעיל</span>'}</td>
          <td><div style="display:flex;gap:6px">
            <a href="/card/${c.serial}" target="_blank" class="btn btn-g btn-sm">כרטיס ↗</a>
            <button onclick="adminPunch('${c.serial}')" class="btn btn-sm" style="background:#eff6ff;color:#3b82f6">+ ניקוב</button>
            <button onclick="adminReset('${c.serial}')" class="btn btn-sm btn-red">אפס</button>
          </div></td>
        </tr>`;
      }).join('');

  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(biz.name)} — PunchCard</title>
${FONTS}${QR_JS}${BASE_CSS}
<style>
.topbar{background:linear-gradient(135deg,#5B21B6,#7C3AED);color:#fff;padding:0 28px;height:62px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50}
.topbar .logo{font-size:18px;font-weight:900;display:flex;align-items:center;gap:8px}
.topbar .biz-name{opacity:.7;font-size:13px;font-weight:500}
.container{max-width:1100px;margin:0 auto;padding:28px 20px}
.dash-grid{display:grid;grid-template-columns:380px 1fr;gap:24px;margin-bottom:28px}
@media(max-width:900px){.dash-grid{grid-template-columns:1fr}}
.sec-title{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:12px}
.preview-wrap{background:#f8f6ff;border-radius:16px;padding:18px;border:2px dashed rgba(107,70,193,.2)}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.qr-wrap{display:flex;flex-direction:column;align-items:center;gap:10px;background:#f8f6ff;border-radius:16px;padding:18px;border:1px solid rgba(107,70,193,.12);text-align:center}
.qr-box{padding:10px;background:#fff;border-radius:12px;border:1px solid #e5e7eb}
.qr-label{font-size:12px;font-weight:700;color:#6b7280;line-height:1.5}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}
.stat{background:#fff;border-radius:16px;padding:16px;text-align:center;border:1px solid rgba(107,70,193,.08);box-shadow:0 2px 12px rgba(107,70,193,.06)}
.stat-val{font-size:28px;font-weight:900;color:var(--p)}
.stat-lbl{font-size:11px;color:#9ca3af;font-weight:600;margin-top:2px}
.tbl-wrap{overflow-x:auto;border-radius:16px;border:1px solid #e5e7eb}
table{width:100%;border-collapse:collapse}
thead th{background:#faf8ff;padding:11px 14px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;text-align:right;border-bottom:1px solid #e5e7eb}
tbody tr{border-bottom:1px solid #f0f0f8;transition:background .1s}
tbody tr:hover{background:#faf8ff}
tbody tr:last-child{border-bottom:none}
tbody td{padding:11px 14px;font-size:13px;vertical-align:middle}
.scan-btn{position:fixed;bottom:28px;right:28px;z-index:40;background:var(--p);color:#fff;border:none;border-radius:20px;padding:14px 22px;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 8px 24px rgba(107,70,193,.45);display:flex;align-items:center;gap:8px;transition:all .2s}
.scan-btn:hover{transform:scale(1.04)}
.scan-modal{display:none;position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);align-items:center;justify-content:center}
.scan-modal.open{display:flex}
.scan-box{background:#fff;border-radius:24px;padding:24px;width:min(92vw,420px);text-align:center}
.scan-video-wrap{position:relative;background:#000;border-radius:14px;overflow:hidden;aspect-ratio:4/3;margin-bottom:16px}
video{width:100%;height:100%;object-fit:cover;display:block}
.scan-frame{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:180px;height:180px;box-shadow:0 0 0 9999px rgba(0,0,0,.5);border-radius:12px}
.scan-frame::before,.scan-frame::after{content:'';position:absolute;width:28px;height:28px;border-color:var(--p);border-style:solid}
.scan-frame::before{top:-2px;right:-2px;border-width:3px 3px 0 0;border-radius:0 10px 0 0}
.scan-frame::after{bottom:-2px;left:-2px;border-width:0 0 3px 3px;border-radius:0 0 0 10px}
.scan-line{position:absolute;left:0;right:0;height:2px;background:var(--p);box-shadow:0 0 6px var(--p);animation:scn 1.8s linear infinite}
@keyframes scn{0%{top:0}100%{top:100%}}
.scan-result{padding:16px;border-radius:14px;margin-bottom:12px;display:none}
.scan-result.ok{background:#dcfce7;color:#16a34a}
.scan-result.err{background:#fef2f2;color:#dc2626}
</style>
</head>
<body>

<div class="topbar">
  <div class="logo">☕ PunchCard <span class="biz-name">${esc(biz.name)}</span></div>
  <div style="display:flex;align-items:center;gap:10px">
    <span style="background:rgba(255,255,255,.15);padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700">${customers.length} לקוחות</span>
    <a href="/logout" style="color:rgba(255,255,255,.65);font-size:12px;font-weight:700;text-decoration:none">יציאה</a>
  </div>
</div>

<div class="container">

  <!-- Stats -->
  <div class="stats">
    <div class="stat"><div class="stat-val">${customers.length}</div><div class="stat-lbl">לקוחות</div></div>
    <div class="stat"><div class="stat-val" style="color:#22c55e">${customers.filter(c => c.punches >= t.goal).length}</div><div class="stat-lbl">כרטיסים מלאים</div></div>
    <div class="stat"><div class="stat-val">${customers.reduce((s,c) => s + (c.redeemed||0), 0)}</div><div class="stat-lbl">הטבות מומשו</div></div>
  </div>

  <div class="dash-grid">

    <!-- LEFT: Card designer -->
    <div>
      <p class="sec-title">✏️ עצב כרטיס</p>
      <div class="card" style="padding:20px;margin-bottom:16px">
        <div class="fg"><label>שם העסק</label><input id="f-biz" value="${esc(t.businessName)}" oninput="preview()"/></div>
        <div class="fg"><label>כותרת</label><input id="f-title" value="${esc(t.cardTitle)}" oninput="preview()"/></div>
        <div class="fg"><label>תיאור</label><input id="f-desc" value="${esc(t.description)}" oninput="preview()"/></div>
        <div class="fg"><label>שם ההטבה</label><input id="f-reward" value="${esc(t.reward)}" oninput="preview()"/></div>
        <div class="form-row">
          <div class="fg"><label>ניקובים</label><input id="f-goal" type="number" min="3" max="20" value="${t.goal}" oninput="preview()"/></div>
          <div class="fg"><label>תוקף</label><input id="f-expiry" type="date" value="${t.expiry||''}" dir="ltr" oninput="preview()"/></div>
        </div>
        <button onclick="saveCard()" class="btn btn-p" style="width:100%;justify-content:center;padding:11px">💾 שמור כרטיסייה</button>
      </div>

      <p class="sec-title">👁️ תצוגה מקדימה</p>
      <div class="preview-wrap"><div id="card-preview">${kraftCard(t, 6, null)}</div></div>
    </div>

    <!-- RIGHT: QR + Customers -->
    <div>
      <p class="sec-title">📲 QR להצטרפות לקוחות</p>
      <div class="qr-wrap" style="margin-bottom:20px">
        <div class="qr-box"><div id="join-qr"></div></div>
        <p class="qr-label">לקוח סורק ← ממלא שם ← מקבל כרטיס אישי</p>
        <p style="font-size:11px;color:#9ca3af;font-family:monospace;direction:ltr;word-break:break-all">${B}/join/${bizId}</p>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <p class="sec-title" style="margin-bottom:0">👥 לקוחות (${customers.length})</p>
        <div style="display:flex;gap:8px">
          <input id="search" type="text" placeholder="חיפוש..." oninput="filterTable(this.value)"
            style="border:2px solid #e5e7eb;border-radius:10px;padding:6px 12px;font-size:12px;font-weight:600;width:140px"/>
          <button onclick="location.reload()" class="btn btn-g btn-sm">↻</button>
        </div>
      </div>
      <div class="tbl-wrap card">
        <table>
          <thead><tr><th>שם</th><th>מספר</th><th>התקדמות</th><th>סטטוס</th><th>פעולות</th></tr></thead>
          <tbody id="tbl">${custRows}</tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<!-- Scan Button -->
<button class="scan-btn" onclick="openScanner()">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>
  סרוק ניקוב
</button>

<!-- Scanner Modal -->
<div class="scan-modal" id="scan-modal" onclick="e => {if(e.target===this)closeScanner()}">
  <div class="scan-box">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h3 style="font-size:17px;font-weight:900">סרוק ברקוד לקוח</h3>
      <button onclick="closeScanner()" style="background:#f4f4fa;border:none;border-radius:999px;width:32px;height:32px;cursor:pointer;font-size:16px">✕</button>
    </div>
    <div id="scan-result" class="scan-result"></div>
    <div class="scan-video-wrap">
      <video id="scan-vid" autoplay playsinline muted></video>
      <canvas id="scan-cv" style="display:none"></canvas>
      <div class="scan-frame"><div class="scan-line"></div></div>
    </div>
    <div style="display:flex;gap:8px">
      <button onclick="startScan()" class="btn btn-p" style="flex:1;justify-content:center">הפעל מצלמה</button>
      <button onclick="closeScanner()" class="btn btn-g" style="padding:10px 16px">סגור</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const BIZ_ID = '${bizId}';

// QR code
new QRCode(document.getElementById('join-qr'), {
  text: '${B}/join/${bizId}',
  width: 140, height: 140,
  colorDark: '#6B46C1', colorLight: '#ffffff',
  correctLevel: QRCode.CorrectLevel.M
});

function toast(msg, ok=true){
  const el=document.getElementById('toast');
  el.textContent=msg; el.style.background=ok?'#1a202c':'#dc2626';
  el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2800);
}

async function saveCard(){
  const r=await fetch('/api/template',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    businessName: document.getElementById('f-biz').value,
    cardTitle:    document.getElementById('f-title').value,
    description:  document.getElementById('f-desc').value,
    reward:       document.getElementById('f-reward').value,
    goal:         parseInt(document.getElementById('f-goal').value)||10,
    expiry:       document.getElementById('f-expiry').value,
  })});
  r.ok ? toast('✅ נשמר!') : toast('שגיאה',false);
}

async function preview(){
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

async function adminPunch(serial){
  const r=await fetch('/api/punch/'+serial,{method:'POST'});
  const d=await r.json();
  r.ok ? (toast('✅ ניקוב נרשם — '+d.punches+'/'+d.goal), setTimeout(()=>location.reload(),900)) : toast(d.error||'שגיאה',false);
}
async function adminReset(serial){
  if(!confirm('לאפס כרטיס?'))return;
  const r=await fetch('/api/reset/'+serial,{method:'POST'});
  r.ok ? (toast('✅ אופס'),setTimeout(()=>location.reload(),800)) : toast('שגיאה',false);
}
function filterTable(q){
  document.querySelectorAll('#tbl tr').forEach(tr=>{
    tr.style.display=tr.textContent.toLowerCase().includes(q.toLowerCase())?'':'none';
  });
}

// Scanner
let scanStream=null, scanInterval=null;
function openScanner(){ document.getElementById('scan-modal').classList.add('open'); startScan(); }
function closeScanner(){
  document.getElementById('scan-modal').classList.remove('open');
  if(scanStream){ scanStream.getTracks().forEach(t=>t.stop()); scanStream=null; }
  clearInterval(scanInterval); scanInterval=null;
  document.getElementById('scan-result').style.display='none';
}
async function startScan(){
  try{
    scanStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    const vid=document.getElementById('scan-vid');
    vid.srcObject=scanStream; await vid.play();
    scanInterval=setInterval(()=>{
      const vid=document.getElementById('scan-vid');
      if(!vid.videoWidth) return;
      const cv=document.getElementById('scan-cv');
      cv.width=vid.videoWidth; cv.height=vid.videoHeight;
      const ctx=cv.getContext('2d'); ctx.drawImage(vid,0,0);
      const img=ctx.getImageData(0,0,cv.width,cv.height);
      if(typeof jsQR==='undefined') return;
      const code=jsQR(img.data,img.width,img.height);
      if(code?.data) handleScan(code.data);
    },400);
  }catch(e){ showScanResult('❌ אין גישה למצלמה', false); }
}
let lastScanned='';
async function handleScan(data){
  const m=data.match(/\/punch\/([^/?&]+)/)||data.match(/\/card\/([^/?&]+)/);
  if(!m) return;
  const serial=m[1];
  if(serial===lastScanned) return;
  lastScanned=serial;
  setTimeout(()=>{lastScanned='';},3000);

  const r=await fetch('/api/punch/'+serial,{method:'POST'});
  const d=await r.json();
  if(r.ok){
    showScanResult('✅ '+d.name+' — '+d.punches+'/'+d.goal+' ניקובים', true);
    if(d.full) showScanResult('🎉 כרטיס מלא! מגיע '+d.reward, true);
  } else {
    showScanResult('❌ '+(d.error||'שגיאה'), false);
  }
}
function showScanResult(msg, ok){
  const el=document.getElementById('scan-result');
  el.textContent=msg; el.className='scan-result '+(ok?'ok':'err');
  el.style.display='block';
  setTimeout(()=>{ el.style.display='none'; },3000);
}
</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jsqr/1.4.0/jsQR.js"></script>
</body></html>`);
});

// ══════════════════════════════════════════════════════
// JOIN (customer)
// ══════════════════════════════════════════════════════
app.get('/join/:bizId', async (req, res) => {
  const db  = await loadDB();
  const biz = db.businesses[req.params.bizId];
  if (!biz) return res.status(404).send(notFound());
  const t = biz.cardTemplate;

  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>הצטרף — ${esc(biz.name)}</title>
${FONTS}${BASE_CSS}
<style>
body{background:linear-gradient(160deg,#5B21B6,#4338CA);display:flex;align-items:flex-end;min-height:100dvh}
.sheet{background:#f5f4ff;border-radius:28px 28px 0 0;width:100%;padding:24px 20px 40px;animation:up .4s cubic-bezier(.16,1,.3,1)}
@keyframes up{from{transform:translateY(100%)}to{transform:translateY(0)}}
.handle{width:36px;height:4px;background:#d1d5db;border-radius:999px;margin:0 auto 20px}
.mc{background:rgba(107,70,193,.06);border:1.5px solid rgba(107,70,193,.15);border-radius:16px;padding:14px 16px;display:flex;align-items:center;gap:12px;margin-bottom:20px}
.mi{width:44px;height:44px;background:var(--p);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
.sbtn{width:100%;padding:15px;background:var(--p);color:#fff;border:none;border-radius:16px;font-size:17px;font-weight:900;cursor:pointer;margin-top:4px;box-shadow:0 8px 24px rgba(107,70,193,.35)}
.sbtn:active{opacity:.9;transform:scale(.98)}
</style>
</head>
<body>
<div class="sheet">
  <div class="handle"></div>
  <div style="text-align:center;font-size:44px;margin-bottom:8px">☕</div>
  <h1 style="text-align:center;font-size:21px;font-weight:900;margin-bottom:4px">הצטרף לכרטיסיית הניקוב!</h1>
  <p style="text-align:center;font-size:13px;color:#9ca3af;margin-bottom:20px">של ${esc(biz.name)}</p>
  <div class="mc">
    <div class="mi">☕</div>
    <div>
      <div style="font-size:15px;font-weight:900;color:var(--p)">${esc(t.cardTitle)}</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:2px">${esc(t.description)}</div>
    </div>
  </div>
  <form method="POST" action="/api/join/${biz.id}">
    <div class="fg"><label>שמך המלא</label><input type="text" name="name" placeholder="ישראל ישראלי" required autocomplete="name"/></div>
    <div class="fg"><label>מספר טלפון (אופציונלי)</label><input type="tel" name="phone" placeholder="050-0000000" dir="ltr" autocomplete="tel"/></div>
    <button type="submit" class="sbtn">קבל את הכרטיס שלי ✨</button>
  </form>
  <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:14px">אין ספאם · ${esc(biz.name)}</p>
</div>
</body></html>`);
});

app.post('/api/join/:bizId', async (req, res) => {
  const name  = sanitize(req.body.name || '');
  if (!name) return res.status(400).send('שם חסר');
  const db  = await loadDB();
  const biz = db.businesses[req.params.bizId];
  if (!biz) return res.status(404).send(notFound());

  if (!db.customers) db.customers = {};
  const ser = custSerial(db.nextSerial++);
  db.customers[ser] = {
    serial: ser, bizId: req.params.bizId,
    name, phone: sanitize(req.body.phone || '', 20),
    punches: 0, redeemed: 0,
    createdAt: new Date().toISOString()
  };
  await saveDB(db);
  res.redirect(`/card/${ser}`);
});

// ══════════════════════════════════════════════════════
// CUSTOMER CARD
// ══════════════════════════════════════════════════════
app.get('/card/:serial', async (req, res) => {
  const db = await loadDB();
  const c  = db.customers?.[req.params.serial];
  if (!c) return res.status(404).send(notFound());
  const biz = db.businesses[c.bizId];
  if (!biz) return res.status(404).send(notFound());
  const t   = biz.cardTemplate;
  const B   = base(req);
  const full = c.punches >= t.goal;

  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>הכרטיס של ${esc(c.name)}</title>
${FONTS}${QR_JS}${BASE_CSS}
<style>
body{background:linear-gradient(160deg,#5B21B6,#4338CA);display:flex;flex-direction:column;min-height:100dvh}
.top{padding:28px 20px 10px;color:#fff;display:flex;justify-content:space-between;align-items:center}
.sheet{flex:1;background:#f5f4ff;border-radius:28px 28px 0 0;padding:6px 16px 40px;overflow-y:auto;animation:up .4s cubic-bezier(.16,1,.3,1)}
@keyframes up{from{transform:translateY(100%)}to{transform:translateY(0)}}
.handle{width:36px;height:4px;background:#d1d5db;border-radius:999px;margin:10px auto 16px}
.qr-sec{background:#fff;border-radius:20px;border:1px solid #e5e7eb;padding:18px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.06)}
.qr-box{display:inline-block;padding:10px;background:#fff;border-radius:12px;border:1.5px solid #e5e7eb}
.ab{display:block;width:100%;padding:14px;border-radius:16px;font-size:16px;font-weight:900;text-align:center;border:none;cursor:pointer;transition:all .15s}
.ab:active{transform:scale(.97)}
.ab-ready{background:#22c55e;color:#fff;box-shadow:0 8px 24px rgba(34,197,94,.3)}
.ab-wait{background:rgba(107,70,193,.08);color:rgba(107,70,193,.4);border:2px solid rgba(107,70,193,.15);cursor:not-allowed}
.wallets{display:flex;flex-direction:column;gap:8px;margin-top:12px}
.wallets a{display:flex;justify-content:center}
</style>
</head>
<body>
<div class="top">
  <div style="font-size:17px;font-weight:900">☕ ${esc(biz.name)}</div>
  <div style="background:rgba(255,255,255,.15);padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700">${esc(c.name)}</div>
</div>
<div class="sheet">
  <div class="handle"></div>
  <div style="font-size:20px;font-weight:900;margin-bottom:2px">הכרטיס שלי 👋</div>
  <div style="font-size:12px;color:#9ca3af;margin-bottom:16px">מס׳ ${esc(c.serial)}</div>

  ${kraftCard(t, c.punches, c.serial)}
  <div style="height:14px"></div>

  <div class="qr-sec">
    <div style="font-size:14px;font-weight:800;color:#374151;margin-bottom:4px">הברקוד שלי</div>
    <div style="font-size:11px;color:#9ca3af;margin-bottom:12px">הצג לפקיד בכל קנייה לצבירת ניקוב</div>
    <div class="qr-box"><div id="my-qr"></div></div>
    <div style="margin-top:10px;font-size:11px;font-weight:700;color:#9ca3af">${esc(c.serial)}</div>
  </div>
  <div style="height:14px"></div>

  ${full
    ? `<button class="ab ab-ready">🎁 מימוש הטבה — ${esc(t.reward)}</button>
       <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:8px">הצג לפקיד למימוש 🎉</p>`
    : `<button class="ab ab-wait" disabled>🎁 מימוש הטבה</button>
       <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:8px">חסרים עוד ${t.goal - c.punches} ניקובים ל${esc(t.reward)}</p>`
  }

  <div class="wallets">
    <a href="/wallet/${c.serial}">
      <img src="https://pay.google.com/about/static_kv/partner/EN/iwallet_button.png" alt="Add to Google Wallet" style="height:46px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.1)"/>
    </a>
    <a href="/apple-wallet/${c.serial}">
      <div style="height:46px;background:#000;color:#fff;border-radius:8px;padding:0 22px;display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.15)">
        <svg viewBox="0 0 814 1000" width="16" height="20" fill="white"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 790.7 0 663 0 541.8c0-207.5 135.4-317.5 269-317.5 70.1 0 128.4 46.4 172.5 46.4 42.8 0 109.6-50.1 190.2-50.1 30.6 0 111.3 2.6 168.3 74.9zm-234.5-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/></svg>
        Add to Apple Wallet
      </div>
    </a>
  </div>
</div>

<script>
new QRCode(document.getElementById('my-qr'),{
  text:'${B}/card/${c.serial}',width:150,height:150,
  colorDark:'#6B46C1',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M
});
let last=${c.punches};
setInterval(async()=>{
  try{const r=await fetch('/api/card-state/${c.serial}');const d=await r.json();if(d.punches!==last){location.reload();}}
  catch(e){}
},2000);
</script>
</body></html>`);
});

// ══════════════════════════════════════════════════════
// PUNCH  (scanned from customer card QR)
// ══════════════════════════════════════════════════════
app.get('/punch/:serial', async (req, res) => {
  const db = await loadDB();
  const c  = db.customers?.[req.params.serial];
  if (!c) return res.status(404).send(notFound());
  const biz = db.businesses[c.bizId];
  const t   = biz?.cardTemplate || {};
  const full = c.punches >= t.goal;
  if (!full) {
    if (!checkRate(req.params.serial)) return res.send(punchPage(c.name, c.punches, 'rate', t));
    c.punches++;
    await saveDB(db);
  }
  res.send(punchPage(c.name, c.punches, c.punches >= t.goal ? 'full' : 'ok', t));
});

function punchPage(name, punches, state, t = {}) {
  const goal = t.goal || 10;
  const cfg = {
    ok:   { bg:'linear-gradient(135deg,#6B46C1,#7C3AED)', e:'☕', title:'ניקוב נרשם!',  c:'#6B46C1' },
    full: { bg:'linear-gradient(135deg,#16a34a,#15803d)', e:'🎉', title:'כרטיס מלא!',   c:'#16a34a' },
    rate: { bg:'linear-gradient(135deg,#f59e0b,#d97706)', e:'⏳', title:'המתן רגע',     c:'#f59e0b' },
  };
  const { bg, e, title, c } = cfg[state] || cfg.ok;
  const sub = state==='full' ? `מגיע לך ${esc(t.reward||'פרס')}! 🎁<br/>הצג לפקיד למימוש`
            : state==='rate' ? 'סריקה נרשמה לאחרונה — נסה שוב בעוד רגע'
            : `עוד ${goal-(punches||0)} ניקובים ל${esc(t.reward||'פרס')}`;
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title>${FONTS}<style>*{margin:0;padding:0;box-sizing:border-box;font-family:'Heebo',system-ui,sans-serif}body{min-height:100dvh;display:flex;align-items:center;justify-content:center;background:${bg}}.card{background:#fff;border-radius:28px;padding:44px 32px;text-align:center;margin:24px;max-width:320px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.25);animation:pop .4s cubic-bezier(.34,1.56,.64,1)}@keyframes pop{from{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}}.name{font-size:14px;font-weight:800;color:#374151;margin-bottom:4px}h1{font-size:26px;font-weight:900;color:${c};margin-bottom:8px}.count{font-size:52px;font-weight:900;color:${c};line-height:1;margin:8px 0}p{font-size:14px;color:#6b7280;line-height:1.6}</style></head><body><div class="card"><div style="font-size:72px;margin-bottom:8px">${e}</div>${name?`<div class="name">${esc(name)}</div>`:''}<h1>${title}</h1><div class="count">${punches}<span style="font-size:24px;opacity:.3"> / ${goal}</span></div><p>${sub}</p></div></body></html>`;
}

// ══════════════════════════════════════════════════════
// API
// ══════════════════════════════════════════════════════
app.post('/api/template', authMiddleware, async (req, res) => {
  const { biz, bizId, db } = req;
  const data = req.body;
  Object.assign(db.businesses[bizId].cardTemplate, {
    businessName: sanitize(data.businessName || biz.cardTemplate.businessName),
    cardTitle:    sanitize(data.cardTitle    || biz.cardTemplate.cardTitle),
    description:  sanitize(data.description || biz.cardTemplate.description),
    reward:       sanitize(data.reward       || biz.cardTemplate.reward),
    goal:         Math.min(20, Math.max(3, parseInt(data.goal)||10)),
    expiry:       sanitize(data.expiry || biz.cardTemplate.expiry || '', 20),
  });
  await saveDB(db);
  res.json({ ok: true });
});

app.post('/api/preview', async (req, res) => {
  const tpl = { ...req.body, goal: Math.min(20, Math.max(3, parseInt(req.body.goal)||10)) };
  res.send(kraftCard(tpl, Math.ceil((tpl.goal||10) * 0.55), null));
});

app.post('/api/punch/:serial', authMiddleware, async (req, res) => {
  const { bizId, db } = req;
  const c = db.customers?.[req.params.serial];
  if (!c) return res.status(404).json({ error: 'לקוח לא נמצא' });
  if (c.bizId !== bizId) return res.status(403).json({ error: 'לקוח לא שייך לעסק זה' });
  const t = db.businesses[bizId].cardTemplate;
  if (c.punches >= t.goal) return res.status(400).json({ error: 'כרטיס מלא — יש למממש קודם' });
  c.punches++;
  await saveDB(db);
  res.json({ ok: true, name: c.name, punches: c.punches, goal: t.goal, reward: t.reward, full: c.punches >= t.goal });
});

app.post('/api/reset/:serial', authMiddleware, async (req, res) => {
  const { bizId, db } = req;
  const c = db.customers?.[req.params.serial];
  if (!c || c.bizId !== bizId) return res.status(404).json({ error: 'not found' });
  c.punches = 0;
  await saveDB(db);
  res.json({ ok: true });
});

app.get('/api/card-state/:serial', async (req, res) => {
  const db = await loadDB();
  const c  = db.customers?.[req.params.serial];
  if (!c) return res.status(404).json({ error: 'not found' });
  const t = db.businesses[c.bizId]?.cardTemplate || {};
  res.json({ punches: c.punches, goal: t.goal || 10 });
});

// ══════════════════════════════════════════════════════
// WALLETS
// ══════════════════════════════════════════════════════
const PASS_TYPE_ID = 'pass.ZX5VG4RDTL.loyalty';
const TEAM_ID      = 'ZX5VG4RDTL';
const ISSUER_ID    = '3388000000023148997';

function solidPNG(size, r, g, b) {
  const zlib=require('zlib'), table=new Uint32Array(256);
  for(let i=0;i<256;i++){let c=i;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;table[i]=c;}
  function crc(buf){let c=0xFFFFFFFF;for(const b of buf)c=table[(c^b)&0xFF]^(c>>>8);return(~c)>>>0;}
  function chunk(type,data){const t=Buffer.from(type),l=Buffer.allocUnsafe(4),cv=Buffer.allocUnsafe(4);l.writeUInt32BE(data.length);cv.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([l,t,data,cv]);}
  const raw=Buffer.allocUnsafe(size*(3*size+1));
  for(let y=0;y<size;y++){raw[y*(3*size+1)]=0;for(let x=0;x<size;x++){const i=y*(3*size+1)+1+x*3;raw[i]=r;raw[i+1]=g;raw[i+2]=b;}}
  const ihdr=Buffer.allocUnsafe(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=2;ihdr[10]=ihdr[11]=ihdr[12]=0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}

app.get('/wallet/:serial', async (req, res) => {
  const db = await loadDB();
  const c  = db.customers?.[req.params.serial];
  if (!c) return res.status(404).send(notFound());
  const biz = db.businesses[c.bizId];
  const t   = biz?.cardTemplate || {};
  const B   = base(req);
  try {
    const jwt   = require('jsonwebtoken');
    const creds = (() => { try { return process.env.GOOGLE_CREDENTIALS ? JSON.parse(process.env.GOOGLE_CREDENTIALS) : require('./credentials.json'); } catch { return null; } })();
    if (!creds) return res.status(500).send('Google credentials missing');
    const classId  = `${ISSUER_ID}.loyalty_v1`;
    const objectId = `${ISSUER_ID}.${c.serial.replace(/-/g,'_')}`;
    const token = jwt.sign({
      iss: creds.client_email, aud: 'google', typ: 'savetowallet',
      iat: Math.floor(Date.now()/1000), origins: [B],
      payload: {
        loyaltyClasses: [{ id:classId, issuerName:t.businessName||biz.name, programName:t.cardTitle, rewardsTierLabel:'הטבה', rewardsTier:t.reward, hexBackgroundColor:'#C4975A', countryCode:'IL', reviewStatus:'UNDER_REVIEW' }],
        loyaltyObjects: [{ id:objectId, classId, state:'ACTIVE', accountId:c.serial, accountName:c.name,
          loyaltyPoints:{ label:'ניקובים', balance:{ int: c.punches } },
          barcode:{ type:'QR_CODE', value:`${B}/card/${c.serial}`, alternateText: c.serial } }]
      }
    }, creds.private_key, { algorithm:'RS256' });
    res.redirect(`https://pay.google.com/gp/v/save/${token}`);
  } catch(e) { res.status(500).send('Wallet error: ' + e.message); }
});

app.get('/apple-wallet/:serial', async (req, res) => {
  const db = await loadDB();
  const c  = db.customers?.[req.params.serial];
  if (!c) return res.status(404).send(notFound());
  const biz = db.businesses[c.bizId];
  const t   = biz?.cardTemplate || {};
  const B   = base(req);
  try {
    const { PKPass } = require('passkit-generator');
    const os = require('os');
    const passJson = {
      formatVersion:1, passTypeIdentifier:PASS_TYPE_ID, teamIdentifier:TEAM_ID,
      serialNumber:c.serial, organizationName:t.businessName||biz.name, description:t.cardTitle,
      backgroundColor:'rgb(196,151,90)', foregroundColor:'rgb(28,15,0)', labelColor:'rgb(80,40,0)',
      storeCard:{
        primaryFields:[{key:'stamps',label:'STAMPS',value:`${c.punches} / ${t.goal}`}],
        secondaryFields:[{key:'reward',label:'REWARD',value:t.reward},{key:'left',label:'REMAINING',value:`${Math.max(0,t.goal-c.punches)} more`}],
        backFields:[{key:'serial',label:'Card Number',value:c.serial}]
      },
      barcodes:[{message:`${B}/card/${c.serial}`,format:'PKBarcodeFormatQR',messageEncoding:'iso-8859-1',altText:c.serial}],
      barcode:{message:`${B}/card/${c.serial}`,format:'PKBarcodeFormatQR',messageEncoding:'iso-8859-1',altText:c.serial}
    };
    function getCert(envKey, file){ return process.env[envKey] ? Buffer.from(process.env[envKey],'base64') : fs.readFileSync(path.join(__dirname,file)); }
    const tmpDir = path.join(os.tmpdir(), 'pkpass_'+Date.now()+'.pass');
    fs.mkdirSync(tmpDir, { recursive:true });
    const ico = solidPNG(29,196,151,90), logo = solidPNG(58,196,151,90);
    fs.writeFileSync(path.join(tmpDir,'pass.json'), JSON.stringify(passJson));
    fs.writeFileSync(path.join(tmpDir,'icon.png'), ico);
    fs.writeFileSync(path.join(tmpDir,'icon@2x.png'), solidPNG(58,196,151,90));
    fs.writeFileSync(path.join(tmpDir,'logo.png'), logo);
    fs.writeFileSync(path.join(tmpDir,'logo@2x.png'), logo);
    try {
      const pass = await PKPass.from({ model:tmpDir, certificates:{ wwdr:getCert('APPLE_WWDR','wwdr.pem'), signerCert:getCert('APPLE_PASS_CERT','pass.pem'), signerKey:getCert('APPLE_PASS_KEY','pass.key') } });
      const buf = pass.getAsBuffer();
      res.set({'Content-Type':'application/vnd.apple.pkpass','Content-Disposition':`attachment; filename="${c.serial}.pkpass"`,'Content-Length':buf.length});
      res.send(buf);
    } finally { fs.rmSync(tmpDir, { recursive:true, force:true }); }
  } catch(e) { res.status(500).send('Apple Wallet error: ' + e.message); }
});

// ══════════════════════════════════════════════════════
// 404
// ══════════════════════════════════════════════════════
function notFound() {
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>לא נמצא</title>${FONTS}<style>*{margin:0;padding:0;box-sizing:border-box;font-family:'Heebo',sans-serif}body{min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#f5f4ff}.box{text-align:center;padding:48px}</style></head><body><div class="box"><div style="font-size:64px;margin-bottom:16px">🔍</div><h1 style="font-size:22px;font-weight:900;margin-bottom:8px">עמוד לא נמצא</h1><p style="color:#6b7280;font-size:14px;margin-bottom:20px">הקישור אינו תקף</p><a href="/" style="background:#6B46C1;color:#fff;padding:10px 24px;border-radius:12px;font-weight:700;font-size:14px;text-decoration:none">חזרה לדף הבית</a></div></body></html>`;
}
app.use((req, res) => res.status(404).send(notFound()));
app.use((err, req, res, next) => { console.error(err); res.status(500).send(notFound()); });

// ══════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════
if (!process.env.VERCEL) {
  const os = require('os');
  function localIP(){ for(const ifaces of Object.values(os.networkInterfaces())) for(const i of ifaces) if(i.family==='IPv4'&&!i.internal) return i.address; return 'localhost'; }
  const PORT=3000, IP=localIP();
  app.listen(PORT,'0.0.0.0',()=>{
    console.log(`\n☕  PunchCard\n`);
    console.log(`   Landing:    http://${IP}:${PORT}`);
    console.log(`   Dashboard:  http://${IP}:${PORT}/dashboard\n`);
  });
}
module.exports = app;
