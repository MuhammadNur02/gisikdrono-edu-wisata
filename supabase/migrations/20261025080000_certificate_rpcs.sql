-- Task P4.5.01 (docs/PRD.md FR-POST-01, FR-POST-02, FR-POST-04; docs/Security.md §9.2; QR-08, REC-11): the
-- certificates of a visit. check_in_ticket (20261025080100) issues them once every leg of the booking is checked in;
-- the dashboard issues them again, waives the unpaid-pax hold and revokes one (Task P4.5.03). A booking gets one group
-- certificate covering every RW it visited, and one per participant when its list exists and fits the people who came.
-- Each is released, that is downloadable and announced with certificate_ready, only when nobody came unpaid or a
-- superadmin waived that, which audit_logs records.


-- ===== Who came =====

-- What the gates recorded for a booking: its legs, how many of their tickets were used, the fewest people one gate let
-- in (a combo's two gates may count differently) and the people above the booking.
create function internal.booking_attendance(p_booking_id uuid)
  returns table (leg_count integer, used_count integer, fewest_checked_in integer, unpaid_pax integer)
  language sql stable
  set search_path = ''
as $$
  select (select count(*)::integer from public.booking_legs l where l.booking_id = p_booking_id),
         count(*) filter (where t.status = 'used')::integer,
         min(t.checked_in_pax) filter (where t.status = 'used'),
         coalesce(sum(t.unpaid_pax) filter (where t.status = 'used'), 0)::integer
  from public.tickets_qr t
  where t.booking_id = p_booking_id;
$$;

-- undo_check_in revokes a booking's certificates under this reason, and the next check-in of every leg brings the same
-- ones back with their numbers, since a booking has one group certificate for life (certificates_group_once).
create function internal.undo_check_in_reason() returns text
  language sql immutable
  set search_path = ''
as $$ select 'undo_check_in'; $$;


-- ===== Issuing =====

-- One certificate, numbered SERT/GSK/YYYY/NNNNN when it is written.
create function internal.insert_certificate(
  p_booking record, p_kind public.certificate_kind, p_participant_id uuid, p_recipient text, p_release_at timestamptz,
  p_issued_by uuid
) returns void
  language plpgsql
  set search_path = ''
as $$
begin
  insert into public.certificates (booking_id, participant_id, kind, certificate_number, verify_code, recipient_name,
    institution_name, visit_date, rw_ids, template_version, released_at, issued_by)
  values (p_booking.id, p_participant_id, p_kind, internal.next_document_number('certificate', now()),
          internal.new_verify_code(), p_recipient, p_booking.institution_name, p_booking.visit_date, p_booking.rw_ids,
          coalesce((select (s.value #>> '{}')::smallint from public.site_settings s
                    where s.key = 'certificate.template_version'), 1),
          p_release_at, p_issued_by);
end;
$$;

-- FR-POST-02: a certificate per participant, in list order, only while the list is no longer than the fewest people a
-- gate let in.
create function internal.insert_participant_certificates(
  p_booking record, p_fewest_checked_in integer, p_release_at timestamptz, p_issued_by uuid
) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  participant record;
  written integer := 0;
begin
  if (select count(*) from public.booking_participants p where p.booking_id = p_booking.id) > p_fewest_checked_in then
    return 0;
  end if;
  for participant in
    select p.id, p.full_name from public.booking_participants p
    where p.booking_id = p_booking.id
      and not exists (select 1 from public.certificates c where c.participant_id = p.id and c.kind = 'participant')
    order by p.seq_no
  loop
    perform internal.insert_certificate(p_booking, 'participant', participant.id, participant.full_name, p_release_at,
                                        p_issued_by);
    written := written + 1;
  end loop;
  return written;
end;
$$;

-- certificate_ready goes out once a booking's group certificate is released; the outbox's dedupe key keeps it to one
-- message per channel however often this runs.
create function internal.announce_released_certificates(p_booking_id uuid) returns void
  language plpgsql
  set search_path = ''
as $$
begin
  if exists (select 1 from public.certificates c
             where c.booking_id = p_booking_id and c.kind = 'group' and c.status = 'issued'
               and c.released_at is not null) then
    perform internal.enqueue_notification(p_booking_id, 'certificate_ready', 'whatsapp', '{"link_scope": "certificate"}');
    perform internal.enqueue_notification(p_booking_id, 'certificate_ready', 'email', '{"link_scope": "certificate"}');
  end if;
end;
$$;

-- FR-POST-01: idempotent. Nothing happens until every leg's ticket is used; then the group certificate and the
-- participants' are written once, those undo_check_in revoked come back, and the released ones are announced. The
-- caller holds the audit turn and the booking's row, with app.in_rpc open. Returns how many it wrote or brought back.
create function internal.issue_certificates(p_booking_id uuid, p_issued_by uuid) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  booking record;
  attendance record;
  release_at timestamptz;
  written integer;
  added integer;
begin
  select b.id, b.status, b.institution_name, b.pic_name, b.visit_date, b.rw_ids into booking
  from public.bookings b where b.id = p_booking_id;
  select * into attendance from internal.booking_attendance(p_booking_id);
  if booking.status not in ('checked_in', 'completed') or attendance.leg_count = 0
     or attendance.used_count < attendance.leg_count then
    return 0;
  end if;
  release_at := case when attendance.unpaid_pax = 0 then now() end;

  update public.certificates c
  set status = 'issued', revoked_at = null, revoke_reason = null,
      released_at = case when c.release_waived_by is not null then c.released_at else release_at end
  where c.booking_id = p_booking_id and c.status = 'revoked' and c.revoke_reason = internal.undo_check_in_reason();
  get diagnostics written = row_count;

  if not exists (select 1 from public.certificates c where c.booking_id = p_booking_id and c.kind = 'group') then
    -- An individual visitor's booking has no institution; its group certificate carries the PIC's name.
    perform internal.insert_certificate(booking, 'group', null, coalesce(booking.institution_name, booking.pic_name),
                                        release_at, p_issued_by);
    written := written + 1;
  end if;
  added := internal.insert_participant_certificates(booking, attendance.fewest_checked_in, release_at, p_issued_by);
  perform internal.announce_released_certificates(p_booking_id);
  return written + added;
end;
$$;

-- FR-POST-02: a superadmin lets the certificates of a group that brought unpaid people go out, with the reason in
-- audit_logs.
create function internal.waive_certificate_release(p_booking_id uuid, p_reason text) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  released integer;
begin
  update public.certificates
  set released_at = now(), release_waived_by = auth.uid()
  where booking_id = p_booking_id and status = 'issued' and released_at is null;
  get diagnostics released = row_count;
  if released > 0 then
    perform internal.log_audit('certificate_release_waived', 'bookings', p_booking_id::text,
      jsonb_build_object('reason', p_reason, 'certificates', released,
                         'unpaid_pax', (select a.unpaid_pax from internal.booking_attendance(p_booking_id) a)));
    perform internal.announce_released_certificates(p_booking_id);
  end if;
  return released;
end;
$$;

revoke execute on function internal.booking_attendance(uuid), internal.undo_check_in_reason(),
  internal.insert_certificate(record, public.certificate_kind, uuid, text, timestamptz, uuid),
  internal.insert_participant_certificates(record, integer, timestamptz, uuid),
  internal.announce_released_certificates(uuid), internal.issue_certificates(uuid, uuid),
  internal.waive_certificate_release(uuid, text)
  from public, anon, authenticated, service_role;


-- ===== Staff RPCs =====

-- The dashboard's issue and waiver (Task P4.5.03): an officer of one of the booking's RWs or the superadmin, at AAL2,
-- issues what is missing; only the superadmin waives, with a reason of 3 to 300 characters. Certificates follow the
-- check-in of every leg, so a booking still waiting for one is refused.
create function public.issue_certificates(p_booking_id uuid, p_waiver_reason text default null) returns integer
  language plpgsql security definer
  set search_path = ''
as $$
declare
  rw_ids smallint[];
  previous_settings jsonb;
  written integer;
begin
  if not (public.is_staff() and public.aal2()) then
    raise exception 'certificates are issued by staff with a verified authenticator' using errcode = '42501';
  end if;
  select b.rw_ids into rw_ids from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'booking % does not exist', p_booking_id using errcode = 'P0002';
  end if;
  if not (public.is_superadmin() or public.owns_any_rw(rw_ids)) then
    raise exception 'this booking belongs to another RW' using errcode = '42501';
  end if;
  if p_waiver_reason is not null and not public.is_superadmin() then
    raise exception 'only the superadmin waives the unpaid-pax hold' using errcode = '42501';
  end if;
  if p_waiver_reason is not null and length(btrim(p_waiver_reason)) not between 3 and 300 then
    raise exception 'a waiver needs a reason of 3 to 300 characters' using errcode = '22023';
  end if;

  perform internal.take_audit_turn();
  perform 1 from public.bookings b where b.id = p_booking_id for update;
  if exists (select 1 from internal.booking_attendance(p_booking_id) a
             where a.leg_count = 0 or a.used_count < a.leg_count) then
    raise exception 'certificates follow the check-in of every leg of the booking'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  previous_settings := internal.push_settings('{"app.in_rpc": "1"}');
  written := internal.issue_certificates(p_booking_id, auth.uid());
  if p_waiver_reason is not null then
    written := written + internal.waive_certificate_release(p_booking_id, btrim(p_waiver_reason));
  end if;
  perform internal.restore_settings(previous_settings);
  return written;
end;
$$;

-- FR-POST-04: the superadmin revokes one certificate with a reason; /verifikasi then shows it as "Dicabut".
create function public.revoke_certificate(p_certificate_id uuid, p_reason text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  certificate record;
  previous_settings jsonb;
begin
  if not (public.is_superadmin() and public.aal2()) then
    raise exception 'only the superadmin revokes a certificate' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'a revocation needs a reason of 3 to 300 characters' using errcode = '22023';
  end if;
  perform internal.take_audit_turn();
  select c.id, c.status into certificate from public.certificates c where c.id = p_certificate_id for update;
  if not found then
    raise exception 'certificate % does not exist', p_certificate_id using errcode = 'P0002';
  end if;
  if certificate.status <> 'issued' then
    raise exception 'the certificate is already revoked' using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  previous_settings := internal.push_settings('{"app.in_rpc": "1"}');
  update public.certificates set status = 'revoked', revoked_at = now(), revoke_reason = btrim(p_reason)
  where id = p_certificate_id;
  perform internal.restore_settings(previous_settings);
end;
$$;

revoke execute on function public.issue_certificates(uuid, text), public.revoke_certificate(uuid, text)
  from public, anon, service_role;
grant execute on function public.issue_certificates(uuid, text), public.revoke_certificate(uuid, text)
  to authenticated;
