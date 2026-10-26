-- Task P4.3.10 with the admin booking path of P4.3.08 (docs/PRD.md §13.1 A9, A13; BOOK-05, BOOK-11, AZ-14; decision of
-- 2026-10-26 on the split): an officer registers a walk-in group, or a group from abroad, at the counter.
--
--   public.create_admin_booking    The officer's entry point, at AAL2. The actor is auth.uid(), never a parameter, and
--                                  it reaches internal.create_booking with p_channel = 'admin'.
--   internal.create_booking        Replaces the 20261022140000 version: the web path is unchanged; 'admin' goes to
--                                  internal.create_admin_booking.
--   internal.create_admin_booking  An officer of every RW the package visits, or the superadmin; no OTP; the same
--                                  quote, quote hash (PRICE_MISMATCH) and quota reservation as the web; created_by set.
--   public.mark_booking_paid_manually  An RW admin's cash for an officer's booking of their RW, at AAL2 with a fresh
--                                  code (A9, FR-B2B-08). The superadmin's transfer with its proof and dual control
--                                  comes with the rest of P4.3.08.
--
-- Two product decisions of the owner (docs/PRD.md §13.1 A21 and A22, 2026-10-26); each sits in one function:
--   A  internal.admin_phone_confirmed: the officer ticks "Nomor sudah dicek dengan rombongan", which sets
--      phone_verified_at (booking_events admin_phone_confirmed and an audit row). Unticked, the number gets no WhatsApp
--      (enqueue_notification needs phone_verified_at) and the group hears by email only.
--   C  internal.admin_booking_sessions and internal.admin_hold_deadline: a session of today is booked until it ends
--      (booking.max_advance_days and the quota still apply); the hold is 30 minutes when the officer takes the cash on
--      the spot, else the institution hold, ending at the first session's start at the latest. The officer attests the
--      PIC's consent to the privacy notice (p_consent.attested_by).
-- An officer's booking takes no add-ons or participant list yet; the PIC adds the list later on the manage page.


-- ===== C: the sessions an officer may book =====

-- internal.booking_sessions with the web's lead time replaced by the session's end.
create function internal.admin_booking_sessions(p_package_id uuid, p_session_ids uuid[])
  returns table (leg_order smallint, rw_id smallint, session_id uuid, session_date date, starts_at timestamptz)
  language plpgsql stable
  set search_path = ''
as $$
declare
  max_legs constant integer := 4;
  max_advance_days integer := (select (s.value #>> '{}')::integer from public.site_settings s
                               where s.key = 'booking.max_advance_days');
  closed uuid;
  unsold_day date;
begin
  select requested.id into closed
  from unnest(coalesce(p_session_ids, '{}')) as requested(id)
  left join public.visit_sessions s on s.id = requested.id
  left join public.rw_units u on u.id = s.rw_id
  where s.id is null or s.status <> 'open' or u.is_active is not true
  limit 1;
  if closed is not null then
    raise exception 'session % is not open for booking', closed using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  if coalesce(cardinality(p_session_ids), 0) not between 1 and max_legs
     or cardinality(p_session_ids) <> (select count(distinct s.rw_id) from public.visit_sessions s
                                       where s.id = any (p_session_ids))
     or (select array_agg(s.rw_id order by s.rw_id) from public.visit_sessions s where s.id = any (p_session_ids))
        is distinct from
        (select array_agg(l.rw_id order by l.rw_id) from public.tour_package_legs l where l.package_id = p_package_id)
  then
    raise exception 'a booking takes one session for each RW the package visits'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  -- Independent review of PR #26, L5: valid_from and valid_to bound the visit days a package is sold for.
  select s.session_date into unsold_day
  from public.visit_sessions s
  join public.tour_packages p on p.id = p_package_id
  where s.id = any (p_session_ids) and (s.session_date < p.valid_from or s.session_date > p.valid_to)
  order by s.session_date
  limit 1;
  if unsold_day is not null then
    raise exception 'package % is not sold for visits on %', p_package_id, unsold_day
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  -- Decision of 2026-10-26 (docs/PRD.md §13.1 A22): an officer books a session of today until it ends, so a
  -- walk-in group that arrives during a session can still join it; booking.min_lead_hours is the web's rule.
  if exists (select 1 from public.visit_sessions s where s.id = any (p_session_ids)
             and (s.session_date + s.end_time) at time zone 'Asia/Jakarta' <= now()) then
    raise exception 'a session that has ended takes no booking' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if exists (select 1 from public.visit_sessions s where s.id = any (p_session_ids)
             and s.session_date > public.today_jkt() + max_advance_days) then
    raise exception 'a session is booked at most % days ahead', max_advance_days
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  return query
    select l.leg_order, l.rw_id, s.id, s.session_date, (s.session_date + s.start_time) at time zone 'Asia/Jakarta'
    from public.tour_package_legs l
    join public.visit_sessions s on s.rw_id = l.rw_id and s.id = any (p_session_ids)
    where l.package_id = p_package_id
    order by l.leg_order;
end;
$$;


-- ===== C: how long an officer's hold lasts =====

create function internal.admin_hold_deadline(p_is_cash_on_the_spot boolean, p_first_session_start timestamptz)
  returns timestamptz
  language plpgsql stable
  set search_path = ''
as $$
declare
  cash_hold constant interval := interval '30 minutes';
begin
  if p_is_cash_on_the_spot then
    return now() + cash_hold;
  end if;
  return least(now() + make_interval(hours => (select (s.value #>> '{}')::integer from public.site_settings s
                                               where s.key = 'booking.hold_hours_institution')),
               p_first_session_start);
end;
$$;


-- ===== A: the officer's check of the number =====

create function internal.admin_phone_confirmed(p_booker jsonb) returns boolean
  language sql immutable
  set search_path = ''
as $$
  select coalesce(p_booker #>> '{admin,phone_confirmed}', 'false') = 'true';
$$;


-- ===== Who books for a group =====

-- An active superadmin, or an active RW admin of every RW the package visits.
create function internal.require_admin_booker(p_actor_id uuid, p_rw_ids smallint[]) returns void
  language plpgsql stable
  set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p
                 where p.id = p_actor_id and p.is_active
                   and (p.role = 'superadmin'
                        or (p.role = 'admin_rw' and p.rw_id is not null and p_rw_ids <@ array[p.rw_id]))) then
    raise exception 'only an officer of the package''s RW books for a group' using errcode = '42501';
  end if;
end;
$$;


-- ===== The officer's booking =====

create function internal.insert_admin_booking(p_package public.tour_packages, p_rw_ids smallint[], p_first_day date,
  p_last_day date, p_expires_at timestamptz, p_quote jsonb, p_pax integer, p_booker jsonb, p_idempotency_key text,
  p_consent jsonb, p_actor_id uuid, p_client_meta jsonb) returns public.bookings
  language plpgsql
  set search_path = ''
as $$
declare
  booking public.bookings;
begin
  insert into public.bookings (booking_code, status, channel, package_id, package_snapshot, rw_ids, booker_type,
    institution_name, pic_name, pic_phone, pic_email, pax_count, visit_date, visit_date_end, notes, subtotal_package,
    subtotal_addons, total_amount, expires_at, phone_verified_at, consent_version, consented_at, idempotency_key,
    created_by, source_ip, user_agent)
  values (internal.new_booking_code(), 'pending_payment', 'admin', p_package.id,
    jsonb_build_object('name', p_package.name, 'category', p_package.category, 'pricing_basis', p_package.pricing_basis,
                       'unit_price', (p_quote #>> '{lines,0,unit_price}')::bigint, 'tier', p_quote -> 'tier'),
    p_rw_ids, (p_booker ->> 'booker_type')::public.booker_type, nullif(trim(p_booker ->> 'institution_name'), ''),
    p_booker ->> 'pic_name', p_booker ->> 'pic_phone', lower(trim(p_booker ->> 'pic_email')), p_pax, p_first_day,
    p_last_day, nullif(trim(p_booker ->> 'notes'), ''), (p_quote ->> 'subtotal_package')::bigint,
    (p_quote ->> 'subtotal_addons')::bigint, (p_quote ->> 'total')::bigint, p_expires_at,
    case when internal.admin_phone_confirmed(p_booker) then now() end, p_consent ->> 'version', now(),
    p_idempotency_key, p_actor_id, nullif(p_client_meta ->> 'ip', '')::inet, left(p_client_meta ->> 'user_agent', 500))
  returning * into booking;
  return booking;
end;
$$;

-- The events and messages of a new officer's booking: who made it, who checked the number (A), and the booking_created
-- message unless the cash is taken at once, when the ticket message follows within minutes.
create function internal.record_admin_booking(p_booking public.bookings, p_actor_id uuid, p_legs integer,
  p_is_cash_on_the_spot boolean) returns void
  language plpgsql
  set search_path = ''
as $$
begin
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, payload)
  values (p_booking.id, null, p_booking.status, 'admin', p_actor_id,
          jsonb_build_object('channel', p_booking.channel, 'legs', p_legs, 'pax', p_booking.pax_count,
                             'cash_on_the_spot', p_is_cash_on_the_spot));
  if p_booking.phone_verified_at is not null then
    insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason)
    values (p_booking.id, p_booking.status, p_booking.status, 'admin', p_actor_id, 'admin_phone_confirmed');
    perform internal.log_audit('bookings.phone_confirmed', 'bookings', p_booking.id::text,
                               jsonb_build_object('channel', 'admin', 'confirmed_by', p_actor_id));
  end if;
  if not p_is_cash_on_the_spot then
    perform internal.enqueue_notification(p_booking.id, 'booking_created', 'whatsapp', '{"link_scope": "manage"}');
    perform internal.enqueue_notification(p_booking.id, 'booking_created', 'email', '{"link_scope": "manage"}');
  end if;
end;
$$;

create function internal.create_admin_booking(
  p_package_id uuid, p_session_ids uuid[], p_pax integer, p_booker jsonb, p_mode text, p_idempotency_key text,
  p_consent jsonb, p_actor_id uuid, p_client_meta jsonb, p_quote_hash text
) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  large_group_pax constant integer := 60;
  is_cash_on_the_spot boolean := coalesce(p_booker #>> '{admin,cash_on_the_spot}', 'false') = 'true';
  previous_settings jsonb;
  tour_package public.tour_packages;
  sessions record;
  quote jsonb;
  deadline timestamptz;
  booking public.bookings;
begin
  if p_mode is distinct from 'pay' then
    raise exception 'an officer''s booking is a hold' using errcode = '22023';
  end if;
  if p_actor_id is null then
    raise exception 'an officer''s booking names its officer' using errcode = '42501';
  end if;
  if coalesce(p_consent ->> 'version', '') = '' or p_consent ->> 'attested_by' is distinct from p_actor_id::text then
    raise exception 'the officer attests the PIC''s consent to the privacy notice' using errcode = '22023';
  end if;
  perform internal.take_audit_turn();
  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1')
    || internal.document_actor(p_actor_id));

  if p_idempotency_key is not null then
    select * into booking from public.bookings b where b.idempotency_key = p_idempotency_key;
    if found then
      if booking.channel <> 'admin' or booking.created_by is distinct from p_actor_id then
        raise exception 'this form was already sent for another booking' using errcode = '23505';
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
  from internal.admin_booking_sessions(p_package_id, p_session_ids) as s;
  perform internal.require_admin_booker(p_actor_id, sessions.rw_ids);
  perform internal.check_booking_size(p_pax, '[]');
  deadline := internal.admin_hold_deadline(is_cash_on_the_spot, sessions.first_start);
  if deadline <= now() then
    raise exception 'the session has started: take the cash on the spot' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  quote := internal.booking_quote(p_package_id, p_pax, '[]', sessions.rw_ids);
  if internal.booking_quote_hash(quote) is distinct from p_quote_hash then
    raise exception 'the price changed since the summary was shown' using errcode = 'P0001', hint = 'PRICE_MISMATCH';
  end if;

  booking := internal.insert_admin_booking(tour_package, sessions.rw_ids, sessions.first_day, sessions.last_day,
    deadline, quote, p_pax, p_booker, p_idempotency_key, p_consent, p_actor_id, p_client_meta);
  perform internal.insert_booking_lines(booking, 'pay', sessions.ids, p_pax, quote, '[]', '[]');
  perform internal.record_admin_booking(booking, p_actor_id, cardinality(sessions.ids), is_cash_on_the_spot);
  if p_pax > large_group_pax then
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('large_group', 'info', 'large_group:' || booking.id, 'Rombongan besar: lebih dari 60 orang',
            jsonb_build_object('booking_id', booking.id, 'pax', p_pax, 'rw_ids', booking.rw_ids));
  end if;

  perform internal.restore_settings(previous_settings);
  return internal.booking_reply('created', booking);
end;
$$;


-- ===== The web's path, unchanged, and the officer's branch =====

-- Replaces the 20261022140000 version. One change: p_channel = 'admin' goes to internal.create_admin_booking.
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
  -- Task P4.3.10: an officer's booking takes its own path, with its own rules for the actor, the contact and the
  -- time left (internal.create_admin_booking); pricing and quota are the same helpers as below.
  if p_channel = 'admin' then
    return internal.create_admin_booking(p_package_id, p_session_ids, p_pax, p_booker, p_mode, p_idempotency_key,
                                         p_consent, p_actor_id, p_client_meta, p_quote_hash);
  end if;
  if p_channel is distinct from 'web' then
    raise exception 'a booking comes from the web or from an officer' using errcode = '22023';
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

revoke execute on function internal.admin_booking_sessions(uuid, uuid[]),
  internal.admin_hold_deadline(boolean, timestamptz),
  internal.admin_phone_confirmed(jsonb),
  internal.require_admin_booker(uuid, smallint[]),
  internal.insert_admin_booking(public.tour_packages, smallint[], date, date, timestamptz, jsonb, integer, jsonb, text,
                                jsonb, uuid, jsonb),
  internal.record_admin_booking(public.bookings, uuid, integer, boolean),
  internal.create_admin_booking(uuid, uuid[], integer, jsonb, text, text, jsonb, uuid, jsonb, text)
  from public, anon, authenticated;


-- ===== The officer's entry point =====

-- p_booker: booker_type, institution_name, pic_name, pic_phone (E.164, any country), pic_email, notes, and
-- admin {phone_confirmed, cash_on_the_spot}. The consent is the privacy notice version the server shows, attested by
-- the caller. Refusals carry the hints of internal.create_booking.
create function public.create_admin_booking(p_package_id uuid, p_session_ids uuid[], p_pax integer, p_booker jsonb,
  p_idempotency_key text, p_consent_version text, p_quote_hash text) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if not (public.is_staff() and public.aal2()) then
    raise exception 'only an officer at AAL2 books for a group' using errcode = '42501';
  end if;
  return internal.create_booking(p_package_id, p_session_ids, p_pax, p_booker, '[]', '[]', 'pay', 'admin',
                                 p_idempotency_key, null,
                                 jsonb_build_object('version', p_consent_version, 'attested_by', auth.uid()::text),
                                 auth.uid(), '{}', p_quote_hash);
end;
$$;
revoke execute on function public.create_admin_booking(uuid, uuid[], integer, jsonb, text, text, text)
  from public, anon, service_role;
grant execute on function public.create_admin_booking(uuid, uuid[], integer, jsonb, text, text, text) to authenticated;


-- ===== Cash at the counter (A9) =====

-- The cash an RW admin takes for an officer's booking of their own RW: the whole total, once, while the hold runs. It settles
-- as a Midtrans payment does (internal.settle_payment: invoice and receipt numbers, ledger, tickets with the server's
-- QR key id, messages), as a manual payment the officer recorded. A transfer with its proof is not taken here.
create function public.mark_booking_paid_manually(p_booking_id uuid, p_method public.payment_method, p_amount bigint,
  p_key_id text, p_reference text default null, p_proof_path text default null) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  max_attempts constant integer := 99;
  previous_settings jsonb;
  booking public.bookings;
  attempt integer;
  payment public.payments;
  answer jsonb;
begin
  if not (public.is_staff() and public.aal2()) then
    raise exception 'only an officer at AAL2 records a payment' using errcode = '42501';
  end if;
  if not public.fresh_totp() then
    raise exception 'confirm with a fresh authenticator code first' using errcode = '42501', hint = 'FRESH_TOTP';
  end if;
  if p_method is distinct from 'cash' or p_proof_path is not null then
    raise exception 'only cash for an officer''s booking is recorded here' using errcode = 'P0001',
      hint = 'STATE_INVALID';
  end if;
  if length(coalesce(p_reference, '')) > 100 then
    raise exception 'a receipt reference has at most 100 characters' using errcode = '22023';
  end if;
  perform internal.take_audit_turn();
  select * into booking from public.bookings b where b.id = p_booking_id for update;
  -- A9, FR-B2B-08: cash is the RW admin's, for a booking of their own RW; the superadmin's transfers come later.
  if not found or not (public.is_admin_rw() and cardinality(booking.rw_ids) = 1
                       and public.owns_rw(booking.rw_ids[1])) then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  if booking.channel <> 'admin' or booking.status <> 'pending_payment' or booking.needs_review
     or booking.expires_at <= now()
     or exists (select 1 from public.payments p where p.booking_id = booking.id
                and p.status in ('initiated', 'pending', 'needs_review', 'settled')) then
    raise exception 'this booking takes no cash now' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if p_amount is distinct from booking.total_amount then
    raise exception 'the cash is the booking''s whole total' using errcode = 'P0001', hint = 'PRICE_MISMATCH';
  end if;

  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1', 'app.qr_key_id', p_key_id)
    || internal.document_actor(auth.uid()));
  select coalesce(max(p.attempt_no), 0) + 1 into attempt from public.payments p where p.booking_id = booking.id;
  if attempt > max_attempts then
    raise exception 'booking % has used all its payment attempts', booking.booking_code
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  insert into public.payments (booking_id, attempt_no, provider, method, status, order_id, gross_amount,
    transaction_time, manual_reference, recorded_by)
  values (booking.id, attempt, 'manual', 'cash', 'initiated', booking.booking_code || '-' || lpad(attempt::text, 2, '0'),
          booking.total_amount, now(), nullif(btrim(coalesce(p_reference, '')), ''), auth.uid())
  returning * into payment;
  answer := internal.settle_payment(booking, payment, jsonb_build_object('source', 'cash'), 'admin');
  perform internal.restore_settings(previous_settings);
  return answer || jsonb_build_object('order_id', payment.order_id);
end;
$$;
revoke execute on function public.mark_booking_paid_manually(uuid, public.payment_method, bigint, text, text, text)
  from public, anon, service_role;
grant execute on function public.mark_booking_paid_manually(uuid, public.payment_method, bigint, text, text, text)
  to authenticated;
