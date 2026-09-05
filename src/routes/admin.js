// ══════════════════════════════════════════════════════
// ADMIN ROUTES — gated on businesses.is_admin
// ══════════════════════════════════════════════════════
const express = require('express');
const db      = require('../db');
const crm     = require('../crm');
const auth    = require('../auth');
const { sanitize } = require('../util');
const { adminPage } = require('../views/admin');

const router = express.Router();

const biz_isOwner = req => req.admin?.isOwner === true;

// Three levels: owner (מנהל על) > admin (מנהל) > client (לקוח).
//
// A signed-in business is not enough. Clients are bounced to their own
// dashboard rather than told the area exists, and the guard runs on every
// route including the POSTs, not only on the page.
async function staffOnly(req, res, next) {
  const bizId = auth.verifySession(req.cookies?.session);
  if (!bizId) return res.redirect('/login');
  try {
    const biz = await db.getBusiness(bizId);
    if (!biz || !biz.isStaff) return res.redirect('/dashboard');
    req.admin = biz;
    next();
  } catch (e) { next(e); }
}

// Money and role changes are the owner's alone — an admin who reaches for
// either is treated exactly like a client reaching for the area.
function ownerOnly(req, res, next) {
  if (!req.admin?.isOwner) return res.redirect('/admin');
  next();
}

router.get('/admin', staffOnly, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    let tab = ['clients', 'tasks', 'money', 'roles'].includes(req.query.tab) ? req.query.tab : 'clients';
    // an admin has no money or roles tab to land on
    if (!biz_isOwner(req) && (tab === 'money' || tab === 'roles')) tab = 'clients';
    const owner = biz_isOwner(req);
    const [stats, clients, tasks, finance, unlinked, accounts] = await Promise.all([
      crm.stats(), crm.listClients(), crm.listTasks(),
      owner ? crm.listFinance()  : [],
      crm.unlinkedBusinesses(),
      owner ? crm.listAccounts() : [],
    ]);
    res.send(adminPage({ admin: req.admin, stats, clients, tasks, finance, unlinked, accounts, tab,
                         notice: req.query.notice || '' }));
  } catch (e) { next(e); }
});

// ── clients ───────────────────────────────────────────
router.post('/admin/clients', staffOnly, async (req, res, next) => {
  try {
    const name = sanitize(req.body.name || '', 120);
    if (!name) return res.redirect('/admin?tab=clients');
    await crm.createClient({
      name,
      contact: sanitize(req.body.contact || '', 80),
      phone:   sanitize(req.body.phone   || '', 30),
      email:   sanitize(req.body.email   || '', 120).toLowerCase(),
      status:  req.body.status,
      notes:   sanitize(req.body.notes   || '', 500),
      bizId:   sanitize(req.body.bizId   || '', 20) || null,
    });
    res.redirect('/admin?tab=clients');
  } catch (e) { next(e); }
});

router.post('/admin/clients/:id/delete', staffOnly, async (req, res, next) => {
  try {
    await crm.deleteClient(req.params.id);
    res.redirect('/admin?tab=clients');
  } catch (e) { next(e); }
});

// ── tasks ─────────────────────────────────────────────
router.post('/admin/tasks', staffOnly, async (req, res, next) => {
  try {
    const title = sanitize(req.body.title || '', 200);
    if (!title) return res.redirect('/admin?tab=tasks');
    await crm.createTask({
      title,
      notes:    sanitize(req.body.notes || '', 500),
      dueOn:    req.body.dueOn || null,
      clientId: req.body.clientId || null,
    });
    res.redirect('/admin?tab=tasks');
  } catch (e) { next(e); }
});

router.post('/admin/tasks/:id/toggle', staffOnly, async (req, res, next) => {
  try {
    await crm.toggleTask(req.params.id);
    res.redirect('/admin?tab=tasks');
  } catch (e) { next(e); }
});

router.post('/admin/tasks/:id/delete', staffOnly, async (req, res, next) => {
  try {
    await crm.deleteTask(req.params.id);
    res.redirect('/admin?tab=tasks');
  } catch (e) { next(e); }
});

// ── money ─────────────────────────────────────────────
router.post('/admin/finance', staffOnly, ownerOnly, async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount < 0) return res.redirect('/admin?tab=money');
    await crm.createEntry({
      kind:       req.body.kind,
      amount,
      category:   sanitize(req.body.category || '', 80),
      note:       sanitize(req.body.note     || '', 500),
      occurredOn: req.body.occurredOn || null,
      clientId:   req.body.clientId || null,
    });
    res.redirect('/admin?tab=money');
  } catch (e) { next(e); }
});

router.post('/admin/finance/:id/delete', staffOnly, ownerOnly, async (req, res, next) => {
  try {
    await crm.deleteEntry(req.params.id);
    res.redirect('/admin?tab=money');
  } catch (e) { next(e); }
});

// ── roles (owner only) ────────────────────────────────
router.post('/admin/roles/:bizId', staffOnly, ownerOnly, async (req, res, next) => {
  try {
    const r = await crm.setRole(req.params.bizId, req.body.role);
    const notice = r.ok
      ? (r.changed ? 'ההרשאה עודכנה' : '')
      : (r.reason === 'last-owner'
          ? 'אי אפשר להוריד את מנהל העל האחרון — מנה קודם מנהל על נוסף'
          : 'עדכון ההרשאה נכשל');
    res.redirect('/admin?tab=roles' + (notice ? '&notice=' + encodeURIComponent(notice) : ''));
  } catch (e) { next(e); }
});

module.exports = router;
