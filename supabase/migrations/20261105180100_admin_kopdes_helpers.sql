-- docs/PRD.md §13.1 A30, docs/Security.md AZ-16: what the new admin_kopdes role is to the database.
--
-- The existing helpers stay exactly as they are, and that is the point: is_staff() is still the superadmin or an RW
-- admin, owns_rw() and owns_any_rw() still answer for the superadmin and the RW's own admin, and app_rw_id() is still
-- NULL for anyone but an RW admin. So every policy, view and RPC written against them keeps admin_kopdes out without a
-- change (bookings, PII, payments, tickets, sessions, packages, RW content, reviews, finance, exports, users, audit,
-- alerts). What admin_kopdes may touch is granted by name instead, through two new helpers:
--
--   is_admin_kopdes()  the caller is the Kopdes admin (fresh claims, active profile: app_role() decides).
--   manages_umkm()     the superadmin or the Kopdes admin: who writes vendors, products and variants (20261105180200).
--
-- Also here: a Kopdes admin has no RW (profiles and staff_invites), and its own name in audit_logs.actor_role, so a
-- write it makes is recorded as admin_kopdes, never as anon.


-- ===== Helpers =====

create function public.is_admin_kopdes() returns boolean
  language sql stable
  set search_path = ''
as $$ select public.app_role() = 'admin_kopdes'; $$;

create function public.manages_umkm() returns boolean
  language sql stable
  set search_path = ''
as $$ select public.is_superadmin() or public.is_admin_kopdes(); $$;

-- Read-only RLS helpers like the others of 0004: authenticated only (CLAUDE.md §6.2, rls_enumeration.sql).
revoke execute on function public.is_admin_kopdes(), public.manages_umkm() from public, anon;
grant execute on function public.is_admin_kopdes(), public.manages_umkm() to authenticated;


-- ===== A Kopdes admin works for the whole kelurahan, never for one RW =====

alter table public.profiles drop constraint profiles_role_rw_ok;
alter table public.profiles add constraint profiles_role_rw_ok check (
  (role = 'superadmin' and rw_id is null) or (role = 'admin_rw' and rw_id is not null)
  or (role = 'admin_kopdes' and rw_id is null) or (role = 'none' and rw_id is null));

alter table public.staff_invites drop constraint staff_invites_role_rw_ok;
alter table public.staff_invites add constraint staff_invites_role_rw_ok check (
  (role = 'superadmin' and rw_id is null) or (role = 'admin_rw' and rw_id is not null)
  or (role = 'admin_kopdes' and rw_id is null));


-- ===== Who wrote an audit row =====

alter table public.audit_logs drop constraint audit_logs_actor_role_check;
alter table public.audit_logs add constraint audit_logs_actor_role_check
  check (actor_role in ('superadmin', 'admin_rw', 'admin_kopdes', 'service', 'cron', 'visitor', 'anon'));

-- Replaces the 0004 version: a write under a Kopdes admin's session is theirs (svc_log_audit already names the role
-- of an active profile, which the new constraint above accepts).
create or replace function internal.current_actor_role() returns text
  language sql stable security definer
  set search_path = ''
as $$
  select case coalesce(current_setting('role', true), 'none')
    when 'authenticated' then
      case when public.app_role() in ('superadmin', 'admin_rw', 'admin_kopdes') then public.app_role() else 'anon' end
    when 'anon' then 'anon'
    when 'service_role' then coalesce(nullif(current_setting('app.actor_role', true), ''), 'service')
    else coalesce(nullif(current_setting('app.actor_role', true), ''), 'cron')
  end;
$$;
revoke execute on function internal.current_actor_role() from public, anon, authenticated, service_role;
