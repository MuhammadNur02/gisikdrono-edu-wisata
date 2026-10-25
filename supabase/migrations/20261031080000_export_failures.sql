-- Independent review of PR #63, Mediums 1 and 3 (docs/Security.md §7.5; CLAUDE.md §5.4 Export, §6.6; DATA-06):
--   1. An export whose file never reached the documents bucket (too big, refused by Storage, or its path not
--      recorded) had already been counted on the hourly cap and recorded by rpc_create_export. The route now hands
--      it back through svc_fail_export: the row is marked failed, the hit on the cap is given back and the audit
--      trail gets an export.failed row next to the export.<kind> one. The bucket takes 50 MB, the Supabase upload
--      ceiling (supabase/config.toml [storage]), up from 20 MB; the route checks a file's size before it uploads.
--   2. An expired export waited for the 02:00 retention run to be marked, and its file for the next purge-storage
--      run after that: up to about 48 hours on disk. The hourly purge-storage run now takes every export past its
--      expires_at itself, so a file goes within about an hour of its 24 hours.
-- security_events keeps its one export_downloaded row per export: its event type list is being rewritten by an open
-- migration, so a failure is recorded in audit_logs rather than as a new event type.


-- ===== 1. The documents bucket takes the largest export =====

update storage.buckets set file_size_limit = 50 * 1024 * 1024 where id = 'documents';


-- ===== 1. A failed export =====

alter table public.exports
  add column failed_at timestamptz,
  add column failure_reason text
    check (failure_reason in ('render_failed', 'too_large', 'upload_failed', 'record_failed')),
  add constraint exports_failure_pair check ((failed_at is null) = (failure_reason is null));

grant select (failed_at, failure_reason) on public.exports to authenticated;

-- Marks an export of p_actor_id's whose file was never stored as failed (and so nothing to purge), gives back its hit
-- on the hourly cap while that hour lasts, and audits the failure in the requester's name. Only a row without a
-- stored file and not failed yet qualifies, so a replay, another staff member's export or a delivered one changes
-- nothing and answers false. Service role only: a staff member who could call it could refund their own cap after
-- reading the rows rpc_create_export answered.
create function internal.fail_export(p_export_id uuid, p_actor_id uuid, p_reason text) returns boolean
  language plpgsql security definer
  set search_path = ''
as $$
declare
  hour_seconds constant integer := 3600;
  staff_role public.app_role;
  failed public.exports;
  previous_settings jsonb;
begin
  if p_reason is null or p_reason not in ('render_failed', 'too_large', 'upload_failed', 'record_failed') then
    raise exception 'an export fails as render_failed, too_large, upload_failed or record_failed'
      using errcode = '22023';
  end if;
  select p.role into staff_role from public.profiles p where p.id = p_actor_id and p.is_active;
  if staff_role is null or staff_role = 'none' then
    raise exception 'export actor % is not active staff', p_actor_id using errcode = '42501';
  end if;
  perform internal.take_audit_turn();
  update public.exports e set failed_at = now(), failure_reason = p_reason, deleted_at = now()
  where e.id = p_export_id and e.requested_by = p_actor_id and e.storage_path is null and e.failed_at is null
  returning * into failed;
  if not found then
    return false;
  end if;
  -- rate_limit_hit counts in fixed windows; an hour that has already turned over has nothing left to give back.
  if floor(extract(epoch from failed.created_at) / hour_seconds) = floor(extract(epoch from now()) / hour_seconds) then
    perform internal.rate_limit_refund('export:user:' || p_actor_id::text, hour_seconds);
  end if;
  previous_settings := internal.push_settings(jsonb_build_object(
    'app.actor_id', p_actor_id::text, 'app.actor_role', staff_role::text));
  perform internal.log_audit('export.failed', 'exports', p_export_id::text, jsonb_build_object(
    'kind', failed.kind, 'format', failed.format, 'rows', failed.row_count, 'reason', p_reason));
  perform internal.restore_settings(previous_settings);
  return true;
end;
$$;

create function public.svc_fail_export(p_export_id uuid, p_actor_id uuid, p_reason text) returns boolean
  language sql security definer
  set search_path = ''
as $$ select internal.fail_export(p_export_id, p_actor_id, p_reason); $$;

revoke execute on function internal.fail_export(uuid, uuid, text), public.svc_fail_export(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function internal.fail_export(uuid, uuid, text) from service_role;
grant execute on function public.svc_fail_export(uuid, uuid, text) to service_role;


-- ===== 2. Expired export files go within the hour =====

-- Replaces the 0004_functions.sql version: an export past its expires_at is purgeable whether or not a retention run
-- has marked it yet.
create or replace function internal.purgeable_files(p_limit integer) returns table (bucket text, path text)
  language sql stable security definer
  set search_path = ''
as $$
  (select 'documents', c.pdf_path from public.certificates c
   where c.purged_at is not null and c.pdf_path is not null order by c.purged_at limit p_limit)
  union all
  (select 'documents', e.storage_path from public.exports e
   where (e.deleted_at is not null or e.expires_at < now()) and e.storage_path is not null
   order by coalesce(e.deleted_at, e.expires_at) limit p_limit)
  union all
  -- Ticket PDFs are kept for 12 months after the visit.
  (select 'documents', b.ticket_pdf_path from public.bookings b
   where b.ticket_pdf_path is not null and b.visit_date_end < (public.today_jkt() - interval '12 months')::date
   order by b.visit_date_end limit p_limit);
$$;

-- Replaces the 0004_functions.sql version: an expired export whose file is gone is marked deleted here too.
create or replace function internal.forget_purged_files(p_paths text[]) returns integer
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  forgotten integer := 0;
  cleared integer;
begin
  previous_settings := internal.begin_scheduled_job();
  update public.certificates set pdf_path = null where purged_at is not null and pdf_path = any (p_paths);
  get diagnostics cleared = row_count;
  forgotten := forgotten + cleared;
  update public.exports set storage_path = null, deleted_at = coalesce(deleted_at, now())
  where (deleted_at is not null or expires_at < now()) and storage_path = any (p_paths);
  get diagnostics cleared = row_count;
  forgotten := forgotten + cleared;
  update public.bookings set ticket_pdf_path = null
  where ticket_pdf_path = any (p_paths) and visit_date_end < (public.today_jkt() - interval '12 months')::date;
  get diagnostics cleared = row_count;
  perform internal.restore_settings(previous_settings);
  return forgotten + cleared;
end;
$$;

revoke execute on function internal.purgeable_files(integer), internal.forget_purged_files(text[])
  from public, anon, authenticated;
