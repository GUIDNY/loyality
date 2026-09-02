// ══════════════════════════════════════════════════════
// SHARED ASSETS — logo, fonts, base stylesheet, stamp icons
// Extracted verbatim from the original single-file server so the
// rendered UI is byte-for-byte unchanged.
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

module.exports = { APP_NAME, FAVICON, LOGO_SVG, LOGO_ICON, FONTS, BASE_CSS, BEAN, BEANS3, ORDS, STAMP_ICONS };
