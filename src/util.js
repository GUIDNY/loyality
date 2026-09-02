// ══════════════════════════════════════════════════════
// SMALL SHARED HELPERS
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
  const h = String(hex || '').replace('#','');
  return [parseInt(h.slice(0,2),16) || 0, parseInt(h.slice(2,4),16) || 0, parseInt(h.slice(4,6),16) || 0];
}

async function makeQR(text, size = 200) {
  const QRCode = require('qrcode');
  return QRCode.toDataURL(text, {
    width: size, margin: 2,
    color: { dark: '#1a202c', light: '#ffffff' }
  });
}

// The card template every new business starts with.
function defaultTemplate(name) {
  return {
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
  };
}

module.exports = { base, esc, sanitize, hexToRgb, makeQR, defaultTemplate };
