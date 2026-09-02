// ══════════════════════════════════════════════════════
// CUSTOMER CARD PAGE + punch confirmation screen + 404
// ══════════════════════════════════════════════════════
const { esc, makeQR } = require('../util');
const { FONTS, BASE_CSS } = require('./assets');
const { kraftCard } = require('./cards');

async function cardPage({ customer: c, business: biz, B }) {
  const t    = biz.cardTemplate;
  const full = c.punches >= t.goal;
  const cardQR = await makeQR(`${B}/card/${c.serial}`, 160);
  return `<!DOCTYPE html>
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
</body></html>`;
}

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

function notFound() {
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>עמוד לא נמצא — Ten Dots</title>${FONTS}<style>*{margin:0;padding:0;box-sizing:border-box;font-family:'Heebo',sans-serif}body{min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#F7F7F8;padding:24px}.box{text-align:center;padding:48px 40px;background:#fff;border-radius:12px;border:1px solid #E5E5E5;box-shadow:0 1px 3px rgba(0,0,0,.08);max-width:320px;width:100%}.icon{width:56px;height:56px;background:#F0F0F1;border:1px solid #E5E5E5;border-radius:12px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px}h1{font-size:20px;font-weight:800;margin-bottom:8px;color:#111}p{color:#666;font-size:14px;line-height:1.6;margin-bottom:24px}a{display:inline-flex;align-items:center;background:#111;color:#fff;padding:0 20px;height:40px;border-radius:4px;font-weight:700;font-size:14px;text-decoration:none}a:hover{background:#333}</style></head><body><div class="box"><div class="icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div><h1>עמוד לא נמצא</h1><p>הקישור אינו תקף או שהעמוד הוסר.</p><a href="/">חזרה לדף הבית</a></div></body></html>`;
}

module.exports = { cardPage, punchPage, notFound };
