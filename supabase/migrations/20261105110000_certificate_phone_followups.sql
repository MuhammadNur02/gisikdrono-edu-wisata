-- Follow-ups of the review of PR #94 (20261104210100_certificate_phone_check.sql; Task P4.5.03; docs/Security.md §6.7,
-- DOC-02).
--
-- 1. A right answer starts the count of wrong tries again. bookings.certificate_phone_failures exists so that guesses
--    spread over the 90 days add up to the block; a PIC who mistyped now and then and then proved the number is no such
--    guesser, and a right answer is what a guesser never gives. The block itself stays for good: check_certificate_phone
--    answers blocked before it compares anything, so no right answer can reach this reset once the tenth wrong try has.
-- 2. The security definer steps behind check_certificate_phone check their caller first, as every other server-only
--    function of the documents does (internal.require_server_caller, 20261023110000). No API role is granted them, so
--    this is the second line.

create or replace function internal.block_certificate_phone(p_booking public.bookings) returns void
  language plpgsql security definer
  set search_path = ''
as $$
begin
  perform internal.require_server_caller('block_certificate_phone');
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values ('certificate_phone_blocked', 'high', 'certificate_phone_blocked:' || p_booking.id,
          'Empat digit nomor pemesan salah sepuluh kali di halaman sertifikat, langkah ini ditutup: '
            || p_booking.booking_code,
          jsonb_build_object('booking_id', p_booking.id))
  on conflict (fingerprint) where acknowledged_at is null do update
  set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1;
end;
$$;

-- A right answer opens names, so it is a pii_revealed event of the visitor's, with the hashed IP the server hands in;
-- and it clears the wrong tries counted so far (1.).
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

create or replace function internal.count_certificate_phone_failure(p_booking public.bookings) returns text
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  failures smallint;
begin
  perform internal.require_server_caller('count_certificate_phone_failure');
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

revoke execute on function internal.block_certificate_phone(public.bookings),
  internal.record_certificate_phone_proof(public.bookings, text),
  internal.count_certificate_phone_failure(public.bookings)
  from public, anon, authenticated;
