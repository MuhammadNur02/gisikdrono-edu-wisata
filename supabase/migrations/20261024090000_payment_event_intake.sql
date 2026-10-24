-- Task P3.8.03 (docs/Security.md §3.3 steps 5 and 7; WH-01, WH-02, WH-03, WH-15): what the Midtrans webhook stores
-- before anything is applied. A notification whose signature failed leaves metadata only in webhook_rejections; one
-- that passed becomes a payment_events row, deduplicated by the hash of its raw body (docs/PRD.md §10.1).


-- ===== A signature-valid notification, stored once =====

-- Returns the event's id and whether it was processed already. Midtrans sends the same body again whenever it got no
-- 200, so a body seen before is not new work: when it was processed the webhook answers duplicate, and when its first
-- delivery stopped short (the Status API out of reach, 503) the same row is picked up again rather than stored twice.
create function internal.record_payment_event(p_source text, p_event_hash text, p_payload jsonb) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  event_order_id text := p_payload ->> 'order_id';
  event_id bigint;
  is_processed boolean := false;
begin
  perform internal.require_server_caller('record_payment_event');
  if p_source is null or p_source not in ('webhook', 'status_api', 'poll') then
    raise exception 'a payment event comes from the webhook, the Status API or the poll' using errcode = '22023';
  end if;
  if coalesce(p_event_hash, '') !~ '^[0-9a-f]{64}$' or coalesce(event_order_id, '') = '' then
    raise exception 'a payment event needs its body hash and its order id' using errcode = '22023';
  end if;

  insert into public.payment_events (payment_id, order_id, source, event_hash, transaction_status, fraud_status,
    status_code, gross_amount_raw, payload)
  values ((select p.id from public.payments p where p.order_id = event_order_id), event_order_id, p_source,
          p_event_hash, p_payload ->> 'transaction_status', p_payload ->> 'fraud_status', p_payload ->> 'status_code',
          p_payload ->> 'gross_amount', p_payload)
  on conflict (event_hash) do nothing
  returning id into event_id;
  if event_id is null then
    select e.id, e.processed_at is not null into event_id, is_processed
    from public.payment_events e where e.event_hash = p_event_hash;
  end if;
  return jsonb_build_object('event_id', event_id, 'is_processed', is_processed);
end;
$$;


-- ===== A refused notification, as metadata only =====

-- docs/Security.md §3.3 step 5: the order id, the status code, the body's hash, the sender's address, never the body.
-- The webhook caps these rows per IP before it gets here (webhook_rejection:ip). Three signature failures in ten
-- minutes for an order we really have raise an alert; junk posts naming no order of ours never page anyone (WH-15).
create function internal.record_webhook_rejection(p_reason text, p_order_id text, p_status_code text,
  p_body_sha256 text, p_ip inet, p_user_agent text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  burst_size constant integer := 3;
  burst_window constant interval := interval '10 minutes';
  is_known_order boolean := exists (select 1 from public.payments p where p.order_id = p_order_id);
  failures integer;
begin
  perform internal.require_server_caller('record_webhook_rejection');
  insert into public.webhook_rejections (provider, reason, order_id, status_code, body_sha256, ip, user_agent)
  values ('midtrans', p_reason, left(p_order_id, 64), left(p_status_code, 8), p_body_sha256, p_ip,
          left(p_user_agent, 300));
  if p_reason not in ('signature_invalid', 'merchant_mismatch') or not is_known_order then
    return;
  end if;

  insert into public.security_events (event_type, severity, entity_type, entity_id, details)
  values ('webhook_signature_invalid', case p_reason when 'merchant_mismatch' then 'high' else 'medium' end::public.alert_severity,
          'payments', p_order_id, jsonb_build_object('reason', p_reason, 'body_sha256', p_body_sha256));
  select count(*)::integer into failures from public.webhook_rejections r
  where r.provider = 'midtrans' and r.order_id = p_order_id and r.reason in ('signature_invalid', 'merchant_mismatch')
    and r.received_at > now() - burst_window;
  if failures >= burst_size or p_reason = 'merchant_mismatch' then
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('webhook_signature_burst', 'high', 'webhook_signature_burst:' || p_order_id,
            'Notifikasi Midtrans dengan tanda tangan salah untuk pesanan yang ada',
            jsonb_build_object('order_id', p_order_id, 'failures', failures, 'reason', p_reason))
    on conflict (fingerprint) where acknowledged_at is null do update
    set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1, details = excluded.details,
        notified_at = null;
  end if;
end;
$$;

revoke execute on function internal.record_payment_event(text, text, jsonb),
  internal.record_webhook_rejection(text, text, text, text, inet, text)
  from public, anon, authenticated;

create function public.svc_record_payment_event(p_source text, p_event_hash text, p_payload jsonb) returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.record_payment_event(p_source, p_event_hash, p_payload); $$;

create function public.svc_record_webhook_rejection(p_reason text, p_order_id text default null,
  p_status_code text default null, p_body_sha256 text default null, p_ip inet default null,
  p_user_agent text default null) returns void
  language sql security definer
  set search_path = ''
as $$ select internal.record_webhook_rejection(p_reason, p_order_id, p_status_code, p_body_sha256, p_ip, p_user_agent); $$;

revoke execute on function public.svc_record_payment_event(text, text, jsonb),
  public.svc_record_webhook_rejection(text, text, text, text, inet, text)
  from public, anon, authenticated;
grant execute on function public.svc_record_payment_event(text, text, jsonb),
  public.svc_record_webhook_rejection(text, text, text, text, inet, text)
  to service_role;
