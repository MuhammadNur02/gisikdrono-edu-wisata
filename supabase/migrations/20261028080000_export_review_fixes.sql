-- Independent review of PR #56, Lows (docs/Security.md §7.5; REC-07, DATA-06):
--   1. A vendor's ledger rows carry rw_id NULL, so the recap views, revenue_recap and the RW-narrowed finance export
--      left a vendor's share out of its own RW. A vendor share now belongs to its vendor's RW (umkm_vendors.rw_id);
--      the kelurahan's share stays the superadmin's alone and is never part of one RW's figures.
--   2. A refused export rolled its hit on the hourly cap back, so oversized scans were free. The size is now counted
--      before anything heavy runs, and an export past 50 000 rows is answered {refused: 'EXPORT_TOO_LARGE',
--      row_count} instead of raised, so its hit stays counted.
--   3. The period filters compared a timestamp cast to a Jakarta date, which no index can serve; they compare the
--      timestamp with the period's Jakarta bounds now, and audit_logs and security_events get an index on the time.
--   4. The attendance export's manual flag follows v_attendance_today: any check-in whose source is not a QR.


-- ===== 1. A vendor's share is its RW's =====

create or replace view public.v_revenue_recap_daily with (security_invoker = true) as
select (e.created_at at time zone 'Asia/Jakarta')::date as day, coalesce(e.rw_id, v.rw_id) as rw_id, e.beneficiary_key,
       coalesce(sum(e.amount) filter (where e.entry_type = 'settlement'), 0)::bigint as settled_amount,
       coalesce(sum(e.amount) filter (where e.entry_type = 'reversal'), 0)::bigint as reversed_amount,
       sum(e.amount)::bigint as net_amount,
       count(distinct e.booking_id) as bookings
from public.revenue_share_entries e
left join public.umkm_vendors v on v.id = e.vendor_id
where (select public.is_superadmin()) or public.owns_rw(coalesce(e.rw_id, v.rw_id))
group by 1, 2, 3;

-- beneficiary_name is NULL for the kelurahan; the dashboard labels it from its own copy.
create or replace view public.v_revenue_recap_by_party with (security_invoker = true) as
select e.beneficiary, e.beneficiary_key, coalesce(r.name, v.name) as beneficiary_name,
       coalesce(e.rw_id, v.rw_id) as rw_id,
       sum(e.amount)::bigint as accrued,
       coalesce(sum(e.amount) filter (where e.payout_batch_id is not null), 0)::bigint as paid_out,
       (sum(e.amount) - coalesce(sum(e.amount) filter (where e.payout_batch_id is not null), 0))::bigint as outstanding
from public.revenue_share_entries e
left join public.rw_units r on e.beneficiary = 'rw_treasury' and r.id = e.rw_id
left join public.umkm_vendors v on v.id = e.vendor_id
where (select public.is_superadmin()) or public.owns_rw(coalesce(e.rw_id, v.rw_id))
group by e.beneficiary, e.beneficiary_key, coalesce(r.name, v.name), coalesce(e.rw_id, v.rw_id);


-- ===== 3. Periods as timestamp bounds =====

create index audit_logs_time_idx on public.audit_logs (occurred_at);
create index security_events_time_idx on public.security_events (occurred_at);
create index revenue_entries_time_idx on public.revenue_share_entries (created_at);

-- The first instant of a Jakarta day.
create function internal.jakarta_start(p_day date) returns timestamptz
  language sql immutable
  set search_path = ''
as $$ select p_day::timestamp at time zone 'Asia/Jakarta'; $$;
revoke execute on function internal.jakarta_start(date) from public, anon, authenticated, service_role;

-- Replaces the 20261027080100 version: the RW of a vendor's entry is its vendor's.
create or replace function internal.export_finance_rows(p_from date, p_to date, p_rw_id smallint, p_limit integer)
  returns jsonb
  language sql stable
  set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]')
  from (select e.id, (e.created_at at time zone 'Asia/Jakarta')::date as day, b.booking_code, e.entry_type,
               e.beneficiary, e.beneficiary_key, coalesce(e.rw_id, v.rw_id) as rw_id, e.line_ref, e.base_amount, e.pct,
               e.amount, e.payout_batch_id
        from public.revenue_share_entries e
        join public.bookings b on b.id = e.booking_id
        left join public.umkm_vendors v on v.id = e.vendor_id
        where e.created_at >= internal.jakarta_start(p_from) and e.created_at < internal.jakarta_start(p_to + 1)
          and (p_rw_id is null or coalesce(e.rw_id, v.rw_id) = p_rw_id)
        order by e.id
        limit p_limit) as r;
$$;

-- Replaces the 20261027080100 version: timestamp bounds.
create or replace function internal.export_audit_rows(p_from date, p_to date, p_rw_id smallint, p_limit integer)
  returns jsonb
  language sql stable
  set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.occurred_at, r.source, r.id), '[]')
  from (select * from (
          select 'audit_logs' as source, a.id, a.occurred_at, a.actor_id, a.actor_role, a.action, null::text as severity,
                 a.entity_type, a.entity_id, a.rw_id, a.before, a.after, a.metadata as details
          from public.audit_logs a
          where a.occurred_at >= internal.jakarta_start(p_from) and a.occurred_at < internal.jakarta_start(p_to + 1)
            and (p_rw_id is null or a.rw_id = p_rw_id)
          union all
          select 'security_events', e.id, e.occurred_at, e.actor_id, e.actor_role, e.event_type, e.severity::text,
                 e.entity_type, e.entity_id, e.rw_id, null, null, e.details
          from public.security_events e
          where e.occurred_at >= internal.jakarta_start(p_from) and e.occurred_at < internal.jakarta_start(p_to + 1)
            and (p_rw_id is null or e.rw_id = p_rw_id)) as logs
        order by logs.occurred_at, logs.source, logs.id
        limit p_limit) as r;
$$;


-- ===== 4. The manual flag as v_attendance_today reads it =====

-- Replaces the 20261027080100 version: a check-in by code or a superadmin's back-fill is manual, as on the gate list.
create or replace function internal.export_attendance_rows(p_from date, p_to date, p_rw_id smallint, p_limit integer)
  returns jsonb
  language sql stable
  set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.session_date, r.start_time, r.booking_code, r.rw_id), '[]')
  from (select v.session_date, v.start_time, v.session_label, v.rw_id, v.booking_code, v.institution_name,
               v.leg_pax as booked_pax, v.checked_in_pax, v.unpaid_pax, v.ticket_status,
               exists (select 1 from public.ticket_scans s join public.tickets_qr t on t.id = s.ticket_id
                       where t.ticket_code = v.ticket_code and s.phase = 'check_in' and s.result = 'ok'
                         and s.source <> 'qr') as manual_checkin
        from public.v_booking_export v
        where v.ticket_code is not null and v.session_date between p_from and p_to
          and (p_rw_id is null or v.rw_id = p_rw_id)
        order by v.session_date, v.start_time, v.booking_code, v.rw_id
        limit p_limit) as r;
$$;


-- ===== 2. The size first, the refusal answered =====

-- How many rows an export would hold, counted up to one past the cap, before any row is built.
create function internal.export_row_count(
  p_kind public.export_kind, p_from date, p_to date, p_rw_id smallint, p_limit integer
) returns integer
  language sql stable
  set search_path = ''
as $$
  select case p_kind
    when 'visits' then (select count(*)::integer from (
        select 1 from public.v_booking_export v
        where v.session_date between p_from and p_to and (p_rw_id is null or v.rw_id = p_rw_id) limit p_limit) as c)
    when 'attendance' then (select count(*)::integer from (
        select 1 from public.v_booking_export v
        where v.ticket_code is not null and v.session_date between p_from and p_to
          and (p_rw_id is null or v.rw_id = p_rw_id) limit p_limit) as c)
    when 'finance' then (select count(*)::integer from (
        select 1 from public.revenue_share_entries e left join public.umkm_vendors v on v.id = e.vendor_id
        where e.created_at >= internal.jakarta_start(p_from) and e.created_at < internal.jakarta_start(p_to + 1)
          and (p_rw_id is null or coalesce(e.rw_id, v.rw_id) = p_rw_id) limit p_limit) as c)
    when 'audit' then (select count(*)::integer from (
        select 1 from public.audit_logs a
        where a.occurred_at >= internal.jakarta_start(p_from) and a.occurred_at < internal.jakarta_start(p_to + 1)
          and (p_rw_id is null or a.rw_id = p_rw_id)
        union all
        select 1 from public.security_events e
        where e.occurred_at >= internal.jakarta_start(p_from) and e.occurred_at < internal.jakarta_start(p_to + 1)
          and (p_rw_id is null or e.rw_id = p_rw_id)
        limit p_limit) as c)
  end;
$$;
revoke execute on function internal.export_row_count(public.export_kind, date, date, smallint, integer)
  from public, anon, authenticated, service_role;

-- Replaces the 20261027080100 version. Past 50 000 rows the export is answered {refused: 'EXPORT_TOO_LARGE',
-- row_count} (the route maps it to 422), not raised, so its hit on the hourly cap stays counted; nothing else is
-- recorded and no row is built.
create or replace function public.rpc_create_export(
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
  counted integer;
  recorded jsonb;
begin
  perform internal.require_export_request(p_kind, p_format, p_reason);
  select * into scope from internal.export_scope(p_filters);
  if not internal.rate_limit_hit('export:user:' || auth.uid()::text, hourly_cap, hour_seconds) then
    raise exception 'at most % exports an hour', hourly_cap using errcode = 'P0001', hint = 'RATE_LIMITED';
  end if;
  counted := internal.export_row_count(p_kind, scope.period_from, scope.period_to, scope.rw_id, row_cap + 1);
  if counted > row_cap then
    return jsonb_build_object('refused', 'EXPORT_TOO_LARGE', 'row_count', counted);
  end if;
  recorded := internal.record_export(p_kind, p_format, scope, p_reason, counted);
  return recorded || jsonb_build_object('row_count', counted,
    'rows', internal.export_rows(p_kind, scope.period_from, scope.period_to, scope.rw_id, row_cap));
end;
$$;
