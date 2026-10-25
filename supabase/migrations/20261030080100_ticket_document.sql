-- Task P3.11.05 (docs/Security.md §10.3, DOC-01): the e-ticket PDF is a booking document like the others, rendered on
-- first need (api/documents/ticket/<booking id>, or the WhatsApp document header of gsk_ticket_issued_v1) and kept in
-- the documents bucket as bookings/<id>/ticket-<booking code>.pdf, the name bookings.ticket_pdf_path has always meant.
-- Unlike an invoice, what a ticket says can change after it was kept (a session moved, a group's size corrected, a
-- ticket suspended), so the file is kept with the fingerprint of the tickets it shows, and a reader whose tickets no
-- longer match it gets a fresh one that replaces it (review of PR #66, L1).

alter table public.bookings add column ticket_pdf_fingerprint text
  check (ticket_pdf_fingerprint is null or ticket_pdf_fingerprint ~ '^[0-9a-f]{64}$');

-- The file of a booking with tickets, under its own name only, with the fingerprint src/server/services/
-- ticket-documents.ts computed over the tickets it was rendered from; the same file and fingerprint again change
-- nothing.
create function internal.record_ticket_pdf(p_booking_id uuid, p_path text, p_fingerprint text, p_actor_id uuid)
  returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  booking record;
begin
  perform internal.require_server_caller('record_ticket_pdf');
  -- The audit turn first, then the row, as every booking writer takes them (record_document_pdf, BOOK-01).
  perform internal.take_audit_turn();
  select b.id, b.booking_code, b.ticket_pdf_path, b.ticket_pdf_fingerprint into booking
  from public.bookings b
  where b.id = p_booking_id and exists (select 1 from public.tickets_qr t where t.booking_id = b.id)
  for update;
  if not found then
    raise exception 'booking % has no tickets', p_booking_id using errcode = 'P0002';
  end if;
  if p_path is distinct from 'bookings/' || booking.id::text || '/ticket-' || booking.booking_code || '.pdf' then
    raise exception 'a ticket file is named after its own booking code' using errcode = '22023';
  end if;
  if coalesce(p_fingerprint, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'a ticket file is kept with the fingerprint of its tickets' using errcode = '22023';
  end if;
  if (booking.ticket_pdf_path, booking.ticket_pdf_fingerprint) is not distinct from (p_path, p_fingerprint) then
    return;
  end if;

  previous_settings := internal.push_settings(internal.document_actor(p_actor_id));
  update public.bookings set ticket_pdf_path = p_path, ticket_pdf_fingerprint = p_fingerprint where id = p_booking_id;
  perform internal.restore_settings(previous_settings);
end;
$$;
revoke execute on function internal.record_ticket_pdf(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;

create function public.svc_record_ticket_pdf(p_booking_id uuid, p_path text, p_fingerprint text, p_actor_id uuid default null)
  returns void
  language sql security definer
  set search_path = ''
as $$ select internal.record_ticket_pdf(p_booking_id, p_path, p_fingerprint, p_actor_id); $$;
revoke execute on function public.svc_record_ticket_pdf(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.svc_record_ticket_pdf(uuid, text, text, uuid) to service_role;
