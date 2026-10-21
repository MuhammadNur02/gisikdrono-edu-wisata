-- Review of PR #20 (M1, L1, L3, L4). A code now belongs to the browser that asked for it: the server gives each
-- browser a signed random id (the gsk_otp_browser cookie) and hands these functions its keyed hash. That closes three
-- holes in 20261021100100_guest_otp_functions.sql, which stays as applied:
--   M1  Anyone could ask for a code for a stranger's number and so cancel the code that visitor was about to type,
--       or spend the number's five codes of the day. A new code now replaces only its own browser's open code, the
--       cooldown and the five-a-day cap count per number and browser, and a number gets fifteen codes a day in all,
--       from however many browsers, which bounds what the WhatsApp bill and the recipient's phone can be made to bear.
--   L1  The soft breaker counted messages WhatsApp had accepted, which lag behind the codes issued; it now counts the
--       WhatsApp codes issued in the last day, the same rows the caps count.
--   L3  verify_phone_otp checked a code by its id alone, whatever it was for; it now finds the code by purpose,
--       channel, number or address and browser, so a code issued to prove a data request never proves a booking's
--       phone.
-- The Next.js server tells the visitor the same thing for sent, cooldown and limited (L4); the detail stays here for
-- the tests and the logs. The code hash is now keyed by the browser id instead of the row id, since the browser no
-- longer learns the row's id: HMAC-SHA256(OTP_PEPPER, 'gsk-otp-code-v1' || E'\n' || browser id || ':' || code).

-- Rows issued before this migration have no browser and no function matches them; they expire within five minutes.
alter table public.guest_otps add column browser_hash text check (browser_hash ~ '^[0-9a-f]{64}$');
create index guest_otps_browser_idx on public.guest_otps (browser_hash, created_at desc);
create index guest_otps_whatsapp_issued_idx on public.guest_otps (created_at) where phone is not null;
drop index public.notifications_otp_sent_idx;

drop function public.svc_issue_phone_otp(uuid, public.otp_purpose, public.notification_channel, text, text, text, text, uuid, inet);
drop function public.svc_verify_phone_otp(uuid, text);
drop function internal.issue_phone_otp(uuid, public.otp_purpose, public.notification_channel, text, text, text, text, uuid, inet);
drop function internal.verify_phone_otp(uuid, text);
drop function internal.whatsapp_otps_sent_today(integer);

-- WhatsApp codes issued in the last day, and the alerts the soft breaker raises: at half its limit, so the superadmin
-- can look before it trips, and when it trips (docs/Security.md §4.1 point 4). An open alert is updated, not repeated.
create function internal.whatsapp_otps_issued_today(p_breaker integer) returns integer
  language plpgsql security definer
  set search_path = ''
as $$
declare
  issued integer;
  stage text;
begin
  select count(*)::integer into issued from public.guest_otps o
  where o.phone is not null and o.created_at > now() - interval '1 day';
  stage := case when issued >= p_breaker then 'tripped' when issued * 2 >= p_breaker then 'half' end;
  if stage is not null then
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('otp_breaker', case stage when 'tripped' then 'critical' else 'high' end::public.alert_severity,
            format('otp_breaker:%s:%s', stage, public.today_jkt()),
            case stage when 'tripped' then 'OTP WhatsApp harian habis; pemesan diminta OTP lewat email'
                       else 'OTP WhatsApp hari ini sudah separuh dari batas harian' end,
            jsonb_build_object('issued', issued, 'limit', p_breaker))
    on conflict (fingerprint) where acknowledged_at is null do update
    set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1,
        details = excluded.details;
  end if;
  return issued;
end;
$$;

-- The caps of one request, in the order they are checked: this browser's minute, then the day's codes for this
-- browser and number, for the number in all, and for the IP. Null when none is reached.
create function internal.otp_cap_reached(
  p_purpose public.otp_purpose, p_target text, p_browser_hash text, p_ip inet
) returns jsonb
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  cooldown constant interval := interval '60 seconds';
  per_browser constant integer := 5;
  per_target constant integer := 15;
  per_ip constant integer := 20;
  last_issued timestamptz;
begin
  select max(o.created_at) into last_issued from public.guest_otps o
  where (o.phone = p_target or o.email = p_target) and o.purpose = p_purpose and o.browser_hash = p_browser_hash;
  if last_issued > now() - cooldown then
    return jsonb_build_object('result', 'cooldown',
      'retry_after', ceil(extract(epoch from (last_issued + cooldown - now())))::integer);
  end if;
  if (select count(*) from public.guest_otps o
      where (o.phone = p_target or o.email = p_target) and o.browser_hash = p_browser_hash
        and o.created_at > now() - interval '1 day') >= per_browser
     or (select count(*) from public.guest_otps o
         where (o.phone = p_target or o.email = p_target) and o.created_at > now() - interval '1 day') >= per_target
     or (p_ip is not null and (select count(*) from public.guest_otps o
         where o.ip = p_ip and o.created_at > now() - interval '1 day') >= per_ip) then
    return jsonb_build_object('result', 'limited');
  end if;
  return null;
end;
$$;

-- Issues a code for p_phone (channel whatsapp) or p_email (channel email) to the browser p_browser_hash names, and
-- queues the message that carries it. Returns {result: sent, otp_id, expires_at}, or instead of failing: degraded
-- (WhatsApp is off or its daily breaker has tripped, so the form switches to email and an interactive Turnstile),
-- unavailable (email codes are only for that case), cooldown (with retry_after seconds) or limited.
create function internal.issue_phone_otp(
  p_otp_id uuid, p_purpose public.otp_purpose, p_channel public.notification_channel, p_browser_hash text,
  p_code_hash text, p_code text, p_phone text default null, p_email text default null, p_booking_id uuid default null,
  p_ip inet default null
) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  validity constant interval := interval '5 minutes';
  breaker constant integer := 500;
  target text := case p_channel when 'whatsapp' then p_phone else lower(trim(p_email)) end;
  whatsapp_open boolean;
  refusal jsonb;
  booking record;
begin
  if p_otp_id is null or p_purpose is null or p_channel is null or coalesce(p_code, '') !~ '^[0-9]{6}$'
     or coalesce(p_code_hash, '') !~ '^[0-9a-f]{64}$' or coalesce(p_browser_hash, '') !~ '^[0-9a-f]{64}$'
     or (p_channel = 'whatsapp' and coalesce(p_phone, '') !~ '^\+628[0-9]{7,11}$')
     or (p_channel = 'email' and coalesce(target, '') !~ '^[^@[:space:]]+@[^@[:space:]]+$') then
    raise exception 'an OTP needs an id, a purpose, a browser, an Indonesian mobile number or an email address, six digits and their keyed hash'
      using errcode = '22023';
  end if;
  if p_booking_id is not null then
    select b.pic_phone, b.pic_email::text as pic_email into booking from public.bookings b where b.id = p_booking_id;
    if not found or target is distinct from (case p_channel when 'whatsapp' then booking.pic_phone else lower(booking.pic_email) end) then
      raise exception 'a booking''s code goes only to that booking''s own contact' using errcode = '42501';
    end if;
  end if;

  whatsapp_open := internal.setting_is_on('whatsapp_enabled') and internal.whatsapp_otps_issued_today(breaker) < breaker;
  if p_channel = 'whatsapp' and not whatsapp_open then
    return jsonb_build_object('result', 'degraded');
  end if;
  if p_channel = 'email' and (whatsapp_open or not internal.setting_is_on('email_enabled')) then
    return jsonb_build_object('result', 'unavailable');
  end if;

  -- Two requests for one number or from one IP take turns, so no cap can be overrun by asking at once.
  perform pg_advisory_xact_lock(hashtextextended('guest_otp:' || target, 0));
  if p_ip is not null then
    perform pg_advisory_xact_lock(hashtextextended('guest_otp_ip:' || p_ip::text, 0));
  end if;
  refusal := internal.otp_cap_reached(p_purpose, target, p_browser_hash, p_ip);
  if refusal is not null then
    return refusal;
  end if;

  -- A new code replaces this browser's open ones for the same number or address, and their unsent messages go with
  -- them; another browser's code is left alone.
  update public.notifications n set status = 'cancelled', params = '{}', last_error_code = 'otp_replaced'
  where n.template = 'phone_otp' and n.status in ('queued', 'failed') and n.dead_at is null
    and n.dedupe_key in (select 'otp:' || o.id from public.guest_otps o
                         where (o.phone = target or o.email = target) and o.purpose = p_purpose
                           and o.browser_hash = p_browser_hash and o.consumed_at is null and o.verified_at is null);
  update public.guest_otps o set consumed_at = now()
  where (o.phone = target or o.email = target) and o.purpose = p_purpose and o.browser_hash = p_browser_hash
    and o.consumed_at is null and o.verified_at is null;

  insert into public.guest_otps (id, purpose, phone, email, booking_id, code_hash, browser_hash, expires_at, ip)
  values (p_otp_id, p_purpose, case p_channel when 'whatsapp' then target end,
          case p_channel when 'email' then target end, p_booking_id, p_code_hash, p_browser_hash, now() + validity, p_ip);
  -- No booking_id: the code belongs to the guest_otps row, which notifications_guest_guard lets through.
  insert into public.notifications (channel, template, recipient, params, dedupe_key)
  values (p_channel, 'phone_otp', target, jsonb_build_object('code', p_code), 'otp:' || p_otp_id);
  return jsonb_build_object('result', 'sent', 'otp_id', p_otp_id, 'expires_at', now() + validity);
end;
$$;

-- Checks a code against the latest one this browser holds for this purpose and number or address. Returns
-- {result: verified, otp_id, purpose, phone, email}, or wrong_code (with attempts_left), locked (five wrong codes end
-- the code), expired, or invalid (no such code, or already used or replaced). The hashes compared are keyed with
-- OTP_PEPPER, so the time the comparison takes says nothing about the code. A code for an existing booking's own
-- number also marks that number verified.
create function internal.verify_phone_otp(
  p_purpose public.otp_purpose, p_channel public.notification_channel, p_browser_hash text, p_code_hash text,
  p_phone text default null, p_email text default null
) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  target text := case p_channel when 'whatsapp' then p_phone else lower(trim(p_email)) end;
  otp public.guest_otps;
  previous_settings jsonb;
begin
  select * into otp from public.guest_otps o
  where o.purpose = p_purpose and o.browser_hash = p_browser_hash
    and (case p_channel when 'whatsapp' then o.phone = target else o.email = target end)
  order by o.created_at desc
  limit 1
  for update;
  if not found or otp.verified_at is not null then
    return jsonb_build_object('result', 'invalid');
  end if;
  if otp.consumed_at is not null then
    return jsonb_build_object('result', case when otp.attempts >= otp.max_attempts then 'locked' else 'invalid' end);
  end if;
  if otp.expires_at <= now() then
    return jsonb_build_object('result', 'expired');
  end if;

  if otp.code_hash is distinct from p_code_hash then
    update public.guest_otps o set attempts = o.attempts + 1,
      consumed_at = case when o.attempts + 1 >= o.max_attempts then now() end
    where o.id = otp.id;
    if otp.attempts + 1 >= otp.max_attempts then
      return jsonb_build_object('result', 'locked');
    end if;
    return jsonb_build_object('result', 'wrong_code', 'attempts_left', otp.max_attempts - otp.attempts - 1);
  end if;

  update public.guest_otps o set attempts = o.attempts + 1, verified_at = now() where o.id = otp.id;
  if otp.booking_id is not null and otp.purpose = 'booking_phone' and otp.phone is not null then
    previous_settings := internal.push_settings('{"app.actor_role": "visitor"}');
    update public.bookings b set phone_verified_at = now() where b.id = otp.booking_id and b.pic_phone = otp.phone;
    perform internal.restore_settings(previous_settings);
  end if;
  return jsonb_build_object('result', 'verified', 'otp_id', otp.id, 'purpose', otp.purpose, 'phone', otp.phone,
                            'email', otp.email::text);
end;
$$;

revoke execute on function internal.whatsapp_otps_issued_today(integer),
  internal.otp_cap_reached(public.otp_purpose, text, text, inet),
  internal.issue_phone_otp(uuid, public.otp_purpose, public.notification_channel, text, text, text, text, text, uuid, inet),
  internal.verify_phone_otp(public.otp_purpose, public.notification_channel, text, text, text, text)
  from public, anon, authenticated;

-- PostgREST exposes public only (decision of 2026-10-16).
create function public.svc_issue_phone_otp(
  p_otp_id uuid, p_purpose public.otp_purpose, p_channel public.notification_channel, p_browser_hash text,
  p_code_hash text, p_code text, p_phone text default null, p_email text default null, p_booking_id uuid default null,
  p_ip inet default null
) returns jsonb
  language sql security definer
  set search_path = ''
as $$
  select internal.issue_phone_otp(p_otp_id, p_purpose, p_channel, p_browser_hash, p_code_hash, p_code, p_phone, p_email,
                                  p_booking_id, p_ip);
$$;

create function public.svc_verify_phone_otp(
  p_purpose public.otp_purpose, p_channel public.notification_channel, p_browser_hash text, p_code_hash text,
  p_phone text default null, p_email text default null
) returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.verify_phone_otp(p_purpose, p_channel, p_browser_hash, p_code_hash, p_phone, p_email); $$;

revoke execute on function
  public.svc_issue_phone_otp(uuid, public.otp_purpose, public.notification_channel, text, text, text, text, text, uuid, inet),
  public.svc_verify_phone_otp(public.otp_purpose, public.notification_channel, text, text, text, text)
  from public, anon, authenticated;
grant execute on function
  public.svc_issue_phone_otp(uuid, public.otp_purpose, public.notification_channel, text, text, text, text, text, uuid, inet),
  public.svc_verify_phone_otp(public.otp_purpose, public.notification_channel, text, text, text, text)
  to service_role;
