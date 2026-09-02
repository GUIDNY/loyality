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
  return parts[0];
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
function hexToRgb(hex) {
  const h = hex.replace('#','');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
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
// SERVER-SIDE QR CODE GENERATOR
// ══════════════════════════════════════════════════════
async function makeQR(text, size = 200) {
  const QRCode = require('qrcode');
  return QRCode.toDataURL(text, {
    width: size, margin: 2,
    color: { dark: '#1a202c', light: '#ffffff' }
  });
}

// ══════════════════════════════════════════════════════
// SHARED ASSETS
// ══════════════════════════════════════════════════════
const APP_NAME = 'Ten Dots';

const FAVICON = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg viewBox='0 0 550 240' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='55' cy='60' r='48' stroke='%23111' stroke-width='8'/%3E%3Ccircle cx='165' cy='60' r='48' stroke='%23111' stroke-width='8'/%3E%3Ccircle cx='275' cy='60' r='48' stroke='%23111' stroke-width='8'/%3E%3Ccircle cx='385' cy='60' r='48' stroke='%23111' stroke-width='8'/%3E%3Ccircle cx='495' cy='60' r='48' fill='%23111'/%3E%3Cpath d='M472 60 l14 16 28-30' stroke='white' stroke-width='9' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ccircle cx='55' cy='180' r='48' stroke='%23111' stroke-width='8'/%3E%3Ccircle cx='165' cy='180' r='48' stroke='%23111' stroke-width='8'/%3E%3Ccircle cx='275' cy='180' r='48' stroke='%23111' stroke-width='8'/%3E%3Ccircle cx='385' cy='180' r='48' stroke='%23111' stroke-width='8'/%3E%3Ccircle cx='495' cy='180' r='48' stroke='%23111' stroke-width='8'/%3E%3C/svg%3E"/>`;

const LOGO_SVG = `<svg width="110" height="48" viewBox="0 0 550 240" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
  <circle cx="55"  cy="60"  r="48" stroke="#111" stroke-width="8"/>
  <text x="55"  y="60"  text-anchor="middle" dominant-baseline="central" font-family="system-ui,sans-serif" font-weight="800" font-size="44" fill="#111">T</text>
  <circle cx="165" cy="60"  r="48" stroke="#111" stroke-width="8"/>
  <text x="165" y="60"  text-anchor="middle" dominant-baseline="central" font-family="system-ui,sans-serif" font-weight="800" font-size="44" fill="#111">E</text>
  <circle cx="275" cy="60"  r="48" stroke="#111" stroke-width="8"/>
  <text x="275" y="60"  text-anchor="middle" dominant-baseline="central" font-family="system-ui,sans-serif" font-weight="800" font-size="44" fill="#111">N</text>
  <circle cx="385" cy="60"  r="48" stroke="#111" stroke-width="8"/>
  <circle cx="495" cy="60"  r="48" fill="#111"/>
  <path d="M472 60 l14 16 28-30" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="55"  cy="180" r="48" stroke="#111" stroke-width="8"/>
  <text x="55"  y="180" text-anchor="middle" dominant-baseline="central" font-family="system-ui,sans-serif" font-weight="800" font-size="44" fill="#111">D</text>
  <circle cx="165" cy="180" r="48" stroke="#111" stroke-width="8"/>
  <text x="165" y="180" text-anchor="middle" dominant-baseline="central" font-family="system-ui,sans-serif" font-weight="800" font-size="44" fill="#111">O</text>
  <circle cx="275" cy="180" r="48" stroke="#111" stroke-width="8"/>
  <text x="275" y="180" text-anchor="middle" dominant-baseline="central" font-family="system-ui,sans-serif" font-weight="800" font-size="44" fill="#111">T</text>
  <circle cx="385" cy="180" r="48" stroke="#111" stroke-width="8"/>
  <text x="385" y="180" text-anchor="middle" dominant-baseline="central" font-family="system-ui,sans-serif" font-weight="800" font-size="44" fill="#111">S</text>
  <circle cx="495" cy="180" r="48" stroke="#111" stroke-width="8"/>
</svg>`;

const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet"/>`;

const BASE_CSS = `<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Heebo',system-ui,sans-serif}
:root{
  --bg:#FFFFFF;--bg-2:#F7F7F8;--bg-3:#F0F0F1;
  --border:#E5E5E5;--text:#111111;--text-2:#666666;
  --accent:#6B46C1;--accent-h:#5a38a8;
  --s1:4px;--s2:8px;--s3:12px;--s4:16px;--s6:24px;--s8:32px;--s12:48px;--s16:64px;
  --text-sm:14px;--text-base:16px;--text-lg:20px;--text-xl:24px;--text-2xl:32px;--text-3xl:48px;
  --radius-sm:4px;--radius-md:8px;--radius-lg:12px;
}
body{background:var(--bg-2);color:var(--text);min-height:100dvh}
input:focus,select:focus,textarea:focus{outline:2px solid var(--accent);outline-offset:-1px;border-color:transparent!important}
.btn{display:inline-flex;align-items:center;gap:6px;padding:0 16px;height:40px;border-radius:var(--radius-sm);font-weight:700;font-size:var(--text-sm);cursor:pointer;border:none;transition:all 150ms ease;text-decoration:none;white-space:nowrap}
.btn-primary{background:#111111;color:#fff}.btn-primary:hover{background:#333333}
.btn-secondary{background:transparent;border:1px solid #111111;color:#111111}.btn-secondary:hover{background:var(--bg-3)}
.btn-accent{background:var(--accent);color:#fff}.btn-accent:hover{background:var(--accent-h)}
.btn-danger{background:transparent;border:1px solid var(--border);color:#D32F2F}.btn-danger:hover{background:#fff5f5}
.btn-ghost{background:transparent;color:var(--text-2);border:none}.btn-ghost:hover{color:var(--text);background:var(--bg-3)}
.btn-sm{height:32px;padding:0 12px;font-size:13px;border-radius:var(--radius-sm)}
.btn-lg{height:48px;padding:0 24px;font-size:var(--text-base)}
.btn:disabled{opacity:.4;cursor:not-allowed;pointer-events:none}
.card{background:#fff;border-radius:var(--radius-md);box-shadow:0 1px 3px rgba(0,0,0,.08);border:1px solid var(--border)}
.card:hover{box-shadow:0 4px 12px rgba(0,0,0,.10)}
.toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#111111;color:#fff;padding:10px 22px;border-radius:var(--radius-sm);font-size:13px;font-weight:700;z-index:9999;opacity:0;transition:opacity 150ms ease;pointer-events:none;white-space:nowrap}
.toast.show{opacity:1}
.fg{margin-bottom:16px}
.fg label{display:block;font-size:var(--text-sm);font-weight:600;color:var(--text);margin-bottom:6px}
.fg input,.fg select{width:100%;border:1px solid var(--border);border-radius:var(--radius-sm);padding:0 12px;height:40px;font-size:var(--text-sm);color:var(--text);background:#fff;transition:border-color 150ms ease}
.tag{display:inline-block;padding:2px 8px;border-radius:var(--radius-sm);font-size:12px;font-weight:600}
</style>`;

const LOGO_ICON = LOGO_SVG;

// ══════════════════════════════════════════════════════
// KRAFT CARD
// ══════════════════════════════════════════════════════
const BEAN = `<svg viewBox="0 0 26 36" width="19" height="26" fill="currentColor"><ellipse cx="13" cy="18" rx="11" ry="16"/><path d="M13 2Q5 18 13 34" fill="none" stroke="#C4975A" stroke-width="2.2" stroke-linecap="round"/></svg>`;
const BEANS3 = `<svg viewBox="0 0 74 58" width="54" height="43" fill="#1C0F00"><g transform="rotate(-22,20,34)"><ellipse cx="20" cy="34" rx="11" ry="16"/><path d="M20 18Q12 34 20 50" fill="none" stroke="#C4975A" stroke-width="2" stroke-linecap="round"/></g><g transform="rotate(18,50,18)"><ellipse cx="50" cy="18" rx="11" ry="16"/><path d="M50 2Q42 18 50 34" fill="none" stroke="#C4975A" stroke-width="2" stroke-linecap="round"/></g><g transform="rotate(-4,54,44)"><ellipse cx="54" cy="44" rx="10" ry="14"/><path d="M54 30Q47 44 54 58" fill="none" stroke="#C4975A" stroke-width="2" stroke-linecap="round"/></g></svg>`;
const ORDS = ['1ST','2ND','3RD','4TH','5TH','6TH','7TH','8TH','9TH','10TH','11TH','12TH','13TH','14TH','15TH','16TH','17TH','18TH','19TH','20TH'];

// Punch stamp icon library — 5 food & drink options
const STAMP_ICONS = {
  circle: (c) => `<svg viewBox="0 0 24 24" width="28" height="28"><circle cx="12" cy="12" r="7" fill="${c}"/></svg>`,
  coffee: (c) => `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>`,
  beer:   (c) => `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 11h1a3 3 0 010 6h-1"/><path d="M5 3l1 18h10l1-18z"/><line x1="4" y1="8" x2="20" y2="8"/></svg>`,
  wine:   (c) => `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><line x1="12" y1="10" x2="12" y2="21"/><path d="M6 2h12l-2 8a4 4 0 01-8 0z"/></svg>`,
  burger: (c) => `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"><line x1="3" y1="7" x2="21" y2="7"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="17" x2="21" y2="17"/></svg>`,
};

function walletCard(tpl, punches, ser, logoData) {
  const { goal=10, reward='Free Item', businessName='Business',
          bgColor='#C4975A', fillColor='#1C0F00', textColor='#1C0F00', circleStyle='coffee' } = tpl;
  const iconFn = STAMP_ICONS[circleStyle] || STAMP_ICONS.coffee;
  // Use a color that contrasts with the fill circle background
  const [fr,fg,fb] = hexToRgb(fillColor);
  const lum = (0.299*fr + 0.587*fg + 0.114*fb)/255;
  const iconColor = lum > 0.5 ? '#111111' : (bgColor || '#FFFFFF');
  const stampIcon = iconFn(iconColor);
  const cols = goal<=5 ? goal : 5;
  const left = Math.max(0, goal-punches);

  let dots='';
  for(let i=0;i<goal;i++){
    const on=i<punches;
    dots+=`<div style="width:46px;height:46px;border-radius:50%;background:${on?fillColor:'transparent'};border:2.5px solid ${textColor};display:flex;align-items:center;justify-content:center;">${on?stampIcon:''}</div>`;
  }

  // QR placeholder
  const qrPts=[[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[0,1],[6,1],[0,2],[2,2],[3,2],[4,2],[6,2],[0,3],[2,3],[4,3],[6,3],[0,4],[2,4],[3,4],[4,4],[6,4],[0,5],[6,5],[0,6],[1,6],[2,6],[3,6],[4,6],[5,6],[6,6],[8,1],[9,1],[11,1],[8,2],[10,2],[12,2],[9,3],[11,3],[8,4],[10,4],[12,4],[14,0],[15,0],[16,0],[17,0],[18,0],[19,0],[20,0],[14,1],[20,1],[14,2],[16,2],[18,2],[20,2],[14,3],[16,3],[18,3],[20,3],[14,4],[16,4],[17,4],[18,4],[20,4],[14,5],[20,5],[14,6],[15,6],[16,6],[17,6],[18,6],[19,6],[20,6],[0,14],[1,14],[2,14],[3,14],[4,14],[5,14],[6,14],[0,15],[6,15],[0,16],[2,16],[3,16],[4,16],[6,16],[0,17],[2,17],[4,17],[6,17],[0,18],[2,18],[3,18],[4,18],[6,18],[0,19],[6,19],[0,20],[1,20],[2,20],[3,20],[4,20],[5,20],[6,20],[8,8],[10,8],[12,8],[9,9],[11,9],[13,9],[8,10],[10,10],[12,10],[9,11],[11,11],[8,12],[10,12],[12,12]];
  const qrSvg=`<svg viewBox="0 0 21 21" width="140" height="140" shape-rendering="crispEdges" style="display:block"><rect width="21" height="21" fill="white"/>${qrPts.map(([x,y])=>`<rect x="${x}" y="${y}" width="1" height="1" fill="#111"/>`).join('')}</svg>`;

  const logoHtml = logoData
    ? `<img src="${logoData}" style="width:30px;height:30px;object-fit:contain;border-radius:6px;flex-shrink:0"/>`
    : '';

  return `<div style="width:290px;border-radius:22px;overflow:hidden;background:${bgColor};box-shadow:0 14px 44px rgba(0,0,0,.30);font-family:-apple-system,'Heebo',sans-serif;color:${textColor}">
  <!-- Header: logo right, biz name left (Apple RTL) -->
  <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 16px 4px;direction:rtl">
    <div style="font-size:15px;font-weight:700;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(businessName)}</div>
    ${logoHtml}
  </div>
  <!-- Circles grid -->
  <div style="padding:14px 14px 10px;display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px;justify-items:center">
    ${dots}
  </div>
  <!-- Fields (direction: rtl matches Apple Wallet) -->
  <div style="display:flex;justify-content:space-between;padding:6px 18px 14px;direction:rtl">
    <div>
      <div style="font-size:10px;font-weight:600;opacity:.6;margin-bottom:4px">חותמות</div>
      <div style="font-size:22px;font-weight:800;line-height:1;direction:ltr;text-align:right">${punches} / ${goal}</div>
    </div>
    <div style="text-align:left">
      <div style="font-size:10px;font-weight:600;opacity:.6;margin-bottom:4px">נשאר</div>
      <div style="font-size:22px;font-weight:800;line-height:1">${left===0?'מוכן!':'עוד '+left}</div>
    </div>
  </div>
  <!-- QR -->
  <div style="margin:0 14px 14px;background:#fff;border-radius:14px;padding:16px;display:flex;flex-direction:column;align-items:center;gap:8px">
    ${qrSvg}
    ${ser?`<div style="font-size:11px;color:#888;font-family:monospace;letter-spacing:.06em">${esc(ser)}</div>`:'<div style="font-size:11px;color:#bbb;font-family:monospace">PC-XXXX</div>'}
  </div>
</div>`;
}

function kraftCard(tpl, punches, ser, logoData) {
  const { cardTitle = 'Loyalty Card', goal = 10, reward = 'Free Item', expiry, businessName,
          bgColor = '#C4975A', fillColor = '#1C0F00', textColor = '#1C0F00', circleStyle = 'bean' } = tpl;
  const cols    = goal <= 5 ? goal : goal <= 8 ? 4 : 5;
  const goalOrd = ORDS[goal - 1] || goal + 'TH';
  const iconFn  = STAMP_ICONS[circleStyle] || STAMP_ICONS.coffee;
  const stampIcon = iconFn(bgColor);

  let circles = '';
  for (let i = 0; i < goal; i++) {
    const last = i === goal - 1, stamped = i < punches;
    if (last) {
      const rw = (reward || 'FREE').toUpperCase().split(' ').slice(0, 3);
      circles += `<div class="kc ${stamped ? 'kc-on' : 'kc-prize'}">${stamped ? stampIcon : `<span class="kc-pt">${rw.join('<br/>')}</span>`}</div>`;
    } else if (stamped) {
      circles += `<div class="kc kc-on kc-pop">${stampIcon}</div>`;
    } else {
      circles += `<div class="kc kc-off">${i + 1}</div>`;
    }
  }
  const exFmt = expiry ? expiry.split('-').reverse().join('/') : '';
  const logoHtml = logoData
    ? `<img src="${logoData}" style="width:44px;height:44px;object-fit:contain;border-radius:8px" />`
    : `<div><div class="kc-lo">LOYALTY</div><div class="kc-ca">CARD</div></div>`;
  return `<div class="kc-card" style="background:${bgColor};color:${textColor}">
  <div class="kc-hd">
    ${logoHtml}${BEANS3}
  </div>
  <div class="kc-rule" style="background:${textColor}"></div>
  <div class="kc-hl">COLLECT ${goal-1} STAMPS — GET THE ${goalOrd} FREE</div>
  <div class="kc-grid" style="grid-template-columns:repeat(${cols},1fr)">${circles}</div>
  ${ser ? `<div class="kc-ser"># ${esc(ser)}</div>` : ''}
  <div class="kc-ft">${exFmt ? `VALID UNTIL ${exFmt} · ` : ''}TERMS &amp; CONDITIONS APPLY</div>
</div>
<style>
.kc-card{border-radius:16px;padding:18px 20px 14px;position:relative;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.18)}
.kc-card::after{content:'';position:absolute;inset:0;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='.08'/%3E%3C/svg%3E");pointer-events:none;border-radius:16px}
.kc-hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.kc-lo{font-size:11px;font-weight:900;letter-spacing:.22em;opacity:.75;font-family:Impact,'Arial Black',sans-serif}
.kc-ca{font-size:28px;font-weight:900;letter-spacing:.06em;line-height:1;margin-top:-3px;font-family:Impact,'Arial Black',sans-serif}
.kc-rule{height:2.5px;border-radius:2px;opacity:.8;margin-bottom:5px}
.kc-hl{font-size:9.5px;font-weight:900;letter-spacing:.07em;text-align:center;padding:4px 0 9px;opacity:.8;border-bottom:1.5px solid rgba(0,0,0,.25);margin-bottom:13px;font-family:Impact,'Arial Black',sans-serif}
.kc-grid{display:grid;gap:7px;justify-items:center;margin-bottom:10px}
.kc{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2.5px solid ${textColor}}
.kc-off{background:transparent;color:${textColor};font-size:14px;font-weight:900;opacity:.65;font-family:Impact,'Arial Black',sans-serif}
.kc-on{background:${fillColor};color:${bgColor};border-color:${fillColor}}
.kc-pop{animation:ks .35s cubic-bezier(.34,1.56,.64,1) both}
@keyframes ks{from{transform:scale(.2) rotate(-20deg);opacity:0}to{transform:scale(1) rotate(0);opacity:1}}
.kc-prize{border-style:dashed;border-color:rgba(0,0,0,.4)}
.kc-pt{font-size:6.5px;font-weight:900;text-align:center;line-height:1.35;opacity:.75;font-family:Impact,'Arial Black',sans-serif}
.kc-ser{text-align:center;font-size:9px;opacity:.5;font-weight:900;letter-spacing:.12em;margin-bottom:4px;font-family:Impact,'Arial Black',sans-serif}
.kc-ft{font-size:7.5px;text-align:center;opacity:.45;letter-spacing:.07em;padding-top:7px;border-top:1px solid rgba(0,0,0,.18);font-family:Impact,'Arial Black',sans-serif}
</style>`;
}

// ══════════════════════════════════════════════════════
// LANDING PAGE
// ══════════════════════════════════════════════════════
app.get('/og.png', (req, res) => {
  const W=1200, H=630;
  const rgb=Buffer.alloc(W*H*3, 255); // white
  function px(x,y,r,g,b){ if(x<0||x>=W||y<0||y>=H)return; const i=(y*W+x)*3;rgb[i]=r;rgb[i+1]=g;rgb[i+2]=b; }
  function circle(cx,cy,R,filled){
    for(let dy=-R;dy<=R;dy++){
      const hw=Math.floor(Math.sqrt(Math.max(0,R*R-dy*dy)));
      if(filled){ for(let dx=-hw;dx<=hw;dx++) px(cx+dx,cy+dy,17,17,17); }
      else {
        const iR=R-8,iw=iR>0&&Math.abs(dy)<=iR?Math.floor(Math.sqrt(Math.max(0,iR*iR-dy*dy))):0;
        for(let dx=-hw;dx<=hw;dx++) if(Math.abs(dx)>iw||Math.abs(dy)>iR) px(cx+dx,cy+dy,17,17,17);
      }
    }
  }
  function check(cx,cy,R){
    // white checkmark inside filled circle
    for(let t=0;t<=20;t++){
      const x1=cx-Math.round(R*0.4)+Math.round(t*R*0.4/20);
      const y1=cy+Math.round(t*R*0.4/20);
      px(x1,y1,255,255,255); px(x1,y1-1,255,255,255); px(x1,y1+1,255,255,255);
    }
    for(let t=0;t<=30;t++){
      const x2=cx+Math.round(t*R*0.5/30);
      const y2=cy+Math.round(R*0.4)-Math.round(t*R*0.55/30);
      px(x2,y2,255,255,255); px(x2,y2-1,255,255,255); px(x2,y2+1,255,255,255);
    }
  }
  const R=70, gap=160, startX=200, row1Y=260, row2Y=380;
  for(let i=0;i<5;i++){
    const cx=startX+i*gap;
    if(i===4){ circle(cx,row1Y,R,true); check(cx,row1Y,R); }
    else circle(cx,row1Y,R,false);
    circle(cx,row2Y,R,false);
  }
  res.set({'Content-Type':'image/png','Cache-Control':'public,max-age=86400'});
  res.send(rgbToPNG(rgb,W,H));
});

app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const cardPreview = kraftCard({ cardTitle:'Coffee 10 Free', goal:10, reward:'Free Coffee', businessName:'Your Café' }, 6, null);

  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Ten Dots — כרטיס נאמנות דיגיטלי לעסק שלך</title>
${FAVICON}
<meta property="og:title" content="Ten Dots — כרטיס נאמנות דיגיטלי"/>
<meta property="og:description" content="הפוך לקוחות חוזרים ללקוחות נאמנים. ללא נייר, ללא אפליקציה."/>
<meta property="og:image" content="https://loyal-tan.vercel.app/og.png"/>
<meta property="og:type" content="website"/>
<meta name="twitter:card" content="summary_large_image"/>
${FONTS}${BASE_CSS}
<style>
nav{position:sticky;top:0;z-index:100;background:#fff;border-bottom:1px solid var(--border);height:56px;padding:0 32px;display:flex;align-items:center;justify-content:space-between}
@media(max-width:768px){nav{padding:0 16px}}
.nav-logo{display:flex;align-items:center;gap:8px;text-decoration:none;font-size:18px;font-weight:800;color:var(--text)}
.nav-links{display:flex;align-items:center;gap:8px}

.hero{background:#fff;padding:96px 32px 80px}
@media(max-width:768px){.hero{padding:48px 16px 48px}}
.hero-inner{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center}
@media(max-width:768px){.hero-inner{grid-template-columns:1fr}.hero-card{display:none}}
.hero-badge{display:inline-flex;align-items:center;gap:6px;background:var(--bg-2);border:1px solid var(--border);color:var(--text-2);padding:4px 12px;border-radius:var(--radius-sm);font-size:13px;font-weight:600;margin-bottom:20px}
.hero h1{font-size:48px;font-weight:800;line-height:1.15;color:var(--text);margin-bottom:16px}
@media(max-width:768px){.hero h1{font-size:32px}}
.hero-sub{font-size:var(--text-base);color:var(--text-2);line-height:1.6;margin-bottom:32px}
.hero-cta{display:flex;gap:12px;flex-wrap:wrap}

.section{padding:80px 32px}
@media(max-width:768px){.section{padding:48px 16px}}
.section-inner{max-width:1100px;margin:0 auto}
.section-eyebrow{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#999;margin-bottom:8px}
.section-title{font-size:32px;font-weight:800;color:var(--text);margin-bottom:48px;line-height:1.2}
@media(max-width:768px){.section-title{font-size:24px;margin-bottom:32px}}

.features-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
@media(max-width:768px){.features-grid{grid-template-columns:1fr}}
.feat{padding:24px;border-radius:var(--radius-md);background:#fff;border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,.08)}
.feat-icon{width:40px;height:40px;background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;margin-bottom:14px;color:var(--accent)}
.feat h3{font-size:var(--text-base);font-weight:700;color:var(--text);margin-bottom:8px}
.feat p{font-size:var(--text-sm);color:var(--text-2);line-height:1.6}

.steps{display:flex;flex-direction:column;gap:16px;margin-top:40px}
.step{display:flex;align-items:flex-start;gap:20px;background:#fff;border-radius:var(--radius-md);padding:20px 24px;border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,.08)}
.step-num{width:24px;height:24px;background:#111;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;margin-top:2px}
.step h3{font-size:var(--text-base);font-weight:700;color:var(--text);margin-bottom:4px}
.step p{font-size:var(--text-sm);color:var(--text-2);line-height:1.5}

.cta-section{padding:80px 32px;background:#111;text-align:center;color:#fff}
@media(max-width:768px){.cta-section{padding:48px 16px}}
.cta-section h2{font-size:32px;font-weight:800;margin-bottom:12px}
@media(max-width:768px){.cta-section h2{font-size:24px}}
.cta-section p{font-size:var(--text-base);color:#999;margin-bottom:32px}

footer{background:var(--bg-2);border-top:1px solid var(--border);padding:24px 32px;text-align:center;font-size:13px;color:var(--text-2)}
</style>
</head>
<body>

<nav>
  <a href="/" class="nav-logo">${LOGO_ICON}</a>
  <div class="nav-links" id="nav-links">
    <a href="/login" class="btn btn-secondary btn-sm">כניסה</a>
    <a href="/signup" class="btn btn-accent btn-sm">התחל בחינם</a>
  </div>
</nav>

<section class="hero">
  <div class="hero-inner">
    <div>
      <div class="hero-badge">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#6B46C1" stroke-width="1.5"/><path d="M4 6l1.5 1.5 3-3" stroke="#6B46C1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        חינמי לחלוטין
      </div>
      <h1>כרטיס נאמנות דיגיטלי לעסק שלך</h1>
      <p class="hero-sub">הפוך לקוחות חוזרים ללקוחות נאמנים.<br/>ללא נייר, ללא אפליקציה — עם Apple Wallet ו-Google Wallet.</p>
      <div class="hero-cta" id="hero-cta">
        <a href="/signup" class="btn btn-accent btn-lg">התחל בחינם</a>
        <a href="/login" class="btn btn-secondary btn-lg">כניסה לחשבון</a>
      </div>
    </div>
    <div class="hero-card">${cardPreview}</div>
  </div>
</section>

<section class="section" style="background:var(--bg-2)">
  <div class="section-inner">
    <p class="section-eyebrow">למה Ten Dots?</p>
    <h2 class="section-title">כל מה שצריך לנאמנות לקוחות</h2>
    <div class="features-grid">
      <div class="feat">
        <div class="feat-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M16 14h2"/></svg>
        </div>
        <h3>Wallet מובנה</h3>
        <p>לקוחות שומרים את הכרטיס ב-Google Wallet או Apple Wallet — תמיד נגיש, לא נאבד.</p>
      </div>
      <div class="feat">
        <div class="feat-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
        </div>
        <h3>סריקה בשנייה</h3>
        <p>הפקיד סורק QR של הלקוח — ניקוב נרשם מיד. לא צריך אפליקציה מיוחדת.</p>
      </div>
      <div class="feat">
        <div class="feat-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        </div>
        <h3>CRM פשוט</h3>
        <p>ראה כמה לקוחות יש לך, מי קרוב לפרס, ומה הפעילות שלהם — הכל במקום אחד.</p>
      </div>
    </div>
  </div>
</section>

<section class="section" style="background:#fff">
  <div class="section-inner" style="max-width:720px">
    <p class="section-eyebrow">איך זה עובד</p>
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
          <h3>סרוק בכל קנייה — ניקוב אוטומטי</h3>
          <p>הפקיד פותח את דף הסריקה, מכוון מצלמה ל-QR של הלקוח — ניקוב נרשם ושניהם רואים את זה.</p>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="cta-section">
  <h2>מוכן להתחיל?</h2>
  <p>הצטרף לעסקים שכבר משתמשים ב-Ten Dots</p>
  <a href="/signup" class="btn btn-accent btn-lg">צור חשבון בחינם</a>
</section>

<footer>Ten Dots &copy; 2024 &middot; נבנה לעסקים ישראלים</footer>

<script>
function updateNav(bizName) {
  document.getElementById('nav-links').innerHTML =
    '<a href="/dashboard" class="btn btn-secondary btn-sm" style="gap:6px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
    bizName + '</a>' +
    '<a href="/dashboard" class="btn btn-accent btn-sm">לדשבורד</a>';
  document.getElementById('hero-cta').innerHTML =
    '<a href="/dashboard" class="btn btn-accent btn-lg">לדשבורד שלי</a>' +
    '<a href="/scan" class="btn btn-secondary btn-lg">סרוק ניקוב</a>';
}
function checkAuth() {
  fetch('/api/me', {credentials:'same-origin'})
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(d){ if(d && d.ok) updateNav(d.bizName); })
    .catch(function(){});
}
checkAuth();
window.addEventListener('pageshow', function(e){ checkAuth(); });
</script>
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
      expiry:       new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
      bgColor:      '#C4975A',
      fillColor:    '#1C0F00',
      textColor:    '#1C0F00',
      circleStyle:  'coffee',
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
  const errParam = '';
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
${FAVICON}
<title>${isLogin ? 'כניסה' : 'הרשמה'} — Ten Dots</title>
${FONTS}${BASE_CSS}
<style>
body{background:var(--bg-2);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;min-height:100dvh}
.auth-logo{display:flex;align-items:center;gap:8px;font-size:20px;font-weight:800;color:var(--text);text-decoration:none;margin-bottom:32px}
.box{background:#fff;border-radius:var(--radius-lg);padding:32px;width:min(92vw,400px);border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{font-size:20px;font-weight:800;margin-bottom:4px;color:var(--text)}
.sub{font-size:var(--text-sm);color:var(--text-2);margin-bottom:24px}
.err{background:#fff5f5;border:1px solid #fecaca;color:#D32F2F;border-radius:var(--radius-sm);padding:10px 14px;font-size:var(--text-sm);font-weight:600;margin-bottom:16px}
.switch{text-align:center;font-size:13px;color:var(--text-2);margin-top:16px}
.switch a{color:var(--accent);font-weight:600;text-decoration:none}
.divider{height:1px;background:var(--border);margin:20px 0}
</style>
</head>
<body>
<a href="/" class="auth-logo">${LOGO_ICON}</a>
<div class="box">
  <h1>${isLogin ? 'כניסה לחשבון' : 'צור חשבון חינם'}</h1>
  <p class="sub">${isLogin ? 'ברוך השב ל-Loyal' : 'הצטרף לעסקים שמשתמשים ב-Ten Dots'}</p>
  <form method="POST" action="/${mode}">
    ${!isLogin ? `<div class="fg"><label>שם העסק</label><input type="text" name="name" placeholder="הקפה שלי" required autocomplete="organization"/></div>` : ''}
    <div class="fg"><label>אימייל</label><input type="email" name="email" placeholder="cafe@example.com" required dir="ltr" autocomplete="email"/></div>
    <div class="fg" style="margin-bottom:20px"><label>סיסמה</label><input type="password" name="password" placeholder="${isLogin ? 'הסיסמה שלך' : 'לפחות 6 תווים'}" required autocomplete="${isLogin ? 'current-password' : 'new-password'}"/></div>
    <button type="submit" class="btn btn-accent btn-lg" style="width:100%;justify-content:center">
      ${isLogin ? 'כניסה' : 'צור חשבון'}
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
  res.set('Cache-Control', 'no-store');
  const { biz, bizId, db } = req;
  const t = biz.cardTemplate;
  const B = base(req);
  const customers = Object.values(db.customers || {}).filter(c => c.bizId === bizId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const joinQR = await makeQR(`${B}/join/${bizId}`, 140);

  const custRows = customers.length === 0
    ? `<tr><td colspan="5" style="text-align:center;padding:48px 20px">
        <div style="display:inline-flex;flex-direction:column;align-items:center;gap:12px">
          <div style="width:48px;height:48px;background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1.5" stroke-linecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          </div>
          <div>
            <div style="font-size:var(--text-sm);font-weight:700;color:var(--text);margin-bottom:4px">אין לקוחות עדיין</div>
            <div style="font-size:13px;color:var(--text-2)">שתף את קוד ה-QR עם הלקוחות שלך</div>
          </div>
        </div>
       </td></tr>`
    : customers.map(c => {
        const full = c.punches >= t.goal;
        const pct  = Math.round((c.punches / t.goal) * 100);
        return `<tr>
          <td>
            <div style="font-size:var(--text-sm);font-weight:600;color:var(--text)">${c.name ? esc(c.name) : `<span style="color:#999">${esc(c.serial)}</span>`}</div>
            <div style="font-size:12px;color:var(--text-2);margin-top:2px">${esc(c.phone||'')}</div>
          </td>
          <td>
            <button data-action="edit" data-serial="${c.serial}" data-name="${esc(c.name)}" data-phone="${esc(c.phone||'')}" class="btn btn-secondary btn-sm">ערוך</button>
          </td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div style="flex:1;height:4px;background:var(--bg-3);border-radius:2px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:${full?'#2e7d32':'var(--accent)'};border-radius:2px;transition:width 300ms ease"></div>
              </div>
              <span style="font-size:12px;font-weight:700;color:${full?'#2e7d32':'var(--text)'};white-space:nowrap">${c.punches}/${t.goal}</span>
            </div>
          </td>
          <td>
            ${full
              ? `<span class="tag" style="background:#e8f5e9;border:1px solid #a5d6a7;color:#2e7d32">מלא</span>`
              : `<span class="tag" style="background:var(--bg-2);border:1px solid var(--border);color:var(--text-2)">פעיל</span>`
            }
          </td>
          <td>
            <div style="display:flex;gap:6px">
              <a href="/card/${c.serial}" target="_blank" class="btn btn-secondary btn-sm">כרטיס</a>
              <button data-action="punch" data-serial="${c.serial}" class="btn btn-primary btn-sm">+ ניקוב</button>
              <button data-action="wallet" data-serial="${c.serial}" class="btn btn-secondary btn-sm" title="עדכן Apple Wallet">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </button>
              <button data-action="reset" data-serial="${c.serial}" class="btn btn-danger btn-sm">אפס</button>
            </div>
          </td>
        </tr>`;
      }).join('');

  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>${esc(biz.name)} — Ten Dots</title>
${FONTS}${BASE_CSS}
<style>
.topbar{background:#fff;border-bottom:1px solid var(--border);height:56px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50}
.topbar-logo{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:800;color:var(--text);text-decoration:none;min-width:0}
.topbar-biz{color:var(--text-2);font-size:14px;font-weight:400;margin-right:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:480px){.topbar-biz{display:none}}
.container{max-width:1100px;margin:0 auto;padding:24px 20px}

.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}
.stat{background:#fff;border-radius:var(--radius-md);padding:16px;border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,.08)}
.stat-val{font-size:28px;font-weight:800;color:var(--text);line-height:1}
@media(max-width:600px){.stat-val{font-size:22px}}
.stat-lbl{font-size:11px;color:var(--text-2);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-top:4px}

.dash-grid{display:grid;grid-template-columns:360px 1fr;gap:20px}
@media(max-width:900px){.dash-grid{grid-template-columns:1fr}.dash-left{order:2}.dash-right{order:1}}

.sec-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#999;margin-bottom:10px}
.preview-wrap{background:var(--bg-2);border:1px dashed var(--border);border-radius:var(--radius-md);padding:16px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}

.qr-wrap{display:flex;flex-direction:column;align-items:center;gap:10px;background:#fff;border-radius:var(--radius-md);padding:20px;border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,.08);text-align:center;margin-bottom:20px}
.qr-box{padding:8px;background:#fff;border-radius:var(--radius-sm);border:1px solid var(--border);display:inline-block}

.tbl-wrap{border-radius:var(--radius-md);border:1px solid var(--border);background:#fff;overflow:hidden}
table{width:100%;border-collapse:collapse}
thead th{background:var(--bg-2);padding:10px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#999;text-align:right;border-bottom:1px solid var(--border)}
tbody tr{border-bottom:1px solid var(--bg-2);transition:background 150ms ease}
tbody tr:hover{background:var(--bg-2)}
tbody tr:last-child{border-bottom:none}
tbody td{padding:10px 14px;font-size:var(--text-sm);vertical-align:middle}
@media(max-width:680px){
  thead th:nth-child(2),tbody td:nth-child(2),
  thead th:nth-child(3),tbody td:nth-child(3),
  thead th:nth-child(4),tbody td:nth-child(4){display:none}
  tbody td{padding:10px 12px}
  tbody td:nth-child(5) div{flex-direction:column;gap:4px;align-items:stretch}
  tbody td:nth-child(5) .btn-danger{display:none}
  tbody td:nth-child(5) .btn{justify-content:center;width:100%}
}

.scan-btn{position:fixed;bottom:calc(24px + env(safe-area-inset-bottom, 0px));right:24px;z-index:40;background:#111;color:#fff;border:none;border-radius:var(--radius-md);padding:0 20px;height:48px;font-size:var(--text-sm);font-weight:700;cursor:pointer;display:flex;align-items:center;gap:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);transition:background 150ms ease;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.scan-btn:hover{background:#333}

/* ── Mobile Tabs ── */
.mob-tabbar{display:none}
@media(max-width:900px){
  .mob-tabbar{display:flex;position:fixed;bottom:0;left:0;right:0;z-index:100;background:#fff;border-top:1px solid var(--border);padding-bottom:env(safe-area-inset-bottom,0px);box-shadow:0 -2px 12px rgba(0,0,0,.07)}
  .mob-tab{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:10px 0 8px;border:none;background:none;font-size:11px;font-weight:600;color:#aaa;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:color 120ms ease}
  .mob-tab.active{color:#111}
  .mob-tab svg{transition:transform 150ms ease}
  .mob-tab.active svg{transform:scale(1.1)}
  .mob-tab-scan{flex:0 0 72px;position:relative;padding-bottom:8px}
  .mob-tab-scan-btn{width:52px;height:52px;border-radius:50%;background:#111;border:3px solid #fff;box-shadow:0 3px 14px rgba(0,0,0,.22);display:flex;align-items:center;justify-content:center;margin:0 auto;margin-top:-16px;cursor:pointer;-webkit-tap-highlight-color:transparent}
  .mob-tab-scan-lbl{font-size:10px;font-weight:700;color:#111;text-align:center;margin-top:2px}
  /* Panel visibility */
  [data-panel]{display:block}
  [data-panel].mob-hidden{display:none}
  /* Hide desktop scan btn on mobile */
  .scan-btn{display:none}
  /* Container bottom pad for tab bar */
  .container{padding-bottom:90px}
  /* Stats compact on mobile */
  .stats{gap:8px}
  .stat{padding:12px}
}

.scan-modal{display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:200;background:rgba(0,0,0,.6);align-items:center;justify-content:center}
.scan-modal.open{display:flex}
.scan-box{background:#fff;border-radius:var(--radius-lg);padding:20px;width:90vw;max-width:460px;max-height:90vh;overflow-y:auto;border:1px solid var(--border)}
.scan-video-wrap{position:relative;background:#000;border-radius:var(--radius-md);overflow:hidden;aspect-ratio:4/3;margin-bottom:12px}
video{width:100%;height:100%;object-fit:cover;display:block}
.scan-frame{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:200px;height:200px;box-shadow:0 0 0 9999px rgba(0,0,0,.45);border-radius:var(--radius-md)}
.scan-frame::before,.scan-frame::after{content:'';position:absolute;width:28px;height:28px;border-color:var(--accent);border-style:solid}
.scan-frame::before{top:-2px;right:-2px;border-width:3px 3px 0 0;border-radius:0 4px 0 0}
.scan-frame::after{bottom:-2px;left:-2px;border-width:0 0 3px 3px;border-radius:0 0 0 4px}
.scan-line{position:absolute;left:0;right:0;height:2px;background:var(--accent);opacity:.8;animation:scn 1.8s ease-in-out infinite}
@keyframes scn{0%{top:5%}100%{top:95%}}
.scan-result{padding:12px 16px;border-radius:var(--radius-sm);margin-bottom:12px;display:none;font-size:var(--text-sm);font-weight:600;border:1px solid var(--border)}
.scan-result.ok{background:#e8f5e9;border-color:#a5d6a7;color:#2e7d32}
.scan-result.err{background:#fff5f5;border-color:#fecaca;color:#D32F2F}
.scan-manual{display:flex;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)}
.scan-manual input{flex:1;border:1px solid var(--border);border-radius:var(--radius-sm);padding:0 12px;height:40px;font-size:var(--text-sm);direction:ltr}
</style>
</head>
<body>

<div class="topbar">
  <a href="/dashboard" class="topbar-logo">
    ${LOGO_ICON}
    <span class="topbar-biz">${esc(biz.name)}</span>
  </a>
  <div style="display:flex;align-items:center;gap:12px">
    <span class="tag" style="background:var(--bg-2);border:1px solid var(--border);color:var(--text-2)">${customers.length} לקוחות</span>
    <a href="/" class="btn btn-ghost btn-sm">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      בית
    </a>
    <a href="/logout" class="btn btn-ghost btn-sm" style="color:var(--text-2);font-size:12px">התנתק</a>
  </div>
</div>

<div class="container">
  <div class="stats">
    <div class="stat">
      <div class="stat-val">${customers.length}</div>
      <div class="stat-lbl">לקוחות</div>
    </div>
    <div class="stat">
      <div class="stat-val">${customers.filter(c => c.punches >= t.goal).length}</div>
      <div class="stat-lbl">כרטיסים מלאים</div>
    </div>
    <div class="stat">
      <div class="stat-val">${customers.reduce((s,c) => s + (c.redeemed||0), 0)}</div>
      <div class="stat-lbl">הטבות מומשו</div>
    </div>
  </div>

  <div class="dash-grid">

    <div class="dash-left" data-panel="design">
      <p class="sec-label">עצב כרטיס</p>
      <div class="card" style="padding:20px;margin-bottom:16px;box-shadow:none">
        <div class="fg"><label>שם העסק</label><input id="f-biz" value="${esc(t.businessName)}" oninput="preview()"/></div>
        <div class="fg"><label>כותרת</label><input id="f-title" value="${esc(t.cardTitle)}" oninput="preview()"/></div>
        <div class="fg"><label>תיאור</label><input id="f-desc" value="${esc(t.description)}" oninput="preview()"/></div>
        <div class="fg"><label>שם ההטבה</label><input id="f-reward" value="${esc(t.reward)}" oninput="preview()"/></div>
        <div class="form-row">
          <div class="fg"><label>ניקובים</label><input id="f-goal" type="number" min="3" max="20" value="${t.goal}" oninput="preview()"/></div>
          <div class="fg"><label>תוקף</label><input id="f-expiry" type="date" value="${t.expiry||''}" dir="ltr" oninput="preview()"/></div>
        </div>

        <div style="border-top:1px solid var(--border);margin:16px 0;padding-top:16px">
          <p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-2);margin-bottom:12px">עיצוב ויזואלי</p>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
            <div class="fg" style="margin-bottom:0">
              <label>צבע רקע</label>
              <input type="color" id="f-bg-color" value="${t.bgColor||'#C4975A'}" oninput="preview()" style="width:100%;height:36px;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;padding:2px 4px"/>
            </div>
            <div class="fg" style="margin-bottom:0">
              <label>צבע ניקוב</label>
              <input type="color" id="f-fill-color" value="${t.fillColor||'#1C0F00'}" oninput="preview()" style="width:100%;height:36px;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;padding:2px 4px"/>
            </div>
            <div class="fg" style="margin-bottom:0">
              <label>צבע טקסט</label>
              <input type="color" id="f-text-color" value="${t.textColor||'#1C0F00'}" oninput="preview()" style="width:100%;height:36px;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;padding:2px 4px"/>
            </div>
          </div>

          <div class="fg" style="margin-bottom:14px">
            <label>סגנון ניקוב</label>
            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">
              ${[['circle','○','עיגול'],['coffee','☕','קפה'],['beer','🍺','בירה'],['wine','🍷','יין'],['burger','🍔','המבורגר']
              ].map(([val,emoji,lbl]) =>
                `<label data-style-lbl="${val}" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:8px 4px;border:1.5px solid ${(t.circleStyle||'coffee')===val?'#111':'var(--border)'};border-radius:var(--radius-sm);cursor:pointer;font-size:10px;font-weight:600;background:${(t.circleStyle||'coffee')===val?'#f5f5f5':''}">
                  <input type="radio" name="circleStyle" value="${val}" ${(t.circleStyle||'coffee')===val?'checked':''} onchange="preview()" style="display:none"/>
                  <span style="font-size:18px">${emoji}</span>${lbl}
                </label>`
              ).join('')}
            </div>
          </div>

          <div class="fg" style="margin-bottom:0">
            <label>לוגו עסק (יופיע ב-Apple Wallet)</label>
            <div style="display:flex;align-items:center;gap:12px;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-2)">
              <div id="logo-preview-box" style="width:52px;height:52px;border-radius:8px;border:1px solid var(--border);background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
                ${biz.logo ? `<img src="${biz.logo}" style="width:100%;height:100%;object-fit:contain"/>` : `<span style="font-size:22px">🏪</span>`}
              </div>
              <div style="flex:1">
                <input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp" style="display:none"/>
                <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('logo-file').click()" style="width:100%;justify-content:center;margin-bottom:6px">העלה לוגו</button>
                ${biz.logo ? `<button type="button" data-action="remove-logo" class="btn btn-sm" style="width:100%;justify-content:center;background:transparent;border:1px solid var(--border);color:var(--text-2)">הסר לוגו</button>` : ''}
              </div>
            </div>
          </div>
        </div>

        <button onclick="saveCard()" class="btn btn-primary" style="width:100%;justify-content:center">שמור כרטיסייה</button>
      </div>

      <p class="sec-label">תצוגה מקדימה</p>
      <div class="preview-wrap"><div id="card-preview">${walletCard(t, 6, null, biz.logo||null)}</div></div>
    </div>

    <div class="dash-right" data-panel="customers">
      <p class="sec-label">QR להצטרפות לקוחות</p>
      <div class="qr-wrap">
        <div class="qr-box"><img src="${joinQR}" width="140" height="140" style="display:block" alt="Join QR"/></div>
        <p style="font-size:var(--text-sm);color:var(--text-2);line-height:1.5">לקוח סורק ← ממלא שם ← מקבל כרטיס אישי</p>
        <p style="font-size:11px;color:#999;font-family:monospace;direction:ltr;word-break:break-all">${B}/join/${bizId}</p>
      </div>

      ${customers.filter(c => c.punches >= t.goal).length > 0 ? `
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:var(--radius-md);padding:16px;margin-bottom:20px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#16a34a;margin-bottom:10px">
          מוכנים למימוש — ${customers.filter(c => c.punches >= t.goal).length} כרטיסים
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${customers.filter(c => c.punches >= t.goal).map(c => `
          <div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border-radius:var(--radius-sm);padding:10px 14px;border:1px solid #86efac">
            <div>
              <div style="font-size:var(--text-sm);font-weight:700;color:var(--text)">${esc(c.name)}</div>
              <div style="font-size:12px;color:#16a34a;margin-top:2px">${esc(t.reward)} · ${esc(c.serial)}</div>
            </div>
            <button data-action="redeem" data-serial="${c.serial}" style="height:36px;padding:0 16px;background:#16a34a;color:#fff;border:none;border-radius:var(--radius-sm);font-size:13px;font-weight:700;cursor:pointer;font-family:'Heebo',sans-serif;white-space:nowrap">
              ממש פרס
            </button>
          </div>
          `).join('')}
        </div>
      </div>` : ''}

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <p class="sec-label" style="margin-bottom:0">לקוחות (${customers.length})</p>
        <div style="display:flex;gap:8px">
          <input id="search" type="text" placeholder="חיפוש..." oninput="filterTable(this.value)"
            style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:0 10px;height:32px;font-size:13px;width:140px"/>
          <button onclick="location.reload()" class="btn btn-secondary btn-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
          </button>
        </div>
      </div>
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>לקוח</th><th>פרטים</th><th>התקדמות</th><th>סטטוס</th><th>פעולות</th></tr></thead>
          <tbody id="tbl">${custRows}</tbody>
        </table>
      </div>
    </div>

  </div>
</div>

<a href="/scan" class="scan-btn">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>
  סרוק ניקוב
</a>

<div class="toast" id="toast"></div>

<!-- Mobile tab bar -->
<div class="mob-tabbar">
  <button class="mob-tab active" data-tab="customers" onclick="switchTab('customers')">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
    לקוחות
  </button>
  <div class="mob-tab-scan">
    <a href="/scan" class="mob-tab-scan-btn">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>
    </a>
    <div class="mob-tab-scan-lbl">סרוק</div>
  </div>
  <button class="mob-tab" data-tab="design" onclick="switchTab('design')">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="13.5" cy="6.5" r="2.5"/><path d="M17 4l3 3-9.5 9.5-4 1 1-4L17 4z"/><path d="M2 20h20"/></svg>
    עיצוב
  </button>
</div>

<script>
function switchTab(tab){
  document.querySelectorAll('[data-panel]').forEach(function(el){
    el.classList.toggle('mob-hidden', el.dataset.panel !== tab);
  });
  document.querySelectorAll('.mob-tab').forEach(function(el){
    el.classList.toggle('active', el.dataset.tab === tab);
  });
}
// Init mobile: show customers tab by default, hide design
if(window.innerWidth <= 900){
  switchTab('customers');
}
function toast(msg, ok=true){
  const el=document.getElementById('toast');
  el.textContent=msg; el.style.background=ok?'#111111':'#D32F2F';
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
    bgColor:      document.getElementById('f-bg-color').value,
    fillColor:    document.getElementById('f-fill-color').value,
    textColor:    document.getElementById('f-text-color').value,
    circleStyle:  document.querySelector('input[name="circleStyle"]:checked')?.value || 'bean',
  })});
  r.ok ? toast('נשמר!') : toast('שגיאה',false);
}
var _currentLogo = null; // cached in memory for instant preview
async function preview(){
  const data={
    businessName: document.getElementById('f-biz').value,
    cardTitle:    document.getElementById('f-title').value,
    description:  document.getElementById('f-desc').value,
    reward:       document.getElementById('f-reward').value,
    goal:         document.getElementById('f-goal').value,
    expiry:       document.getElementById('f-expiry').value,
    bgColor:      document.getElementById('f-bg-color').value,
    fillColor:    document.getElementById('f-fill-color').value,
    textColor:    document.getElementById('f-text-color').value,
    circleStyle:  document.querySelector('input[name="circleStyle"]:checked')?.value || 'coffee',
    logo: _currentLogo,
  };
  try{
    const r=await fetch('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    document.getElementById('card-preview').innerHTML=await r.text();
  }catch(e){}
}
async function doPunch(serial){
  try {
    const r=await fetch('/api/punch/'+serial,{method:'POST'});
    const d=await r.json();
    if(r.ok){
      toast('ניקוב נרשם — '+d.punches+'/'+d.goal);
      // Fire wallet push in background — don't await
      fetch('/api/wallet-push/'+serial,{method:'POST'}).catch(()=>{});
      setTimeout(()=>location.reload(),900);
    } else toast(d.error||'שגיאה',false);
  }catch(e){ toast('שגיאה: '+e.message,false); }
}
async function doReset(serial){
  if(!confirm('לאפס כרטיס?'))return;
  const r=await fetch('/api/reset/'+serial,{method:'POST'});
  r.ok ? (toast('אופס'),setTimeout(()=>location.reload(),800)) : toast('שגיאה',false);
}
async function doWallet(serial){
  const r=await fetch('/api/wallet-push/'+serial,{method:'POST'});
  const d=await r.json();
  if(!d.registered) toast('הלקוח צריך להוריד pass חדש', false);
  else if(d.results&&d.results.some(function(x){return x.ok;})) toast('Apple Wallet עודכן!');
  else toast('שגיאת APNs',false);
}
function doEdit(serial, name, phone, btn){
  var row=btn.closest('tr'), cell=row.cells[0];
  cell.innerHTML='<div style="display:flex;gap:6px;align-items:center">'+
    '<input class="en" value="'+name+'" placeholder="שם" style="border:1px solid #e5e5e5;border-radius:4px;padding:0 8px;height:30px;font-size:13px;width:90px"/>'+
    '<input class="ep" value="'+phone+'" placeholder="טלפון" dir="ltr" style="border:1px solid #e5e5e5;border-radius:4px;padding:0 8px;height:30px;font-size:13px;width:90px"/>'+
    '<button data-action="save" data-serial="'+serial+'" style="height:30px;padding:0 10px;background:#111;color:#fff;border:none;border-radius:4px;font-size:12px;font-weight:700;cursor:pointer">שמור</button>'+
    '</div>';
  cell.querySelector('.en').focus();
}
async function doSave(serial, btn){
  var row=btn.closest('tr');
  var n=row.querySelector('.en').value.trim();
  var p=row.querySelector('.ep').value.trim();
  var r=await fetch('/api/customer/'+serial,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,phone:p})});
  r.ok ? (toast('נשמר!'),setTimeout(()=>location.reload(),500)) : toast('שגיאה',false);
}
async function doRedeem(serial){
  if(!confirm('לממש את הפרס ולאפס את הכרטיס?'))return;
  var r=await fetch('/api/redeem/'+serial,{method:'POST'});
  var d=await r.json();
  r.ok ? (toast('מומש!'),setTimeout(()=>location.reload(),900)) : toast(d.error||'שגיאה',false);
}
// Single event listener — no inline onclick needed
document.addEventListener('DOMContentLoaded', function(){
  document.addEventListener('click', function(e){
    var btn=e.target.closest('[data-action]');
    if(!btn) return;
    var action=btn.dataset.action, serial=btn.dataset.serial;
    if(action==='punch')       doPunch(serial);
    if(action==='reset')       doReset(serial);
    if(action==='wallet')      doWallet(serial);
    if(action==='edit')        doEdit(serial, btn.dataset.name||'', btn.dataset.phone||'', btn);
    if(action==='save')        doSave(serial, btn);
    if(action==='redeem')      doRedeem(serial);
    if(action==='remove-logo') doRemoveLogo();
  });
});
function filterTable(q){
  document.querySelectorAll('#tbl tr').forEach(tr=>{
    tr.style.display=tr.textContent.toLowerCase().includes(q.toLowerCase())?'':'none';
  });
}
// Logo upload
var logoFileEl=document.getElementById('logo-file');
if(logoFileEl){
  logoFileEl.addEventListener('change', function(e){
    var file=e.target.files[0];
    if(!file) return;
    var reader=new FileReader();
    reader.onload=function(ev){
      var dataUrl=ev.target.result;
      var img=new Image();
      img.onload=async function(){
        var canvas=document.createElement('canvas');
        var S=120;
        canvas.width=canvas.height=S;
        var ctx=canvas.getContext('2d');
        var scale=Math.min(S/img.width, S/img.height);
        ctx.drawImage(img, (S-img.width*scale)/2, (S-img.height*scale)/2, img.width*scale, img.height*scale);
        var png=canvas.toDataURL('image/png');
        var r=await fetch('/api/logo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({logo:png})});
        var d=await r.json();
        if(r.ok){
          _currentLogo = png; // cache for instant preview
          document.getElementById('logo-preview-box').innerHTML='<img src="'+png+'" style="width:100%;height:100%;object-fit:contain"/>';
          toast('לוגו נשמר!');
          preview();
        } else toast(d.error||'שגיאה',false);
      };
      img.src=dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
async function doRemoveLogo(){
  var r=await fetch('/api/logo/remove',{method:'POST'});
  if(r.ok){ _currentLogo=null; toast('לוגו הוסר'); document.getElementById('logo-preview-box').innerHTML='<span style="font-size:22px">🏪</span>'; preview(); }
  else toast('שגיאה',false);
}
document.querySelectorAll('input[name="circleStyle"]').forEach(function(radio){
  radio.addEventListener('change', function(){
    document.querySelectorAll('[data-style-lbl]').forEach(function(l){ l.style.borderColor='var(--border)'; l.style.background=''; });
    var lbl=document.querySelector('[data-style-lbl="'+this.value+'"]');
    if(lbl){ lbl.style.borderColor='#111'; lbl.style.background='#f5f5f5'; }
  });
});
</script>
</body></html>`);
});

// ══════════════════════════════════════════════════════
// SCAN PAGE
// ══════════════════════════════════════════════════════
app.get('/scan', authMiddleware, (req, res) => {
  const { biz } = req;
  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>סרוק ניקוב — ${esc(biz.name)}</title>
${FONTS}
<script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Heebo',system-ui,sans-serif}
body{background:#111;color:#fff;min-height:100dvh;display:flex;flex-direction:column}
.topbar{padding:16px 20px calc(16px + env(safe-area-inset-top,0px)) 20px;padding-top:calc(16px + env(safe-area-inset-top,0px));background:#111;display:flex;align-items:center;justify-content:space-between}
.back{color:#fff;text-decoration:none;font-size:14px;font-weight:600;display:flex;align-items:center;gap:6px;opacity:.7}
.biz-name{font-size:14px;font-weight:700;opacity:.5}
.cam-wrap{flex:1;position:relative;overflow:hidden}
video{width:100%;height:100%;object-fit:cover;display:block}
canvas{display:none}
.frame{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:220px;height:220px;border-radius:16px;box-shadow:0 0 0 9999px rgba(0,0,0,.55)}
.frame::before,.frame::after{content:'';position:absolute;width:32px;height:32px;border-color:#6B46C1;border-style:solid}
.frame::before{top:-2px;right:-2px;border-width:3px 3px 0 0;border-radius:0 6px 0 0}
.frame::after{bottom:-2px;left:-2px;border-width:0 0 3px 3px;border-radius:0 0 0 6px}
.scan-line{position:absolute;left:0;right:0;height:2px;background:#6B46C1;animation:scan 2s ease-in-out infinite}
@keyframes scan{0%{top:5%}50%{top:95%}100%{top:5%}}
.result{position:absolute;top:20px;left:50%;transform:translateX(-50%);white-space:nowrap;padding:10px 20px;border-radius:999px;font-size:14px;font-weight:700;display:none;animation:pop .2s ease}
@keyframes pop{from{transform:translateX(-50%) scale(.8);opacity:0}to{transform:translateX(-50%) scale(1);opacity:1}}
.result.ok{background:#22c55e;color:#fff}
.result.err{background:#ef4444;color:#fff}
.result.show{display:block}
.success-overlay{position:fixed;inset:0;z-index:999;background:#22c55e;display:none;flex-direction:column;align-items:center;justify-content:center;gap:16px;animation:fadeIn .15s ease}
.success-overlay.show{display:flex}
@keyframes fadeIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
.success-check{width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center}
.success-name{font-size:28px;font-weight:800;color:#fff;text-align:center}
.success-sub{font-size:16px;color:rgba(255,255,255,.8);text-align:center}
.bottom{padding:16px 20px calc(16px + env(safe-area-inset-bottom,0px)) 20px;background:#111;display:flex;flex-direction:column;gap:10px}
.cam-btn{width:100%;height:48px;background:#6B46C1;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer;font-family:'Heebo',sans-serif}
.manual-row{display:flex;gap:8px}
.manual-row input{flex:1;height:44px;background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:0 14px;color:#fff;font-size:14px;font-family:'Heebo',sans-serif;direction:ltr}
.manual-row input::placeholder{color:#555}
.manual-row input:focus{outline:2px solid #6B46C1;border-color:transparent}
.manual-btn{height:44px;padding:0 18px;background:#333;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Heebo',sans-serif}
</style>
</head>
<body>
<div class="topbar">
  <a href="/dashboard" class="back">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    חזרה
  </a>
  <span class="biz-name">${esc(biz.name)}</span>
</div>

<div class="cam-wrap" id="cam-wrap">
  <video id="vid" autoplay playsinline muted></video>
  <canvas id="cv"></canvas>
  <div class="frame"><div class="scan-line"></div></div>
  <div class="result" id="result"></div>
</div>

<div class="success-overlay" id="success-overlay">
  <div class="success-check">
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  </div>
  <div class="success-name" id="success-name"></div>
  <div class="success-sub" id="success-sub"></div>
</div>

<div class="bottom">
  <button class="cam-btn" id="cam-btn" onclick="toggleCam()">הפעל מצלמה</button>
  <div class="manual-row">
    <input id="serial-input" type="text" placeholder="PC-0001" autocomplete="off" autocapitalize="characters"/>
    <button class="manual-btn" onclick="manualPunch()">ניקוב</button>
  </div>
</div>

<script>
var stream=null, timer=null, lastScan='', camOn=false;

function toggleCam(){
  if(camOn){ stopCam(); } else { startCam(); }
}

function startCam(){
  var btn=document.getElementById('cam-btn');
  btn.textContent='מפעיל...';
  btn.disabled=true;

  if(!navigator||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    btn.textContent='הפעל מצלמה'; btn.disabled=false;
    showResult('הדפדפן לא תומך במצלמה — נסה Chrome',false);
    return;
  }

  navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}})
    .then(function(s){
      stream=s; camOn=true;
      var vid=document.getElementById('vid');
      vid.srcObject=s;
      var p=vid.play();
      if(p&&p.then) p.then(function(){
        btn.textContent='עצור מצלמה'; btn.disabled=false;
        loadQR();
      }).catch(function(e){ onCamErr(e,btn); });
      else{ btn.textContent='עצור מצלמה'; btn.disabled=false; loadQR(); }
    })
    .catch(function(e){ onCamErr(e,btn); });
}

function onCamErr(e,btn){
  camOn=false;
  if(stream){ stream.getTracks().forEach(function(t){t.stop()}); stream=null; }
  btn.textContent='הפעל מצלמה'; btn.disabled=false;
  var msg=e&&e.name==='NotAllowedError'?'אפשר גישה למצלמה בהגדרות הדפדפן':
          e&&e.name==='NotFoundError'?'לא נמצאה מצלמה':
          'שגיאת מצלמה — נסה שנית';
  showResult(msg,false);
}

function loadQR(){
  timer=setInterval(tick,300);
}

function stopCam(){
  camOn=false;
  if(stream){ stream.getTracks().forEach(function(t){t.stop()}); stream=null; }
  clearInterval(timer); timer=null;
  var vid=document.getElementById('vid'); vid.srcObject=null;
  document.getElementById('cam-btn').textContent='הפעל מצלמה';
  document.getElementById('cam-btn').disabled=false;
}

function tick(){
  if(typeof jsQR==='undefined'){ showResult('טוען סורק QR...',true); return; }
  try{
    var vid=document.getElementById('vid');
    if(!vid||!vid.videoWidth||vid.paused||vid.readyState<2) return;
    var cv=document.getElementById('cv');
    cv.width=vid.videoWidth; cv.height=vid.videoHeight;
    var ctx=cv.getContext('2d');
    ctx.drawImage(vid,0,0);
    var img=ctx.getImageData(0,0,cv.width,cv.height);
    var code=jsQR(img.data,img.width,img.height,{inversionAttempts:'attemptBoth'});
    if(!code||!code.data) return;
    var url=code.data;
    var m=url.match(/[\/]card[\/]([A-Za-z0-9_-]+)/);
    if(!m){ showResult('QR לא מוכר',false); return; }
    var serial=m[1].toUpperCase();
    if(serial===lastScan) return;
    lastScan=serial;
    setTimeout(function(){lastScan='';},3000);
    punch(serial);
  }catch(e){ console.error('tick error:',e); }
}

function manualPunch(){
  var inp=document.getElementById('serial-input');
  var s=inp.value.trim().toUpperCase();
  if(!s){ inp.focus(); return; }
  inp.value=''; punch(s);
}

var punching=false;
function punch(serial){
  if(punching) return;
  punching=true;
  fetch('/api/punch/'+serial,{method:'POST'})
    .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d}});})
    .then(function(res){
      if(res.ok){
        stopCam();
        var d=res.d;
        // Fire wallet push immediately in background
        fetch('/api/wallet-push/'+serial,{method:'POST'}).catch(function(){});
        document.getElementById('success-name').textContent=d.name||serial;
        document.getElementById('success-sub').textContent=
          d.full ? 'כרטיס מלא! מגיע '+d.reward : d.punches+' / '+d.goal+' ניקובים';
        document.getElementById('success-overlay').className='success-overlay show';
        setTimeout(function(){ window.location.href='/dashboard'; }, 2000);
      } else {
        punching=false;
        showResult(res.d.error||'שגיאה',false);
      }
    }).catch(function(){ punching=false; showResult('שגיאת רשת',false); });
}

function showResult(msg,ok){
  var el=document.getElementById('result');
  el.textContent=msg; el.className='result '+(ok?'ok':'err')+' show';
  clearTimeout(el._t);
  el._t=setTimeout(function(){ el.className='result'; },3500);
}

document.getElementById('serial-input').addEventListener('keydown',function(e){
  if(e.key==='Enter') manualPunch();
});
</script>
</body></html>`);
});

// ══════════════════════════════════════════════════════
// JOIN (customer)
// ══════════════════════════════════════════════════════
// סריקת QR הצטרפות — יוצר לקוח מיד ומנתב לכרטיס
app.get('/join/:bizId', async (req, res) => {
  const db  = await loadDB();
  const biz = db.businesses[req.params.bizId];
  if (!biz) return res.status(404).send(notFound());
  if (!db.customers) db.customers = {};
  const ser = custSerial(db.nextSerial++);
  db.customers[ser] = {
    serial: ser, bizId: req.params.bizId,
    name: '', phone: '',
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
  const biz = c.bizId ? db.businesses[c.bizId] : null;
  if (!biz) return res.status(404).send(notFound());
  const t    = biz.cardTemplate;
  const B    = base(req);
  const full = c.punches >= t.goal;

  const cardQR = await makeQR(`${B}/card/${c.serial}`, 160);

  res.send(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>הכרטיס של ${esc(c.name)}</title>
${FONTS}${BASE_CSS}
<style>
body{background:var(--bg-2);min-height:100dvh}
.container{max-width:480px;margin:0 auto;padding:16px}
.topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.biz-label{font-size:var(--text-base);font-weight:700;color:var(--text)}
.name-chip{background:var(--bg-2);border:1px solid var(--border);color:var(--text-2);padding:4px 10px;border-radius:var(--radius-sm);font-size:13px;font-weight:600}

.qr-sec{background:#fff;border-radius:var(--radius-md);border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,.08);padding:20px;text-align:center;margin-top:16px}
.qr-title{font-size:var(--text-sm);font-weight:700;color:var(--text);margin-bottom:4px}
.qr-sub{font-size:13px;color:var(--text-2);margin-bottom:14px}

.redeem-btn{display:block;width:100%;height:44px;border-radius:var(--radius-sm);font-size:var(--text-base);font-weight:700;text-align:center;border:none;cursor:pointer;transition:all 150ms ease;line-height:44px;margin-top:14px}
.redeem-ready{background:var(--accent);color:#fff}.redeem-ready:hover{background:var(--accent-h)}
.redeem-wait{background:var(--bg-2);color:#999;border:1px solid var(--border);cursor:not-allowed}

.wallets{display:flex;flex-direction:column;gap:8px;margin-top:12px}
.wallet-btn{display:flex;align-items:center;justify-content:center;gap:8px;height:44px;border-radius:var(--radius-sm);font-size:var(--text-sm);font-weight:600;width:100%;transition:background 150ms ease;border:none;cursor:pointer;text-decoration:none}
.wallet-google{background:#fff;color:var(--text);border:1px solid var(--border)}.wallet-google:hover{background:var(--bg-2)}
.wallet-apple{background:#111;color:#fff}.wallet-apple:hover{background:#333}
</style>
</head>
<body>
<div class="container">
  <div class="topbar">
    <span class="biz-label">${esc(biz.name)}</span>
    <span class="name-chip">${esc(c.name)}</span>
  </div>

  ${kraftCard(t, c.punches, c.serial, biz?.logo||null)}

  <div class="qr-sec">
    <div class="qr-title">הברקוד שלי</div>
    <div class="qr-sub">הצג לפקיד בכל קנייה לצבירת ניקוב</div>
    <img src="${cardQR}" width="160" height="160" style="display:block;margin:0 auto;border-radius:var(--radius-sm)" alt="QR Code"/>
    <div style="margin-top:10px;font-size:11px;color:#999;font-family:monospace">${esc(c.serial)}</div>
  </div>

  ${full
    ? `<button class="redeem-btn redeem-ready">מימוש הטבה — ${esc(t.reward)}</button>
       <p style="text-align:center;font-size:13px;color:var(--text-2);margin-top:8px">הצג לפקיד למימוש</p>`
    : `<button class="redeem-btn redeem-wait" disabled>מימוש הטבה</button>
       <p style="text-align:center;font-size:13px;color:var(--text-2);margin-top:8px">חסרים ${t.goal - c.punches} ניקובים ל${esc(t.reward)}</p>`
  }

  <div class="wallets">
    <a href="/wallet/${c.serial}" class="wallet-btn wallet-google">
      <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
      Add to Google Wallet
    </a>
    <a href="/apple-wallet/${c.serial}" class="wallet-btn wallet-apple" id="apple-btn">
      <svg viewBox="0 0 814 1000" width="14" height="18" fill="white"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 790.7 0 663 0 541.8c0-207.5 135.4-317.5 269-317.5 70.1 0 128.4 46.4 172.5 46.4 42.8 0 109.6-50.1 190.2-50.1 30.6 0 111.3 2.6 168.3 74.9zm-234.5-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/></svg>
      ${c.passToken ? 'עדכן Apple Wallet' : 'Add to Apple Wallet'}
    </a>
  </div>
  ${!c.passToken ? `
  <p style="text-align:center;font-size:11px;color:#999;margin-top:8px;line-height:1.5">
    לעדכונים אוטומטיים ב-Apple Wallet — לחץ "Add to Apple Wallet" פעם אחת
  </p>` : ''}
</div>

<script>
let last=${c.punches};
setInterval(async()=>{
  try{const r=await fetch('/api/card-state/${c.serial}');const d=await r.json();if(d.punches!==last){location.reload();}}
  catch(e){}
},2000);
</script>
</body></html>`);
});

// ══════════════════════════════════════════════════════
// PUNCH (scanned from customer card QR)
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
  const icons = {
    ok:   `<svg width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" fill="#6B46C1" opacity=".12"/><circle cx="24" cy="24" r="16" fill="#6B46C1"/><path d="M16 24l5.5 5.5 10.5-11" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    full: `<svg width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" fill="#2e7d32" opacity=".12"/><circle cx="24" cy="24" r="16" fill="#2e7d32"/><path d="M16 24l5.5 5.5 10.5-11" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    rate: `<svg width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" fill="#111" opacity=".06"/><circle cx="24" cy="24" r="16" fill="#666"/><path d="M24 17v7l4 4" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  };
  const titles = { ok:'ניקוב נרשם', full:'כרטיס מלא!', rate:'המתן רגע' };
  const subs = {
    full: `מגיע לך ${esc(t.reward||'פרס')} — הצג לפקיד למימוש`,
    rate: 'סריקה נרשמה לאחרונה — נסה שוב בעוד רגע',
    ok:   `עוד ${goal-(punches||0)} ניקובים ל${esc(t.reward||'פרס')}`,
  };
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${titles[state]||titles.ok}</title>${FONTS}<style>*{margin:0;padding:0;box-sizing:border-box;font-family:'Heebo',system-ui,sans-serif}body{min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#F7F7F8;padding:24px}.card{background:#fff;border-radius:12px;padding:40px 32px;text-align:center;max-width:320px;width:100%;border:1px solid #E5E5E5;box-shadow:0 1px 3px rgba(0,0,0,.08);animation:up .2s ease both}@keyframes up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}.name-chip{display:inline-block;background:#F0F0F1;border:1px solid #E5E5E5;color:#666;padding:4px 10px;border-radius:4px;font-size:13px;font-weight:600;margin-bottom:14px}h1{font-size:20px;font-weight:800;color:#111;margin-bottom:8px}.count{font-size:40px;font-weight:800;color:#6B46C1;line-height:1;margin:10px 0}p{font-size:14px;color:#666;line-height:1.6}</style></head><body><div class="card"><div style="margin-bottom:16px">${icons[state]||icons.ok}</div>${name?`<div class="name-chip">${esc(name)}</div>`:''}<h1>${titles[state]||titles.ok}</h1><div class="count">${punches}<span style="font-size:20px;color:#999"> / ${goal}</span></div><p>${subs[state]||subs.ok}</p></div></body></html>`;
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
    description:  sanitize(data.description  || biz.cardTemplate.description),
    reward:       sanitize(data.reward       || biz.cardTemplate.reward),
    goal:         Math.min(20, Math.max(3, parseInt(data.goal)||10)),
    expiry:       sanitize(data.expiry || biz.cardTemplate.expiry || '', 20),
    bgColor:      sanitize(data.bgColor    || biz.cardTemplate.bgColor    || '#C4975A', 10),
    fillColor:    sanitize(data.fillColor  || biz.cardTemplate.fillColor  || '#1C0F00', 10),
    textColor:    sanitize(data.textColor  || biz.cardTemplate.textColor  || '#1C0F00', 10),
    circleStyle: Object.keys(STAMP_ICONS).includes(data.circleStyle) ? data.circleStyle : (biz.cardTemplate.circleStyle || 'bean'),
  });
  await saveDB(db);
  res.json({ ok: true });
});

app.post('/api/preview', authMiddleware, async (req, res) => {
  const { logo: clientLogo, ...bodyRest } = req.body;
  const tpl = { ...bodyRest, goal: Math.min(20, Math.max(3, parseInt(bodyRest.goal)||10)) };
  // Prefer logo sent from client (avoids serverless cross-instance DB mismatch)
  const logoData = (clientLogo && clientLogo.startsWith('data:image')) ? clientLogo : (req.biz?.logo||null);
  res.send(walletCard(tpl, Math.ceil((tpl.goal||10) * 0.55), null, logoData));
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
  // Respond immediately — client will trigger wallet push separately
  res.json({ ok: true, name: c.name||c.serial, punches: c.punches, goal: t.goal, reward: t.reward, full: c.punches >= t.goal, serial: c.serial });
});

app.post('/api/redeem/:serial', authMiddleware, async (req, res) => {
  const { bizId, db } = req;
  const c = db.customers?.[req.params.serial];
  if (!c || c.bizId !== bizId) return res.status(404).json({ error: 'not found' });
  const t = db.businesses[bizId].cardTemplate;
  if (c.punches < t.goal) return res.status(400).json({ error: 'הכרטיס עדיין לא מלא' });
  c.punches = 0;
  c.redeemed = (c.redeemed || 0) + 1;
  await saveDB(db);
  res.json({ ok: true });
  // wallet push triggered client-side via /api/wallet-push
  res.json({ ok: true, name: c.name, redeemed: c.redeemed });
});

app.post('/api/customer/:serial', authMiddleware, async (req, res) => {
  const { bizId, db } = req;
  const c = db.customers?.[req.params.serial];
  if (!c || c.bizId !== bizId) return res.status(404).json({ error: 'not found' });
  c.name  = sanitize(req.body.name  || '', 80);
  c.phone = sanitize(req.body.phone || '', 20);
  await saveDB(db);
  res.json({ ok: true });
});

app.post('/api/reset/:serial', authMiddleware, async (req, res) => {
  const { bizId, db } = req;
  const c = db.customers?.[req.params.serial];
  if (!c || c.bizId !== bizId) return res.status(404).json({ error: 'not found' });
  const t = db.businesses[bizId].cardTemplate;
  c.punches = 0;
  await saveDB(db);
  updateGoogleWalletObject(c.serial, 0, t.goal, t.reward);
  pushAppleWalletUpdate(c.serial);
  res.json({ ok: true });
});

app.get('/api/me', async (req, res) => {
  const bizId = verifySession(req.cookies?.session);
  if (!bizId) return res.status(401).json({ ok: false });
  const db = await loadDB();
  const biz = db.businesses[bizId];
  if (!biz) return res.status(401).json({ ok: false });
  res.json({ ok: true, bizName: biz.name });
});

app.post('/api/logo', authMiddleware, async (req, res) => {
  const { bizId, db } = req;
  const { logo } = req.body;
  if (!logo || !logo.startsWith('data:image')) return res.status(400).json({ error: 'Invalid' });
  if (logo.length > 800000) return res.status(400).json({ error: 'תמונה גדולה מדי (מקסימום 500KB)' });
  db.businesses[bizId].logo = logo;
  await saveDB(db);
  res.json({ ok: true });
});

app.post('/api/logo/remove', authMiddleware, async (req, res) => {
  const { bizId, db } = req;
  delete db.businesses[bizId].logo;
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
// GOOGLE WALLET LIVE UPDATE
// ══════════════════════════════════════════════════════
async function updateGoogleWalletObject(serial, punches, goal, reward) {
  try {
    const jwt = require('jsonwebtoken');
    const creds = (() => { try { return process.env.GOOGLE_CREDENTIALS ? JSON.parse(process.env.GOOGLE_CREDENTIALS) : require('./credentials.json'); } catch { return null; } })();
    if (!creds) return;

    // Get OAuth2 access token via service account JWT
    const now = Math.floor(Date.now() / 1000);
    const assertion = jwt.sign({
      iss: creds.client_email, sub: creds.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now, exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/wallet_object.issuer'
    }, creds.private_key, { algorithm: 'RS256' });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`
    });
    const { access_token } = await tokenRes.json();
    if (!access_token) return;

    const objectId = `${ISSUER_ID}.${serial.replace(/-/g,'_')}`;
    await fetch(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(objectId)}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loyaltyPoints: { label: 'ניקובים', balance: { int: punches } },
        secondaryFields: [{ key:'left', label:'REMAINING', value: `${Math.max(0,goal-punches)} more` }]
      })
    });
  } catch(e) { /* silent — wallet update is best-effort */ }
}

// ══════════════════════════════════════════════════════
// WALLETS
// ══════════════════════════════════════════════════════
const PASS_TYPE_ID = 'pass.ZX5VG4RDTL.loyalty';
const TEAM_ID      = 'ZX5VG4RDTL';
const ISSUER_ID    = '3388000000023148997';

function rgbToPNG(rgb, W, H) {
  const zlib = require('zlib');
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c&1 ? 0xEDB88320^(c>>>1) : c>>>1; table[i]=c; }
  function crc(buf){ let c=0xFFFFFFFF; for(const b of buf) c=table[(c^b)&0xFF]^(c>>>8); return(~c)>>>0; }
  function chunk(type,data){ const t=Buffer.from(type),l=Buffer.allocUnsafe(4),cv=Buffer.allocUnsafe(4); l.writeUInt32BE(data.length); cv.writeUInt32BE(crc(Buffer.concat([t,data]))); return Buffer.concat([l,t,data,cv]); }
  const raw = Buffer.allocUnsafe(H*(1+W*3));
  for(let y=0;y<H;y++){ raw[y*(1+W*3)]=0; rgb.copy(raw,y*(1+W*3)+1,y*W*3,(y+1)*W*3); }
  const ihdr=Buffer.allocUnsafe(13); ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4); ihdr[8]=8; ihdr[9]=2; ihdr[10]=ihdr[11]=ihdr[12]=0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}

function generatePassImages(punches, goal, theme={}) {
  const BG   = hexToRgb(theme.bgColor   || '#C4975A');
  const DARK = hexToRgb(theme.fillColor || '#1C0F00');
  const W=750, H=288;

  // Build pixel buffer
  const rgb=Buffer.alloc(W*H*3);
  for(let i=0;i<W*H;i++){ rgb[i*3]=BG[0];rgb[i*3+1]=BG[1];rgb[i*3+2]=BG[2]; }

  function px(x,y,c){
    if(x<0||x>=W||y<0||y>=H) return;
    const i=(y*W+x)*3; rgb[i]=c[0];rgb[i+1]=c[1];rgb[i+2]=c[2];
  }

  // Rotated filled ellipse
  function ellipse(cx,cy,rx,ry,ang,col){
    const cos=Math.cos(ang),sin=Math.sin(ang);
    for(let dy=-ry;dy<=ry;dy++){
      const hw=Math.floor(rx*Math.sqrt(Math.max(0,1-(dy/ry)**2)));
      for(let dx=-hw;dx<=hw;dx++){
        px(Math.round(cx+dx*cos-dy*sin), Math.round(cy+dx*sin+dy*cos), col);
      }
    }
  }

  // Coffee bean: dark ellipse + kraft crack
  function bean(cx,cy,rx,ry,ang){
    ellipse(cx,cy,rx,ry,ang,DARK);
    const cos=Math.cos(ang),sin=Math.sin(ang);
    for(let t=-(ry-3);t<=(ry-3);t++){
      const xo=Math.round(3*Math.sin(t*Math.PI/Math.max(1,ry-3)));
      px(Math.round(cx+xo*cos-t*sin), Math.round(cy+xo*sin+t*cos), BG);
    }
  }

  const circleStyle = theme.circleStyle || 'coffee';
  function punch(cx,cy,R,filled){
    if(filled){
      // Filled: dark circle
      for(let dy=-R;dy<=R;dy++){
        const hw=Math.floor(Math.sqrt(Math.max(0,R*R-dy*dy)));
        for(let dx=-hw;dx<=hw;dx++) px(cx+dx,cy+dy,DARK);
      }
      if(circleStyle==='circle'){
        // empty circle style: just the dark fill, no inner mark
      } else {
        // All other styles: BG-colored coffee bean inside (clean, recognizable)
        ellipse(cx,cy,Math.round(R*0.52),Math.round(R*0.75),0,BG);
        const bry=Math.round(R*0.75);
        for(let t=-(bry-2);t<=(bry-2);t++){
          const xo=Math.round(2.5*Math.sin(t*Math.PI/Math.max(1,bry-2)));
          px(cx+xo,cy+t,DARK);
        }
      }
    } else {
      const border=5;
      for(let dy=-R;dy<=R;dy++){
        const hw=Math.floor(Math.sqrt(Math.max(0,R*R-dy*dy)));
        const iR=R-border;
        const iw=iR>0&&Math.abs(dy)<=iR?Math.floor(Math.sqrt(Math.max(0,iR*iR-dy*dy))):0;
        for(let dx=-hw;dx<=hw;dx++) if(Math.abs(dx)>iw||Math.abs(dy)>iR) px(cx+dx,cy+dy,DARK);
      }
    }
  }

  // Circles only — 2 rows of 5, vertically centered
  const perRow = Math.min(goal, 5);
  const rows = Math.ceil(goal / perRow);
  const R = 32, gap = 110;
  const startX = Math.round((W - (perRow-1)*gap) / 2);
  const totalH = (rows-1)*110;
  const startY = Math.round((H - totalH) / 2);

  for(let i=0; i<Math.min(goal,10); i++){
    const col=i%perRow, row=Math.floor(i/perRow);
    punch(startX+col*gap, startY+row*110, R, i<punches);
  }

  // Logo: 1px invisible (same as background)
  const lrgb=solidPNG(1, BG[0], BG[1], BG[2]);

  return { strip:rgbToPNG(rgb,W,H), logo:lrgb };
}

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

function getCert(envKey, file) {
  return process.env[envKey] ? Buffer.from(process.env[envKey],'base64') : fs.readFileSync(path.join(__dirname,file));
}

function buildPassJson(c, t, biz, B) {
  const left = Math.max(0, t.goal - c.punches);
  const bg  = hexToRgb(t.bgColor   || '#C4975A');
  const fg  = hexToRgb(t.textColor || '#1C0F00');
  const lbl = [Math.round(fg[0]*0.5), Math.round(fg[1]*0.5+10), Math.round(fg[2]*0.4)];
  return {
    formatVersion:1, passTypeIdentifier:PASS_TYPE_ID, teamIdentifier:TEAM_ID,
    serialNumber:c.serial, organizationName:t.businessName||biz.name, description:t.cardTitle,
    backgroundColor:`rgb(${bg.join(',')})`, foregroundColor:`rgb(${fg.join(',')})`, labelColor:`rgb(${lbl.join(',')})`,
    stripColor:`rgb(${bg.join(',')})`,
    webServiceURL:`${B}/passkit/`,
    authenticationToken: c.passToken,
    storeCard:{
      headerFields:[{
        key:'bizname', label:'', value: t.businessName||biz.name,
        textAlignment:'PKTextAlignmentCenter'
      }],
      primaryFields:[{
        key:'reward', label:'ההטבה', value:t.reward||'Free Item',
        textAlignment:'PKTextAlignmentCenter'
      }],
      secondaryFields:[
        {key:'stamps', label:'חותמות', value:`${c.punches} / ${t.goal}`},
        {key:'left', label:'נשאר', value: left===0 ? 'מוכן למימוש!' : `עוד ${left}`}
      ],
      backFields:[
        {key:'serial', label:'מספר כרטיס', value:c.serial},
        {key:'biz', label:'בית עסק', value:t.businessName||biz.name},
        {key:'info', label:'איך זה עובד', value:`אסוף ${t.goal} חותמות וקבל ${t.reward||'פרס'} חינם`}
      ]
    },
    barcodes:[{message:`${B}/card/${c.serial}`,format:'PKBarcodeFormatQR',messageEncoding:'iso-8859-1',altText:c.serial}],
    barcode:{message:`${B}/card/${c.serial}`,format:'PKBarcodeFormatQR',messageEncoding:'iso-8859-1',altText:c.serial}
  };
}

async function generatePkpass(c, t, biz, B) {
  const { PKPass } = require('passkit-generator');
  const os = require('os');
  const tmpDir = path.join(os.tmpdir(), 'pkpass_'+Date.now()+'.pass');
  fs.mkdirSync(tmpDir, { recursive:true });
  const imgs = generatePassImages(c.punches, t.goal, t);
  const darkRgb = hexToRgb(t.fillColor || '#1C0F00');
  const icon = solidPNG(29, darkRgb[0], darkRgb[1], darkRgb[2]);
  // Use stored biz logo if available
  let logoPng;
  if (biz.logo && biz.logo.startsWith('data:image')) {
    const b64 = biz.logo.replace(/^data:image\/[a-z+]+;base64,/,'');
    logoPng = Buffer.from(b64, 'base64');
  } else {
    logoPng = imgs.logo;
  }
  fs.writeFileSync(path.join(tmpDir,'pass.json'), JSON.stringify(buildPassJson(c,t,biz,B)));
  fs.writeFileSync(path.join(tmpDir,'icon.png'), icon);
  fs.writeFileSync(path.join(tmpDir,'icon@2x.png'), solidPNG(58, darkRgb[0], darkRgb[1], darkRgb[2]));
  fs.writeFileSync(path.join(tmpDir,'logo.png'), logoPng);
  fs.writeFileSync(path.join(tmpDir,'logo@2x.png'), logoPng);
  fs.writeFileSync(path.join(tmpDir,'strip.png'), imgs.strip);
  fs.writeFileSync(path.join(tmpDir,'strip@2x.png'), imgs.strip);
  try {
    const pass = await PKPass.from({ model:tmpDir, certificates:{
      wwdr:getCert('APPLE_WWDR','wwdr.pem'),
      signerCert:getCert('APPLE_PASS_CERT','pass.pem'),
      signerKey:getCert('APPLE_PASS_KEY','pass.key')
    }});
    return pass.getAsBuffer();
  } finally { fs.rmSync(tmpDir, { recursive:true, force:true }); }
}

app.get('/apple-wallet/:serial', async (req, res) => {
  const db = await loadDB();
  const c  = db.customers?.[req.params.serial];
  if (!c) return res.status(404).send(notFound());
  const biz = db.businesses[c.bizId];
  const t   = biz?.cardTemplate || {};
  const B   = base(req);
  if (!c.passToken) { c.passToken = crypto.randomBytes(16).toString('hex'); await saveDB(db); }
  try {
    const buf = await generatePkpass(c, t, biz, B);
    res.set({'Content-Type':'application/vnd.apple.pkpass','Content-Disposition':`attachment; filename="${c.serial}.pkpass"`,'Content-Length':buf.length});
    res.send(buf);
  } catch(e) { res.status(500).send('Apple Wallet error: ' + e.message); }
});

// ══════════════════════════════════════════════════════
// PASSKIT WEB SERVICE (Apple Wallet live updates)
// ══════════════════════════════════════════════════════
function passAuth(req) {
  const h = req.headers['authorization'] || '';
  return h.startsWith('ApplePass ') ? h.slice(10) : null;
}

async function sendApnsPush(pushToken) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ ok:false, err:'timeout' }), 8000);
    try {
      const http2 = require('http2');
      const client = http2.connect('https://api.push.apple.com', {
        cert: getCert('APPLE_PASS_CERT','pass.pem'),
        key:  getCert('APPLE_PASS_KEY','pass.key'),
        rejectUnauthorized: true
      });
      client.on('error', e => { clearTimeout(timer); client.destroy(); resolve({ ok:false, err:e.message }); });
      const req = client.request({
        ':method':'POST', ':path':`/3/device/${pushToken}`,
        'apns-topic': PASS_TYPE_ID,
        'apns-push-type':'background',
        'apns-priority':'10',
        'content-type':'application/json'
      });
      let status, body='';
      req.write('{}'); req.end();
      req.on('response', h => { status=h[':status']; });
      req.on('data', d => { body+=d; });
      req.on('end', () => {
        clearTimeout(timer);
        client.close();
        resolve({ ok: status===200, status, body });
      });
      req.on('error', e => { clearTimeout(timer); client.destroy(); resolve({ ok:false, err:e.message }); });
    } catch(e) { clearTimeout(timer); resolve({ ok:false, err:e.message }); }
  });
}

async function pushAppleWalletUpdate(serial) {
  try {
    const db = await loadDB();
    if (!db.passUpdatedAt) db.passUpdatedAt = {};
    db.passUpdatedAt[serial] = new Date().toISOString();
    const devices = Object.values(db.passDevices?.[serial] || {});
    if (!db.apnsLog) db.apnsLog = {};
    const results = [];
    for (const d of devices) {
      const r = await sendApnsPush(d.pushToken);
      results.push({ token: d.pushToken.slice(-8), ...r });
    }
    db.apnsLog[serial] = { at: new Date().toISOString(), devices: devices.length, results };
    await saveDB(db);
    return results;
  } catch(e) { console.error('pushAppleWalletUpdate error:', e); return []; }
}

// Debug + manual push endpoint (auth required)
app.post('/api/wallet-push/:serial', authMiddleware, async (req, res) => {
  const { bizId, db } = req;
  const c = db.customers?.[req.params.serial];
  if (!c || c.bizId !== bizId) return res.status(404).json({ error: 'not found' });
  const devices = Object.values(db.passDevices?.[req.params.serial] || {});
  if (!devices.length) return res.json({ ok:false, msg:'לקוח לא רשום — צריך להוריד pass חדש', registered:false });
  const results = await pushAppleWalletUpdate(req.params.serial);
  res.json({ ok: true, registered: true, devices: devices.length, results });
});

app.get('/api/wallet-status/:serial', authMiddleware, async (req, res) => {
  const { bizId, db } = req;
  const c = db.customers?.[req.params.serial];
  if (!c || c.bizId !== bizId) return res.status(404).json({ error: 'not found' });
  const devices = db.passDevices?.[req.params.serial] || {};
  const log = db.apnsLog?.[req.params.serial];
  res.json({
    hasPassToken: !!c.passToken,
    devicesRegistered: Object.keys(devices).length,
    lastPush: log || null
  });
});

app.post('/passkit/v1/devices/:deviceId/registrations/:passTypeId/:serial', async (req, res) => {
  const { deviceId, serial } = req.params;
  const token = passAuth(req);
  const { pushToken } = req.body;
  if (!token || !pushToken) return res.status(401).send();
  const db = await loadDB();
  const c = db.customers?.[serial];
  if (!c || c.passToken !== token) return res.status(401).send();
  if (!db.passDevices) db.passDevices = {};
  if (!db.passDevices[serial]) db.passDevices[serial] = {};
  const isNew = !db.passDevices[serial][deviceId];
  db.passDevices[serial][deviceId] = { pushToken, updatedAt: new Date().toISOString() };
  await saveDB(db);
  res.status(isNew ? 201 : 200).send();
});

app.delete('/passkit/v1/devices/:deviceId/registrations/:passTypeId/:serial', async (req, res) => {
  const { deviceId, serial } = req.params;
  const token = passAuth(req);
  if (!token) return res.status(401).send();
  const db = await loadDB();
  const c = db.customers?.[serial];
  if (!c || c.passToken !== token) return res.status(401).send();
  if (db.passDevices?.[serial]?.[deviceId]) { delete db.passDevices[serial][deviceId]; await saveDB(db); }
  res.status(200).send();
});

app.get('/passkit/v1/devices/:deviceId/registrations/:passTypeId', async (req, res) => {
  const { deviceId } = req.params;
  const since = req.query.passesUpdatedSince;
  const db = await loadDB();
  const serials = [];
  for (const [serial, devices] of Object.entries(db.passDevices || {})) {
    if (!devices[deviceId]) continue;
    const upd = db.passUpdatedAt?.[serial] || '';
    if (!since || upd > since) serials.push(serial);
  }
  if (!serials.length) return res.status(204).send();
  res.json({ lastUpdated: new Date().toISOString(), serialNumbers: serials });
});

app.get('/passkit/v1/passes/:passTypeId/:serial', async (req, res) => {
  const token = passAuth(req);
  if (!token) return res.status(401).send();
  const db = await loadDB();
  const c = db.customers?.[req.params.serial];
  if (!c || c.passToken !== token) return res.status(401).send();
  const biz = db.businesses[c.bizId];
  const t = biz?.cardTemplate || {};
  const B = base(req);
  try {
    const buf = await generatePkpass(c, t, biz, B);
    res.set({'Content-Type':'application/vnd.apple.pkpass','Last-Modified':new Date().toUTCString(),'Content-Length':buf.length});
    res.send(buf);
  } catch(e) { res.status(500).send(); }
});

app.post('/passkit/v1/log', (req, res) => res.status(200).json({}));

// ══════════════════════════════════════════════════════
// 404
// ══════════════════════════════════════════════════════
function notFound() {
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>עמוד לא נמצא — Ten Dots</title>${FONTS}<style>*{margin:0;padding:0;box-sizing:border-box;font-family:'Heebo',sans-serif}body{min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#F7F7F8;padding:24px}.box{text-align:center;padding:48px 40px;background:#fff;border-radius:12px;border:1px solid #E5E5E5;box-shadow:0 1px 3px rgba(0,0,0,.08);max-width:320px;width:100%}.icon{width:56px;height:56px;background:#F0F0F1;border:1px solid #E5E5E5;border-radius:12px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px}h1{font-size:20px;font-weight:800;margin-bottom:8px;color:#111}p{color:#666;font-size:14px;line-height:1.6;margin-bottom:24px}a{display:inline-flex;align-items:center;background:#111;color:#fff;padding:0 20px;height:40px;border-radius:4px;font-weight:700;font-size:14px;text-decoration:none}a:hover{background:#333}</style></head><body><div class="box"><div class="icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div><h1>עמוד לא נמצא</h1><p>הקישור אינו תקף או שהעמוד הוסר.</p><a href="/">חזרה לדף הבית</a></div></body></html>`;
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
    console.log(`\n  Ten Dots\n`);
    console.log(`   Landing:    http://${IP}:${PORT}`);
    console.log(`   Dashboard:  http://${IP}:${PORT}/dashboard\n`);
  });
}
module.exports = app;
