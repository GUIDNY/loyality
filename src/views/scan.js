// ══════════════════════════════════════════════════════
// SCAN PAGE — camera QR scanner for the cashier
// ══════════════════════════════════════════════════════
const { esc } = require('../util');
const { FONTS } = require('./assets');

function scanPage(biz) {
  return `<!DOCTYPE html>
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
</body></html>`;
}

module.exports = { scanPage };
