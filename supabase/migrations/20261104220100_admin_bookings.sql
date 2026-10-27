-- Task P4.3.10 with the admin booking path of P4.3.08 (docs/PRD.md §13.1 A9, A13, A21, A22, A23; BOOK-05, BOOK-11,
-- AZ-14; decision of 2026-10-26 on the split): an officer registers a walk-in group, or a group from abroad.
--
--   public.create_admin_booking    The officer's entry point, at AAL2. The actor is auth.uid(), never a parameter, and
--                                  it reaches internal.create_booking with p_channel = 'admin'.
--   internal.create_booking        Replaces the 20261022140000 version: the web path is unchanged; 'admin' goes to
--                                  internal.create_admin_booking.
--   internal.create_admin_booking  An officer of every RW the package visits, or the superadmin; no OTP; the same
--                                  quote, quote hash (PRICE_MISMATCH) and quota reservation as the web; created_by set.
--                                  The admin path keeps none of the web's unpaid caps: staff at AAL2 are the trust
--                                  model there, and every booking names its officer.
--   internal.booking_sessions      One session check for both paths, with the earliest time each allows (the 2-argument
--                                  web form keeps its lead time).
--   public.send_admin_booking_link The PIC's pay link, when the officer does not take the cash after all.
--   public.mark_booking_paid_manually  An RW admin's cash for an officer's booking of their own RW, at AAL2 with a fresh
--                                  code (A9, A23). The superadmin's transfer with its proof and dual control comes with
--                                  the rest of P4.3.08.
--
-- The owner's decisions, each in one function so that it changes in one place:
--   A21 internal.admin_phone_confirmed: the officer ticks "Nomor sudah dicek dengan rombongan", which sets
--       phone_verified_at (booking_events admin_phone_confirmed and an audit row). Unticked, the number gets no WhatsApp
--       (enqueue_notification needs phone_verified_at) and the group hears by email only.
--   A22 internal.booking_sessions with p_earliest_end: a session of today is booked until it ends
--       (booking.max_advance_days, the package's validity and the quota still apply). The officer attests the PIC's
--       consent to the privacy notice (p_consent.attested_by).
--   A23 internal.admin_hold_deadline and mark_booking_paid_manually: a booking of one RW may take cash, by an RW admin
--       of that RW, until 23:59 WIB of its visit day, so its hold runs until then; a combo is paid through its link and
--       keeps the institution hold, ending at the first session's start. Cash after 23:59 is refused; the superadmin
--       settles such a case through a finance adjustment.
-- An officer's booking takes no add-ons or participant list yet; the PIC adds the list later on the manage page.


-- ===== A22: one session check, with the earliest time each path allows =====

create function internal.booking_sessions(p_package_id uuid, p_session_ids uuid[], p_earliest_start timestamptz,
  p_earliest_end timestamptz)
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

  -- The time the caller allows: the web's lead time before the start, or an officer's session until its end.
  if p_earliest_start is not null
     and exists (select 1 from public.visit_sessions s where s.id = any (p_session_ids)
                 and (s.session_date + s.start_time) at time zone 'Asia/Jakarta' < p_earliest_start) then
    raise exception 'a session is booked at least % hours before it starts',
      round(extract(epoch from p_earliest_start - now()) / 3600)::integer
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if p_earliest_end is not null
     and exists (select 1 from public.visit_sessions s where s.id = any (p_session_ids)
                 and (s.session_date + s.end_time) at time zone 'Asia/Jakarta' <= p_earliest_end) then
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

-- Replaces the 20261022120000 version: the web's lead time, through the shared check above.
create or replace function internal.booking_sessions(p_package_id uuid, p_session_ids uuid[])
  returns table (leg_order smallint, rw_id smallint, session_id uuid, session_date date, starts_at timestamptz)
  language sql stable
  set search_path = ''
as $$
  select * from internal.booking_sessions(p_package_id, p_session_ids,
    now() + make_interval(hours => (select (s.value #>> '{}')::integer from public.site_settings s
                                    where s.key = 'booking.min_lead_hours')),
    null);
$$;


-- ===== A23: how long an officer's hold lasts =====

-- The end of the visit day in Semarang, the last moment cash is taken for a booking of one RW.
create function internal.cash_deadline(p_visit_day date) returns timestamptz
  language sql immutable
  set search_path = ''
as $$
  select (p_visit_day + time '23:59') at time zone 'Asia/Jakarta';
$$;

create function internal.admin_hold_deadline(p_rw_ids smallint[], p_last_day date, p_first_session_start timestamptz)
  returns timestamptz
  language plpgsql stable
  set search_path = ''
as $$
begin
  if cardinality(p_rw_ids) = 1 then
    return internal.cash_deadline(p_last_day);
  end if;
  return least(now() + make_interval(hours => (select (s.value #>> '{}')::integer from public.site_settings s
                                               where s.key = 'booking.hold_hours_institution')),
               p_first_session_start);
end;
$$;


-- ===== A21: the officer's check of the number =====

create function internal.admin_phone_confirmed(p_booker jsonb) returns boolean
  language sql immutable
  set search_path = ''
as $$
  select coalesce(p_booker #>> '{admin,phone_confirmed}', 'false') = 'true';
$$;


-- ===== Who books for a group =====

-- An active superadmin, or an active RW admin of every RW the package visits; and only an RW admin of a package of one
-- RW takes the cash on the spot (A9, A23).
create function internal.require_admin_booker(p_actor_id uuid, p_rw_ids smallint[], p_is_cash_on_the_spot boolean)
  returns void
  language plpgsql stable
  set search_path = ''
as $$
declare
  actor_role public.app_role;
begin
  select p.role into actor_role from public.profiles p
  where p.id = p_actor_id and p.is_active
    and (p.role = 'superadmin'
         or (p.role = 'admin_rw' and p.rw_id is not null and coalesce(p_rw_ids <@ array[p.rw_id], false)));
  if actor_role is null then
    raise exception 'only an officer of the package''s RW books for a group' using errcode = '42501';
  end if;
  if p_is_cash_on_the_spot and (actor_role <> 'admin_rw' or cardinality(p_rw_ids) <> 1) then
    raise exception 'only an RW admin takes cash, for a package of their own RW' using errcode = '42501';
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

-- The PIC's pay link by WhatsApp (when the number was checked) and email; enqueue_notification's key sends it once.
-- Answers how many messages it queued (delta review of PR #91, L-5): enqueue_notification also answers the id of a
-- message its dedupe key already holds, so the rows are counted before and after.
create function internal.queue_admin_pay_link(p_booking_id uuid) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  queued_before integer := (select count(*) from public.notifications n
                            where n.booking_id = p_booking_id and n.template = 'booking_created');
begin
  perform internal.enqueue_notification(p_booking_id, 'booking_created', 'whatsapp', '{"link_scope": "manage"}');
  perform internal.enqueue_notification(p_booking_id, 'booking_created', 'email', '{"link_scope": "manage"}');
  return (select count(*) from public.notifications n
          where n.booking_id = p_booking_id and n.template = 'booking_created') - queued_before;
end;
$$;

-- The events and messages of a new officer's booking: who made it, who checked the number (A21), and the pay link
-- unless the officer takes the cash at once, when the ticket follows instead (or send_admin_booking_link, if not).
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
    perform internal.queue_admin_pay_link(p_booking.id);
  end if;
end;
$$;

-- The reply of internal.create_booking, with what the cash step asks for: the total, and when the first session starts
-- (after it, the cash counts the group in, A23 addendum).
create function internal.admin_booking_reply(p_result text, p_booking public.bookings) returns jsonb
  language sql stable
  set search_path = ''
as $$
  select internal.booking_reply(p_result, p_booking) || jsonb_build_object('total_amount', p_booking.total_amount,
    'first_starts_at', (select min((s.session_date + s.start_time) at time zone 'Asia/Jakarta')
                          from public.booking_legs l join public.visit_sessions s on s.id = l.visit_session_id
                          where l.booking_id = p_booking.id));
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
  -- A hold with less than this left cannot be paid through the link (create_payment_attempt).
  min_hold_left constant interval := interval '5 minutes';
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
  perform internal.require_admin_booker(p_actor_id,
    (select array_agg(l.rw_id order by l.rw_id) from public.tour_package_legs l where l.package_id = p_package_id),
    is_cash_on_the_spot);
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
      return internal.admin_booking_reply('existing', booking);
    end if;
  end if;

  select * into tour_package from public.tour_packages p where p.id = p_package_id and p.status = 'published';
  if not found then
    raise exception 'package % is not on sale', p_package_id using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  select array_agg(s.rw_id order by s.leg_order) as rw_ids, array_agg(s.session_id order by s.leg_order) as ids,
         min(s.starts_at) as first_start, min(s.session_date) as first_day, max(s.session_date) as last_day
    into sessions
  from internal.booking_sessions(p_package_id, p_session_ids, null, now()) as s;
  perform internal.check_booking_size(p_pax, '[]');
  deadline := internal.admin_hold_deadline(sessions.rw_ids, sessions.last_day, sessions.first_start);
  if not is_cash_on_the_spot and deadline < now() + min_hold_left then
    raise exception 'too little of the hold would be left to pay' using errcode = 'P0001', hint = 'STATE_INVALID';
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
  return internal.admin_booking_reply('created', booking);
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

revoke execute on function internal.booking_sessions(uuid, uuid[], timestamptz, timestamptz),
  internal.cash_deadline(date),
  internal.admin_hold_deadline(smallint[], date, timestamptz),
  internal.admin_phone_confirmed(jsonb),
  internal.require_admin_booker(uuid, smallint[], boolean),
  internal.insert_admin_booking(public.tour_packages, smallint[], date, date, timestamptz, jsonb, integer, jsonb, text,
                                jsonb, uuid, jsonb),
  internal.queue_admin_pay_link(uuid),
  internal.record_admin_booking(public.bookings, uuid, integer, boolean),
  internal.admin_booking_reply(text, public.bookings),
  internal.create_admin_booking(uuid, uuid[], integer, jsonb, text, text, jsonb, uuid, jsonb, text)
  from public, anon, authenticated;


-- ===== The officer's entry points =====

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

-- The officer leaves the cash step without taking the cash: the PIC gets the pay link, once.
create function public.send_admin_booking_link(p_booking_id uuid) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  booking public.bookings;
begin
  if not (public.is_staff() and public.aal2()) then
    raise exception 'only an officer at AAL2 sends a pay link' using errcode = '42501';
  end if;
  perform internal.take_audit_turn();
  select * into booking from public.bookings b where b.id = p_booking_id for update;
  -- Every RW of the booking is the officer's (delta review of PR #91, L-5); a combo is the superadmin's.
  if not found or not (public.is_superadmin()
                       or (public.is_admin_rw() and booking.rw_ids <@ array[public.app_rw_id()])) then
    raise exception 'booking % is not in this officer''s RW', p_booking_id using errcode = 'P0002';
  end if;
  if booking.channel <> 'admin' or booking.status <> 'pending_payment' or booking.expires_at <= now() then
    raise exception 'this booking takes no pay link now' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1')
    || internal.document_actor(auth.uid()));
  if internal.queue_admin_pay_link(booking.id) > 0 then
    insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason)
    values (booking.id, booking.status, booking.status, 'admin', auth.uid(), 'admin_pay_link_sent');
  end if;
  perform internal.restore_settings(previous_settings);
end;
$$;
revoke execute on function public.send_admin_booking_link(uuid) from public, anon, service_role;
grant execute on function public.send_admin_booking_link(uuid) to authenticated;


-- ===== L3: the QR key ids a ticket may be signed with =====

-- The server names the kid it signs with (QR_SIGNING_ACTIVE_KID); a call from an officer's session is held against
-- this list, which the key rotation runbook extends before the server moves to a new kid.
insert into public.site_settings (key, value, is_public, description) values
  ('qr.signing_kids', '["k1"]', false, 'Kid kunci tanda tangan QR yang boleh dipakai tiket baru')
on conflict (key) do nothing;


-- ===== A23 addendum: cash after the session started (delta review of PR #91, L-3) =====

create function internal.session_has_started(p_booking_id uuid) returns boolean
  language sql stable
  set search_path = ''
as $$
  select coalesce(min((s.session_date + s.start_time) at time zone 'Asia/Jakarta') <= now(), false)
  from public.booking_legs l join public.visit_sessions s on s.id = l.visit_session_id
  where l.booking_id = p_booking_id;
$$;

-- The check-in of the scanner's manual path (note_admission, admit_group, record_scan) for each ticket the cash just
-- issued: the group is at the counter. Delta review of PR #91, L-A (A23): cash is taken until 23:59 WIB, so a group
-- past its session's check-in window is let in as an override with the reason cash_after_session, audited as
-- check_in_override and kept on the scan row; any other verdict refuses the cash. L-B: the WhatsApp ticket message
-- would read as a ticket still to use, so it is not sent; the email keeps its view link to the receipt.
create function internal.check_in_at_cash(p_booking_id uuid, p_attendee_count integer) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  override_reason constant text := 'cash_after_session';
  ticket record;
  verdict public.scan_result;
begin
  for ticket in select t.id from public.tickets_qr t where t.booking_id = p_booking_id and t.status = 'issued'
                order by t.id loop
    verdict := internal.ticket_verdict(ticket.id, 'manual', false);
    if verdict not in ('ok', 'outside_window') then
      raise exception 'the ticket of this cash cannot be checked in: %', verdict
        using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
    perform internal.note_admission(ticket.id, 'manual', verdict, override_reason);
    perform internal.admit_group(ticket.id, p_attendee_count, 'Hadir saat pembayaran tunai di loket');
    perform internal.record_scan(gen_random_uuid(), ticket.id, 'check_in', 'ok', 'manual', p_attendee_count,
                                 case when verdict = 'outside_window' then override_reason end, null, '{}'::jsonb, null);
  end loop;
  update public.notifications n set status = 'cancelled', last_error_code = 'checked_in_at_cash'
  where n.booking_id = p_booking_id and n.template = 'payment_received_ticket' and n.channel = 'whatsapp'
    and n.status = 'queued';
end;
$$;
revoke execute on function internal.session_has_started(uuid), internal.check_in_at_cash(uuid, integer)
  from public, anon, authenticated;


-- ===== A9, A23: cash at the counter =====

-- The cash an RW admin takes for an officer's booking of their own RW: the whole total, once, while the hold runs and
-- at the latest by 23:59 WIB of the visit day. It settles as a Midtrans payment does (internal.settle_payment: invoice
-- and receipt numbers, ledger, tickets, messages), as a manual payment the officer recorded, who is not told of it
-- again by admin_new_paid_booking. An open Midtrans order is ended by the server first (src/server/services); while
-- one is open, the cash is refused.
create function public.mark_booking_paid_manually(p_booking_id uuid, p_method public.payment_method, p_amount bigint,
  p_key_id text, p_reference text default null, p_proof_path text default null, p_attendee_count integer default null)
  returns jsonb
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
  if not exists (select 1 from public.site_settings s
                 where s.key = 'qr.signing_kids' and s.value ? coalesce(p_key_id, '')) then
    raise exception 'the QR key id is not one tickets are signed with'
      using errcode = 'P0001', hint = 'QR_KEY_UNKNOWN';
  end if;
  perform internal.take_audit_turn();
  select * into booking from public.bookings b where b.id = p_booking_id for update;
  -- A9: cash is the RW admin's, for a booking of their own RW.
  if not found or not (public.is_admin_rw() and cardinality(booking.rw_ids) = 1
                       and public.owns_rw(booking.rw_ids[1])) then
    raise exception 'booking % is not one this RW admin takes cash for', p_booking_id using errcode = 'P0002';
  end if;
  if booking.channel <> 'admin' or booking.status <> 'pending_payment' or booking.needs_review
     or booking.expires_at <= now() or now() >= internal.cash_deadline(booking.visit_date_end)
     or exists (select 1 from public.payments p where p.booking_id = booking.id
                and p.status in ('initiated', 'pending', 'needs_review', 'settled')) then
    raise exception 'this booking takes no cash now' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if p_amount is distinct from booking.total_amount then
    raise exception 'the cash is the booking''s whole total' using errcode = 'P0001', hint = 'PRICE_MISMATCH';
  end if;
  -- A23 addendum (delta review of PR #91, L-3): cash after the session started is taken from a group that came, so the
  -- officer counts it in; before, nobody is counted in yet.
  if (internal.session_has_started(booking.id)) <> (p_attendee_count is not null) then
    raise exception 'cash after the session started counts the group in, and only then'
      using errcode = 'P0001', hint = 'ATTENDANCE_REQUIRED';
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
  if p_attendee_count is not null and answer ->> 'result' = 'applied' then
    perform internal.check_in_at_cash(booking.id, p_attendee_count);
  end if;
  -- The officer who took the cash needs no email that the booking is paid (internal.notify_staff's key).
  update public.notifications n set status = 'cancelled', last_error_code = 'recorded_by_recipient'
  where n.dedupe_key = concat_ws(':', 'booking', booking.id, 'admin_new_paid_booking', 'email', auth.uid())
    and n.status = 'queued';
  perform internal.restore_settings(previous_settings);
  return answer || jsonb_build_object('order_id', payment.order_id);
end;
$$;
revoke execute on function public.mark_booking_paid_manually(uuid, public.payment_method, bigint, text, text, text,
  integer) from public, anon, service_role;
grant execute on function public.mark_booking_paid_manually(uuid, public.payment_method, bigint, text, text, text,
  integer) to authenticated;


-- Delta review of PR #91, L-1: payment-service.ts ends the PIC's open Midtrans order before an RW admin takes the cash
-- and closes it here as expired, with the officer as its actor.
create function internal.close_attempt_for_cash(p_payment_id uuid, p_actor_id uuid) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  closed public.payments;
begin
  perform internal.require_server_caller('close_attempt_for_cash');
  perform internal.take_audit_turn();
  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1')
    || internal.document_actor(p_actor_id));
  update public.payments set status = 'expired'
  where id = p_payment_id and status in ('initiated', 'pending')
  returning * into closed;
  if closed.id is not null then
    insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
    select b.id, b.status, b.status, 'admin', p_actor_id, 'payment_expired_for_cash',
           jsonb_build_object('order_id', closed.order_id)
    from public.bookings b where b.id = closed.booking_id;
  end if;
  perform internal.restore_settings(previous_settings);
end;
$$;
revoke execute on function internal.close_attempt_for_cash(uuid, uuid) from public, anon, authenticated;

create function public.svc_close_attempt_for_cash(p_payment_id uuid, p_actor_id uuid) returns void
  language sql security definer
  set search_path = ''
as $$ select internal.close_attempt_for_cash(p_payment_id, p_actor_id); $$;
revoke execute on function public.svc_close_attempt_for_cash(uuid, uuid) from public, anon, authenticated;
grant execute on function public.svc_close_attempt_for_cash(uuid, uuid) to service_role;


-- ===== A23 addendum: an officer's long hold (delta review of PR #91, L-2) =====

-- Replaces the 20261024100200 version. Two changes for an officer's hold, which A23 runs until 23:59 WIB of the visit
-- day: its payment reminder comes six hours before the first session starts rather than before the deadline, and a
-- hold still unpaid seven days after it was made raises one medium alert, admin_hold_unpaid_long, for the staff to
-- follow up. Everything else is unchanged.
create or replace function internal.payments_housekeeping() returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  reminder_ahead constant interval := interval '6 hours';
  unpaid_too_long constant interval := interval '7 days';
  previous_settings jsonb;
  orphan record;
  hold record;
  suspended integer := 0;
  reminded integer := 0;
begin
  perform internal.require_server_caller('payments_housekeeping');
  perform internal.take_audit_turn();
  previous_settings := internal.begin_scheduled_job();
  for orphan in
    select distinct t.booking_id from public.tickets_qr t join public.bookings b on b.id = t.booking_id
    where t.status = 'issued' and t.valid_until > now() and b.status not in ('paid', 'checked_in')
    order by t.booking_id
  loop
    suspended := suspended + internal.suspend_booking_tickets(orphan.booking_id, 'booking_not_paid');
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('tickets_without_payment', 'critical', 'tickets_without_payment:' || orphan.booking_id,
            'Tiket masih berlaku untuk pesanan yang tidak lunas; tiketnya ditangguhkan',
            jsonb_build_object('booking_id', orphan.booking_id))
    on conflict (fingerprint) where acknowledged_at is null do update
    set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1, notified_at = null;
  end loop;

  for hold in
    select b.id from public.bookings b
    cross join lateral (select min((s.session_date + s.start_time) at time zone 'Asia/Jakarta') as first_start
                        from public.booking_legs l join public.visit_sessions s on s.id = l.visit_session_id
                        where l.booking_id = b.id) as legs
    cross join lateral (select case when b.channel = 'admin' then least(b.expires_at, legs.first_start)
                                    else b.expires_at end as remind_by) as due
    where b.status = 'pending_payment' and not b.needs_review
      and (b.channel = 'admin' or b.booker_type in ('school', 'university', 'government', 'company'))
      and b.expires_at > now() and due.remind_by > now() and due.remind_by <= now() + reminder_ahead
      and not exists (select 1 from public.notifications n
                      where n.booking_id = b.id and n.template = 'payment_reminder')
      -- Delta review of PR #91, L-C: an officer's hold is reminded only after its pay link went out.
      and (b.channel <> 'admin'
           or exists (select 1 from public.notifications n
                      where n.booking_id = b.id and n.template = 'booking_created'
                        and n.status in ('sent', 'delivered', 'read')))
    order by due.remind_by
  loop
    perform internal.enqueue_notification(hold.id, 'payment_reminder', 'whatsapp', '{"link_scope": "pay"}');
    perform internal.enqueue_notification(hold.id, 'payment_reminder', 'email', '{"link_scope": "pay"}');
    reminded := reminded + 1;
  end loop;
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  select 'admin_hold_unpaid_long', 'medium', 'admin_hold_unpaid_long:' || b.id,
         'Pemesanan petugas belum dibayar lebih dari 7 hari: ' || b.booking_code,
         jsonb_build_object('booking_id', b.id, 'rw_ids', b.rw_ids, 'created_by', b.created_by)
  from public.bookings b
  where b.channel = 'admin' and b.status = 'pending_payment' and b.created_at < now() - unpaid_too_long
    and not exists (select 1 from public.security_alerts a where a.fingerprint = 'admin_hold_unpaid_long:' || b.id)
  on conflict (fingerprint) where acknowledged_at is null do nothing;
  -- L-D: the alert of a booking that is no longer waiting for its payment closes by itself.
  update public.security_alerts a
  set acknowledged_at = now(), details = a.details || jsonb_build_object('closed', 'no_longer_unpaid')
  from public.bookings b
  where a.rule = 'admin_hold_unpaid_long' and a.acknowledged_at is null
    and a.fingerprint = 'admin_hold_unpaid_long:' || b.id and b.status <> 'pending_payment';
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('suspended', suspended, 'reminded', reminded);
end;
$$;


-- ===== One Snap page lives 24 hours at most (delta review of PR #91, M-A) =====

-- Replaces the 20261024080000 version: payments.expiry_time is the attempt's page expiry, the hold's deadline capped
-- at 24 hours as src/lib/midtrans/snap.ts caps Snap's expiry.duration, so startPayment sees a pending page that has
-- lapsed and replaces it. Everything else is unchanged.
create or replace function internal.create_payment_attempt(p_booking_id uuid, p_replaces uuid, p_actor_id uuid) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  min_hold_left constant interval := interval '5 minutes';
  max_attempts constant integer := 99;   -- the two digits of order_id
  snap_page_lifetime constant interval := interval '24 hours';
  previous_settings jsonb;
  booking public.bookings;
  open_payment public.payments;
  attempt integer;
  payment public.payments;
begin
  perform internal.require_server_caller('create_payment_attempt');
  -- The audit chain's turn before the booking's row lock, the one order every writer keeps (BOOK-01).
  perform internal.take_audit_turn();
  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1')
    || internal.document_actor(p_actor_id));

  select * into booking from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  if booking.needs_review then
    raise exception 'a booking under review takes no new payment' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if booking.status = 'quoted' then
    perform internal.start_quoted_hold(booking, p_actor_id);
    select * into booking from public.bookings b where b.id = p_booking_id;
  elsif booking.status <> 'pending_payment' then
    raise exception 'a % booking takes no payment', booking.status using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if booking.expires_at - now() < min_hold_left then
    raise exception 'less than five minutes of the hold are left' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  select * into open_payment from public.payments p
  where p.booking_id = booking.id and p.status in ('initiated', 'pending', 'needs_review') for update;
  if found then
    if open_payment.status = 'needs_review' or open_payment.id is distinct from p_replaces then
      raise exception 'booking % has an open payment attempt', booking.booking_code
        using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
    update public.payments set status = 'expired' where id = open_payment.id;
  end if;

  select coalesce(max(p.attempt_no), 0) + 1 into attempt from public.payments p where p.booking_id = booking.id;
  if attempt > max_attempts then
    raise exception 'booking % has used all its payment attempts', booking.booking_code
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  insert into public.payments (booking_id, attempt_no, provider, status, order_id, gross_amount, expiry_time)
  values (booking.id, attempt, 'midtrans', 'initiated', booking.booking_code || '-' || lpad(attempt::text, 2, '0'),
          booking.total_amount, least(booking.expires_at, now() + snap_page_lifetime))
  returning * into payment;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, reason, payload)
  values (booking.id, booking.status, booking.status, case when p_actor_id is null then 'visitor' else 'admin' end,
          p_actor_id, 'payment_attempt', jsonb_build_object('order_id', payment.order_id));

  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('payment_id', payment.id, 'order_id', payment.order_id,
                            'gross_amount', payment.gross_amount, 'expires_at', booking.expires_at);
end;
$$;
