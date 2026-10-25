-- Task P3.11.05 (docs/Security.md §10.3, DOC-01): the e-ticket PDF is a booking document like the others, rendered on
-- first need (api/documents/ticket/<booking id>, or the WhatsApp document header of gsk_ticket_issued_v1) and kept in
-- the documents bucket as bookings/<id>/ticket-<booking code>.pdf, the name bookings.ticket_pdf_path has always meant.
-- internal.record_document_pdf learns the kind: a booking with tickets, its own file only, set once.

-- Replaces the 20261023120000 version.
create or replace function internal.record_document_pdf(p_kind text, p_document_id uuid, p_path text, p_actor_id uuid)
  returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  booking_id uuid;
  document_number text;
  recorded_path text;
  own_path text;
begin
  perform internal.require_server_caller('record_document_pdf');
  -- The audit turn first, then the row, as create_quotation and every booking writer take them (review finding 2).
  perform internal.take_audit_turn();
  if p_kind = 'quotation' then
    select q.booking_id, q.quotation_number, q.pdf_path into booking_id, document_number, recorded_path
    from public.quotations q where q.id = p_document_id for update;
  elsif p_kind = 'invoice' then
    select i.booking_id, i.invoice_number, i.pdf_path into booking_id, document_number, recorded_path
    from public.invoices i where i.id = p_document_id for update;
  elsif p_kind = 'receipt' then
    select i.booking_id, i.receipt_number, i.receipt_pdf_path into booking_id, document_number, recorded_path
    from public.invoices i where i.id = p_document_id for update;
  elsif p_kind = 'ticket' then
    -- A ticket file is the booking's; it exists once the booking has tickets, which only settlement issues.
    select b.id, b.booking_code, b.ticket_pdf_path into booking_id, document_number, recorded_path
    from public.bookings b
    where b.id = p_document_id and exists (select 1 from public.tickets_qr t where t.booking_id = b.id)
    for update;
  else
    raise exception 'no document of kind %', p_kind using errcode = '22023';
  end if;
  if booking_id is null or document_number is null then
    raise exception 'document % does not exist', p_document_id using errcode = 'P0002';
  end if;

  -- The file name booking-documents.ts gives it: the kind, then the number with its slashes as dashes.
  own_path := 'bookings/' || booking_id::text || '/' || p_kind || '-' || replace(document_number, '/', '-') || '.pdf';
  if p_path is distinct from own_path then
    raise exception 'a % file is named after its own number', p_kind using errcode = '22023';
  end if;
  if recorded_path is not null then
    if recorded_path = own_path then
      return;
    end if;
    raise exception 'the % already names its file', p_kind using errcode = '23505';
  end if;

  previous_settings := internal.push_settings(internal.document_actor(p_actor_id));
  if p_kind = 'quotation' then
    update public.quotations set pdf_path = own_path where id = p_document_id;
  elsif p_kind = 'invoice' then
    update public.invoices set pdf_path = own_path where id = p_document_id;
  elsif p_kind = 'receipt' then
    update public.invoices set receipt_pdf_path = own_path where id = p_document_id;
  else
    update public.bookings set ticket_pdf_path = own_path where id = p_document_id;
  end if;
  perform internal.restore_settings(previous_settings);
end;
$$;
