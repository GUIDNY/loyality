// ══════════════════════════════════════════════════════
// AUTH PAGES — login / signup
// ══════════════════════════════════════════════════════
const { esc } = require('../util');
const { FAVICON, FONTS, BASE_CSS, LOGO_ICON } = require('./assets');

// The original built an `errParam` variable, never used it, and rendered no
// error at all — so a failed login just bounced back to a pristine form with
// ?err=1 in the URL and no explanation. The messages below close that gap.
const ERRORS = {
  '1':       'אימייל או סיסמה שגויים',
  exists:    'האימייל הזה כבר רשום — נסה להתחבר במקום',
  missing:   'יש למלא שם עסק, אימייל וסיסמה בת 6 תווים לפחות',
};

function authPage(mode, errCode) {
  const isLogin = mode === 'login';
  const errHtml = ERRORS[errCode] ? `<div class="err">${esc(ERRORS[errCode])}</div>` : '';
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
  <p class="sub">${isLogin ? 'ברוך השב ל-Ten Dots' : 'הצטרף לעסקים שמשתמשים ב-Ten Dots'}</p>
  ${errHtml}
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

module.exports = { authPage, ERRORS };
