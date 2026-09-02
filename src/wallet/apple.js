// ══════════════════════════════════════════════════════
// APPLE WALLET — pass generation, strip artwork, APNs push
// ══════════════════════════════════════════════════════
const fs   = require('fs');
const path = require('path');
const { hexToRgb } = require('../util');
const { rgbToPNG, solidPNG } = require('../png');
const db = require('../db');

const PASS_TYPE_ID = 'pass.ZX5VG4RDTL.loyalty';
const TEAM_ID      = 'ZX5VG4RDTL';
const ISSUER_ID    = '3388000000023148997';

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

function getCert(envKey, file) {
  // Certificates sit at the project root; this module is two levels down.
  return process.env[envKey] ? Buffer.from(process.env[envKey],'base64') : fs.readFileSync(path.join(__dirname,'..','..',file));
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

// Was: load whole DB, mutate three nested maps, write whole DB back.
// Now each piece of state is its own row, so a push never races a punch.
async function pushAppleWalletUpdate(serial) {
  try {
    await db.markPassUpdated(serial);
    const devices = await db.listDevices(serial);
    const results = [];
    for (const d of devices) {
      const r = await sendApnsPush(d.pushToken);
      results.push({ token: d.pushToken.slice(-8), ...r });
    }
    await db.logApns(serial, devices.length, results);
    return results;
  } catch (e) {
    console.error('pushAppleWalletUpdate error:', e);
    return [];
  }
}

function passAuth(req) {
  const h = req.headers['authorization'] || '';
  return h.startsWith('ApplePass ') ? h.slice(10) : null;
}

module.exports = {
  PASS_TYPE_ID, TEAM_ID, ISSUER_ID,
  generatePassImages, buildPassJson, generatePkpass,
  sendApnsPush, pushAppleWalletUpdate, passAuth, getCert,
};
