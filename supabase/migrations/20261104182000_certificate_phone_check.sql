-- The guest certificate page's step-up (Task P4.5.03; docs/Security.md §6.7, DOC-02): a certificate that prints a
-- person's name opens only for the visitor who types the last four digits of the PIC's verified WhatsApp number.
-- The number never leaves the database, as for svc_is_booking_phone (review of PR #69, L-7): the server hands in the
-- four digits and reads back only the answer. Five tries per booking a day are counted by the server
-- (certificate_phone:booking); the first refusal raises certificate_phone_locked here.

-- verified, mismatch, or unverified when the booking's number was never proven by a WhatsApp code (a booking made
-- while WhatsApp codes were degraded to email), which no step-up may then rest on.
create function internal.check_certificate_phone(p_booking_id uuid, p_last_four text) returns text
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  booking public.bookings;
begin
  perform internal.require_server_caller('check_certificate_phone');
  if coalesce(p_last_four, '') !~ '^[0-9]{4}$' then
    raise exception 'the step-up takes four digits' using errcode = '22023';
  end if;
  select * into booking from public.bookings b where b.id = p_booking_id;
  if booking.id is null then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  if booking.phone_verified_at is null then
    return 'unverified';
  end if;
  return case when right(booking.pic_phone, 4) = p_last_four then 'verified' else 'mismatch' end;
end;
$$;

-- The five tries are used up: one open alert per booking, its count raised by every later lock.
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

revoke execute on function internal.check_certificate_phone(uuid, text), internal.lock_certificate_phone(uuid)
  from public, anon, authenticated;

create function public.svc_check_certificate_phone(p_booking_id uuid, p_last_four text) returns text
  language sql security definer
  set search_path = ''
as $$ select internal.check_certificate_phone(p_booking_id, p_last_four); $$;

create function public.svc_lock_certificate_phone(p_booking_id uuid) returns void
  language sql security definer
  set search_path = ''
as $$ select internal.lock_certificate_phone(p_booking_id); $$;

revoke execute on function public.svc_check_certificate_phone(uuid, text), public.svc_lock_certificate_phone(uuid)
  from public, anon, authenticated;
grant execute on function public.svc_check_certificate_phone(uuid, text), public.svc_lock_certificate_phone(uuid)
  to service_role;
