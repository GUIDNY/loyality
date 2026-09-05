// ══════════════════════════════════════════════════════
// CRM DATA ACCESS — admin area (clients, tasks, money)
// ══════════════════════════════════════════════════════
const { q } = require('./db');

const STATUSES = ['lead', 'active', 'paused', 'churned'];

// ── clients ───────────────────────────────────────────
// Each row carries its linked account's live numbers, so the list can show how
// many card holders a client actually has without a second round trip.
async function listClients() {
  const { rows } = await q(`
    select c.*,
           b.name  as biz_name,
           b.email as biz_email,
           (select count(*) from customers cu where cu.biz_id = c.biz_id)::int as card_holders,
           (select coalesce(sum(cu.punches), 0) from customers cu where cu.biz_id = c.biz_id)::int as punches
      from admin_clients c
      left join businesses b on b.id = c.biz_id
     order by case c.status when 'active' then 0 when 'lead' then 1 when 'paused' then 2 else 3 end,
              c.created_at desc`);
  return rows;
}

async function createClient(d) {
  const { rows } = await q(
    `insert into admin_clients (name, contact, phone, email, status, notes, biz_id)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [d.name, d.contact || '', d.phone || '', d.email || '',
     STATUSES.includes(d.status) ? d.status : 'lead', d.notes || '', d.bizId || null]
  );
  return rows[0];
}

async function updateClient(id, d) {
  const { rows } = await q(
    `update admin_clients
        set name = $2, contact = $3, phone = $4, email = $5, status = $6, notes = $7, biz_id = $8
      where id = $1 returning *`,
    [id, d.name, d.contact || '', d.phone || '', d.email || '',
     STATUSES.includes(d.status) ? d.status : 'lead', d.notes || '', d.bizId || null]
  );
  return rows[0];
}

async function deleteClient(id) {
  await q('delete from admin_clients where id = $1', [id]);
}

// Businesses with no CRM row yet — offered as one-click "pull into CRM".
async function unlinkedBusinesses() {
  const { rows } = await q(`
    select b.id, b.name, b.email, b.created_at,
           (select count(*) from customers cu where cu.biz_id = b.id)::int as card_holders
      from businesses b
     where not exists (select 1 from admin_clients c where c.biz_id = b.id)
     order by b.created_at desc`);
  return rows;
}

// ── tasks ─────────────────────────────────────────────
async function listTasks() {
  const { rows } = await q(`
    select t.*, c.name as client_name
      from admin_tasks t
      left join admin_clients c on c.id = t.client_id
     order by t.done asc, t.due_on asc nulls last, t.created_at desc`);
  return rows;
}

async function createTask(d) {
  const { rows } = await q(
    `insert into admin_tasks (title, notes, due_on, client_id)
     values ($1,$2,$3,$4) returning *`,
    [d.title, d.notes || '', d.dueOn || null, d.clientId || null]
  );
  return rows[0];
}

async function toggleTask(id) {
  const { rows } = await q('update admin_tasks set done = not done where id = $1 returning *', [id]);
  return rows[0];
}

async function deleteTask(id) {
  await q('delete from admin_tasks where id = $1', [id]);
}

// ── money ─────────────────────────────────────────────
async function listFinance(limit = 100) {
  const { rows } = await q(`
    select f.*, c.name as client_name
      from admin_finance f
      left join admin_clients c on c.id = f.client_id
     order by f.occurred_on desc, f.id desc
     limit $1`, [limit]);
  return rows;
}

async function createEntry(d) {
  const { rows } = await q(
    `insert into admin_finance (kind, amount, category, note, occurred_on, client_id)
     values ($1,$2,$3,$4,coalesce($5, current_date),$6) returning *`,
    [d.kind === 'expense' ? 'expense' : 'income', d.amount, d.category || '',
     d.note || '', d.occurredOn || null, d.clientId || null]
  );
  return rows[0];
}

async function deleteEntry(id) {
  await q('delete from admin_finance where id = $1', [id]);
}

// ── headline numbers ──────────────────────────────────
async function stats() {
  const { rows } = await q(`
    select
      (select count(*) from businesses)::int                            as businesses,
      (select count(*) from customers)::int                             as card_holders,
      (select coalesce(sum(punches),0) from customers)::int             as punches,
      (select count(*) from admin_clients where status = 'active')::int as active_clients,
      (select count(*) from admin_tasks where not done)::int            as open_tasks,
      (select count(*) from admin_tasks
        where not done and due_on is not null and due_on < current_date)::int as overdue_tasks,
      (select coalesce(sum(amount),0) from admin_finance where kind='income')::numeric  as income,
      (select coalesce(sum(amount),0) from admin_finance where kind='expense')::numeric as expense,
      (select coalesce(sum(amount),0) from admin_finance
        where kind='income' and occurred_on >= date_trunc('month', current_date))::numeric  as income_month,
      (select coalesce(sum(amount),0) from admin_finance
        where kind='expense' and occurred_on >= date_trunc('month', current_date))::numeric as expense_month`);
  return rows[0];
}

module.exports = {
  STATUSES,
  listClients, createClient, updateClient, deleteClient, unlinkedBusinesses,
  listTasks, createTask, toggleTask, deleteTask,
  listFinance, createEntry, deleteEntry,
  stats,
};

// ── roles (owner only) ────────────────────────────────
const ROLES = ['owner', 'admin', 'client'];

async function listAccounts() {
  const { rows } = await q(`
    select b.id, b.name, b.email, b.role, b.created_at,
           (select count(*) from customers cu where cu.biz_id = b.id)::int as card_holders
      from businesses b
     order by case b.role when 'owner' then 0 when 'admin' then 1 else 2 end, b.created_at`);
  return rows;
}

async function countOwners() {
  const { rows } = await q("select count(*)::int n from businesses where role = 'owner'");
  return rows[0].n;
}

// Refuses to remove the last owner, so the platform can never be locked out of
// its own admin area.
async function setRole(bizId, role) {
  if (!ROLES.includes(role)) return { ok: false, reason: 'bad-role' };

  const { rows } = await q('select role from businesses where id = $1', [bizId]);
  if (!rows[0]) return { ok: false, reason: 'not-found' };
  if (rows[0].role === role) return { ok: true, changed: false };

  if (rows[0].role === 'owner' && await countOwners() <= 1) {
    return { ok: false, reason: 'last-owner' };
  }

  await q('update businesses set role = $2 where id = $1', [bizId, role]);
  return { ok: true, changed: true };
}

module.exports.ROLES = ROLES;
module.exports.listAccounts = listAccounts;
module.exports.countOwners = countOwners;
module.exports.setRole = setRole;
