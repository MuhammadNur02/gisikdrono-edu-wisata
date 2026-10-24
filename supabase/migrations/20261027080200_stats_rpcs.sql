-- Task P4.2.01 (docs/PRD.md §8.7.1; docs/Security.md REC-07, AZ-13) and P4.10.02's chain status. The bookings RLS
-- window of 0005 (a week back to a month ahead) limits what an RW admin reads row by row; the dashboard's figures
-- count every period, so they come from security definer aggregates that hand out counts and sums only, never a
-- row, and force an RW admin to their own RW whatever they asked for.
--
--   visit_stats         bookings, people booked and admitted, tickets used and products sold per day, week or month
--                       of the visit; the gross booking total for the superadmin only (an RW's own revenue is its
--                       ledger, revenue_recap)
--   revenue_recap       the ledger recap of a period: per day and per beneficiary from v_revenue_recap_daily, and what
--                       each beneficiary is still owed from v_revenue_recap_by_party
--   verify_audit_chain  the superadmin's view of internal.verify_audit_chain and verify_ledger_chain, a few times an
--                       hour, since each walks a whole table


-- ===== Shared =====

-- The period and RW of a staff aggregate: staff at AAL2, at most 12 months, an RW admin's own RW always.
create function internal.stats_scope(p_from date, p_to date, p_rw_id smallint) returns smallint
  language plpgsql stable
  set search_path = ''
as $$
begin
  if not (public.is_staff() and public.aal2()) then
    raise exception 'figures are read by staff with a verified authenticator' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to >= p_from + interval '12 months' then
    raise exception 'figures cover a period of at most 12 months' using errcode = '22023';
  end if;
  return case when public.is_superadmin() then p_rw_id else public.app_rw_id() end;
end;
$$;
revoke execute on function internal.stats_scope(date, date, smallint) from public, anon, authenticated, service_role;


-- ===== visit_stats =====

create function internal.visit_counts(p_from date, p_to date, p_rw_id smallint, p_unit text)
  returns table (bucket date, bookings bigint, pax_booked bigint, pax_checked_in bigint, tickets_used bigint)
  language sql stable
  set search_path = ''
as $$
  select date_trunc(p_unit, s.session_date)::date, count(distinct l.booking_id), sum(l.pax_count),
         coalesce(sum(t.checked_in_pax) filter (where t.status = 'used'), 0), count(t.id) filter (where t.status = 'used')
  from public.booking_legs l
  join public.bookings b on b.id = l.booking_id
  join public.visit_sessions s on s.id = l.visit_session_id
  left join public.tickets_qr t on t.booking_leg_id = l.id
  where s.session_date between p_from and p_to and b.status in ('paid', 'checked_in', 'completed', 'no_show')
    and (p_rw_id is null or l.rw_id = p_rw_id)
  group by 1;
$$;

-- Products sold of the RW, and for the superadmin the bookings' totals, by the day the booking visits; a booking of
-- two RWs counts its whole total once, under either RW the superadmin narrows to.
create function internal.visit_sales(p_from date, p_to date, p_rw_id smallint, p_unit text)
  returns table (bucket date, products_sold bigint, gross_amount bigint)
  language sql stable
  set search_path = ''
as $$
  select date_trunc(p_unit, b.visit_date)::date,
         coalesce(sum((select sum(a.qty) from public.booking_addons a
                       where a.booking_id = b.id and a.fulfillment_status <> 'cancelled'
                         and (p_rw_id is null or a.rw_id = p_rw_id))), 0)::bigint,
         sum(b.total_amount)::bigint
  from public.bookings b
  where b.visit_date between p_from and p_to and b.status in ('paid', 'checked_in', 'completed', 'no_show')
    and (p_rw_id is null or p_rw_id = any (b.rw_ids))
  group by 1;
$$;

revoke execute on function internal.visit_counts(date, date, smallint, text),
  internal.visit_sales(date, date, smallint, text)
  from public, anon, authenticated, service_role;

-- [{bucket, bookings, pax_booked, pax_checked_in, tickets_used, products_sold, gross_amount}], one per day, week or
-- month of the period, zero-filled; gross_amount is null for an RW admin.
create function public.visit_stats(
  p_from date, p_to date, p_rw_id smallint default null, p_granularity text default 'day'
) returns jsonb
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  rw_id smallint := internal.stats_scope(p_from, p_to, p_rw_id);
begin
  if p_granularity is null or p_granularity not in ('day', 'week', 'month') then
    raise exception 'figures are counted per day, week or month' using errcode = '22023';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'bucket', buckets.bucket, 'bookings', coalesce(c.bookings, 0), 'pax_booked', coalesce(c.pax_booked, 0),
             'pax_checked_in', coalesce(c.pax_checked_in, 0), 'tickets_used', coalesce(c.tickets_used, 0),
             'products_sold', coalesce(s.products_sold, 0),
             'gross_amount', case when public.is_superadmin() then coalesce(s.gross_amount, 0) end)
           order by buckets.bucket), '[]')
    from (select generate_series(date_trunc(p_granularity, p_from), p_to, ('1 ' || p_granularity)::interval)::date
                   as bucket) as buckets
    left join internal.visit_counts(p_from, p_to, rw_id, p_granularity) c on c.bucket = buckets.bucket
    left join internal.visit_sales(p_from, p_to, rw_id, p_granularity) s on s.bucket = buckets.bucket);
end;
$$;


-- ===== revenue_recap =====

-- {daily: [...], by_beneficiary: [...], outstanding: [...]} for the period: the views' own rows, an RW admin's only
-- their RW's treasury and vendors (the views decide), the superadmin's narrowed to one RW when asked.
create function public.revenue_recap(p_from date, p_to date, p_rw_id smallint default null) returns jsonb
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  scoped_rw smallint := internal.stats_scope(p_from, p_to, p_rw_id);
begin
  return jsonb_build_object(
    'daily', (select coalesce(jsonb_agg(to_jsonb(d) order by d.day, d.beneficiary_key), '[]')
              from public.v_revenue_recap_daily d
              where d.day between p_from and p_to and (scoped_rw is null or d.rw_id = scoped_rw)),
    'by_beneficiary', (select coalesce(jsonb_agg(to_jsonb(t) order by t.beneficiary_key), '[]')
                       from (select d.beneficiary_key, d.rw_id, sum(d.settled_amount)::bigint as settled_amount,
                                    sum(d.reversed_amount)::bigint as reversed_amount,
                                    sum(d.net_amount)::bigint as net_amount
                             from public.v_revenue_recap_daily d
                             where d.day between p_from and p_to
                               and (scoped_rw is null or d.rw_id = scoped_rw)
                             group by d.beneficiary_key, d.rw_id) as t),
    'outstanding', (select coalesce(jsonb_agg(to_jsonb(p) order by p.beneficiary_key), '[]')
                    from public.v_revenue_recap_by_party p
                    where scoped_rw is null or p.rw_id = scoped_rw));
end;
$$;


-- ===== verify_audit_chain =====

-- {audit: {ok, checked, first_broken_id}, ledger: {...}} for the superadmin at AAL2, six times an hour at most.
create function public.verify_audit_chain() returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  hourly_cap constant integer := 6;
  hour_seconds constant integer := 3600;
begin
  if not (public.is_superadmin() and public.aal2()) then
    raise exception 'the chains are checked by the superadmin with a verified authenticator' using errcode = '42501';
  end if;
  if not internal.rate_limit_hit('audit_chain:user:' || auth.uid()::text, hourly_cap, hour_seconds) then
    raise exception 'the chains are checked at most % times an hour', hourly_cap
      using errcode = 'P0001', hint = 'RATE_LIMITED';
  end if;
  return jsonb_build_object('audit', internal.verify_audit_chain(), 'ledger', internal.verify_ledger_chain());
end;
$$;

revoke execute on function public.visit_stats(date, date, smallint, text), public.revenue_recap(date, date, smallint),
  public.verify_audit_chain()
  from public, anon, service_role;
grant execute on function public.visit_stats(date, date, smallint, text), public.revenue_recap(date, date, smallint),
  public.verify_audit_chain()
  to authenticated;
