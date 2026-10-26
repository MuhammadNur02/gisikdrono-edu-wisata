-- Task P4.3.02 (docs/Security.md STAFF-02, DATA-04; security review of PR #4; decision of 2026-10-26): an add-on's
-- note is the visitor's free text for the kitchen and may name someone, so booking_addons.notes is granted to no API
-- role (0005). The kitchen reads it here: staff at AAL2, of one of the booking's RWs or the superadmin, inside the
-- booking window of internal.require_booking_pii_access (30 days before the visit to 7 days after it), and only the
-- notes of the lines of the caller's own RW (every line for the superadmin). Each read is audited.

create function public.rpc_get_addon_notes(p_booking_id uuid)
  returns table (addon_id uuid, notes text)
  language plpgsql security definer
  set search_path = ''
as $$
declare
  rw_ids smallint[] := internal.require_booking_pii_access(p_booking_id);
  returned integer;
begin
  return query
    select a.id, a.notes from public.booking_addons a
    where a.booking_id = p_booking_id and a.notes is not null
      and (public.is_superadmin() or public.owns_rw(a.rw_id))
    order by a.created_at, a.id;
  get diagnostics returned = row_count;
  perform internal.log_audit('addon_notes.read', 'bookings', p_booking_id::text,
    jsonb_build_object('rows', returned, 'rw_id', case when public.is_superadmin() then null else public.app_rw_id() end,
                       'booking_rw_ids', to_jsonb(rw_ids)));
end;
$$;

revoke execute on function public.rpc_get_addon_notes(uuid) from public, anon, service_role;
grant execute on function public.rpc_get_addon_notes(uuid) to authenticated;
