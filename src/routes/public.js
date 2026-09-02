// ══════════════════════════════════════════════════════
// PUBLIC ROUTES — landing, signup/login, customer-facing card
// ══════════════════════════════════════════════════════
const express = require('express');
const db      = require('../db');
const auth    = require('../auth');
const { base, esc, sanitize, defaultTemplate } = require('../util');
const { ogPng, landingPage } = require('../views/landing');
const { authPage }           = require('../views/auth');
const { cardPage, punchPage, notFound } = require('../views/card');

const router = express.Router();

router.get('/og.png', (req, res) => {
  res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public,max-age=86400' });
  res.send(ogPng());
});

router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.send(landingPage());
});

// ── signup ────────────────────────────────────────────
router.get('/signup', (req, res) => res.send(authPage('signup', req.query.err)));

router.post('/signup', async (req, res, next) => {
  try {
    const name  = sanitize(req.body.name || '');
    const email = sanitize(req.body.email || '').toLowerCase();
    const pass  = req.body.password || '';
    if (!name || !email || pass.length < 6) return res.redirect('/signup?err=missing');

    // The unique index on lower(email) decides the race, not a prior SELECT:
    // two simultaneous signups with the same email can no longer both succeed.
    const biz = await db.createBusiness({
      name, email,
      passwordHash: auth.hashPassword(pass),
      cardTemplate: defaultTemplate(name),
    });
    if (!biz) return res.redirect('/signup?err=exists');

    res.cookie('session', auth.makeSession(biz.id), auth.COOKIE_OPTS);
    res.redirect('/dashboard');
  } catch (e) { next(e); }
});

// ── login ─────────────────────────────────────────────
router.get('/login', (req, res) => res.send(authPage('login', req.query.err)));

router.post('/login', async (req, res, next) => {
  try {
    const email = sanitize(req.body.email || '').toLowerCase();
    const pass  = req.body.password || '';
    const biz   = await db.getBusinessByEmail(email);

    const { ok, needsUpgrade } = biz
      ? auth.verifyPassword(pass, biz.passwordHash)
      : { ok: false, needsUpgrade: false };

    if (!ok) return res.redirect('/login?err=1');

    // Accounts created under the old unsalted-HMAC scheme move to scrypt here.
    if (needsUpgrade) {
      try { await db.setPasswordHash(biz.id, auth.hashPassword(pass)); }
      catch (e) { console.error('[login] hash upgrade failed:', e.message); }
    }

    res.cookie('session', auth.makeSession(biz.id), auth.COOKIE_OPTS);
    res.redirect('/dashboard');
  } catch (e) { next(e); }
});

router.get('/logout', (req, res) => {
  res.clearCookie('session');
  res.redirect('/');
});

// ── customer joins a business ─────────────────────────
router.get('/join/:bizId', async (req, res, next) => {
  try {
    const biz = await db.getBusiness(req.params.bizId);
    if (!biz) return res.status(404).send(notFound());
    const c = await db.createCustomer(biz.id);
    res.redirect(`/card/${c.serial}`);
  } catch (e) { next(e); }
});

// ── the customer's own card ───────────────────────────
router.get('/card/:serial', async (req, res, next) => {
  try {
    const { customer, business } = await db.getCustomerWithBusiness(req.params.serial);
    if (!customer || !business) return res.status(404).send(notFound());
    res.set('Cache-Control', 'no-store');
    res.send(await cardPage({ customer, business, B: base(req) }));
  } catch (e) { next(e); }
});

router.get('/api/card-state/:serial', async (req, res, next) => {
  try {
    const { customer, business } = await db.getCustomerWithBusiness(req.params.serial);
    if (!customer) return res.status(404).json({ error: 'not found' });
    res.json({ punches: customer.punches, goal: business?.cardTemplate?.goal || 10 });
  } catch (e) { next(e); }
});

// ── cashier punch-by-URL ──────────────────────────────
// SECURITY: this used to be an unauthenticated GET that incremented a counter.
// Serials run in sequence (PC-0001, PC-0002 ...), so any customer could punch
// their own card — or anyone else's — just by editing the URL. The only guard
// was a 10-second cooldown held in a per-process Map, which does nothing on
// serverless where each request may hit a fresh instance.
// It now requires a signed-in business, and the cooldown lives in the database.
router.get('/punch/:serial', auth.authMiddleware, async (req, res, next) => {
  try {
    const { customer, business } = await db.getCustomerWithBusiness(req.params.serial);
    if (!customer || customer.bizId !== req.bizId) return res.status(404).send(notFound());

    const t = business.cardTemplate || {};
    const goal = t.goal || 10;

    if (customer.punches >= goal) {
      return res.send(punchPage(customer.name, customer.punches, 'full', t));
    }
    if (!(await db.takePunchSlot(customer.serial))) {
      return res.send(punchPage(customer.name, customer.punches, 'rate', t));
    }

    const updated = await db.punch(customer.serial, goal);
    if (!updated) return res.send(punchPage(customer.name, customer.punches, 'full', t));

    res.send(punchPage(updated.name, updated.punches, updated.punches >= goal ? 'full' : 'ok', t));
  } catch (e) { next(e); }
});

module.exports = router;
