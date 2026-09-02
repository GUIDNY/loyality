// ══════════════════════════════════════════════════════
// PUBLIC PAGES — landing page and its OG image
// ══════════════════════════════════════════════════════
const { rgbToPNG } = require('../png');
const { FAVICON, FONTS, BASE_CSS, LOGO_ICON } = require('./assets');
const { kraftCard } = require('./cards');

// Hand-rasterised 1200x630 share image — ten circles, last one ticked.
function ogPng() {
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
  return rgbToPNG(rgb,W,H);
}

function landingPage() {
  const cardPreview = kraftCard({ cardTitle:'Coffee 10 Free', goal:10, reward:'Free Coffee', businessName:'Your Café' }, 6, null);
  return `<!DOCTYPE html>
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
</body></html>`;
}

module.exports = { ogPng, landingPage };
