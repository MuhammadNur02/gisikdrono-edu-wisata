-- The independent review of PR #33 (Task P3.6): the quotation functions check their caller and name their actor, a
-- quoted booking whose first quotation was lost between two transactions gets it on the next try, and a rendered
-- document's file is recorded under the reader's name, so the audit trigger accepts the write.


-- ===== Callers and actors =====

-- These functions serve the server alone: the service role through their svc_* wrappers, or the owner's own session
-- (migrations, pgTAP, cron). An API role arrives with a role PostgREST set and is refused, so a grant added by mistake
-- still opens nothing (review of PR #33, finding 4; the pattern of 20261020090000).
create function internal.require_server_caller(p_function text) returns void
  language plpgsql stable
  set search_path = ''
as $$
begin
  if coalesce(current_setting('role', true), 'none') not in ('service_role', 'none') then
    raise exception '% is reserved for the server', p_function using errcode = '42501';
  end if;
end;
$$;

-- The settings that name who acts: the visitor when nobody signed in, else the staff member by their own profile, so a
-- re-issue by an officer is never logged as the visitor's (finding 4). An id that is no active staff member is refused.
create function internal.document_actor(p_actor_id uuid) returns jsonb
  language plpgsql stable
  set search_path = ''
as $$
declare
  staff_role text;
begin
  if p_actor_id is null then
    return jsonb_build_object('app.actor_role', 'visitor');
  end if;
  select p.role::text into staff_role from public.profiles p
  where p.id = p_actor_id and p.is_active and p.role in ('superadmin', 'admin_rw');
  if staff_role is null then
    raise exception 'actor % is no active staff member', p_actor_id using errcode = '42501';
  end if;
  return jsonb_build_object('app.actor_role', staff_role, 'app.actor_id', p_actor_id::text);
end;
$$;


-- ===== internal.create_quotation =====

-- Replaces the 20261023100000 version: the caller is checked first and the actor is the profile p_actor_id names.
-- Everything else is unchanged.
create or replace function internal.create_quotation(p_booking_id uuid, p_actor_id uuid) returns jsonb
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
  perform internal.require_server_caller('create_quotation');
  -- The audit chain's turn before the booking's row lock, the one order every writer keeps (BOOK-01).
  perform internal.take_audit_turn();
  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1')
    || internal.document_actor(p_actor_id));

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


-- ===== The first quotation, once =====

-- "Minta Surat Penawaran" makes the quoted booking and then its first quotation in a second transaction, so an answer
-- lost in between leaves a quoted booking with no quotation. The visitor's next try replays the same form, and this
-- issues the first quotation then (finding 3). Null when the booking already has one, or is no longer quoted.
create function internal.issue_first_quotation(p_booking_id uuid) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  booking_status public.booking_status;
begin
  perform internal.require_server_caller('issue_first_quotation');
  perform internal.take_audit_turn();
  -- The booking's row lock makes two tries at once take turns: the second finds the quotation the first issued.
  select b.status into booking_status from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  if booking_status <> 'quoted' or exists (select 1 from public.quotations q where q.booking_id = p_booking_id) then
    return null;
  end if;
  return internal.create_quotation(p_booking_id, null);
end;
$$;


-- ===== A rendered document's file =====

-- The file the documents route rendered and kept (Task P3.6.04), recorded on its row under the reader's name: the
-- visitor, or the staff member who opened it. The audit trigger refuses a service-role write that names no actor, so
-- the route cannot write this column itself (finding 1). The path is the document's own, under its booking's folder.
create function internal.record_document_pdf(p_kind text, p_document_id uuid, p_path text, p_actor_id uuid)
  returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  booking_id uuid;
begin
  perform internal.require_server_caller('record_document_pdf');
  if p_kind = 'quotation' then
    select q.booking_id into booking_id from public.quotations q where q.id = p_document_id;
  elsif p_kind in ('invoice', 'receipt') then
    select i.booking_id into booking_id from public.invoices i where i.id = p_document_id;
  else
    raise exception 'no document of kind %', p_kind using errcode = '22023';
  end if;
  if booking_id is null then
    raise exception 'document % does not exist', p_document_id using errcode = 'P0002';
  end if;
  if p_path is null or p_path !~ ('^bookings/' || booking_id::text || '/' || p_kind || '-[A-Z0-9-]+\.pdf$') then
    raise exception 'a % file lies in its own booking''s folder', p_kind using errcode = '22023';
  end if;

  previous_settings := internal.push_settings(internal.document_actor(p_actor_id));
  if p_kind = 'quotation' then
    update public.quotations set pdf_path = p_path where id = p_document_id;
  elsif p_kind = 'invoice' then
    update public.invoices set pdf_path = p_path where id = p_document_id;
  else
    update public.invoices set receipt_pdf_path = p_path where id = p_document_id;
  end if;
  perform internal.restore_settings(previous_settings);
end;
$$;

revoke execute on function internal.require_server_caller(text), internal.document_actor(uuid),
  internal.issue_first_quotation(uuid), internal.record_document_pdf(text, uuid, text, uuid)
  from public, anon, authenticated;

-- PostgREST exposes public only (decision of 2026-10-16).
create function public.svc_issue_first_quotation(p_booking_id uuid) returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.issue_first_quotation(p_booking_id); $$;
create function public.svc_record_document_pdf(p_kind text, p_document_id uuid, p_path text, p_actor_id uuid default null)
  returns void
  language sql security definer
  set search_path = ''
as $$ select internal.record_document_pdf(p_kind, p_document_id, p_path, p_actor_id); $$;
revoke execute on function public.svc_issue_first_quotation(uuid), public.svc_record_document_pdf(text, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.svc_issue_first_quotation(uuid), public.svc_record_document_pdf(text, uuid, text, uuid)
  to service_role;
