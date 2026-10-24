-- Task P4.6.01 (docs/PRD.md FR-ADMIN-22; docs/Security.md §7.5; DATA-06, DATA-10, AUD-04, REC-07): the one way an
-- export is made. v_booking_export, the ledger and the logs are granted to no API role for bulk reading, so this
-- security definer RPC is their exporter: it decides who may export what, keeps the caps (12 months, 50 000 rows,
-- 10 exports an hour per staff member), writes the exports row with its watermark and its 24-hour expiry, the
-- export_downloaded security event and the audit row, and hands the rows to the route that renders the file
-- (P4.6.02), since nothing else may read them. It answers jsonb {export_id, row_count, watermark, rows} rather than
-- the bare uuid docs/PRD.md §8.7.1 first named, for that reason.
--
--   visits      superadmin; every leg of every booking in the period, without a contact column
--   attendance  superadmin, or an RW admin for their own RW only; booked and admitted people per leg, manual flag
--   finance     superadmin; ledger entries (revenue_share_entries) of the period
--   audit       superadmin, CSV only; audit_logs and security_events of the period, without IP or request id


-- ===== The request =====

-- The period and RW an export covers: filters {from, to[, rw_id]} and nothing else, at most 12 months. An RW admin's
-- RW is always their own, whatever they asked for.
create function internal.export_scope(p_filters jsonb, out period_from date, out period_to date, out rw_id smallint)
  language plpgsql stable
  set search_path = ''
as $$
declare
  max_months constant interval := interval '12 months';
begin
  if jsonb_typeof(p_filters) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_filters) as k where k not in ('from', 'to', 'rw_id')) then
    raise exception 'an export is filtered by from, to and rw_id only' using errcode = '22023';
  end if;
  begin
    period_from := (p_filters ->> 'from')::date;
    period_to := (p_filters ->> 'to')::date;
    rw_id := (p_filters ->> 'rw_id')::smallint;
  exception when others then
    raise exception 'an export period is two dates' using errcode = '22023';
  end;
  if period_from is null or period_to is null or period_from > period_to or period_to >= period_from + max_months then
    raise exception 'an export covers a period of at most 12 months' using errcode = '22023';
  end if;
  if not public.is_superadmin() then
    rw_id := public.app_rw_id();
  elsif rw_id is not null and not exists (select 1 from public.rw_units r where r.id = export_scope.rw_id) then
    raise exception 'RW % does not exist', rw_id using errcode = '22023';
  end if;
end;
$$;

-- Who may export which kind, in which format, and why.
create function internal.require_export_request(p_kind public.export_kind, p_format text, p_reason text)
  returns void
  language plpgsql stable
  set search_path = ''
as $$
begin
  if not (public.is_staff() and public.aal2()) then
    raise exception 'exports are made by staff with a verified authenticator' using errcode = '42501';
  end if;
  if not public.is_superadmin() and p_kind <> 'attendance' then
    raise exception 'an RW admin exports the attendance of their own RW only' using errcode = '42501';
  end if;
  if p_format is null or p_format not in ('csv', 'xlsx', 'pdf')
     or (p_kind = 'audit' and p_format <> 'csv') or (p_kind = 'finance' and p_format = 'pdf') then
    raise exception 'an export of % is not made as %', p_kind, p_format using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 200 then
    raise exception 'an export needs a purpose of 10 to 200 characters' using errcode = '22023';
  end if;
end;
$$;


-- ===== The rows =====

create function internal.export_visit_rows(p_from date, p_to date, p_rw_id smallint, p_limit integer) returns jsonb
  language sql stable
  set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.session_date, r.start_time, r.booking_code, r.rw_id), '[]')
  from (select v.booking_code, v.booking_status, v.package_name, v.booker_type, v.institution_name, v.rw_id,
               v.session_date, v.start_time, v.session_label, v.leg_pax, v.leg_status, v.ticket_code, v.ticket_status,
               v.checked_in_pax, v.unpaid_pax, v.paid_at, v.total_amount
        from public.v_booking_export v
        where v.session_date between p_from and p_to and (p_rw_id is null or v.rw_id = p_rw_id)
        order by v.session_date, v.start_time, v.booking_code, v.rw_id
        limit p_limit) as r;
$$;

-- No participant name and no contact: booked and admitted people per leg, and whether it came in by code.
create function internal.export_attendance_rows(p_from date, p_to date, p_rw_id smallint, p_limit integer)
  returns jsonb
  language sql stable
  set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.session_date, r.start_time, r.booking_code, r.rw_id), '[]')
  from (select v.session_date, v.start_time, v.session_label, v.rw_id, v.booking_code, v.institution_name,
               v.leg_pax as booked_pax, v.checked_in_pax, v.unpaid_pax, v.ticket_status,
               exists (select 1 from public.ticket_scans s join public.tickets_qr t on t.id = s.ticket_id
                       where t.ticket_code = v.ticket_code and s.phase = 'check_in' and s.result = 'ok'
                         and s.source = 'manual') as manual_checkin
        from public.v_booking_export v
        where v.ticket_code is not null and v.session_date between p_from and p_to
          and (p_rw_id is null or v.rw_id = p_rw_id)
        order by v.session_date, v.start_time, v.booking_code, v.rw_id
        limit p_limit) as r;
$$;

create function internal.export_finance_rows(p_from date, p_to date, p_rw_id smallint, p_limit integer) returns jsonb
  language sql stable
  set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]')
  from (select e.id, (e.created_at at time zone 'Asia/Jakarta')::date as day, b.booking_code, e.entry_type,
               e.beneficiary, e.beneficiary_key, e.rw_id, e.line_ref, e.base_amount, e.pct, e.amount, e.payout_batch_id
        from public.revenue_share_entries e
        join public.bookings b on b.id = e.booking_id
        where (e.created_at at time zone 'Asia/Jakarta')::date between p_from and p_to
          and (p_rw_id is null or e.rw_id = p_rw_id)
        order by e.id
        limit p_limit) as r;
$$;

-- The allow-listed before/after of audit_logs and the typed details of security_events; never the IP, its hash, the
-- user agent or the request id.
create function internal.export_audit_rows(p_from date, p_to date, p_rw_id smallint, p_limit integer) returns jsonb
  language sql stable
  set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.occurred_at, r.source, r.id), '[]')
  from (select * from (
          select 'audit_logs' as source, a.id, a.occurred_at, a.actor_id, a.actor_role, a.action, null::text as severity,
                 a.entity_type, a.entity_id, a.rw_id, a.before, a.after, a.metadata as details
          from public.audit_logs a
          where (a.occurred_at at time zone 'Asia/Jakarta')::date between p_from and p_to
            and (p_rw_id is null or a.rw_id = p_rw_id)
          union all
          select 'security_events', e.id, e.occurred_at, e.actor_id, e.actor_role, e.event_type, e.severity::text,
                 e.entity_type, e.entity_id, e.rw_id, null, null, e.details
          from public.security_events e
          where (e.occurred_at at time zone 'Asia/Jakarta')::date between p_from and p_to
            and (p_rw_id is null or e.rw_id = p_rw_id)) as logs
        order by logs.occurred_at, logs.source, logs.id
        limit p_limit) as r;
$$;

create function internal.export_rows(
  p_kind public.export_kind, p_from date, p_to date, p_rw_id smallint, p_limit integer
) returns jsonb
  language sql stable
  set search_path = ''
as $$
  select case p_kind
    when 'visits' then internal.export_visit_rows(p_from, p_to, p_rw_id, p_limit)
    when 'attendance' then internal.export_attendance_rows(p_from, p_to, p_rw_id, p_limit)
    when 'finance' then internal.export_finance_rows(p_from, p_to, p_rw_id, p_limit)
    when 'audit' then internal.export_audit_rows(p_from, p_to, p_rw_id, p_limit)
  end;
$$;

revoke execute on function internal.export_scope(jsonb),
  internal.require_export_request(public.export_kind, text, text),
  internal.export_visit_rows(date, date, smallint, integer), internal.export_attendance_rows(date, date, smallint, integer),
  internal.export_finance_rows(date, date, smallint, integer), internal.export_audit_rows(date, date, smallint, integer),
  internal.export_rows(public.export_kind, date, date, smallint, integer)
  from public, anon, authenticated, service_role;


-- ===== The export =====

-- What an export leaves behind: its row (expiring in 24 hours), the export_downloaded event and the audit row.
create function internal.record_export(
  p_kind public.export_kind, p_format text, p_scope record, p_reason text, p_row_count integer
) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  ttl constant interval := interval '24 hours';
  watermark text := 'Diekspor oleh ' || coalesce((select p.full_name from public.profiles p where p.id = auth.uid()), '')
    || ' ' || to_char(now() at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI') || ' WIB'
    || ' - Dokumen rahasia Kelurahan Gisikdrono';
  filters jsonb := jsonb_build_object('from', p_scope.period_from, 'to', p_scope.period_to, 'rw_id', p_scope.rw_id);
  export_id uuid;
begin
  perform internal.take_audit_turn();
  insert into public.exports (kind, format, requested_by, rw_id, filters, reason, row_count, watermark, expires_at)
  values (p_kind, p_format, auth.uid(), p_scope.rw_id, filters, btrim(p_reason), p_row_count, watermark, now() + ttl)
  returning id into export_id;
  insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
  values ('export_downloaded', 'info', auth.uid(), p_scope.rw_id, 'exports', export_id::text,
          jsonb_build_object('kind', p_kind, 'format', p_format, 'rows', p_row_count));
  perform internal.log_audit('export.' || p_kind, 'exports', export_id::text,
                             jsonb_build_object('filters', filters, 'rows', p_row_count, 'format', p_format));
  return jsonb_build_object('export_id', export_id, 'watermark', watermark);
end;
$$;
revoke execute on function internal.record_export(public.export_kind, text, record, text, integer)
  from public, anon, authenticated, service_role;

-- docs/Security.md §7.5. The caps raise P0001 with a hint the route maps: RATE_LIMITED (429) past 10 an hour, and
-- EXPORT_TOO_LARGE (422) past 50 000 rows. A refused export counts nothing and records nothing.
create function public.rpc_create_export(
  p_kind public.export_kind, p_format text, p_filters jsonb, p_reason text
) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  row_cap constant integer := 50000;
  hourly_cap constant integer := 10;
  hour_seconds constant integer := 3600;
  scope record;
  found_rows jsonb;
  counted integer;
  recorded jsonb;
begin
  perform internal.require_export_request(p_kind, p_format, p_reason);
  select * into scope from internal.export_scope(p_filters);
  if not internal.rate_limit_hit('export:user:' || auth.uid()::text, hourly_cap, hour_seconds) then
    raise exception 'at most % exports an hour', hourly_cap using errcode = 'P0001', hint = 'RATE_LIMITED';
  end if;
  found_rows := internal.export_rows(p_kind, scope.period_from, scope.period_to, scope.rw_id, row_cap + 1);
  counted := jsonb_array_length(found_rows);
  if counted > row_cap then
    raise exception 'an export holds at most % rows', row_cap using errcode = 'P0001', hint = 'EXPORT_TOO_LARGE';
  end if;
  recorded := internal.record_export(p_kind, p_format, scope, p_reason, counted);
  return recorded || jsonb_build_object('row_count', counted, 'rows', found_rows);
end;
$$;

revoke execute on function public.rpc_create_export(public.export_kind, text, jsonb, text)
  from public, anon, service_role;
grant execute on function public.rpc_create_export(public.export_kind, text, jsonb, text) to authenticated;
