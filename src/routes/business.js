// ══════════════════════════════════════════════════════
// BUSINESS ROUTES — dashboard, scanner, and the JSON API behind them
// ══════════════════════════════════════════════════════
const express = require('express');
const db      = require('../db');
const auth    = require('../auth');
const { base, sanitize } = require('../util');
const { STAMP_ICONS }    = require('../views/assets');
const { walletCard }     = require('../views/cards');
const { dashboardPage }  = require('../views/dashboard');
const { scanPage }       = require('../views/scan');
const { updateGoogleWalletObject } = require('../wallet/google');
const { pushAppleWalletUpdate }    = require('../wallet/apple');

const router = express.Router();

// ── pages ─────────────────────────────────────────────
router.get('/dashboard', auth.authMiddleware, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const customers = await db.listCustomers(req.bizId);
    res.send(await dashboardPage({ biz: req.biz, bizId: req.bizId, customers, B: base(req) }));
  } catch (e) { next(e); }
});

router.get('/scan', auth.authMiddleware, (req, res) => res.send(scanPage(req.biz)));

// ── card designer ─────────────────────────────────────
router.post('/api/template', auth.authApi, async (req, res, next) => {
  try {
    const d = req.body, cur = req.biz.cardTemplate;
    const patch = {
      businessName: sanitize(d.businessName || cur.businessName),
      cardTitle:    sanitize(d.cardTitle    || cur.cardTitle),
      description:  sanitize(d.description  || cur.description),
      reward:       sanitize(d.reward       || cur.reward),
      goal:         Math.min(20, Math.max(3, parseInt(d.goal) || 10)),
      expiry:       sanitize(d.expiry    || cur.expiry    || '', 20),
      bgColor:      sanitize(d.bgColor   || cur.bgColor   || '#C4975A', 10),
      fillColor:    sanitize(d.fillColor || cur.fillColor || '#1C0F00', 10),
      textColor:    sanitize(d.textColor || cur.textColor || '#1C0F00', 10),
      circleStyle:  Object.keys(STAMP_ICONS).includes(d.circleStyle)
        ? d.circleStyle : (cur.circleStyle || 'bean'),
    };
    await db.updateCardTemplate(req.bizId, patch);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/api/preview', auth.authApi, (req, res) => {
  const { logo: clientLogo, ...rest } = req.body;
  const tpl = { ...rest, goal: Math.min(20, Math.max(3, parseInt(rest.goal) || 10)) };
  const logoData = (clientLogo && clientLogo.startsWith('data:image')) ? clientLogo : (req.biz.logo || null);
  res.send(walletCard(tpl, Math.ceil((tpl.goal || 10) * 0.55), null, logoData));
});

router.post('/api/logo', auth.authApi, async (req, res, next) => {
  try {
    const { logo } = req.body;
    if (!logo || !logo.startsWith('data:image')) return res.status(400).json({ error: 'Invalid' });
    if (logo.length > 800000) return res.status(400).json({ error: 'תמונה גדולה מדי (מקסימום 500KB)' });
    await db.setLogo(req.bizId, logo);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/api/logo/remove', auth.authApi, async (req, res, next) => {
  try {
    await db.setLogo(req.bizId, null);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/api/me', auth.authApi, (req, res) => {
  res.json({ ok: true, bizName: req.biz.name });
});

// ── customer operations ───────────────────────────────
// Every one of these re-checks that the customer belongs to the caller's
// business before touching it.
async function ownedCustomer(req) {
  const c = await db.getCustomer(req.params.serial);
  if (!c || c.bizId !== req.bizId) return null;
  return c;
}

router.post('/api/punch/:serial', auth.authApi, async (req, res, next) => {
  try {
    const c = await ownedCustomer(req);
    if (!c) return res.status(404).json({ error: 'לקוח לא נמצא' });

    const t = req.biz.cardTemplate;
    // The guard is inside the UPDATE, so two cashiers scanning the same card at
    // once produce exactly one punch instead of silently overwriting each other.
    const updated = await db.punch(c.serial, t.goal);
    if (!updated) return res.status(400).json({ error: 'כרטיס מלא — יש למממש קודם' });

    // Answer the cashier first — the scanner UI waits on this.
    res.json({
      ok: true, name: updated.name || updated.serial,
      punches: updated.punches, goal: t.goal, reward: t.reward,
      full: updated.punches >= t.goal, serial: updated.serial,
    });

    // Then refresh the wallets. The original only ever refreshed Google Wallet
    // on reset, so a punched card kept showing a stale balance there forever.
    // Both are best-effort and deliberately not awaited.
    updateGoogleWalletObject(updated.serial, updated.punches, t.goal, t.reward);
  } catch (e) { next(e); }
});

router.post('/api/redeem/:serial', auth.authApi, async (req, res, next) => {
  try {
    const c = await ownedCustomer(req);
    if (!c) return res.status(404).json({ error: 'not found' });

    const t = req.biz.cardTemplate;
    const updated = await db.redeem(c.serial, t.goal);
    if (!updated) return res.status(400).json({ error: 'הכרטיס עדיין לא מלא' });

    // The original returned here without refreshing either wallet, so a redeemed
    // card kept showing a full punch count in Apple/Google Wallet.
    updateGoogleWalletObject(updated.serial, 0, t.goal, t.reward);
    pushAppleWalletUpdate(updated.serial);

    // (The original also called res.json twice here, which threw
    // ERR_HTTP_HEADERS_SENT on every successful redeem.)
    res.json({ ok: true, name: updated.name, redeemed: updated.redeemed });
  } catch (e) { next(e); }
});

router.post('/api/reset/:serial', auth.authApi, async (req, res, next) => {
  try {
    const c = await ownedCustomer(req);
    if (!c) return res.status(404).json({ error: 'not found' });

    const t = req.biz.cardTemplate;
    const updated = await db.resetPunches(c.serial);
    updateGoogleWalletObject(updated.serial, 0, t.goal, t.reward);
    pushAppleWalletUpdate(updated.serial);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/api/customer/:serial', auth.authApi, async (req, res, next) => {
  try {
    const c = await ownedCustomer(req);
    if (!c) return res.status(404).json({ error: 'not found' });
    await db.updateCustomerDetails(
      c.serial,
      sanitize(req.body.name || '', 80),
      sanitize(req.body.phone || '', 20)
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Apple Wallet push diagnostics ─────────────────────
router.post('/api/wallet-push/:serial', auth.authApi, async (req, res, next) => {
  try {
    const c = await ownedCustomer(req);
    if (!c) return res.status(404).json({ error: 'not found' });

    const devices = await db.listDevices(c.serial);
    if (!devices.length) {
      return res.json({ ok: false, msg: 'לקוח לא רשום — צריך להוריד pass חדש', registered: false });
    }
    const results = await pushAppleWalletUpdate(c.serial);
    res.json({ ok: true, registered: true, devices: devices.length, results });
  } catch (e) { next(e); }
});

router.get('/api/wallet-status/:serial', auth.authApi, async (req, res, next) => {
  try {
    const c = await ownedCustomer(req);
    if (!c) return res.status(404).json({ error: 'not found' });
    const devices = await db.listDevices(c.serial);
    res.json({
      hasPassToken: !!c.passToken,
      devicesRegistered: devices.length,
      lastPush: await db.getApnsLog(c.serial),
    });
  } catch (e) { next(e); }
});

module.exports = router;
