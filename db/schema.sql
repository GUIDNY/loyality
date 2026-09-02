-- ══════════════════════════════════════════════════════
-- Ten Dots — loyalty punch-card schema (Supabase / Postgres)
-- ══════════════════════════════════════════════════════

-- Human-readable ids kept identical to the JSON-blob era (B001 / PC-0001)
-- so existing QR codes and already-issued Wallet passes keep resolving.
create sequence if not exists biz_seq  start 1;
create sequence if not exists cust_seq start 1;

create table if not exists businesses (
  id            text primary key default 'B'  || lpad(nextval('biz_seq')::text, 3, '0'),
  name          text        not null,
  email         text        not null,
  password_hash text        not null,
  card_template jsonb       not null default '{}'::jsonb,
  logo          text,
  created_at    timestamptz not null default now()
);

-- Login looks businesses up by lowercased email; enforce that as the key.
create unique index if not exists businesses_email_key on businesses (lower(email));

create table if not exists customers (
  serial          text primary key default 'PC-' || lpad(nextval('cust_seq')::text, 4, '0'),
  biz_id          text        not null references businesses(id) on delete cascade,
  name            text        not null default '',
  phone           text        not null default '',
  punches         integer     not null default 0 check (punches >= 0),
  redeemed        integer     not null default 0 check (redeemed >= 0),
  pass_token      text,
  pass_updated_at timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists customers_biz_idx on customers (biz_id, created_at desc);

-- Apple Wallet devices registered for live pass updates (was db.passDevices)
create table if not exists pass_devices (
  serial     text        not null references customers(serial) on delete cascade,
  device_id  text        not null,
  push_token text        not null,
  updated_at timestamptz not null default now(),
  primary key (serial, device_id)
);

create index if not exists pass_devices_device_idx on pass_devices (device_id);

-- Last APNs push attempt per customer (was db.apnsLog) — diagnostics only.
create table if not exists apns_log (
  serial     text primary key references customers(serial) on delete cascade,
  pushed_at  timestamptz not null default now(),
  devices    integer     not null default 0,
  results    jsonb       not null default '[]'::jsonb
);

-- Replaces the in-memory punchCooldown Map, which does not survive serverless
-- invocations. Enforced in SQL so the 10s window actually holds in production.
create table if not exists punch_log (
  serial     text        not null references customers(serial) on delete cascade,
  punched_at timestamptz not null default now()
);

create index if not exists punch_log_serial_idx on punch_log (serial, punched_at desc);
