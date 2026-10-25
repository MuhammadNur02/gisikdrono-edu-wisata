-- Re-review of PR #58 at fb759d9 (docs/Security.md §5.2, §5.6, §11.2; AUTH-09, AUTH-12, MON-03):
--   N1  consume_mfa_reenrolment_code cleared reenrolment_required before any factor was verified, and nothing set it
--       again: a real officer who used the code and then abandoned the enrolment left the account open to anyone with
--       the password, straight through GoTrue, with no code. Using the code now opens a ten-minute window and keeps the
--       wait: a new factor is verified only inside the window, and the first verified factor ends both. An expired
--       window needs a new code from the superadmin.
--   N2  (1) an open high or critical alert seen again after it went out of band never went out again; a sighting at
--       least an hour after the last delivery now queues it again. (2) A sole superadmin could never acknowledge an
--       alert that names them: acknowledge_alert_as_sole_superadmin lets them, only as the one active superadmin, 24
--       hours after the alert reached the out-of-band contacts and with a reason, and that is itself a high alert that
--       goes out of band (the single-superadmin control of docs/PRD.md: a delay plus mail to the kelurahan head).
--       (3) internal.break_glass_reset_mfa: the Supabase project owner's audited reset for a sole superadmin who lost
--       their authenticator (runbook in docs/Security.md §11.4).


-- ===== N1: the re-enrolment window =====

alter table public.profiles add column reenrolment_window_until timestamptz,
  add constraint profiles_reenrolment_window check (reenrolment_window_until is null or reenrolment_required);

-- Replaces the 20261029080200 version: the window moves only with the wait.
create or replace function internal.profiles_reenrolment_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if (new.reenrolment_required, new.reenrolment_window_until)
       is distinct from (old.reenrolment_required, old.reenrolment_window_until)
     and coalesce(current_setting('app.privileged_rpc', true), '') <> 'on'
     and coalesce(current_setting('role', true), 'none') <> 'none' then
    raise exception 'reenrolment_required changes only through reset_staff_mfa and the re-enrolment code'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Replaces the 20261029080200 version: using the code opens the window and keeps the wait.
create or replace function internal.consume_mfa_reenrolment_code(p_user_id uuid, p_code_hash text) returns boolean
  language plpgsql
  set search_path = ''
as $$
declare
  window_length constant interval := interval '10 minutes';
  previous_settings jsonb;
begin
  perform 1 from public.profiles p where p.id = p_user_id for update;
  if not internal.check_mfa_reenrolment_code(p_user_id, p_code_hash) then
    return false;
  end if;
  previous_settings := internal.push_settings('{"app.privileged_rpc": "on"}');
  update public.profiles
  set mfa_reenrol_code_hash = null, mfa_reenrol_expires_at = null, reenrolment_window_until = now() + window_length
  where id = p_user_id;
  perform internal.restore_settings(previous_settings);
  perform internal.record_reenrolment_step(p_user_id, 'reenrolment_code_used');
  return true;
end;
$$;

-- Replaces the 20261029080200 version: while the account waits, a factor is verified only inside its window.
create or replace function internal.mfa_factor_verification_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  old_status text := case when tg_op = 'UPDATE' then old.status::text end;
begin
  if internal.factor_becomes_verified(tg_op, new.status::text, old_status)
     and exists (select 1 from public.profiles p
                 where p.id = new.user_id and p.reenrolment_required
                   and (p.reenrolment_window_until is null or p.reenrolment_window_until <= now())) then
    raise exception 'a new authenticator after an MFA reset needs the superadmin''s re-enrolment code'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Replaces the 20261029080200 version: the first factor verified inside the window ends the wait.
create or replace function internal.record_mfa_enrolment() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  old_status text := case when tg_op = 'UPDATE' then old.status::text end;
  previous_settings jsonb;
  ends_wait boolean;
begin
  if not internal.factor_becomes_verified(tg_op, new.status::text, old_status) then
    return null;
  end if;
  select p.reenrolment_required into ends_wait from public.profiles p where p.id = new.user_id;
  insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
  values ('mfa_enrolled', 'high', new.user_id, (select p.rw_id from public.profiles p where p.id = new.user_id),
          'profiles', new.user_id::text,
          jsonb_build_object('factor_id', new.id, 'user_id', new.user_id, 'after_reset', coalesce(ends_wait, false)));
  if coalesce(ends_wait, false) then
    previous_settings := internal.push_settings(jsonb_build_object('app.privileged_rpc', 'on',
                                                                   'app.actor_id', new.user_id::text,
                                                                   'app.actor_role', 'service'));
    update public.profiles set reenrolment_required = false, reenrolment_window_until = null where id = new.user_id;
    perform internal.restore_settings(previous_settings);
  end if;
  return null;
end;
$$;


-- ===== N2 (1): a repeat sighting goes out again =====

create function internal.alert_due_again(p_severity public.alert_severity, p_notified_at timestamptz) returns boolean
  language sql stable
  set search_path = ''
as $$
  select p_severity in ('high', 'critical') and p_notified_at is not null and p_notified_at <= now() - interval '1 hour';
$$;
revoke execute on function internal.alert_due_again(public.alert_severity, timestamptz)
  from public, anon, authenticated, service_role;

-- Replaces the 20261029080200 version. A high or critical alert seen again at least an hour after it was delivered is
-- queued for the out-of-band sender once more (notified_at and its lease cleared); within the hour it only counts.
create or replace function internal.raise_anomaly(
  p_rule text, p_severity public.alert_severity, p_subject text, p_title text, p_details jsonb
) returns void
  language sql
  set search_path = ''
as $$
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values (p_rule, p_severity, p_rule || ':' || coalesce(p_subject, '-'), p_title, coalesce(p_details, '{}'))
  on conflict (fingerprint) where acknowledged_at is null do update
  set details = excluded.details, last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1,
      notified_at = case when internal.alert_due_again(public.security_alerts.severity, public.security_alerts.notified_at)
                         then null else public.security_alerts.notified_at end,
      delivery_claimed_at = case when internal.alert_due_again(public.security_alerts.severity,
                                                                public.security_alerts.notified_at)
                                 then null else public.security_alerts.delivery_claimed_at end;
$$;

-- ===== N2 (2): a sole superadmin's acknowledgement =====

alter table public.security_events drop constraint security_events_event_type_check;
alter table public.security_events add constraint security_events_event_type_check check (event_type in (
  'webhook_signature_invalid','webhook_amount_mismatch','status_disagreement','login_failed','login_locked',
  'mfa_failed','mfa_enrolled','scanner_invalid_signature','scanner_lockout','rate_limited','turnstile_failed',
  'upload_rejected','role_changed','staff_disabled','key_rotated','export_downloaded','pii_revealed',
  'manual_checkin','manual_backfill','undo_check_in','cron_failed','notification_dead','price_changed',
  'session_changed_with_bookings','quota_pressure','mfa_reset','notification_blocked','upload_sanitized',
  'mfa_locked','session_revoke_failed','manual_lookup','alert_self_ack_sole_superadmin'));

-- The alert of p_alert_id that names the caller, as the kelurahan's only active superadmin, with a fresh code, at
-- least 24 hours after it reached the out-of-band contacts, with a reason of 10 to 500 characters. The step is a
-- high security event and a high alert of its own, which goes out of band in turn.
create function public.acknowledge_alert_as_sole_superadmin(p_alert_id uuid, p_reason text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  wait constant interval := interval '24 hours';
  alert record;
  step jsonb;
begin
  perform internal.require_superadmin_step_up();
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'acknowledging an alert about yourself needs a reason of 10 to 500 characters' using errcode = '22023';
  end if;
  if (select count(*) from public.profiles p where p.role = 'superadmin' and p.is_active) <> 1 then
    raise exception 'only the sole active superadmin acknowledges an alert about themselves; ask another superadmin'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  select a.id, a.rule, a.notified_at, a.acknowledged_at, a.details into alert
  from public.security_alerts a where a.id = p_alert_id for update;
  if not found then
    raise exception 'no alert %', p_alert_id using errcode = 'P0002';
  end if;
  if alert.acknowledged_at is not null or not (coalesce(alert.details -> 'involved', '[]') ? auth.uid()::text)
     or alert.notified_at is null or alert.notified_at > now() - wait then
    raise exception 'this alert is open, names you and went out of band 24 hours ago, or it takes the ordinary path'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  update public.security_alerts set acknowledged_by = auth.uid() where id = p_alert_id;
  step := jsonb_build_object('alert_id', p_alert_id, 'rule', alert.rule, 'by', auth.uid(), 'reason', btrim(p_reason));
  insert into public.security_events (event_type, severity, actor_id, entity_type, entity_id, details)
  values ('alert_self_ack_sole_superadmin', 'high', auth.uid(), 'security_alerts', p_alert_id::text, step);
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values ('alert_self_ack_sole_superadmin', 'high', 'alert_self_ack_sole_superadmin:' || p_alert_id,
          'Superadmin tunggal menutup peringatan tentang dirinya', step - 'reason');
  perform internal.log_audit('security.alert_self_ack_sole_superadmin', 'security_alerts', p_alert_id::text,
                             step - 'alert_id');
end;
$$;
revoke execute on function public.acknowledge_alert_as_sole_superadmin(uuid, text) from public, anon, service_role;
grant execute on function public.acknowledge_alert_as_sole_superadmin(uuid, text) to authenticated;


-- ===== N2 (3): break-glass for a sole superadmin who lost their authenticator =====

-- Run by the Supabase project owner in the SQL editor (the postgres role; no API role may execute it, and a call
-- with a signed-in user is refused), for the only active superadmin, with a reason. It deletes their factors and
-- sessions, bumps claims_version and opens a 30-minute re-enrolment window without a code: there is no second
-- superadmin to issue one. Each call is a critical mfa_reset event and alert that goes out of band, and an audit row.
-- Returns when the window closes. Production keeps at least two superadmins (docs/Task.md P5.7.07), so this stays rare.
create function internal.break_glass_reset_mfa(p_user_id uuid, p_reason text) returns timestamptz
  language plpgsql
  set search_path = ''
as $$
declare
  window_length constant interval := interval '30 minutes';
  previous_settings jsonb;
  window_until timestamptz := now() + window_length;
  step jsonb;
begin
  if auth.uid() is not null then
    raise exception 'break-glass runs from the SQL editor, never through the API' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'break-glass needs a reason of 10 to 500 characters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.role = 'superadmin' and p.is_active)
     or exists (select 1 from public.profiles p where p.id <> p_user_id and p.role = 'superadmin' and p.is_active) then
    raise exception 'break-glass is for the only active superadmin; another superadmin uses reset_staff_mfa'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  delete from auth.mfa_factors where user_id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;
  -- The audit rows name the superadmin it ran for; details.by names the database role that ran it.
  previous_settings := internal.push_settings(jsonb_build_object('app.privileged_rpc', 'on',
                                                                 'app.actor_id', p_user_id::text,
                                                                 'app.actor_role', 'service'));
  update public.profiles
  set claims_version = claims_version + 1, mfa_reset_requested_at = null, mfa_reset_requested_by = null,
      mfa_reenrol_code_hash = null, mfa_reenrol_expires_at = null,
      reenrolment_required = true, reenrolment_window_until = window_until
  where id = p_user_id;

  step := jsonb_build_object('change', 'mfa_reset', 'stage', 'break_glass', 'user_id', p_user_id,
                             'by', session_user, 'reason', btrim(p_reason));
  insert into public.security_events (event_type, severity, actor_id, entity_type, entity_id, details)
  values ('mfa_reset', 'critical', p_user_id, 'profiles', p_user_id::text, step);
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values ('mfa_reset', 'critical', 'mfa_reset:' || p_user_id, 'Reset MFA darurat oleh pemilik proyek', step - 'reason')
  on conflict (fingerprint) where acknowledged_at is null do update
  set title = excluded.title, details = excluded.details, last_seen_at = now(),
      occurrences = public.security_alerts.occurrences + 1, notified_at = null, delivery_claimed_at = null;
  perform internal.log_audit('staff.mfa_break_glass', 'profiles', p_user_id::text, step - 'user_id');
  perform internal.restore_settings(previous_settings);
  return window_until;
end;
$$;
revoke execute on function internal.break_glass_reset_mfa(uuid, text) from public, anon, authenticated, service_role;
