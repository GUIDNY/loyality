-- ══════════════════════════════════════════════════════
-- ADMIN / CRM — platform-owner area
--
-- "Clients" here are the businesses that use Ten Dots (or leads that have not
-- signed up yet), not the punch-card holders. Tasks and money entries hang off
-- a client, optionally.
-- ══════════════════════════════════════════════════════

alter table businesses add column if not exists is_admin boolean not null default false;

create table if not exists admin_clients (
  id         bigserial primary key,
  -- set when this CRM client has actually signed up for an account
  biz_id     text references businesses(id) on delete set null,
  name       text        not null,
  contact    text        not null default '',
  phone      text        not null default '',
  email      text        not null default '',
  status     text        not null default 'lead'
             check (status in ('lead','active','paused','churned')),
  notes      text        not null default '',
  created_at timestamptz not null default now()
);

create index if not exists admin_clients_status_idx on admin_clients (status, created_at desc);

create table if not exists admin_tasks (
  id         bigserial primary key,
  client_id  bigint references admin_clients(id) on delete set null,
  title      text        not null,
  notes      text        not null default '',
  due_on     date,
  done       boolean     not null default false,
  created_at timestamptz not null default now()
);

-- Open tasks first, soonest due first; nulls last so undated tasks sink.
create index if not exists admin_tasks_open_idx on admin_tasks (done, due_on nulls last);

create table if not exists admin_finance (
  id          bigserial primary key,
  client_id   bigint references admin_clients(id) on delete set null,
  kind        text          not null check (kind in ('income','expense')),
  amount      numeric(12,2) not null check (amount >= 0),
  category    text          not null default '',
  note        text          not null default '',
  occurred_on date          not null default current_date,
  created_at  timestamptz   not null default now()
);

create index if not exists admin_finance_date_idx on admin_finance (occurred_on desc);
