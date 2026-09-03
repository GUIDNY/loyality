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

// A signed-in business is not enough — the account must carry the admin flag.
// Non-admins are bounced to their own dashboard rather than told the area exists.
async function adminOnly(req, res, next) {
  const bizId = auth.verifySession(req.cookies?.session);
  if (!bizId) return res.redirect('/login');
  try {
    const { rows } = await db.q('select id, name, email, is_admin from businesses where id = $1', [bizId]);
    if (!rows[0] || !rows[0].is_admin) return res.redirect('/dashboard');
    req.admin = rows[0];
    next();
  } catch (e) { next(e); }
}

router.get('/admin', adminOnly, async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const tab = ['clients', 'tasks', 'money'].includes(req.query.tab) ? req.query.tab : 'clients';
    const [stats, clients, tasks, finance, unlinked] = await Promise.all([
      crm.stats(), crm.listClients(), crm.listTasks(), crm.listFinance(), crm.unlinkedBusinesses(),
    ]);
    res.send(adminPage({ admin: req.admin, stats, clients, tasks, finance, unlinked, tab }));
  } catch (e) { next(e); }
});

// ── clients ───────────────────────────────────────────
router.post('/admin/clients', adminOnly, async (req, res, next) => {
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

router.post('/admin/clients/:id/delete', adminOnly, async (req, res, next) => {
  try {
    await crm.deleteClient(req.params.id);
    res.redirect('/admin?tab=clients');
  } catch (e) { next(e); }
});

// ── tasks ─────────────────────────────────────────────
router.post('/admin/tasks', adminOnly, async (req, res, next) => {
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

router.post('/admin/tasks/:id/toggle', adminOnly, async (req, res, next) => {
  try {
    await crm.toggleTask(req.params.id);
    res.redirect('/admin?tab=tasks');
  } catch (e) { next(e); }
});

router.post('/admin/tasks/:id/delete', adminOnly, async (req, res, next) => {
  try {
    await crm.deleteTask(req.params.id);
    res.redirect('/admin?tab=tasks');
  } catch (e) { next(e); }
});

// ── money ─────────────────────────────────────────────
router.post('/admin/finance', adminOnly, async (req, res, next) => {
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

router.post('/admin/finance/:id/delete', adminOnly, async (req, res, next) => {
  try {
    await crm.deleteEntry(req.params.id);
    res.redirect('/admin?tab=money');
  } catch (e) { next(e); }
});

module.exports = router;
