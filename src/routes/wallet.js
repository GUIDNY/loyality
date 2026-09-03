// ══════════════════════════════════════════════════════
// WALLET ROUTES — Google save link, .pkpass download,
// and the PassKit web service Apple calls for live updates
// ══════════════════════════════════════════════════════
const express = require('express');
const crypto  = require('crypto');
const db      = require('../db');
const auth    = require('../auth');
const { base } = require('../util');
const { notFound } = require('../views/card');
const { googleSaveUrl } = require('../wallet/google');
const { generatePkpass, passAuth } = require('../wallet/apple');

const router = express.Router();

// ── Google Wallet ─────────────────────────────────────
router.get('/wallet/:serial', async (req, res, next) => {
  try {
    const { customer, business } = await db.getCustomerWithBusiness(req.params.serial);
    if (!customer || !business) return res.status(404).send(notFound());

    const url = googleSaveUrl(customer, business, business.cardTemplate || {}, base(req));
    if (!url) return res.status(500).send('Google credentials missing');
    res.redirect(url);
  } catch (e) { next(e); }
});

// ── Apple Wallet ──────────────────────────────────────
router.get('/apple-wallet/:serial', async (req, res, next) => {
  try {
    const { customer, business } = await db.getCustomerWithBusiness(req.params.serial);
    if (!customer || !business) return res.status(404).send(notFound());

    // coalesce() in SQL: two taps on "Add to Apple Wallet" can't mint two
    // different auth tokens and lock the first pass out of updates.
    const token = await db.ensurePassToken(customer.serial, crypto.randomBytes(16).toString('hex'));
    customer.passToken = token;

    const buf = await generatePkpass(customer, business.cardTemplate || {}, business, base(req));
    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="${customer.serial}.pkpass"`,
      'Content-Length': buf.length,
    });
    res.send(buf);
  } catch (e) {
    console.error('[apple-wallet]', e);
    res.status(500).send('Apple Wallet error: ' + e.message);
  }
});

// ── one-tap NFC join ──────────────────────────────────
// An NFC tag holding this URL takes the customer straight to the Wallet "Add"
// sheet: we mint the customer and answer with the pass itself, so there is no
// web page in between. iOS opens .pkpass responses in Wallet directly; Android
// gets the Google Wallet save link; anything else falls back to the card page.
//
// (The OS still asks the customer to confirm the add — Apple gives no way to
// install a pass silently, and that confirmation is the only tap left.)
router.get('/nfc/:bizId', async (req, res, next) => {
  try {
    const biz = await db.getBusiness(req.params.bizId);
    if (!biz) return res.status(404).send(notFound());

    const ua      = String(req.headers['user-agent'] || '');
    const isApple = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && !/Android/i.test(ua));
    const t       = biz.cardTemplate || {};
    const B       = base(req);

    const c = await db.createCustomer(biz.id);

    if (isApple) {
      try {
        c.passToken = await db.ensurePassToken(c.serial, crypto.randomBytes(16).toString('hex'));
        const buf = await generatePkpass(c, t, biz, B);
        res.set({
          'Content-Type': 'application/vnd.apple.pkpass',
          'Content-Disposition': `attachment; filename="${c.serial}.pkpass"`,
          'Content-Length': buf.length,
          'Cache-Control': 'no-store',
        });
        return res.send(buf);
      } catch (e) {
        // Never strand the customer on an error page — the card still works.
        console.error('[nfc] pkpass build failed:', e.message);
        return res.redirect(`/card/${c.serial}`);
      }
    }

    if (/Android/i.test(ua)) {
      const url = googleSaveUrl(c, biz, t, B);
      if (url) return res.redirect(url);
    }

    res.redirect(`/card/${c.serial}`);
  } catch (e) { next(e); }
});

// ── PassKit web service ───────────────────────────────
// Device registers for updates to one pass.
router.post('/passkit/v1/devices/:deviceId/registrations/:passTypeId/:serial', async (req, res, next) => {
  try {
    const { deviceId, serial } = req.params;
    const token = passAuth(req);
    const { pushToken } = req.body || {};
    if (!token || !pushToken) return res.status(401).send();

    const c = await db.getCustomer(serial);
    if (!c || !c.passToken || c.passToken !== token) return res.status(401).send();

    const isNew = await db.registerDevice(serial, deviceId, pushToken);
    res.status(isNew ? 201 : 200).send();
  } catch (e) { next(e); }
});

router.delete('/passkit/v1/devices/:deviceId/registrations/:passTypeId/:serial', async (req, res, next) => {
  try {
    const { deviceId, serial } = req.params;
    const token = passAuth(req);
    if (!token) return res.status(401).send();

    const c = await db.getCustomer(serial);
    if (!c || !c.passToken || c.passToken !== token) return res.status(401).send();

    await db.unregisterDevice(serial, deviceId);
    res.status(200).send();
  } catch (e) { next(e); }
});

// Which passes changed since the device last synced.
router.get('/passkit/v1/devices/:deviceId/registrations/:passTypeId', async (req, res, next) => {
  try {
    const serials = await db.serialsForDevice(req.params.deviceId, req.query.passesUpdatedSince);
    if (!serials.length) return res.status(204).send();
    res.json({ lastUpdated: new Date().toISOString(), serialNumbers: serials });
  } catch (e) { next(e); }
});

// The updated pass itself.
router.get('/passkit/v1/passes/:passTypeId/:serial', async (req, res) => {
  try {
    const token = passAuth(req);
    if (!token) return res.status(401).send();

    const { customer, business } = await db.getCustomerWithBusiness(req.params.serial);
    if (!customer || !customer.passToken || customer.passToken !== token) return res.status(401).send();

    const buf = await generatePkpass(customer, business.cardTemplate || {}, business, base(req));
    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Last-Modified': new Date().toUTCString(),
      'Content-Length': buf.length,
    });
    res.send(buf);
  } catch (e) {
    console.error('[passkit] pass build failed:', e.message);
    res.status(500).send();
  }
});

router.post('/passkit/v1/log', (req, res) => res.status(200).json({}));

module.exports = router;
