-- ══════════════════════════════════════════════════════
-- ROLES — three levels, replacing the is_admin boolean
--
--   owner   מנהל על  — the platform owner. Full owner area, money, and the
--                      only role that can appoint or remove other roles.
--   admin   מנהל     — staff. Owner area for clients and tasks, no money,
--                      cannot change anyone's role.
--   client  לקוח     — an ordinary business. Its own dashboard only; the
--                      owner area does not exist as far as it is concerned.
-- ══════════════════════════════════════════════════════

alter table businesses
  add column if not exists role text not null default 'client';

-- Carry the old flag over before it goes away.
update businesses set role = 'owner'
 where role = 'client'
   and exists (select 1 from information_schema.columns
                where table_name = 'businesses' and column_name = 'is_admin')
   and is_admin = true;

alter table businesses drop column if exists is_admin;

alter table businesses drop constraint if exists businesses_role_check;
alter table businesses add constraint businesses_role_check
  check (role in ('owner','admin','client'));

create index if not exists businesses_role_idx on businesses (role) where role <> 'client';
