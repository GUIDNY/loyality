// ══════════════════════════════════════════════════════
// CARD RENDERERS — the kraft-paper card and the Wallet-style preview.
// Markup extracted verbatim from the original server.
// ══════════════════════════════════════════════════════
const { esc, hexToRgb } = require('../util');
const { BEANS3, ORDS, STAMP_ICONS } = require('./assets');

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

module.exports = { walletCard, kraftCard };
