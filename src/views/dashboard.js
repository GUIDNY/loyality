// ══════════════════════════════════════════════════════
// DASHBOARD — card designer + customer table
// ══════════════════════════════════════════════════════
const { esc, makeQR } = require('../util');
const { FONTS, BASE_CSS, LOGO_ICON, STAMP_ICONS } = require('./assets');
const { walletCard, kraftCard } = require('./cards');

// `customers` arrives already ordered by the query — the old in-memory
// localeCompare sort on createdAt is gone (createdAt is a Date now).
async function dashboardPage({ biz, bizId, customers, B }) {
  const t = biz.cardTemplate;
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

  return `<!DOCTYPE html>
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
    ${biz.isStaff ? `<a href="/admin" class="btn btn-secondary btn-sm">ניהול</a>` : ''}
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
</body></html>`;
}

module.exports = { dashboardPage };
