-- Re-review of PR #66, L-G: internal.record_provider_status checks its caller first, as every server-only function of
-- the documents and outbox lanes does (internal.require_server_caller), so nothing but the service role or the
-- database owner ever reaches the outbox rows it moves.

-- Replaces the 20261101120000 version.
create or replace function internal.record_provider_status(
  p_channel public.notification_channel, p_provider_message_id text, p_status text,
  p_error_code text default null, p_occurred_at timestamptz default null
) returns text
  language plpgsql security definer
  set search_path = ''
as $$
declare
  forward constant text[] := array['sent', 'delivered', 'read'];
  failures constant text[] := array['failed', 'bounced', 'complained'];
  message public.notifications;
  reported_at timestamptz := least(coalesce(p_occurred_at, now()), now());
begin
  perform internal.require_server_caller('record_provider_status');
  if p_status is null or not (p_status = any (forward) or p_status = any (failures)) then
    raise exception 'unknown provider status %', p_status using errcode = '22023';
  end if;
  select * into message from public.notifications n
  where n.channel = p_channel and n.provider_message_id = p_provider_message_id
  for update;
  if not found then
    return 'unknown';
  end if;
  if message.dead_at is not null or message.status::text <> all (forward) then
    return 'unchanged';
  end if;

  if p_status = any (failures) then
    perform internal.dead_letter_after_send(message, coalesce(p_error_code, p_channel || '_' || p_status), p_status);
    return 'updated';
  end if;
  if array_position(forward, p_status) <= array_position(forward, message.status::text) then
    return 'unchanged';
  end if;
  update public.notifications n
  set status = p_status::public.notification_status, provider_status = p_status,
      delivered_at = coalesce(n.delivered_at, reported_at),
      read_at = case when p_status = 'read' then coalesce(n.read_at, reported_at) else n.read_at end
  where n.id = message.id;
  return 'updated';
end;
$$;
