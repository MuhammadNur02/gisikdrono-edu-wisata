-- Task P3.6.01 (docs/PRD.md FR-B2B-01…03, §8.4.5, §9.2 rows 5 and 8): a quoted booking's Surat Penawaran. The
-- document is numbered only through internal.next_document_number, carries a verify code for /verifikasi/[code], is
-- valid booking.quotation_valid_days from today, and keeps its own snapshot in the one document shape, so later
-- catalogue edits never change it. A quotation holds no seat (BOOK-08). quotations_limit_guard (0004) refuses a
-- fourth version and any version before the number is verified; the previous version is superseded here.

-- The lines of a booking as a quotation prints them: the package, then each add-on, priced as the booking was.
create function internal.quotation_lines(p_booking public.bookings) returns jsonb
  language sql stable
  set search_path = ''
as $$
  select jsonb_build_array(jsonb_build_object(
           'kind', 'package',
           'product_name', p_booking.package_snapshot ->> 'name',
           'qty', case when p_booking.package_snapshot ->> 'pricing_basis' = 'flat_group' then 1
                       else p_booking.pax_count end,
           'unit_price', (p_booking.package_snapshot ->> 'unit_price')::bigint,
           'line_total', p_booking.subtotal_package))
         || coalesce((select jsonb_agg(jsonb_build_object('kind', 'addon', 'product_name', a.product_name_snapshot,
                                                          'qty', a.qty, 'unit_price', a.unit_price,
                                                          'line_total', a.line_total)
                                       order by a.created_at, a.id)
                      from public.booking_addons a where a.booking_id = p_booking.id), '[]'::jsonb);
$$;

-- The document snapshot of docs/PRD.md §8.4.5 for a quotation: the booker is its institution only, never a contact,
-- and the signatory is the kelurahan official of the moment.
create function internal.quotation_snapshot(p_booking public.bookings, p_valid_until date) returns jsonb
  language sql stable
  set search_path = ''
as $$
  select jsonb_build_object(
    'booking_code', p_booking.booking_code,
    'institution_name', p_booking.institution_name,
    'booker_type', p_booking.booker_type,
    'package_name', p_booking.package_snapshot ->> 'name',
    'package_category', p_booking.package_snapshot ->> 'category',
    'pricing_basis', p_booking.package_snapshot ->> 'pricing_basis',
    'rw_names', (select coalesce(jsonb_agg(r.name order by legs.ordinality), '[]'::jsonb)
                 from unnest(p_booking.rw_ids) with ordinality as legs(rw_id, ordinality)
                 join public.rw_units r on r.id = legs.rw_id),
    'visit_date', p_booking.visit_date,
    'visit_date_end', p_booking.visit_date_end,
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('rw_name', r.name, 'session_date', s.session_date,
                                                               'start_time', s.start_time, 'end_time', s.end_time)
                                           order by l.leg_order), '[]'::jsonb)
                 from public.booking_legs l
                 join public.visit_sessions s on s.id = l.visit_session_id
                 join public.rw_units r on r.id = l.rw_id
                 where l.booking_id = p_booking.id),
    'pax_count', p_booking.pax_count,
    'lines', internal.quotation_lines(p_booking),
    'subtotal_package', p_booking.subtotal_package,
    'subtotal_addons', p_booking.subtotal_addons,
    'discount_amount', p_booking.discount_amount,
    'total_amount', p_booking.total_amount,
    'currency', p_booking.currency,
    'valid_until', p_valid_until,
    'signatory_name', (select value #>> '{}' from public.site_settings where key = 'kelurahan.signatory_name'),
    'signatory_title', (select value #>> '{}' from public.site_settings where key = 'kelurahan.signatory_title'),
    'template_version', 'quotation-v1');
$$;

-- A verify code nobody holds yet: ten Crockford symbols, like a booking code without its prefix.
create function internal.new_verify_code() returns text
  language plpgsql volatile
  set search_path = ''
as $$
declare
  random_bytes constant integer := 7;
  symbols constant integer := 10;
  code text;
begin
  loop
    code := internal.crockford_base32(extensions.gen_random_bytes(random_bytes), symbols);
    exit when not exists (select 1 from public.quotations q where q.verify_code = code)
         and not exists (select 1 from public.certificates c where c.verify_code = code);
  end loop;
  return code;
end;
$$;

-- p_actor_id is the officer re-issuing a quotation, or null for the visitor's own request. The reply names the new
-- row for the service: its id, number, verify code, version and validity.
create function internal.create_quotation(p_booking_id uuid, p_actor_id uuid) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  booking public.bookings;
  quotation_days integer := (select (value #>> '{}')::integer from public.site_settings
                             where key = 'booking.quotation_valid_days');
  valid_until date;
  quotation public.quotations;
  params jsonb;
begin
  -- The audit chain's turn before the booking's row lock, the one order every writer keeps (BOOK-01).
  perform internal.take_audit_turn();
  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1', 'app.actor_role', 'visitor')
    || case when p_actor_id is null then '{}' else jsonb_build_object('app.actor_id', p_actor_id::text) end);

  -- Locked, so two requests at once get versions 2 and 3 rather than two version 2s.
  select * into booking from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  if booking.status <> 'quoted' then
    raise exception 'a quotation is issued for a quoted booking only' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  update public.quotations set status = 'superseded' where booking_id = booking.id and status = 'issued';
  valid_until := (now() at time zone 'Asia/Jakarta')::date + quotation_days;
  insert into public.quotations (booking_id, quotation_number, verify_code, version, valid_until, snapshot, issued_by)
  values (booking.id, internal.next_document_number('quotation', now()), internal.new_verify_code(),
          (select count(*) + 1 from public.quotations q where q.booking_id = booking.id), valid_until,
          internal.quotation_snapshot(booking, valid_until), p_actor_id)
  returning * into quotation;

  insert into public.booking_events (booking_id, from_status, to_status, actor_type, actor_id, payload)
  values (booking.id, booking.status, booking.status, case when p_actor_id is null then 'visitor' else 'admin' end,
          p_actor_id, jsonb_build_object('reason', 'quotation_issued', 'quotation_number', quotation.quotation_number,
                                         'version', quotation.version));
  -- The worker of Task P3.11 fills the greeting and the link from the booking; the number and validity are the
  -- quotation's own (templates.ts quotation_ready).
  params := jsonb_build_object('link_scope', 'manage', 'quotation_number', quotation.quotation_number,
                               'valid_until', quotation.valid_until);
  perform internal.enqueue_notification(booking.id, 'quotation_ready', 'whatsapp', params);
  perform internal.enqueue_notification(booking.id, 'quotation_ready', 'email', params);

  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('quotation_id', quotation.id, 'quotation_number', quotation.quotation_number,
                            'verify_code', quotation.verify_code, 'version', quotation.version,
                            'valid_until', quotation.valid_until);
end;
$$;

revoke execute on function internal.quotation_lines(public.bookings), internal.quotation_snapshot(public.bookings, date),
  internal.new_verify_code(), internal.create_quotation(uuid, uuid)
  from public, anon, authenticated;

-- PostgREST exposes public only (decision of 2026-10-16).
create function public.svc_create_quotation(p_booking_id uuid, p_actor_id uuid default null) returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.create_quotation(p_booking_id, p_actor_id); $$;
revoke execute on function public.svc_create_quotation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.svc_create_quotation(uuid, uuid) to service_role;
