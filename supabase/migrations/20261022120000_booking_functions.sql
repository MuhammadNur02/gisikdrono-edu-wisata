-- The booking engine's core (Task P3.4.01, P3.4.02; docs/PRD.md §9.2; docs/Security.md §4.1–§4.4): internal.create_booking
-- and the steps it is made of. Decisions of 2026-10-22 on the sources that disagreed: a hold writes no payment attempt
-- (Q1), a quotation booking needs the verified contact too and queues nothing (Q2), a hold beyond half a session's
-- capacity is refused as pay_to_confirm with nothing written (Q3), a large group raises an info alert instead of a review
-- (Q4), an institution's 24-hour hold wins over the shortening for large groups (Q5), the summary's quote travels as a
-- hash (Q6), and an email code stands in for the phone only while WhatsApp codes are degraded (Q7). The independent
-- review of PR #26 added the one lock order (M1), the proven contact as the only identity (M2) and the checks of L1–L5.


-- ===== One lock order: the audit chain first (independent review of PR #26, M1) =====

-- Every audited write appends to the audit hash chain, and internal.chain_append holds the chain's advisory lock until
-- the transaction ends. A transaction that locks booking, leg or session rows and audits afterwards can therefore wait
-- for the chain while the chain's holder waits for those rows. So the chain comes first for every writer of these
-- tables: a function that locks their rows with SELECT ... FOR UPDATE calls this before it does, and every other write
-- takes it through the statement triggers below. Taking it again in the same transaction waits for nothing.
create function internal.take_audit_turn() returns void
  language plpgsql
  set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('chain:audit_logs'));
end;
$$;

-- A statement trigger fires before its statement locks a single row.
create function internal.take_audit_turn_first() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  perform internal.take_audit_turn();
  return null;
end;
$$;

revoke execute on function internal.take_audit_turn(), internal.take_audit_turn_first() from public, anon, authenticated;

create trigger take_audit_turn before insert or update or delete on public.bookings
  for each statement execute function internal.take_audit_turn_first();
create trigger take_audit_turn before insert or update or delete on public.booking_legs
  for each statement execute function internal.take_audit_turn_first();
create trigger take_audit_turn before insert or update or delete on public.visit_sessions
  for each statement execute function internal.take_audit_turn_first();


-- ===== Codes (BOOK-10, GUEST-01) =====

-- p_symbols Crockford base32 symbols from the first p_symbols * 5 bits of p_bytes, most significant first. The alphabet
-- leaves out I, L, O and U, so a code read aloud or typed from a ticket is never ambiguous.
create function internal.crockford_base32(p_bytes bytea, p_symbols integer) returns text
  language plpgsql immutable
  set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  bits_per_symbol constant integer := 5;
  encoded text := '';
  symbol integer;
  bit_index integer;
begin
  if p_bytes is null or p_symbols is null or p_symbols < 1 or length(p_bytes) * 8 < p_symbols * bits_per_symbol then
    raise exception '% symbols need % bits', p_symbols, p_symbols * bits_per_symbol using errcode = '22023';
  end if;
  for symbol_index in 0 .. p_symbols - 1 loop
    symbol := 0;
    for bit_offset in 0 .. bits_per_symbol - 1 loop
      bit_index := symbol_index * bits_per_symbol + bit_offset;
      -- get_bit numbers the bits of a byte from its least significant end.
      symbol := symbol * 2 + get_bit(p_bytes, (bit_index / 8) * 8 + 7 - bit_index % 8);
    end loop;
    encoded := encoded || substr(alphabet, symbol + 1, 1);
  end loop;
  return encoded;
end;
$$;

-- A booking code no booking has yet: GSK- and 40 random bits (decision of 2026-10-21, review of PR #19). A repeat is
-- rare enough that drawing again costs nothing; bookings_booking_code_key still refuses one two transactions draw at
-- the same moment.
create function internal.new_booking_code() returns text
  language plpgsql volatile
  set search_path = ''
as $$
declare
  random_bytes constant integer := 5;
  symbols constant integer := 8;
  code text;
begin
  loop
    code := 'GSK-' || internal.crockford_base32(extensions.gen_random_bytes(random_bytes), symbols);
    exit when not exists (select 1 from public.bookings b where b.booking_code = code);
  end loop;
  return code;
end;
$$;


-- ===== The quote (PAY-03) =====

-- The lines of a booking priced from the catalogue rows, exactly as computeBookingQuote prices them in
-- src/lib/pricing/compute-booking-quote.ts: a flat price buys the group as one unit, a per-person price follows the tier
-- that covers the group, and an add-on is a product on sale as one, from an active vendor of an RW the package visits
-- (p_rw_ids), in a quantity its vendor takes. Add-on lines follow the package line in product-id order.
create function internal.booking_quote(p_package_id uuid, p_pax integer, p_addons jsonb, p_rw_ids smallint[])
  returns jsonb
  language plpgsql stable
  set search_path = ''
as $$
declare
  tour_package public.tour_packages;
  tier public.tour_package_price_tiers;
  unit_price bigint;
  quantity integer;
  addon_lines jsonb := '[]';
  addons_total bigint := 0;
  requested record;
  product public.products_umkm;
begin
  select * into tour_package from public.tour_packages p where p.id = p_package_id;
  if not found then
    raise exception 'package % does not exist', p_package_id using errcode = 'P0002';
  end if;
  if p_pax is null or p_pax < tour_package.min_pax or p_pax > tour_package.max_pax then
    raise exception 'the package takes % to % visitors', tour_package.min_pax, tour_package.max_pax
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  if tour_package.pricing_basis = 'flat_group' then
    unit_price := tour_package.flat_price;
    quantity := 1;
  else
    select * into tier from public.tour_package_price_tiers t
    where t.package_id = p_package_id and t.min_pax <= p_pax and (t.max_pax is null or p_pax <= t.max_pax);
    unit_price := coalesce(tier.price_per_pax, tour_package.price_per_pax);
    quantity := p_pax;
  end if;

  if (select count(*) from jsonb_array_elements(coalesce(p_addons, '[]')))
     <> (select count(distinct a ->> 'product_id') from jsonb_array_elements(coalesce(p_addons, '[]')) as a) then
    raise exception 'an add-on is listed once' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  for requested in
    select (a ->> 'product_id')::uuid as product_id, (a ->> 'qty')::integer as qty
    from jsonb_array_elements(coalesce(p_addons, '[]')) as a
    order by a ->> 'product_id' collate "C"
  loop
    select pr.* into product from public.products_umkm pr
    join public.umkm_vendors v on v.id = pr.vendor_id and v.is_active
    where pr.id = requested.product_id and pr.status = 'published' and pr.is_addon_eligible and pr.is_available
      and pr.rw_id = any (p_rw_ids);
    if not found then
      raise exception 'product % is not on sale as an add-on for this package', requested.product_id
        using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
    if requested.qty is null or requested.qty < product.min_order_qty
       or (product.max_order_qty is not null and requested.qty > product.max_order_qty) then
      raise exception 'product % is ordered % to % at a time', requested.product_id, product.min_order_qty,
        coalesce(product.max_order_qty::text, 'any number') using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
    addon_lines := addon_lines || jsonb_build_object('kind', 'addon', 'id', product.id, 'unit_price', product.price,
      'quantity', requested.qty, 'line_total', product.price * requested.qty);
    addons_total := addons_total + product.price * requested.qty;
  end loop;

  if unit_price * quantity + addons_total <= 0 then
    raise exception 'a booking costs more than zero rupiah' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return jsonb_build_object(
    'lines', jsonb_build_array(jsonb_build_object('kind', 'package', 'id', tour_package.id, 'unit_price', unit_price,
                                                  'quantity', quantity, 'line_total', unit_price * quantity))
             || addon_lines,
    'tier', case when tier.id is null then null
                 else jsonb_build_object('min_pax', tier.min_pax, 'max_pax', tier.max_pax,
                                         'price_per_pax', tier.price_per_pax) end,
    'subtotal_package', unit_price * quantity,
    'subtotal_addons', addons_total,
    'total', unit_price * quantity + addons_total);
end;
$$;

-- The fingerprint of a quote the visitor saw (decision of 2026-10-22, Q6): SHA-256, in hex, of one line per priced
-- line, `kind|id|unit_price|quantity|line_total`, the package line first and the add-ons in product-id order, then
-- `total|<total>`. src/lib/pricing/quote-hash.ts computes the same text; both tests pin the same hex.
create function internal.booking_quote_hash(p_quote jsonb) returns text
  language sql immutable
  set search_path = ''
as $$
  select encode(extensions.digest(
    (select string_agg(concat_ws('|', l ->> 'kind', l ->> 'id', l ->> 'unit_price', l ->> 'quantity',
                                 l ->> 'line_total'), E'\n'
                       order by (case l ->> 'kind' when 'package' then '0' else '1' || (l ->> 'id') end) collate "C")
     from jsonb_array_elements(p_quote -> 'lines') as l)
    || E'\n' || 'total|' || (p_quote ->> 'total'),
    'sha256'), 'hex');
$$;


-- ===== Holds (BOOK-02, BOOK-13, BOOK-14) =====

-- When an unpaid hold lapses (decision of 2026-10-22, Q5): a school, university, government office or company gets
-- booking.hold_hours_institution, since its treasurer pays through its own approvals; any other booker gets
-- booking.hold_minutes_individual, or thirty minutes for more than twenty visitors, so a large hold that will not be
-- paid frees its seats soon. No hold runs past an hour before the first session starts.
create function internal.hold_deadline(p_booker_type public.booker_type, p_pax integer,
  p_first_session_start timestamptz) returns timestamptz
  language plpgsql stable
  set search_path = ''
as $$
declare
  large_group_pax constant integer := 20;
  large_group_hold constant interval := interval '30 minutes';
  before_the_session constant interval := interval '1 hour';
  hold interval;
begin
  if p_booker_type in ('school', 'university', 'government', 'company') then
    hold := make_interval(hours => (select (s.value #>> '{}')::integer from public.site_settings s
                                    where s.key = 'booking.hold_hours_institution'));
  elsif p_pax > large_group_pax then
    hold := large_group_hold;
  else
    hold := make_interval(mins => (select (s.value #>> '{}')::integer from public.site_settings s
                                   where s.key = 'booking.hold_minutes_individual'));
  end if;
  return least(now() + hold, p_first_session_start - before_the_session);
end;
$$;

-- Whether WhatsApp codes go out: the soft breaker of internal.issue_phone_otp, 500 codes a day, read without raising
-- its alerts. While it holds, an email code proves only the address (decision of 2026-10-22, Q7); booking_quote.sql pins
-- the two to the same count.
create function internal.whatsapp_otp_open() returns boolean
  language plpgsql stable
  set search_path = ''
as $$
declare
  breaker constant integer := 500;
begin
  return internal.setting_is_on('whatsapp_enabled')
     and (select count(*) from public.guest_otps o where o.phone is not null and o.created_at > now() - interval '1 day')
         < breaker;
end;
$$;

-- The sessions of a booking matched to the package's legs, one session for each RW it visits (review note I1; at most
-- MAX_PACKAGE_LEGS of src/config/booking.ts), each open, of an RW that is online, on a day the package is sold for, and
-- bookable between booking.min_lead_hours and booking.max_advance_days. Returns them in leg order.
create function internal.booking_sessions(p_package_id uuid, p_session_ids uuid[])
  returns table (leg_order smallint, rw_id smallint, session_id uuid, session_date date, starts_at timestamptz)
  language plpgsql stable
  set search_path = ''
as $$
declare
  max_legs constant integer := 4;
  min_lead_hours integer := (select (s.value #>> '{}')::integer from public.site_settings s
                             where s.key = 'booking.min_lead_hours');
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

  if exists (select 1 from public.visit_sessions s where s.id = any (p_session_ids)
             and (s.session_date + s.start_time) at time zone 'Asia/Jakarta'
                 < now() + make_interval(hours => min_lead_hours)) then
    raise exception 'a session is booked at least % hours before it starts', min_lead_hours
      using errcode = 'P0001', hint = 'STATE_INVALID';
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

-- What the OTP a booking presents proves (BOOK-12, GUEST-08; decision of 2026-10-22, Q7): 'whatsapp' when it verified
-- this PIC's number, 'email' when it verified this PIC's address while WhatsApp codes are degraded, else a refusal. The
-- code is for booking_phone, verified within ten minutes (docs/Security.md §4.1 point 3) and not spent yet; its row stays
-- locked until the booking that spends it commits. Only a code no booking owns is locked: verify_phone_otp marks the
-- number of the booking a code belongs to while it holds that code's row, so this never waits for such a row while it
-- holds the audit chain.
create function internal.verified_booking_contact(p_otp_id uuid, p_phone text, p_email text) returns text
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
    if otp.phone is null and lower(otp.email::text) = p_email and not internal.whatsapp_otp_open() then
      return 'email';
    end if;
  end if;
  raise exception 'the PIC''s contact is not verified' using errcode = 'P0001', hint = 'STATE_INVALID';
end;
$$;

-- Whether this hold would leave more than half of any of its sessions in unpaid holds (BOOK-13; decision of 2026-10-22,
-- Q3). The sessions are locked in id order, the order every quota function takes them in, so two holds for one session
-- count each other.
create function internal.over_unpaid_share(p_session_ids uuid[], p_pax integer) returns boolean
  language plpgsql
  set search_path = ''
as $$
declare
  unpaid_share constant numeric := 0.5;
  session record;
  unpaid integer;
begin
  for session in
    select s.id, s.capacity from public.visit_sessions s where s.id = any (p_session_ids) order by s.id for update
  loop
    select coalesce(sum(l.pax_count), 0) into unpaid
    from public.booking_legs l
    join public.bookings b on b.id = l.booking_id
    where l.visit_session_id = session.id and l.status = 'reserved' and b.status = 'pending_payment';
    if unpaid + p_pax > session.capacity * unpaid_share then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

create function internal.booking_reply(p_result text, p_booking public.bookings) returns jsonb
  language sql immutable
  set search_path = ''
as $$
  select jsonb_build_object('result', p_result, 'booking_id', p_booking.id, 'booking_code', p_booking.booking_code,
                            'status', p_booking.status, 'expires_at', p_booking.expires_at);
$$;

-- The one spelling of an address that caps count by (BOOK-11), as normalizeEmail in src/lib/validations/normalize.ts
-- writes it: lower-cased and trimmed, and for Gmail without dots or a plus tag in the mailbox, googlemail.com included.
create function internal.email_key(p_email text) returns text
  language sql immutable
  set search_path = ''
as $$
  select case when parts.mailbox <> '' and parts.domain in ('gmail.com', 'googlemail.com')
              then replace(split_part(parts.mailbox, '+', 1), '.', '') || '@gmail.com'
              else parts.lowered end
  from (select typed.lowered, substring(typed.lowered from '^(.*)@[^@]*$') as mailbox,
               substring(typed.lowered from '@([^@]*)$') as domain
        from (select lower(trim(p_email)) as lowered) as typed) as parts;
$$;

-- A booker is the contact their code proved (independent review of PR #26, M2): the WhatsApp number, or while WhatsApp
-- codes are degraded the address. The other one is what they typed, contact data that is never an identity, so it
-- finds no hold and counts against no cap. The lock on that contact, taken before the duplicate check (L4), makes two
-- requests for one contact see each other.
create function internal.lock_booking_contact(p_contact text, p_phone text, p_email text) returns void
  language plpgsql
  set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('booking:unpaid:' || case p_contact when 'whatsapp' then 'phone:' || p_phone
                                                                  else 'email:' || internal.email_key(p_email) end));
end;
$$;

-- The proven contact's unpaid hold of one of these sessions, whose link booking-service.ts sends again (BOOK-15). An
-- address is matched as it was proved, not by its BOOK-11 key, because resend_booking_link sends to the address the hold
-- has and matches it as typed.
create function internal.unpaid_hold_for(p_contact text, p_phone text, p_email text, p_session_ids uuid[])
  returns public.bookings
  language sql stable
  set search_path = ''
as $$
  select b.* from public.bookings b
  where b.status = 'pending_payment'
    and case p_contact when 'whatsapp' then b.pic_phone = p_phone and b.phone_verified_at is not null
                       else lower(b.pic_email::text) = p_email and b.email_verified_at is not null end
    and exists (select 1 from public.booking_legs l where l.booking_id = b.id and l.visit_session_id = any (p_session_ids))
  order by b.created_at desc
  limit 1;
$$;

-- No proven contact holds more than two unpaid bookings (BOOK-13), an address counted in its BOOK-11 spelling (L3).
create function internal.check_unpaid_caps(p_contact text, p_phone text, p_email text) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  unpaid_per_contact constant integer := 2;
begin
  if (select count(*) from public.bookings b
      where b.status = 'pending_payment'
        and case p_contact when 'whatsapp' then b.pic_phone = p_phone and b.phone_verified_at is not null
                           else internal.email_key(b.pic_email) = internal.email_key(p_email)
                                and b.email_verified_at is not null end)
     >= unpaid_per_contact then
    raise exception 'a phone number or an email address holds at most two unpaid bookings'
      using errcode = 'P0001', hint = 'RATE_LIMITED';
  end if;
end;
$$;

revoke execute on function internal.crockford_base32(bytea, integer), internal.new_booking_code(),
  internal.booking_quote(uuid, integer, jsonb, smallint[]), internal.booking_quote_hash(jsonb),
  internal.hold_deadline(public.booker_type, integer, timestamptz), internal.whatsapp_otp_open(),
  internal.booking_sessions(uuid, uuid[]), internal.verified_booking_contact(uuid, text, text),
  internal.over_unpaid_share(uuid[], integer), internal.booking_reply(text, public.bookings),
  internal.email_key(text), internal.lock_booking_contact(text, text, text),
  internal.unpaid_hold_for(text, text, text, uuid[]), internal.check_unpaid_caps(text, text, text)
  from public, anon, authenticated;


-- ===== internal.create_booking (Task P3.4.01, P3.4.02; docs/PRD.md §9.2) =====

-- A visitor's booking, from the request booking-service.ts checked: a hold (p_mode 'pay': pending_payment, its legs'
-- seats reserved, a deadline) or a quotation booking ('quote': quoted, no seat, no deadline). p_booker carries the PIC
-- as the verified cookie gave the phone (docs/Security.md §4.1 point 3); p_quote_hash is the summary the visitor saw.
-- Every price is computed here again from the catalogue rows. Replies, never with another visitor's booking:
--   created         the new booking;
--   existing        the booking this form key already made, to a request that brings the code it spent (BOOK-06, L1);
--   duplicate       the proven contact's unpaid hold for the same session, whose link booking-service.ts sends again
--                   (BOOK-15);
--   pay_to_confirm  the hold would leave more than half a session unpaid; nothing is written (Q3).
create function internal.create_booking(
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
      -- L1: the key alone opens nothing; a repeat brings the code the booking spent.
      if not exists (select 1 from public.guest_otps o where o.id = p_otp_id and o.booking_id = booking.id) then
        if booking.pic_phone is distinct from phone then
          raise exception 'this form was already sent for another booking' using errcode = '23505';
        end if;
        raise exception 'the PIC''s contact is not verified' using errcode = 'P0001', hint = 'STATE_INVALID';
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

-- The visitors and participants a booking may list: booking.max_pax of site_settings, and no more participants than
-- visitors (booking_participants, at most 300 as src/config/booking.ts says).
create function internal.check_booking_size(p_pax integer, p_participants jsonb) returns void
  language plpgsql stable
  set search_path = ''
as $$
declare
  max_participants constant integer := 300;
  max_pax integer := (select (s.value #>> '{}')::integer from public.site_settings s where s.key = 'booking.max_pax');
  participants integer := jsonb_array_length(coalesce(p_participants, '[]'));
begin
  if p_pax is null or p_pax < 1 or p_pax > max_pax then
    raise exception 'a booking takes 1 to % visitors', max_pax using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if participants > p_pax then
    raise exception 'a booking lists no more participants than visitors' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if participants > max_participants then
    raise exception 'a booking lists at most % participants', max_participants
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
end;
$$;

-- The booking row itself, priced and snapshotted from the quote. A hold gets its deadline once, here (BOOK-14). Two
-- requests with one form key never both get here: the second waits for the audit chain and then finds the first one's
-- booking.
create function internal.insert_booking(p_mode text, p_package public.tour_packages, p_rw_ids smallint[],
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
    consented_at, idempotency_key, source_ip, user_agent)
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
    p_consent ->> 'version', now(), p_idempotency_key, nullif(p_client_meta ->> 'ip', '')::inet,
    left(p_client_meta ->> 'user_agent', 500))
  returning * into booking;
  return booking;
end;
$$;

-- The legs, add-on lines and participants of a new booking. A hold takes its seats session by session in id order, the
-- order release_booking_quota gives them back in; a combo whose second session is full raises QUOTA_UNAVAILABLE and so
-- keeps neither (BOOK-01). A quotation's legs reserve nothing (BOOK-08).
create function internal.insert_booking_lines(p_booking public.bookings, p_mode text, p_session_ids uuid[],
  p_pax integer, p_quote jsonb, p_addons jsonb, p_participants jsonb) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  session_id uuid;
begin
  if p_mode = 'pay' then
    foreach session_id in array (select array_agg(id order by id) from unnest(p_session_ids) as ids(id)) loop
      perform internal.reserve_session_quota(session_id, p_pax);
    end loop;
  end if;
  insert into public.booking_legs (booking_id, rw_id, visit_session_id, leg_order, pax_count, status, quota_reserved_at)
  select p_booking.id, s.rw_id, s.id, l.leg_order, p_pax,
         case p_mode when 'pay' then 'reserved' else 'unreserved' end::public.booking_leg_status,
         case when p_mode = 'pay' then now() end
  from public.visit_sessions s
  join public.tour_package_legs l on l.package_id = p_booking.package_id and l.rw_id = s.rw_id
  where s.id = any (p_session_ids);

  insert into public.booking_addons (booking_id, product_id, rw_id, vendor_id, product_name_snapshot, unit_price, qty,
    line_total, notes)
  select p_booking.id, pr.id, pr.rw_id, pr.vendor_id, pr.name, (line ->> 'unit_price')::bigint,
         (line ->> 'quantity')::integer, (line ->> 'line_total')::bigint,
         nullif(trim((select a ->> 'notes' from jsonb_array_elements(p_addons) as a
                      where (a ->> 'product_id')::uuid = pr.id)), '')
  from jsonb_array_elements(p_quote -> 'lines') as line
  join public.products_umkm pr on pr.id = (line ->> 'id')::uuid
  where line ->> 'kind' = 'addon';

  insert into public.booking_participants (booking_id, seq_no, full_name, group_label, role_label)
  select p_booking.id, participant.seq_no, trim(participant.value ->> 'full_name'),
         nullif(trim(participant.value ->> 'group_label'), ''), nullif(participant.value ->> 'role_label', '')
  from jsonb_array_elements(coalesce(p_participants, '[]')) with ordinality as participant(value, seq_no);
end;
$$;

revoke execute on function
  internal.create_booking(uuid, uuid[], integer, jsonb, jsonb, jsonb, text, public.booking_channel, text, uuid, jsonb,
                          uuid, jsonb, text),
  internal.check_booking_size(integer, jsonb),
  internal.insert_booking(text, public.tour_packages, smallint[], date, date, timestamptz, jsonb, integer, jsonb, text,
                          text, jsonb, jsonb),
  internal.insert_booking_lines(public.bookings, text, uuid[], integer, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

-- PostgREST exposes public only (decision of 2026-10-16). This is a visitor's booking from the web, made by no officer;
-- the officers' walk-in bookings come with their own entry point (Task P4.3.10).
create function public.svc_create_booking(
  p_package_id uuid, p_session_ids uuid[], p_pax integer, p_booker jsonb, p_addons jsonb, p_participants jsonb,
  p_mode text, p_idempotency_key text, p_otp_id uuid, p_consent jsonb, p_client_meta jsonb, p_quote_hash text
) returns jsonb
  language sql security definer
  set search_path = ''
as $$
  select internal.create_booking(p_package_id, p_session_ids, p_pax, p_booker, p_addons, p_participants, p_mode,
                                 'web', p_idempotency_key, p_otp_id, p_consent, null, p_client_meta, p_quote_hash);
$$;
revoke execute on function public.svc_create_booking(uuid, uuid[], integer, jsonb, jsonb, jsonb, text, text, uuid,
  jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.svc_create_booking(uuid, uuid[], integer, jsonb, jsonb, jsonb, text, text, uuid,
  jsonb, jsonb, text) to service_role;


-- ===== A hold's deadline is written once (BOOK-14) =====

-- docs/Security.md §4.2: expires_at is set when the hold starts and never moves on its own; the staff RPCs that extend or
-- reactivate a hold (extend_booking_hold, reactivate_booking) announce themselves with app.hold_extension = '1'.
create function internal.bookings_hold_deadline_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if old.expires_at is not null and new.expires_at is distinct from old.expires_at
     and coalesce(current_setting('app.hold_extension', true), '') <> '1' then
    raise exception 'a hold''s deadline is written once' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return new;
end;
$$;
revoke execute on function internal.bookings_hold_deadline_guard() from public, anon, authenticated;
create trigger bookings_hold_deadline_guard before update of expires_at on public.bookings
  for each row execute function internal.bookings_hold_deadline_guard();


-- ===== The other writers of a session take the same turn (independent review of PR #26, M1) =====
-- These replace the 0004 versions, which locked booking, leg or session rows with SELECT ... FOR UPDATE before their
-- audit rows asked for the chain. Each now takes the chain's turn first; nothing else in them changes, except that the
-- expiry run also reports the holds it could not expire.

create or replace function internal.release_booking_quota(p_booking_id uuid) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  leg record;
  stored integer;
begin
  perform internal.take_audit_turn();
  previous_settings := internal.push_settings('{"app.in_rpc": "1"}');
  for leg in
    select l.id, l.visit_session_id, l.pax_count
    from public.booking_legs l
    where l.booking_id = p_booking_id and l.status = 'reserved' and l.quota_released_at is null
    order by l.visit_session_id
    for update
  loop
    select s.reserved_pax into stored from public.visit_sessions s where s.id = leg.visit_session_id for update;
    if stored < leg.pax_count then
      perform internal.log_audit('quota.drift', 'visit_sessions', leg.visit_session_id::text,
        jsonb_build_object('stored', stored, 'released', leg.pax_count, 'corrected', true,
                           'source', 'release_booking_quota'));
    end if;
    update public.visit_sessions set reserved_pax = greatest(stored - leg.pax_count, 0) where id = leg.visit_session_id;
    update public.booking_legs set status = 'released', quota_released_at = now() where id = leg.id;
  end loop;
  perform internal.restore_settings(previous_settings);
end;
$$;

-- The 0004 version returned only how many holds it expired; /api/jobs/expire-bookings logs { processed, failed }.
drop function public.svc_expire_stale_bookings();
drop function internal.expire_stale_bookings();

create function internal.expire_stale_bookings() returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  quotation_days integer := (select (value #>> '{}')::integer from public.site_settings
                             where key = 'booking.quotation_valid_days');
  stale record;
  expired_count integer := 0;
  failed_count integer := 0;
begin
  perform internal.take_audit_turn();
  previous_settings := internal.begin_scheduled_job();
  for stale in
    select b.id, b.status
    from public.bookings b
    where (b.status = 'pending_payment' and b.expires_at < now() - interval '5 minutes')
       or (b.status = 'quoted' and coalesce(
             (select max(q.valid_until) from public.quotations q where q.booking_id = b.id and q.status = 'issued'),
             (b.created_at at time zone 'Asia/Jakarta')::date + quotation_days
           ) < public.today_jkt())
    order by b.id
    for update skip locked
  loop
    -- One booking that fails must not keep every other hold from expiring: it is rolled back on its
    -- own, reported as cron_failed, and tried again on the next run.
    begin
      update public.bookings set status = 'expired', expired_at = now() where id = stale.id;
      perform internal.release_booking_quota(stale.id);
      update public.payments set status = 'expired' where booking_id = stale.id and status in ('initiated', 'pending');
      update public.quotations set status = 'expired' where booking_id = stale.id and status = 'issued';
      insert into public.booking_events (booking_id, from_status, to_status, actor_type, reason)
      values (stale.id, stale.status, 'expired', 'cron',
              case when stale.status = 'quoted' then 'quotation_lapsed' else 'hold_lapsed' end);
      perform internal.enqueue_notification(stale.id, 'booking_expired', 'whatsapp', '{}');
      perform internal.enqueue_notification(stale.id, 'booking_expired', 'email', '{}');
      expired_count := expired_count + 1;
    exception when others then
      failed_count := failed_count + 1;
      insert into public.security_events (event_type, severity, entity_type, entity_id, details)
      values ('cron_failed', 'high', 'bookings', stale.id::text,
              jsonb_build_object('job', 'expire_stale_bookings', 'sqlstate', sqlstate));
    end;
  end loop;
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('processed', expired_count, 'failed', failed_count);
end;
$$;
revoke execute on function internal.expire_stale_bookings() from public, anon, authenticated;

create function public.svc_expire_stale_bookings() returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.expire_stale_bookings(); $$;
revoke execute on function public.svc_expire_stale_bookings() from public, anon, authenticated;
grant execute on function public.svc_expire_stale_bookings() to service_role;

create or replace function internal.close_past_bookings() returns integer
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  past record;
  next_status public.booking_status;
  closed_count integer := 0;
begin
  perform internal.take_audit_turn();
  previous_settings := internal.begin_scheduled_job();
  for past in
    select b.id, b.status
    from public.bookings b
    where b.status in ('checked_in', 'paid') and b.visit_date_end < public.today_jkt()
    order by b.id
    for update skip locked
  loop
    if past.status = 'checked_in' then
      next_status := 'completed';
      update public.bookings set status = next_status, completed_at = now() where id = past.id;
      perform internal.enqueue_notification(past.id, 'review_invite', 'whatsapp', '{"link_scope": "review"}');
      perform internal.enqueue_notification(past.id, 'review_invite', 'email', '{"link_scope": "review"}');
    else
      next_status := 'no_show';
      update public.bookings set status = next_status where id = past.id;
    end if;
    insert into public.booking_events (booking_id, from_status, to_status, actor_type)
    values (past.id, past.status, next_status, 'cron');
    closed_count := closed_count + 1;
  end loop;

  update public.tickets_qr set status = 'expired' where status = 'issued' and valid_until < now();
  perform internal.restore_settings(previous_settings);
  return closed_count;
end;
$$;

create or replace function internal.reconcile_session_counters() returns integer
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  upcoming record;
  stored integer;
  held integer;
  drift_count integer := 0;
begin
  perform internal.take_audit_turn();
  previous_settings := internal.begin_scheduled_job();
  for upcoming in
    select s.id from public.visit_sessions s where s.session_date >= public.today_jkt() order by s.id
  loop
    select s.reserved_pax into stored from public.visit_sessions s where s.id = upcoming.id for update;
    select coalesce(sum(l.pax_count), 0) into held
    from public.booking_legs l
    where l.visit_session_id = upcoming.id and l.status in ('reserved', 'checked_in');
    continue when stored = held;

    if stored > held then
      update public.visit_sessions set reserved_pax = held where id = upcoming.id;
    end if;
    perform internal.log_audit('quota.drift', 'visit_sessions', upcoming.id::text,
      jsonb_build_object('stored', stored, 'held', held, 'corrected', stored > held));
    drift_count := drift_count + 1;
  end loop;
  perform internal.restore_settings(previous_settings);
  return drift_count;
end;
$$;


-- ===== Every application job is a POST (independent review of PR #26) =====
-- This replaces the 0007 version of call_job. Every job changes something: it claims outbox rows, settles payments,
-- records reconciliation runs, raises alerts or deletes files. So none is a GET that a prefetch, a crawler or a cache
-- could send again.

create or replace function internal.call_job(p_job text) returns bigint
  language plpgsql security definer
  set search_path = ''
as $$
declare
  route_timeout_ms constant integer := 60000;   -- the job routes' maxDuration
  path text := case p_job
    when 'process-notifications' then '/api/jobs/process-notifications'
    when 'payments-poll' then '/api/jobs/payments-poll'
    when 'anomaly-scan' then '/api/jobs/anomaly-scan'
    when 'reconcile-payments' then '/api/jobs/reconcile-payments'
    when 'purge-storage' then '/api/jobs/purge-storage'
  end;
  is_local boolean := internal.environment() is not distinct from 'local';
  base_url text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'jobs_base_url');
  cron_secret text := (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'cron_secret');
  request_id bigint;
begin
  if path is null then
    raise exception 'no application job is called %', p_job using errcode = '22023';
  end if;
  perform internal.settle_job_response(p_job);
  if base_url is null or cron_secret is null then
    if not is_local then
      perform internal.record_job_run(p_job, false, 'secret_missing');
    end if;
    return null;
  end if;
  if base_url !~ '^https://' and not is_local then
    perform internal.record_job_run(p_job, false, 'insecure_base_url');
    return null;
  end if;

  request_id := net.http_post(url := rtrim(base_url, '/') || path, body := '{}'::jsonb,
                              headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret,
                                                            'Content-Type', 'application/json'),
                              timeout_milliseconds := route_timeout_ms);
  update public.job_heartbeats set last_request_id = request_id, last_requested_at = now() where job = p_job;
  return request_id;
end;
$$;
