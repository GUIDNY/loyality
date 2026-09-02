// ══════════════════════════════════════════════════════
// DATA ACCESS — Supabase / Postgres
//
// Replaces the old single-JSON-blob store. Every mutation that used to be
// "read the whole DB, edit in memory, write the whole DB back" is now a single
// statement, so concurrent punches from two cashiers no longer overwrite each
// other.
//
// Rows are mapped back to the camelCase shape the views already expect
// (serial / bizId / passToken / cardTemplate ...) so page rendering is unchanged.
// ══════════════════════════════════════════════════════
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set — point it at the Supabase transaction pooler');
}

// One pool per warm serverless instance. The transaction pooler multiplexes on
// its side, so a small local max is what we want here.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env.VERCEL ? 1 : 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', e => console.error('[db] idle client error:', e.message));

const q = (text, params) => pool.query(text, params);

// ── row → app shape ───────────────────────────────────
function toBusiness(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    passwordHash: r.password_hash,
    cardTemplate: r.card_template || {},
    logo: r.logo || null,
    createdAt: r.created_at,
  };
}
function toCustomer(r) {
  if (!r) return null;
  return {
    serial: r.serial,
    bizId: r.biz_id,
    name: r.name || '',
    phone: r.phone || '',
    punches: r.punches,
    redeemed: r.redeemed,
    passToken: r.pass_token || null,
    createdAt: r.created_at,
  };
}

// ── businesses ────────────────────────────────────────
async function getBusiness(id) {
  const { rows } = await q('select * from businesses where id = $1', [id]);
  return toBusiness(rows[0]);
}

async function getBusinessByEmail(email) {
  const { rows } = await q('select * from businesses where lower(email) = lower($1)', [email]);
  return toBusiness(rows[0]);
}

async function createBusiness({ name, email, passwordHash, cardTemplate }) {
  const { rows } = await q(
    `insert into businesses (name, email, password_hash, card_template)
     values ($1, $2, $3, $4)
     on conflict (lower(email)) do nothing
     returning *`,
    [name, email, passwordHash, cardTemplate]
  );
  return toBusiness(rows[0]); // null when the email was already taken
}

async function setPasswordHash(id, passwordHash) {
  await q('update businesses set password_hash = $2 where id = $1', [id, passwordHash]);
}

// Merges into the existing template rather than replacing it, matching the old
// Object.assign behaviour.
async function updateCardTemplate(id, patch) {
  const { rows } = await q(
    'update businesses set card_template = card_template || $2::jsonb where id = $1 returning *',
    [id, JSON.stringify(patch)]
  );
  return toBusiness(rows[0]);
}

async function setLogo(id, logo) {
  await q('update businesses set logo = $2 where id = $1', [id, logo]);
}

// ── customers ─────────────────────────────────────────
async function listCustomers(bizId) {
  const { rows } = await q(
    'select * from customers where biz_id = $1 order by created_at desc, serial desc',
    [bizId]
  );
  return rows.map(toCustomer);
}

async function countCustomers(bizId) {
  const { rows } = await q('select count(*)::int n from customers where biz_id = $1', [bizId]);
  return rows[0].n;
}

async function createCustomer(bizId) {
  const { rows } = await q('insert into customers (biz_id) values ($1) returning *', [bizId]);
  return toCustomer(rows[0]);
}

async function getCustomer(serial) {
  const { rows } = await q('select * from customers where serial = $1', [serial]);
  return toCustomer(rows[0]);
}

// One round trip for the very common "card page needs both" case.
async function getCustomerWithBusiness(serial) {
  const { rows } = await q(
    `select to_jsonb(c) cust, to_jsonb(b) biz
       from customers c join businesses b on b.id = c.biz_id
      where c.serial = $1`,
    [serial]
  );
  if (!rows[0]) return { customer: null, business: null };
  return { customer: toCustomer(rows[0].cust), business: toBusiness(rows[0].biz) };
}

// Atomic increment. The `punches < goal` guard lives in the WHERE clause, so a
// full card can never be over-punched by two concurrent scans.
async function punch(serial, goal) {
  const { rows } = await q(
    `update customers set punches = punches + 1
      where serial = $1 and punches < $2
      returning *`,
    [serial, goal]
  );
  return toCustomer(rows[0]); // null = card already full
}

async function redeem(serial, goal) {
  const { rows } = await q(
    `update customers set punches = 0, redeemed = redeemed + 1
      where serial = $1 and punches >= $2
      returning *`,
    [serial, goal]
  );
  return toCustomer(rows[0]); // null = not full yet
}

async function resetPunches(serial) {
  const { rows } = await q(
    'update customers set punches = 0 where serial = $1 returning *', [serial]
  );
  return toCustomer(rows[0]);
}

async function updateCustomerDetails(serial, name, phone) {
  const { rows } = await q(
    'update customers set name = $2, phone = $3 where serial = $1 returning *',
    [serial, name, phone]
  );
  return toCustomer(rows[0]);
}

// Issues the Apple Wallet auth token once and never regenerates it — a second
// concurrent request must get the same value back, hence coalesce-on-update.
async function ensurePassToken(serial, token) {
  const { rows } = await q(
    `update customers set pass_token = coalesce(pass_token, $2)
      where serial = $1
      returning pass_token`,
    [serial, token]
  );
  return rows[0]?.pass_token || null;
}

// ── punch rate limit ──────────────────────────────────
// Was an in-memory Map, which is useless across serverless invocations.
// Returns true when the punch is allowed.
async function takePunchSlot(serial, windowSeconds = 10) {
  const { rows } = await q(
    `insert into punch_log (serial)
     select $1
      where not exists (
        select 1 from punch_log
         where serial = $1 and punched_at > now() - ($2 || ' seconds')::interval
      )
     returning punched_at`,
    [serial, String(windowSeconds)]
  );
  return rows.length > 0;
}

// ── Apple Wallet devices ──────────────────────────────
async function registerDevice(serial, deviceId, pushToken) {
  const { rows } = await q(
    `insert into pass_devices (serial, device_id, push_token)
     values ($1, $2, $3)
     on conflict (serial, device_id)
       do update set push_token = excluded.push_token, updated_at = now()
     returning (xmax = 0) as inserted`,
    [serial, deviceId, pushToken]
  );
  return rows[0]?.inserted === true; // true = newly registered (HTTP 201)
}

async function unregisterDevice(serial, deviceId) {
  const { rowCount } = await q(
    'delete from pass_devices where serial = $1 and device_id = $2', [serial, deviceId]
  );
  return rowCount > 0;
}

async function listDevices(serial) {
  const { rows } = await q(
    'select device_id, push_token, updated_at from pass_devices where serial = $1', [serial]
  );
  return rows.map(r => ({ deviceId: r.device_id, pushToken: r.push_token, updatedAt: r.updated_at }));
}

// PassKit polls this to learn which passes changed since it last synced.
async function serialsForDevice(deviceId, since) {
  const { rows } = await q(
    `select c.serial, c.pass_updated_at
       from pass_devices d join customers c on c.serial = d.serial
      where d.device_id = $1
        and ($2::timestamptz is null or c.pass_updated_at > $2::timestamptz)`,
    [deviceId, since || null]
  );
  return rows.map(r => r.serial);
}

async function markPassUpdated(serial) {
  await q('update customers set pass_updated_at = now() where serial = $1', [serial]);
}

async function logApns(serial, devices, results) {
  await q(
    `insert into apns_log (serial, pushed_at, devices, results)
     values ($1, now(), $2, $3::jsonb)
     on conflict (serial) do update
       set pushed_at = now(), devices = excluded.devices, results = excluded.results`,
    [serial, devices, JSON.stringify(results)]
  );
}

async function getApnsLog(serial) {
  const { rows } = await q('select * from apns_log where serial = $1', [serial]);
  if (!rows[0]) return null;
  return { at: rows[0].pushed_at, devices: rows[0].devices, results: rows[0].results };
}

module.exports = {
  pool, q,
  getBusiness, getBusinessByEmail, createBusiness, setPasswordHash,
  updateCardTemplate, setLogo,
  listCustomers, countCustomers, createCustomer, getCustomer, getCustomerWithBusiness,
  punch, redeem, resetPunches, updateCustomerDetails, ensurePassToken,
  takePunchSlot,
  registerDevice, unregisterDevice, listDevices, serialsForDevice,
  markPassUpdated, logApns, getApnsLog,
};
