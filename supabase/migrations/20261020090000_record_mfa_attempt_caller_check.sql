-- internal.record_mfa_attempt checks its caller as its first statement, as every SECURITY DEFINER function here does
-- (CLAUDE.md §6.2; I3 of the independent review of PR #17). The body is otherwise that of
-- 20261020080100_mfa_verification_hook, which stays as it was applied; create or replace keeps its grants.

create or replace function internal.record_mfa_attempt(p_user_id uuid, p_factor_id uuid, p_succeeded boolean) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  lockout_window constant interval := interval '15 minutes';
  failures_allowed constant integer := 5;
  rejection constant jsonb := jsonb_build_object(
    'decision', 'reject',
    'message', 'Terlalu banyak kode yang salah. Coba lagi dalam 15 menit.'
  );
  alert_fingerprint constant text := 'mfa_locked:' || p_user_id::text;
  earlier_failures integer;
  staff_rw_id smallint;
begin
  -- Only Auth, through hook_mfa_verification_attempt, and the database owner's own sessions (migrations, pgTAP) count
  -- attempts. An API role arrives with a role set by PostgREST and is refused here, so a grant added by mistake still
  -- lets nobody lock an account or write its events.
  if session_user not in ('supabase_auth_admin', 'postgres')
     or coalesce(current_setting('role', true), 'none') <> 'none' then
    raise exception 'record_mfa_attempt is reserved for Auth' using errcode = '42501';
  end if;

  -- Parallel guesses would otherwise all count the same earlier failures and all get through; one account's
  -- attempts take turns instead.
  perform pg_advisory_xact_lock(hashtext('mfa_attempts:' || p_user_id::text));
  select count(*) into earlier_failures
  from public.security_events
  where event_type = 'mfa_failed' and actor_id = p_user_id and occurred_at > now() - lockout_window;

  -- Failures are counted before the code is believed, so while the window is full even the right code is refused.
  -- Nothing more is written then, so guessing on cannot flood security_events; the open alert counts the attempts.
  if earlier_failures >= failures_allowed then
    update public.security_alerts
    set occurrences = occurrences + 1, last_seen_at = now()
    where fingerprint = alert_fingerprint and acknowledged_at is null;
    return rejection;
  end if;

  if p_succeeded then
    return jsonb_build_object('decision', 'continue');
  end if;

  select rw_id into staff_rw_id from public.profiles where id = p_user_id;
  insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
  values ('mfa_failed', 'info', p_user_id, staff_rw_id, 'mfa_factor', p_factor_id::text,
          jsonb_build_object('failures', earlier_failures + 1));

  if earlier_failures + 1 < failures_allowed then
    return jsonb_build_object('decision', 'continue');
  end if;

  insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
  values ('mfa_locked', 'high', p_user_id, staff_rw_id, 'mfa_factor', p_factor_id::text,
          jsonb_build_object('failures', failures_allowed));
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values ('mfa_locked', 'high', alert_fingerprint, 'Akun staf dikunci setelah kode autentikator salah berulang kali',
          jsonb_build_object('user_id', p_user_id, 'failures', failures_allowed))
  on conflict (fingerprint) where acknowledged_at is null do update
  set last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1, notified_at = null;
  return rejection;
end;
$$;
