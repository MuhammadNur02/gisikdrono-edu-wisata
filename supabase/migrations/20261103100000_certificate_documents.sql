-- Task P4.5.02 (docs/PRD.md FR-POST-01, FR-POST-02, FR-ADMIN-07; docs/Security.md §10.3, §10.4, DOC-02, DATA-12): a
-- certificate's PDF is kept in the documents bucket like the booking documents, and internal.record_document_pdf now
-- records its file too. The file is named after the certificate's own number under its booking's folder,
-- certificates/<booking_id>/group-<number>.pdf or participant-<number>.pdf, which is the name internal.purge_participants
-- and api/jobs/purge-storage remove 90 days after the visit. Only a certificate that may be handed out has a file: one
-- that is issued, released and not purged. Recording the same file again, as the dashboard's "Render ulang" does after
-- the signatory changed, stamps rendered_at anew and changes nothing else.

-- Replaces the 20261023120000 version; the quotation, invoice and receipt branches are unchanged.
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
  file_prefix text := p_kind;
  certificate record;
begin
  perform internal.require_server_caller('record_document_pdf');
  -- The audit turn first, then the row, as create_quotation and every booking writer take them (review of PR #33).
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
  elsif p_kind = 'certificate' then
    select c.booking_id, c.certificate_number, c.pdf_path, c.kind, c.status, c.released_at, c.purged_at
      into certificate
    from public.certificates c where c.id = p_document_id for update;
    booking_id := certificate.booking_id;
    document_number := certificate.certificate_number;
    recorded_path := certificate.pdf_path;
    file_prefix := certificate.kind::text;
  else
    raise exception 'no document of kind %', p_kind using errcode = '22023';
  end if;
  if booking_id is null or document_number is null then
    raise exception 'document % does not exist', p_document_id using errcode = 'P0002';
  end if;
  -- A certificate that is held back, revoked or purged is never handed out, so no file of it is kept either; a purged
  -- one would otherwise outlive the retention run that already forgot it.
  if p_kind = 'certificate' then
    if certificate.status <> 'issued' or certificate.released_at is null or certificate.purged_at is not null then
      raise exception 'only an issued, released certificate keeps a file'
        using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
  end if;

  -- The file name the documents route gives it: the kind (a certificate's own kind), then the number with its slashes
  -- as dashes, in the booking's folder.
  own_path := case when p_kind = 'certificate' then 'certificates/' else 'bookings/' end
    || booking_id::text || '/' || file_prefix || '-' || replace(document_number, '/', '-') || '.pdf';
  if p_path is distinct from own_path then
    raise exception 'a % file is named after its own number', p_kind using errcode = '22023';
  end if;
  if recorded_path is not null and recorded_path <> own_path then
    raise exception 'the % already names its file', p_kind using errcode = '23505';
  end if;
  if recorded_path is not null and p_kind <> 'certificate' then
    return;
  end if;

  previous_settings := internal.push_settings(internal.document_actor(p_actor_id));
  if p_kind = 'quotation' then
    update public.quotations set pdf_path = own_path where id = p_document_id;
  elsif p_kind = 'invoice' then
    update public.invoices set pdf_path = own_path where id = p_document_id;
  elsif p_kind = 'receipt' then
    update public.invoices set receipt_pdf_path = own_path where id = p_document_id;
  else
    update public.certificates set pdf_path = own_path, rendered_at = now() where id = p_document_id;
  end if;
  perform internal.restore_settings(previous_settings);
end;
$$;
