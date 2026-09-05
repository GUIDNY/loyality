-- ══════════════════════════════════════════════════════
-- PARTNER WORKSPACE — shared ideas + attribution
--
-- This is the partners' own space, separate from the loyalty product: who
-- brought which client, whose income is whose, and a place to park ideas.
-- ══════════════════════════════════════════════════════

-- Who added each row. Kept as a soft link: if an account is removed the
-- history stays, it just loses the name.
alter table admin_clients add column if not exists added_by text references businesses(id) on delete set null;
alter table admin_tasks   add column if not exists added_by text references businesses(id) on delete set null;
alter table admin_finance add column if not exists added_by text references businesses(id) on delete set null;

create index if not exists admin_clients_added_by_idx on admin_clients (added_by);

create table if not exists admin_ideas (
  id         bigserial primary key,
  author_id  text references businesses(id) on delete set null,
  title      text        not null,
  body       text        not null default '',
  status     text        not null default 'new'
             check (status in ('new','doing','done','dropped')),
  created_at timestamptz not null default now()
);

create index if not exists admin_ideas_status_idx on admin_ideas (status, created_at desc);
