// ══════════════════════════════════════════════════════
// GOOGLE WALLET — save link + live loyalty-object updates
// ══════════════════════════════════════════════════════
const { ISSUER_ID } = require('./apple');

function loadCreds() {
  try {
    return process.env.GOOGLE_CREDENTIALS
      ? JSON.parse(process.env.GOOGLE_CREDENTIALS)
      : require('../../credentials.json');
  } catch { return null; }
}

async function updateGoogleWalletObject(serial, punches, goal, reward) {
  try {
    const jwt = require('jsonwebtoken');
    const creds = loadCreds();
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

// Builds the pay.google.com save link the /wallet/:serial route redirects to.
function googleSaveUrl(c, biz, t, B) {
  const jwt   = require('jsonwebtoken');
  const creds = loadCreds();
  if (!creds) return null;

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

  return `https://pay.google.com/gp/v/save/${token}`;
}

module.exports = { updateGoogleWalletObject, googleSaveUrl };
