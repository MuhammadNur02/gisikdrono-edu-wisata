-- Follow-ups of the review of PR #94 (20261104210100_certificate_phone_check.sql; Task P4.5.03; docs/Security.md §6.7,
-- DOC-02).
--
-- 1. Two counts of wrong tries. A right answer starts bookings.certificate_phone_failures again, which spares a PIC who
--    mistyped now and then; the tenth wrong try since the last right one blocks the step-up. But the link may have been
--    forwarded, every holder shares the booking's count, and the PIC proves the number again on every visit (the proof
--    lives 30 minutes), so that reset alone would wipe an outsider's tally each time: five tries a day over the 90 days
--    would come back to some 450 guesses at 10 000 numbers. bookings.certificate_phone_failures_total therefore counts
--    every wrong try of the booking's window and is never reset; at the thirtieth the step-up is blocked the same way,
--    with the same answer and the same high certificate_phone_blocked alert (independent review of PR #107, L1).
--    A blocked booking stays blocked: check_certificate_phone answers blocked before it compares anything, so no right
--    answer reaches the reset once either cap is reached.
-- 2. The security definer steps behind check_certificate_phone check their caller first, as every other server-only
--    function of the documents does (internal.require_server_caller, 20261023110000). No API role is granted them, so
--    this is the second line.

-- Every wrong try of the window, never reset. Written only by internal.count_certificate_phone_failure; no API role is
-- granted the column.
alter table public.bookings add column certificate_phone_failures_total smallint not null default 0
  constraint bookings_certificate_phone_failures_total_ok check (certificate_phone_failures_total >= 0);

-- Mirrored by CERTIFICATE_PHONE_TOTAL_FAILURE_CAP in src/config/guest.ts.
create function internal.certificate_phone_total_failure_cap() returns smallint
  language sql immutable
  set search_path = ''
as $$ select 30::smallint; $$;

-- Either cap reached: ten wrong tries since the last right one, or thirty over the window.
create function internal.is_certificate_phone_blocked(p_booking public.bookings) returns boolean
  language sql stable
  set search_path = ''
as $$
  select p_booking.certificate_phone_failures >= internal.certificate_phone_failure_cap()
      or p_booking.certificate_phone_failures_total >= internal.certificate_phone_total_failure_cap();
$$;

create or replace function internal.block_certificate_phone(p_booking public.bookings) returns void
  language plpgsql security definer
  set search_path = ''
as $$
begin
  perform internal.require_server_caller('block_certificate_phone');
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values ('certificate_phone_blocked', 'high', 'certificate_phone_blocked:' || p_booking.id,
          'Empat digit nomor pemesan terlalu sering salah di halaman sertifikat, langkah ini ditutup: '
            || p_booking.booking_code,
          jsonb_build_object('booking_id', p_booking.id))
  on conflict (fingerprint) where acknowledged_at is null do update
  set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1;
end;
$$;

-- A right answer opens names, so it is a pii_revealed event of the visitor's, with the hashed IP the server hands in;
-- and it starts the count since the last right try again, never the window's total (1.).
create or replace function internal.record_certificate_phone_proof(p_booking public.bookings, p_ip_hash text)
  returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
begin
  perform internal.require_server_caller('record_certificate_phone_proof');
  insert into public.security_events (event_type, severity, actor_role, ip_hash, rw_id, entity_type, entity_id, details)
  values ('pii_revealed', 'info', 'visitor', p_ip_hash, p_booking.rw_ids[1], 'bookings', p_booking.id::text,
          jsonb_build_object('source', 'certificate_phone_step_up'));
  if p_booking.certificate_phone_failures > 0 then
    previous_settings := internal.push_settings('{"app.actor_role": "visitor"}');
    update public.bookings b set certificate_phone_failures = 0 where b.id = p_booking.id;
    perform internal.restore_settings(previous_settings);
  end if;
end;
$$;

-- A wrong answer is counted twice; the one that reaches either cap blocks the step-up and raises the alert.
create or replace function internal.count_certificate_phone_failure(p_booking public.bookings) returns text
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  counted public.bookings;
begin
  perform internal.require_server_caller('count_certificate_phone_failure');
  previous_settings := internal.push_settings('{"app.actor_role": "visitor"}');
  update public.bookings b
  set certificate_phone_failures = b.certificate_phone_failures + 1,
      certificate_phone_failures_total = b.certificate_phone_failures_total + 1
  where b.id = p_booking.id
  returning b.* into counted;
  perform internal.restore_settings(previous_settings);
  if not internal.is_certificate_phone_blocked(counted) then
    return 'mismatch';
  end if;
  perform internal.block_certificate_phone(counted);
  return 'blocked';
end;
$$;

-- As in 20261104210100, with the block read from both counts.
create or replace function internal.check_certificate_phone(p_booking_id uuid, p_last_four text,
                                                           p_ip_hash text default null)
  returns text
  language plpgsql security definer
  set search_path = ''
as $$
declare
  booking public.bookings;
begin
  perform internal.require_server_caller('check_certificate_phone');
  if coalesce(p_last_four, '') !~ '^[0-9]{4}$' then
    raise exception 'the step-up takes four digits' using errcode = '22023';
  end if;
  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'the IP comes hashed' using errcode = '22023';
  end if;
  select * into booking from public.bookings b where b.id = p_booking_id for update;
  if booking.id is null then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  if internal.is_certificate_phone_blocked(booking) then
    perform internal.block_certificate_phone(booking);
    return 'blocked';
  end if;
  if booking.phone_verified_at is null then
    return 'unverified';
  end if;
  if right(booking.pic_phone, 4) is distinct from p_last_four then
    return internal.count_certificate_phone_failure(booking);
  end if;
  perform internal.record_certificate_phone_proof(booking, p_ip_hash);
  return 'verified';
end;
$$;

revoke execute on function internal.certificate_phone_total_failure_cap(),
  internal.is_certificate_phone_blocked(public.bookings),
  internal.block_certificate_phone(public.bookings),
  internal.record_certificate_phone_proof(public.bookings, text),
  internal.count_certificate_phone_failure(public.bookings),
  internal.check_certificate_phone(uuid, text, text)
  from public, anon, authenticated;
