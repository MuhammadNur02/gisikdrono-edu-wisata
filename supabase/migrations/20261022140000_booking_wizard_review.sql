-- The independent review of PR #27 (the booking wizard, Task P3.5): a contact the code did not prove is refused with a
-- hint of its own, CONTACT_UNVERIFIED, which the wizard answers by asking for a new code (M1); a form whose first
-- answer was lost opens its booking again with a fresh code of that booking's own contact (M1); the reply names the
-- visit days, so the sessions of the right months are revalidated (L3); the guardian's consent is required with a
-- participant list and kept with the booking (L4); and a rate limit can give back a hit for a refusal the visitor could
-- not avoid (L2).


-- ===== L4: the guardian's consent, kept with the booking =====

-- When the PIC attested the guardians' consent to list the participants (docs/Security.md §7.6, PDP-01); null for a
-- booking without a participant list. The manage page sets it when a list is added later (Task P3.12.02).
alter table public.bookings add column guardian_consented_at timestamptz;


-- ===== M1: what a code proves, and a hint of its own when it proves nothing =====

-- 'whatsapp' when the code verified this number, 'email' when it verified this address while WhatsApp codes are
-- degraded, else null (decision of 2026-10-22, Q7). The code is for booking_phone, verified within ten minutes and not
-- spent; only a code no booking owns is locked, until the booking that spends it commits.
create function internal.otp_proof(p_otp_id uuid, p_phone text, p_email text) returns text
  language plpgsql
  set search_path = ''
as $$
declare
  freshness constant interval := interval '10 minutes';
  otp public.guest_otps;
begin
  select * into otp from public.guest_otps o where o.id = p_otp_id and o.booking_id is null for update;
  if found and otp.purpose = 'booking_phone' and otp.verified_at > now() - freshness and otp.consumed_at is null then
    if otp.phone is not null and otp.phone = p_phone then
      return 'whatsapp';
    end if;
    if otp.phone is null and lower(otp.email::text) = lower(p_email) and not internal.whatsapp_otp_open() then
      return 'email';
    end if;
  end if;
  return null;
end;
$$;

-- Replaces the 20261022120000 version: the same rule, refused as CONTACT_UNVERIFIED rather than STATE_INVALID, so the
-- wizard tells a stale or mismatched code (ask for a new one) from a choice that changed meanwhile.
create or replace function internal.verified_booking_contact(p_otp_id uuid, p_phone text, p_email text) returns text
  language plpgsql
  set search_path = ''
as $$
declare
  contact text := internal.otp_proof(p_otp_id, p_phone, p_email);
begin
  if contact is null then
    raise exception 'the PIC''s contact is not verified' using errcode = 'P0001', hint = 'CONTACT_UNVERIFIED';
  end if;
  return contact;
end;
$$;

-- Whether a fresh code proves the contact a booking was made with: its verified WhatsApp number, or the address an
-- email code proved. A number an email-proved booking only typed proves nothing (review of PR #26, M2).
create function internal.proves_booking_contact(p_otp_id uuid, p_booking public.bookings) returns boolean
  language plpgsql
  set search_path = ''
as $$
declare
  contact text := internal.otp_proof(p_otp_id, p_booking.pic_phone, p_booking.pic_email::text);
begin
  return coalesce((contact = 'whatsapp' and p_booking.phone_verified_at is not null)
                   or (contact = 'email' and p_booking.email_verified_at is not null), false);
end;
$$;


-- ===== L3: the reply names the visit days =====

-- Replaces the 20261022120000 version with the first and last visit day, which createBookingAction revalidates the
-- sessions of, from the database rather than the form.
create or replace function internal.booking_reply(p_result text, p_booking public.bookings) returns jsonb
  language sql immutable
  set search_path = ''
as $$
  select jsonb_build_object('result', p_result, 'booking_id', p_booking.id, 'booking_code', p_booking.booking_code,
                            'status', p_booking.status, 'expires_at', p_booking.expires_at,
                            'visit_date', p_booking.visit_date, 'visit_date_end', p_booking.visit_date_end);
$$;


-- ===== L4: the booking row keeps the guardian's consent =====

-- Replaces the 20261022120000 version: the same row, with guardian_consented_at when the consent came with it.
create or replace function internal.insert_booking(p_mode text, p_package public.tour_packages, p_rw_ids smallint[],
  p_first_day date, p_last_day date, p_expires_at timestamptz, p_quote jsonb, p_pax integer, p_booker jsonb,
  p_contact text, p_idempotency_key text, p_consent jsonb, p_client_meta jsonb)
  returns public.bookings
  language plpgsql
  set search_path = ''
as $$
declare
  booking public.bookings;
begin
  if coalesce(p_consent ->> 'version', '') = '' then
    raise exception 'a booking records the privacy notice it was made under' using errcode = '22023';
  end if;
  insert into public.bookings (booking_code, status, channel, package_id, package_snapshot, rw_ids, booker_type,
    institution_name, pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, notes, subtotal_package,
    subtotal_addons, total_amount, expires_at, quoted_at, phone_verified_at, email_verified_at, consent_version,
    consented_at, guardian_consented_at, idempotency_key, source_ip, user_agent)
  values (internal.new_booking_code(),
    case p_mode when 'pay' then 'pending_payment' else 'quoted' end::public.booking_status, 'web', p_package.id,
    jsonb_build_object('name', p_package.name, 'category', p_package.category, 'pricing_basis', p_package.pricing_basis,
                       'unit_price', (p_quote #>> '{lines,0,unit_price}')::bigint, 'tier', p_quote -> 'tier'),
    p_rw_ids, (p_booker ->> 'booker_type')::public.booker_type, nullif(trim(p_booker ->> 'institution_name'), ''),
    p_booker ->> 'pic_name', p_booker ->> 'pic_phone', lower(trim(p_booker ->> 'pic_email')), p_pax, p_first_day,
    p_last_day, nullif(trim(p_booker ->> 'notes'), ''), (p_quote ->> 'subtotal_package')::bigint,
    (p_quote ->> 'subtotal_addons')::bigint, (p_quote ->> 'total')::bigint, p_expires_at,
    case when p_mode = 'quote' then now() end,
    case when p_contact = 'whatsapp' then now() end, case when p_contact = 'email' then now() end,
    p_consent ->> 'version', now(), case when p_consent ->> 'guardian_consent' = 'true' then now() end,
    p_idempotency_key, nullif(p_client_meta ->> 'ip', '')::inet, left(p_client_meta ->> 'user_agent', 500))
  returning * into booking;
  return booking;
end;
$$;


-- ===== M1 and L4: internal.create_booking =====

-- Replaces the 20261022120000 version. Two changes: a repeat of a form key also opens its booking with a fresh code of
-- that booking's own contact, and a participant list needs the guardian's consent. Everything else is unchanged.
create or replace function internal.create_booking(
  p_package_id uuid, p_session_ids uuid[], p_pax integer, p_booker jsonb, p_addons jsonb, p_participants jsonb,
  p_mode text, p_channel public.booking_channel, p_idempotency_key text, p_otp_id uuid, p_consent jsonb,
  p_actor_id uuid, p_client_meta jsonb, p_quote_hash text
) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  large_group_pax constant integer := 60;
  phone text := p_booker ->> 'pic_phone';
  email text := lower(trim(p_booker ->> 'pic_email'));
  previous_settings jsonb;
  tour_package public.tour_packages;
  sessions record;
  quote jsonb;
  contact text;
  deadline timestamptz;
  booking public.bookings;
begin
  if p_mode is null or p_mode not in ('pay', 'quote') then
    raise exception 'a booking is either paid for or quoted' using errcode = '22023';
  end if;
  if p_channel is distinct from 'web' then
    raise exception 'an officer''s booking is not taken here yet (Task P4.3.10)'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  -- The audit chain's turn before any row lock (M1), and before the form key is looked up, so the same form sent twice
  -- at once finds the booking the first request made (L2).
  perform internal.take_audit_turn();
  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1', 'app.actor_role', 'visitor')
    || case when p_actor_id is null then '{}' else jsonb_build_object('app.actor_id', p_actor_id::text) end);

  if p_idempotency_key is not null then
    select * into booking from public.bookings b where b.idempotency_key = p_idempotency_key;
    if found then
      -- The key alone opens nothing (review of PR #26, L1): a repeat brings the code the booking spent, or a fresh
      -- one of that booking's own contact, when the first answer never reached the browser (review of PR #27, M1).
      if not exists (select 1 from public.guest_otps o where o.id = p_otp_id and o.booking_id = booking.id)
         and not internal.proves_booking_contact(p_otp_id, booking) then
        if booking.pic_phone is distinct from phone then
          raise exception 'this form was already sent for another booking' using errcode = '23505';
        end if;
        raise exception 'the PIC''s contact is not verified' using errcode = 'P0001', hint = 'CONTACT_UNVERIFIED';
      end if;
      perform internal.restore_settings(previous_settings);
      return internal.booking_reply('existing', booking);
    end if;
  end if;

  select * into tour_package from public.tour_packages p where p.id = p_package_id and p.status = 'published';
  if not found then
    raise exception 'package % is not on sale', p_package_id using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  select array_agg(s.rw_id order by s.leg_order) as rw_ids, array_agg(s.session_id order by s.leg_order) as ids,
         min(s.starts_at) as first_start, min(s.session_date) as first_day, max(s.session_date) as last_day
    into sessions
  from internal.booking_sessions(p_package_id, p_session_ids) as s;
  perform internal.check_booking_size(p_pax, p_participants);
  -- docs/Security.md §7.6 (PDP-01; review of PR #27, L4): many participants are children. Without a list there is
  -- nothing the guardians consented to, so the booking keeps no consent.
  if jsonb_array_length(coalesce(p_participants, '[]')) = 0 then
    p_consent := p_consent - 'guardian_consent';
  elsif coalesce(p_consent ->> 'guardian_consent', '') <> 'true' then
    raise exception 'a participant list needs the guardian''s consent' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if p_mode = 'pay' then
    deadline := internal.hold_deadline((p_booker ->> 'booker_type')::public.booker_type, p_pax, sessions.first_start);
    if deadline <= now() then
      raise exception 'no time is left to pay before the session starts' using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
  end if;

  quote := internal.booking_quote(p_package_id, p_pax, p_addons, sessions.rw_ids);
  if internal.booking_quote_hash(quote) is distinct from p_quote_hash then
    raise exception 'the price changed since the summary was shown' using errcode = 'P0001', hint = 'PRICE_MISMATCH';
  end if;
  contact := internal.verified_booking_contact(p_otp_id, phone, email);

  if p_mode = 'pay' then
    perform internal.lock_booking_contact(contact, phone, email);
    booking := internal.unpaid_hold_for(contact, phone, email, sessions.ids);
    if booking.id is not null then
      perform internal.restore_settings(previous_settings);
      return internal.booking_reply('duplicate', booking);
    end if;
    perform internal.check_unpaid_caps(contact, phone, email);
    if internal.over_unpaid_share(sessions.ids, p_pax) then
      perform internal.restore_settings(previous_settings);
      return jsonb_build_object('result', 'pay_to_confirm');
    end if;
  end if;

  booking := internal.insert_booking(p_mode, tour_package, sessions.rw_ids, sessions.first_day, sessions.last_day,
    deadline, quote, p_pax, p_booker, contact, p_idempotency_key, p_consent, p_client_meta);
  perform internal.insert_booking_lines(booking, p_mode, sessions.ids, p_pax, quote, p_addons, p_participants);
  update public.guest_otps set consumed_at = now(), booking_id = booking.id where id = p_otp_id;

  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, payload)
  values (booking.id, null, booking.status, 'visitor', p_actor_id,
          jsonb_build_object('mode', p_mode, 'legs', cardinality(sessions.ids), 'pax', p_pax));
  if p_mode = 'pay' then
    -- WhatsApp only to a verified number (enqueue_notification skips it otherwise); the email link stays a view link
    -- until the address is confirmed (notifications_guest_guard).
    perform internal.enqueue_notification(booking.id, 'booking_created', 'whatsapp', '{"link_scope": "manage"}');
    perform internal.enqueue_notification(booking.id, 'booking_created', 'email', '{"link_scope": "manage"}');
  end if;
  if p_pax > large_group_pax then
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('large_group', 'info', 'large_group:' || booking.id, 'Rombongan besar: lebih dari 60 orang',
            jsonb_build_object('booking_id', booking.id, 'pax', p_pax, 'rw_ids', booking.rw_ids));
  end if;

  perform internal.restore_settings(previous_settings);
  return internal.booking_reply('created', booking);
end;
$$;


revoke execute on function internal.otp_proof(uuid, text, text),
  internal.proves_booking_contact(uuid, public.bookings)
  from public, anon, authenticated;


-- ===== L2: a hit given back =====

-- The booking limits are counted before the database answers (booking-service.ts). A refusal the visitor could not have
-- avoided (a session that filled, one already half held unpaid, a hold they already have) gives its hit back, so a
-- school trying again from one computer is not locked out for the day; validation, price and abuse refusals keep it.
-- The hit goes back to the current window, and a count never goes below zero.
create function internal.rate_limit_refund(p_key text, p_window_seconds integer) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  current_window timestamptz;
begin
  if p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'a rate limit needs a positive window' using errcode = '22023';
  end if;
  current_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  update public.rate_limit_buckets as bucket set count = greatest(bucket.count - 1, 0)
  where bucket.key = p_key and bucket.window_start = current_window;
end;
$$;
revoke execute on function internal.rate_limit_refund(text, integer) from public, anon, authenticated;

-- PostgREST exposes public only (decision of 2026-10-16).
create function public.svc_rate_limit_refund(p_key text, p_window_seconds integer) returns void
  language sql security definer
  set search_path = ''
as $$ select internal.rate_limit_refund(p_key, p_window_seconds); $$;
revoke execute on function public.svc_rate_limit_refund(text, integer) from public, anon, authenticated;
grant execute on function public.svc_rate_limit_refund(text, integer) to service_role;
