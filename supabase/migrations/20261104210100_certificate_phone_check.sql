-- The guest certificate page's step-up (Task P4.5.03; docs/Security.md §6.7, DOC-02): a certificate that prints a
-- person's name opens only for the visitor who types the last four digits of the PIC's verified WhatsApp number.
-- The number never leaves the database, as for svc_is_booking_phone (review of PR #69, L-7): the server hands in the
-- four digits and reads back only the answer. The server counts five tries per booking a day
-- (certificate_phone:booking) and twenty per IP (certificate_phone:ip), and gives a try back when it was right; the
-- first refusal raises certificate_phone_locked here. The database itself keeps the wrong tries of the whole window
-- (review of PR #94, L1): the tenth blocks the step-up of that booking for good and raises certificate_phone_blocked,
-- because a rate-limit bucket lives one day, and five a day over 90 days would be 450 guesses at 10 000 numbers.

-- The wrong tries so far. Written only by internal.check_certificate_phone; no API role is granted the column.
alter table public.bookings add column certificate_phone_failures smallint not null default 0
  constraint bookings_certificate_phone_failures_ok check (certificate_phone_failures >= 0);

create function internal.certificate_phone_failure_cap() returns smallint
  language sql immutable
  set search_path = ''
as $$ select 10::smallint; $$;

-- The step-up is blocked for good: one open alert per booking, its count raised by every later try.
create function internal.block_certificate_phone(p_booking public.bookings) returns void
  language plpgsql security definer
  set search_path = ''
as $$
begin
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values ('certificate_phone_blocked', 'high', 'certificate_phone_blocked:' || p_booking.id,
          'Empat digit nomor pemesan salah sepuluh kali di halaman sertifikat, langkah ini ditutup: '
            || p_booking.booking_code,
          jsonb_build_object('booking_id', p_booking.id))
  on conflict (fingerprint) where acknowledged_at is null do update
  set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1;
end;
$$;

-- A right answer opens names, so it is a pii_revealed event of the visitor's, with the hashed IP the server hands in.
create function internal.record_certificate_phone_proof(p_booking public.bookings, p_ip_hash text) returns void
  language sql security definer
  set search_path = ''
as $$
  insert into public.security_events (event_type, severity, actor_role, ip_hash, rw_id, entity_type, entity_id, details)
  values ('pii_revealed', 'info', 'visitor', p_ip_hash, p_booking.rw_ids[1], 'bookings', p_booking.id::text,
          jsonb_build_object('source', 'certificate_phone_step_up'));
$$;

-- A wrong answer is counted; the one that reaches the cap blocks the step-up and raises the alert.
create function internal.count_certificate_phone_failure(p_booking public.bookings) returns text
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  failures smallint;
begin
  previous_settings := internal.push_settings('{"app.actor_role": "visitor"}');
  update public.bookings b set certificate_phone_failures = b.certificate_phone_failures + 1
  where b.id = p_booking.id
  returning b.certificate_phone_failures into failures;
  perform internal.restore_settings(previous_settings);
  if failures < internal.certificate_phone_failure_cap() then
    return 'mismatch';
  end if;
  perform internal.block_certificate_phone(p_booking);
  return 'blocked';
end;
$$;

-- verified, mismatch, blocked once the wrong tries reached the cap, or unverified when the booking's number was never
-- proven by a WhatsApp code (a booking made while WhatsApp codes were degraded to email), which no step-up may then
-- rest on. The booking row is locked, so two tries at once never both slip under the cap.
create function internal.check_certificate_phone(p_booking_id uuid, p_last_four text, p_ip_hash text default null)
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
  if booking.certificate_phone_failures >= internal.certificate_phone_failure_cap() then
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

-- The five tries of a day are used up: one open alert per booking, its count raised by every later lock.
create function internal.lock_certificate_phone(p_booking_id uuid) returns void
  language plpgsql security definer
  set search_path = ''
as $$
begin
  perform internal.require_server_caller('lock_certificate_phone');
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  select 'certificate_phone_locked', 'high', 'certificate_phone_locked:' || b.id,
         'Empat digit nomor pemesan salah lima kali di halaman sertifikat: ' || b.booking_code,
         jsonb_build_object('booking_id', b.id)
  from public.bookings b where b.id = p_booking_id
  on conflict (fingerprint) where acknowledged_at is null do update
  set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1;
end;
$$;

revoke execute on function internal.certificate_phone_failure_cap(),
  internal.block_certificate_phone(public.bookings), internal.record_certificate_phone_proof(public.bookings, text),
  internal.count_certificate_phone_failure(public.bookings), internal.check_certificate_phone(uuid, text, text),
  internal.lock_certificate_phone(uuid)
  from public, anon, authenticated;

create function public.svc_check_certificate_phone(p_booking_id uuid, p_last_four text, p_ip_hash text default null)
  returns text
  language sql security definer
  set search_path = ''
as $$ select internal.check_certificate_phone(p_booking_id, p_last_four, p_ip_hash); $$;

create function public.svc_lock_certificate_phone(p_booking_id uuid) returns void
  language sql security definer
  set search_path = ''
as $$ select internal.lock_certificate_phone(p_booking_id); $$;

revoke execute on function public.svc_check_certificate_phone(uuid, text, text),
  public.svc_lock_certificate_phone(uuid)
  from public, anon, authenticated;
grant execute on function public.svc_check_certificate_phone(uuid, text, text), public.svc_lock_certificate_phone(uuid)
  to service_role;
