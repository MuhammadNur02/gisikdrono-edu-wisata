-- Task P4.10.01 (docs/Security.md §11.2; MON-02, MON-07, BOOK-09, OPS-02): the anomaly scan's rules that the database
-- can answer alone. POST /api/jobs/anomaly-scan, which pg_cron already calls every five minutes (0007), runs
-- svc_run_anomaly_scan and reports the run; the alerts it raises go out of band with the outbox job's alert sender
-- (P3.11.08). Each rule looks back over ten minutes, so two runs overlap rather than miss a minute, and raises at most
-- one alert per subject an hour: its fingerprint names the rule, the subject and the hour, and a second sighting within
-- it counts an occurrence instead.
--
-- Not here, and named in docs/Task.md: failed sign-ins and TOTP codes, read from the Auth logs through the Management
-- API, which needs a server-only token and an outbound host CLAUDE.md does not name yet (§7.7, §12.1 no. 15–17); and
-- the price-median rules.


-- ===== Raising an alert =====

create function internal.raise_anomaly(
  p_rule text, p_severity public.alert_severity, p_subject text, p_title text, p_details jsonb
) returns void
  language sql
  set search_path = ''
as $$
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values (p_rule, p_severity,
          p_rule || ':' || coalesce(p_subject, '-') || ':' || to_char(now() at time zone 'Asia/Jakarta', 'YYYYMMDDHH24'),
          p_title, coalesce(p_details, '{}'))
  on conflict (fingerprint) where acknowledged_at is null do update
  set details = excluded.details, last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1;
$$;


-- ===== Payments and bookings =====

-- A burst of bad signatures for an order that exists: someone forging notifications for a real booking.
create function internal.anomaly_signature_burst(p_since timestamptz) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  burst constant integer := 3;
  hit record;
  raised integer := 0;
begin
  for hit in
    select r.order_id, count(*) as attempts from public.webhook_rejections r
    where r.reason = 'signature_invalid' and r.received_at > p_since
      and exists (select 1 from public.payments p where p.order_id = r.order_id)
    group by r.order_id having count(*) >= burst
  loop
    perform internal.raise_anomaly('signature_burst', 'high', hit.order_id, 'Lonjakan tanda tangan webhook palsu',
                                   jsonb_build_object('order_id', hit.order_id, 'attempts', hit.attempts));
    raised := raised + 1;
  end loop;
  return raised;
end;
$$;

-- Security events that are alerts in themselves, one per event's subject.
create function internal.anomaly_from_events(p_since timestamptz) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  hit record;
  raised integer := 0;
begin
  for hit in
    select e.event_type, e.entity_id, count(*) as seen, max(e.rw_id) as rw_id
    from public.security_events e
    where e.occurred_at > p_since
      and e.event_type in ('webhook_amount_mismatch', 'status_disagreement', 'session_changed_with_bookings',
                           'manual_checkin', 'mfa_enrolled', 'export_downloaded')
    group by e.event_type, e.entity_id
  loop
    perform internal.raise_anomaly(hit.event_type,
      case when hit.event_type in ('webhook_amount_mismatch', 'status_disagreement', 'mfa_enrolled') then 'high'
           else 'medium' end::public.alert_severity,
      hit.entity_id,
      case hit.event_type
        when 'webhook_amount_mismatch' then 'Jumlah pembayaran tidak cocok'
        when 'status_disagreement' then 'Status Midtrans berbeda'
        when 'session_changed_with_bookings' then 'Sesi berpemesanan diubah'
        when 'manual_checkin' then 'Check-in manual'
        when 'mfa_enrolled' then 'Autentikator baru didaftarkan'
        else 'Ekspor data' end,
      jsonb_build_object('entity_id', hit.entity_id, 'events', hit.seen, 'rw_id', hit.rw_id));
    raised := raised + 1;
  end loop;
  return raised;
end;
$$;

-- A paid booking that has no ticket ten minutes on, and an issued ticket with no settled payment behind it.
create function internal.anomaly_money_and_tickets() returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  hit record;
  raised integer := 0;
begin
  for hit in
    select b.id from public.bookings b
    where b.status = 'paid' and b.paid_at < now() - interval '10 minutes'
      and not exists (select 1 from public.tickets_qr t where t.booking_id = b.id)
  loop
    perform internal.raise_anomaly('paid_without_tickets', 'critical', hit.id::text, 'Lunas tanpa tiket',
                                   jsonb_build_object('booking_id', hit.id));
    raised := raised + 1;
  end loop;
  for hit in
    select t.id, t.booking_id from public.tickets_qr t
    where t.status = 'issued'
      and not exists (select 1 from public.payments p
                      where p.booking_id = t.booking_id and p.status in ('settled', 'partially_refunded'))
  loop
    perform internal.raise_anomaly('ticket_without_payment', 'critical', hit.id::text, 'Tiket tanpa pembayaran',
                                   jsonb_build_object('ticket_id', hit.id, 'booking_id', hit.booking_id));
    raised := raised + 1;
  end loop;
  return raised;
end;
$$;

-- Holds the expiry job left behind, sessions held mostly by unpaid bookings, large bookings, refunds in volume and
-- check-ins before the visit's day.
create function internal.anomaly_bookings(p_since timestamptz) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  held_share constant numeric := 0.8;
  large_total constant bigint := 20000000;
  large_pax constant integer := 150;
  refund_volume constant bigint := 5000000;
  hit record;
  raised integer := 0;
begin
  select count(*) as stale into hit from public.bookings b
  where b.status = 'pending_payment' and b.expires_at < now() - interval '15 minutes';
  if hit.stale > 0 then
    perform internal.raise_anomaly('hold_past_ttl', 'medium', null, 'Pemesanan melewati batas waktu',
                                   jsonb_build_object('bookings', hit.stale));
    raised := raised + 1;
  end if;
  for hit in
    select s.id, s.capacity, sum(l.pax_count) as held from public.visit_sessions s
    join public.booking_legs l on l.visit_session_id = s.id and l.status = 'reserved'
    join public.bookings b on b.id = l.booking_id and b.status = 'pending_payment'
    where s.session_date >= public.today_jkt()
    group by s.id, s.capacity having sum(l.pax_count) >= held_share * s.capacity
  loop
    perform internal.raise_anomaly('session_held_unpaid', 'medium', hit.id::text, 'Sesi tertahan pemesanan belum bayar',
                                   jsonb_build_object('session_id', hit.id, 'held', hit.held, 'capacity', hit.capacity));
    raised := raised + 1;
  end loop;
  for hit in
    select b.id, b.total_amount, b.pax_count from public.bookings b
    where b.created_at > p_since and (b.total_amount >= large_total or b.pax_count >= large_pax)
  loop
    perform internal.raise_anomaly('large_booking', 'medium', hit.id::text, 'Pemesanan besar',
                                   jsonb_build_object('booking_id', hit.id, 'total', hit.total_amount, 'pax', hit.pax_count));
    raised := raised + 1;
  end loop;
  select coalesce(sum(p.refunded_amount), 0) as refunded into hit from public.payments p
  where p.status in ('refunded', 'partially_refunded') and p.updated_at > now() - interval '24 hours';
  if hit.refunded >= refund_volume then
    perform internal.raise_anomaly('refund_volume', 'high', null, 'Volume refund tinggi',
                                   jsonb_build_object('refunded_24h', hit.refunded));
    raised := raised + 1;
  end if;
  for hit in
    select t.id from public.tickets_qr t
    where t.status = 'used' and t.checked_in_at > p_since
      and (t.checked_in_at at time zone 'Asia/Jakarta')::date < t.valid_on
  loop
    perform internal.raise_anomaly('early_checkin', 'medium', hit.id::text, 'Check-in sebelum tanggal kunjungan',
                                   jsonb_build_object('ticket_id', hit.id));
    raised := raised + 1;
  end loop;
  return raised;
end;
$$;


-- ===== Staff and the chains =====

-- New superadmins, lockout spikes and staff without exactly one verified authenticator (AUTH-12).
create function internal.anomaly_staff(p_since timestamptz) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  lockout_spike constant integer := 3;
  hit record;
  raised integer := 0;
begin
  for hit in
    select e.entity_id from public.security_events e
    where e.occurred_at > p_since and e.event_type = 'role_changed' and e.details ->> 'to_role' = 'superadmin'
  loop
    perform internal.raise_anomaly('new_superadmin', 'critical', hit.entity_id, 'Superadmin baru',
                                   jsonb_build_object('profile_id', hit.entity_id));
    raised := raised + 1;
  end loop;
  select count(*) as locks into hit from public.security_events e
  where e.occurred_at > p_since and e.event_type in ('login_locked', 'mfa_locked', 'scanner_lockout');
  if hit.locks >= lockout_spike then
    perform internal.raise_anomaly('lockout_spike', 'high', null, 'Lonjakan penguncian akun',
                                   jsonb_build_object('lockouts', hit.locks));
    raised := raised + 1;
  end if;
  for hit in
    select p.id, (select count(*) from auth.mfa_factors f
                  where f.user_id = p.id and f.factor_type = 'totp' and f.status = 'verified') as factors
    from public.profiles p
    where p.is_active and p.role <> 'none'
  loop
    if hit.factors <> 1 then
      perform internal.raise_anomaly('staff_factor_count', 'high', hit.id::text, 'Staf tanpa tepat satu autentikator',
                                     jsonb_build_object('profile_id', hit.id, 'factors', hit.factors));
      raised := raised + 1;
    end if;
  end loop;
  return raised;
end;
$$;

-- The audit and ledger chains, once an hour (each walks a whole table): a break is critical.
create function internal.anomaly_chains() returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  audit jsonb := internal.verify_audit_chain();
  ledger jsonb := internal.verify_ledger_chain();
  raised integer := 0;
begin
  if not (audit ->> 'ok')::boolean then
    perform internal.raise_anomaly('chain_broken', 'critical', 'audit_logs', 'Rantai audit rusak', audit);
    raised := raised + 1;
  end if;
  if not (ledger ->> 'ok')::boolean then
    perform internal.raise_anomaly('chain_broken', 'critical', 'revenue_share_entries', 'Rantai buku besar rusak', ledger);
    raised := raised + 1;
  end if;
  return raised;
end;
$$;


-- ===== The run =====

-- {raised, chains_checked}: how many alerts this run raised or saw again. p_check_chains is the route's say: it asks
-- for the chains in the first run of each hour.
create function internal.run_anomaly_scan(p_check_chains boolean default false) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  since timestamptz := now() - interval '10 minutes';
  raised integer;
begin
  raised := internal.anomaly_signature_burst(since) + internal.anomaly_from_events(since)
            + internal.anomaly_money_and_tickets() + internal.anomaly_bookings(since) + internal.anomaly_staff(since)
            + case when coalesce(p_check_chains, false) then internal.anomaly_chains() else 0 end;
  return jsonb_build_object('raised', raised, 'chains_checked', coalesce(p_check_chains, false));
end;
$$;

revoke execute on function internal.raise_anomaly(text, public.alert_severity, text, text, jsonb),
  internal.anomaly_signature_burst(timestamptz), internal.anomaly_from_events(timestamptz),
  internal.anomaly_money_and_tickets(), internal.anomaly_bookings(timestamptz), internal.anomaly_staff(timestamptz),
  internal.anomaly_chains(), internal.run_anomaly_scan(boolean)
  from public, anon, authenticated, service_role;

create function public.svc_run_anomaly_scan(p_check_chains boolean default false) returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.run_anomaly_scan(p_check_chains); $$;
revoke execute on function public.svc_run_anomaly_scan(boolean) from public, anon, authenticated;
grant execute on function public.svc_run_anomaly_scan(boolean) to service_role;
