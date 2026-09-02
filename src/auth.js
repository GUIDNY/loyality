// ══════════════════════════════════════════════════════
// AUTH — password hashing + signed session cookies
// ══════════════════════════════════════════════════════
const crypto = require('crypto');
const db     = require('./db');

const SECRET = process.env.SESSION_SECRET || 'punchcard_secret_2024';

if (!process.env.SESSION_SECRET && process.env.VERCEL) {
  console.warn('[auth] SESSION_SECRET is not set — falling back to the built-in default. ' +
               'Anyone who knows it can forge a session cookie. Set it in the Vercel env.');
}

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ── passwords ─────────────────────────────────────────
// New hashes are salted scrypt. The old scheme was an unsalted HMAC of the
// password, which leaks equality between accounts that share a password and is
// cheap to attack offline. Legacy hashes still verify, and are transparently
// upgraded to scrypt on the next successful login.
const LEGACY_RE = /^[0-9a-f]{64}$/;

// Legacy hashes were always made with the hard-coded default, never with a
// configured SESSION_SECRET — so verifying them must not follow SECRET, or
// rotating the session secret would silently lock those accounts out.
const LEGACY_SECRET = process.env.LEGACY_PASSWORD_SECRET || 'punchcard_secret_2024';

function legacyHash(pass) {
  return crypto.createHmac('sha256', LEGACY_SECRET).update(pass).digest('hex');
}

function hashPassword(pass) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key  = crypto.scryptSync(pass, salt, 64).toString('hex');
  return `scrypt$${salt}$${key}`;
}

function verifyPassword(pass, stored) {
  if (!stored) return { ok: false, needsUpgrade: false };

  if (LEGACY_RE.test(stored)) {
    const ok = timingSafeEq(legacyHash(pass), stored);
    return { ok, needsUpgrade: ok };
  }

  const [scheme, salt, key] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !key) return { ok: false, needsUpgrade: false };
  const candidate = crypto.scryptSync(pass, salt, 64).toString('hex');
  return { ok: timingSafeEq(candidate, key), needsUpgrade: false };
}

function timingSafeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ── sessions ──────────────────────────────────────────
function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
}

function makeSession(bizId) {
  const payload = bizId + '.' + Date.now();
  return payload + '.' + sign(payload);
}

// The old version verified the signature but never looked at the timestamp it
// had gone to the trouble of embedding, so a leaked cookie was valid forever.
function verifySession(token) {
  if (!token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;

  const payload = parts[0] + '.' + parts[1];
  if (!timingSafeEq(sign(payload), parts[2])) return null;

  const issuedAt = Number(parts[1]);
  if (!Number.isFinite(issuedAt)) return null;
  if (Date.now() - issuedAt > SESSION_MAX_AGE_MS) return null;

  return parts[0];
}

const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: SESSION_MAX_AGE_MS,
};

// Loads the business but, unlike the old middleware, no longer drags the entire
// database along on req.
async function authMiddleware(req, res, next) {
  const bizId = verifySession(req.cookies?.session);
  if (!bizId) return res.redirect('/login');
  try {
    const biz = await db.getBusiness(bizId);
    if (!biz) return res.redirect('/login');
    req.biz   = biz;
    req.bizId = bizId;
    next();
  } catch (e) {
    next(e);
  }
}

// JSON variant for /api/* — a redirect to an HTML login page is useless to fetch().
async function authApi(req, res, next) {
  const bizId = verifySession(req.cookies?.session);
  if (!bizId) return res.status(401).json({ error: 'unauthorized' });
  try {
    const biz = await db.getBusiness(bizId);
    if (!biz) return res.status(401).json({ error: 'unauthorized' });
    req.biz   = biz;
    req.bizId = bizId;
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = {
  SECRET, SESSION_MAX_AGE_MS, COOKIE_OPTS,
  hashPassword, verifyPassword,
  makeSession, verifySession,
  authMiddleware, authApi,
};
