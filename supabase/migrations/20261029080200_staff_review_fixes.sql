-- Independent review of PR #58 (docs/Security.md §5.2–§5.6, §11.2; AUTH-09, AUTH-12, MON-02):
--   H1  after reset_staff_mfa the account kept its role, so whoever held the password could enrol a new authenticator,
--       reach AAL2 with the full role and never need the superadmin's re-enrolment code. A completed reset now sets
--       profiles.reenrolment_required: while it is set the account's token carries no role, and a new factor of the
--       account cannot be verified (a guard on auth.mfa_factors, so GoTrue's own /factors path is covered too) until
--       consume_mfa_reenrolment_code clears it. Every factor verification is an mfa_enrolled security event, which the
--       anomaly scan raises. A re-enrolment code is issued only after such a reset.
--   M1  self-acknowledgement: every alert keeps the ids of the people it concerns and of those who acted in
--       details.involved, merged and never overwritten (a later sighting adds, a NULL never erases), and the
--       acknowledge policy refuses anyone named there, for every rule and severity.
--   Lows: the anomaly rules read at most 200 subjects a run; an alert's fingerprint is its rule and subject, deduped
--       while it is open rather than per hour; an order id reaches the out-of-band contacts as a short hash only; the
--       chains are checked by a call of their own, so a failing scan never skips them.
--   CI: set_staff_role refuses the caller's own row before anything else, so the reason stays the same.


-- ===== H1: a reset requires the superadmin's code =====

alter table public.profiles add column reenrolment_required boolean not null default false;

-- Only the privileged staff RPCs (and migrations, the seed and tests, as the database owner) set or clear it.
create function internal.profiles_reenrolment_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if new.reenrolment_required is distinct from old.reenrolment_required
     and coalesce(current_setting('app.privileged_rpc', true), '') <> 'on'
     and coalesce(current_setting('role', true), 'none') <> 'none' then
    raise exception 'reenrolment_required changes only through reset_staff_mfa and the re-enrolment code'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function internal.profiles_reenrolment_guard() from public, anon, authenticated, service_role;
create trigger profiles_reenrolment_guard before update on public.profiles
  for each row execute function internal.profiles_reenrolment_guard();

-- Replaces the 0004 version: an account waiting for its re-enrolment code carries no role.
create or replace function internal.staff_token_claims(p_user_id uuid) returns jsonb
  language sql stable security definer
  set search_path = ''
as $$
  -- A second verified factor means someone else may have enrolled theirs (AUTH-12), and an account after an MFA reset
  -- waits for the superadmin's code (P4.8.05): either way the account carries no role.
  select case
    when p.id is null or not p.is_active or p.reenrolment_required
      or (select count(*) from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified') > 1
      then jsonb_build_object('app_role', 'none', 'app_rw_id', null, 'claims_version', 0)
    else jsonb_build_object('app_role', p.role::text, 'app_rw_id', p.rw_id, 'claims_version', p.claims_version)
  end
  from (select 1) as once
  left join public.profiles p on p.id = p_user_id;
$$;

-- Replaces the 0004 version: the completed reset leaves the account waiting for its re-enrolment code.
create or replace function public.reset_staff_mfa(p_user_id uuid) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  requested_at timestamptz;
begin
  perform internal.require_superadmin_step_up();
  if p_user_id = auth.uid() then
    raise exception 'a superadmin never resets their own MFA' using errcode = '42501';
  end if;
  select p.mfa_reset_requested_at into requested_at from public.profiles p where p.id = p_user_id;
  if not found then
    raise exception 'no staff profile %', p_user_id using errcode = 'P0002';
  end if;

  if not internal.staff_change_is_due(requested_at) then
    if requested_at is null or internal.staff_change_has_lapsed(requested_at) then
      previous_settings := internal.push_settings('{"app.privileged_rpc": "on"}');
      update public.profiles set mfa_reset_requested_at = now(), mfa_reset_requested_by = auth.uid() where id = p_user_id;
      perform internal.restore_settings(previous_settings);
      perform internal.record_staff_change_step(p_user_id, 'mfa_reset', 'requested');
      return internal.staff_change_requested();
    end if;
    raise exception 'this MFA reset can be completed after %', requested_at + internal.staff_change_delay()
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  delete from auth.mfa_factors where user_id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;
  previous_settings := internal.push_settings('{"app.privileged_rpc": "on"}');
  update public.profiles
  set mfa_reset_requested_at = null, mfa_reset_requested_by = null, claims_version = claims_version + 1,
      reenrolment_required = true
  where id = p_user_id;
  perform internal.restore_settings(previous_settings);
  perform internal.record_staff_change_step(p_user_id, 'mfa_reset', 'completed');
  return jsonb_build_object('stage', 'completed');
end;
$$;

-- No factor of an account waiting for its code becomes verified, whichever path asks (the app or GoTrue directly);
-- every factor that does is an mfa_enrolled event.
-- A factor becomes verified when it is written verified (GoTrue writes it unverified first; a seed may not) or moves
-- to verified.
create function internal.factor_becomes_verified(p_op text, p_status text, p_old_status text) returns boolean
  language sql immutable
  set search_path = ''
as $$
  select p_status = 'verified' and (p_op = 'INSERT' or p_old_status is distinct from 'verified');
$$;

create function internal.mfa_factor_verification_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  old_status text := case when tg_op = 'UPDATE' then old.status::text end;
begin
  if internal.factor_becomes_verified(tg_op, new.status::text, old_status)
     and exists (select 1 from public.profiles p where p.id = new.user_id and p.reenrolment_required) then
    raise exception 'a new authenticator after an MFA reset needs the superadmin''s re-enrolment code'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create function internal.record_mfa_enrolment() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  old_status text := case when tg_op = 'UPDATE' then old.status::text end;
begin
  if internal.factor_becomes_verified(tg_op, new.status::text, old_status) then
    insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
    values ('mfa_enrolled', 'high', new.user_id, (select p.rw_id from public.profiles p where p.id = new.user_id),
            'profiles', new.user_id::text, jsonb_build_object('factor_id', new.id, 'user_id', new.user_id));
  end if;
  return null;
end;
$$;
revoke execute on function internal.factor_becomes_verified(text, text, text),
  internal.mfa_factor_verification_guard(), internal.record_mfa_enrolment()
  from public, anon, authenticated, service_role;
create trigger mfa_factor_verification_guard before insert or update of status on auth.mfa_factors
  for each row execute function internal.mfa_factor_verification_guard();
create trigger record_mfa_enrolment after insert or update of status on auth.mfa_factors
  for each row execute function internal.record_mfa_enrolment();

-- Replaces the 20261029080000 version: a code goes only to an account whose MFA reset completed.
create or replace function public.issue_mfa_reenrolment_code(p_user_id uuid, p_code_hash text) returns timestamptz
  language plpgsql security definer
  set search_path = ''
as $$
declare
  ttl constant interval := interval '24 hours';
  previous_settings jsonb;
  code_expires_at timestamptz := now() + ttl;
begin
  perform internal.require_superadmin_step_up();
  if p_user_id = auth.uid() then
    raise exception 'a superadmin never issues their own re-enrolment code' using errcode = '42501';
  end if;
  if coalesce(p_code_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'a re-enrolment code is stored as its keyed hash' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'no staff profile %', p_user_id using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.reenrolment_required)
     or internal.has_verified_factor(p_user_id) then
    raise exception 'a re-enrolment code follows a completed MFA reset only'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  previous_settings := internal.push_settings('{"app.privileged_rpc": "on"}');
  update public.profiles set mfa_reenrol_code_hash = p_code_hash, mfa_reenrol_expires_at = code_expires_at
  where id = p_user_id;
  perform internal.restore_settings(previous_settings);
  perform internal.record_reenrolment_step(p_user_id, 'reenrolment_code_issued');
  return code_expires_at;
end;
$$;

-- Replaces the 20261029080000 version: using the code lets the account's next factor be verified.
create or replace function internal.consume_mfa_reenrolment_code(p_user_id uuid, p_code_hash text) returns boolean
  language plpgsql
  set search_path = ''
as $$
declare
  previous_settings jsonb;
begin
  perform 1 from public.profiles p where p.id = p_user_id for update;
  if not internal.check_mfa_reenrolment_code(p_user_id, p_code_hash) then
    return false;
  end if;
  previous_settings := internal.push_settings('{"app.privileged_rpc": "on"}');
  update public.profiles
  set mfa_reenrol_code_hash = null, mfa_reenrol_expires_at = null, reenrolment_required = false
  where id = p_user_id;
  perform internal.restore_settings(previous_settings);
  perform internal.record_reenrolment_step(p_user_id, 'reenrolment_code_used');
  return true;
end;
$$;


-- ===== CI: the caller's own row first =====

-- Replaces the 20261029080000 version: the own-row refusal comes before the factor check, as it did before it.
create or replace function public.set_staff_role(p_user_id uuid, p_role public.app_role, p_rw_id smallint default null)
  returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  previous record;
  is_promotion boolean;
begin
  perform internal.require_superadmin_step_up();
  if p_user_id = auth.uid() then
    raise exception 'a staff member cannot change their own role or status' using errcode = '42501';
  end if;
  if (p_role = 'admin_rw') <> (p_rw_id is not null) then
    raise exception 'an RW admin needs an RW, and only an RW admin has one' using errcode = '22023';
  end if;
  select p.role, p.rw_id, p.promotion_requested_at into previous from public.profiles p where p.id = p_user_id;
  if not found then
    raise exception 'no staff profile %', p_user_id using errcode = 'P0002';
  end if;
  if p_role <> 'none' and not internal.has_verified_factor(p_user_id) then
    raise exception 'a role goes only to an account with its own verified authenticator'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  is_promotion := p_role = 'superadmin' and previous.role <> 'superadmin';
  if is_promotion and not internal.staff_change_is_due(previous.promotion_requested_at) then
    if previous.promotion_requested_at is null or internal.staff_change_has_lapsed(previous.promotion_requested_at) then
      previous_settings := internal.push_settings('{"app.privileged_rpc": "on"}');
      update public.profiles set promotion_requested_at = now(), promotion_requested_by = auth.uid() where id = p_user_id;
      perform internal.restore_settings(previous_settings);
      perform internal.record_staff_change_step(p_user_id, 'superadmin_promotion', 'requested');
      return internal.staff_change_requested();
    end if;
    raise exception 'this promotion to superadmin can be applied after %',
      previous.promotion_requested_at + internal.staff_change_delay() using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  previous_settings := internal.push_settings('{"app.privileged_rpc": "on"}');
  update public.profiles
  set role = p_role, rw_id = p_rw_id, promotion_requested_at = null, promotion_requested_by = null
  where id = p_user_id;
  perform internal.restore_settings(previous_settings);
  delete from auth.sessions where user_id = p_user_id;

  insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
  values ('role_changed', 'high', auth.uid(), coalesce(p_rw_id, previous.rw_id), 'profiles', p_user_id::text,
          jsonb_build_object('from_role', previous.role, 'to_role', p_role,
                             'from_rw_id', previous.rw_id, 'to_rw_id', p_rw_id));
  if is_promotion then
    perform internal.record_staff_change_step(p_user_id, 'superadmin_promotion', 'completed');
  end if;
  return jsonb_build_object('stage', 'applied');
end;
$$;


-- ===== M1: whom an alert concerns =====

-- The staff ids an alert's details name, under the keys every rule uses: the actor (by, actor_id, actor_ids,
-- created_by) and the subject (user_id, profile_id, accepted_user_id).
create function internal.alert_parties(p_details jsonb) returns jsonb
  language sql immutable
  set search_path = ''
as $$
  select coalesce(jsonb_agg(distinct party), '[]')
  from (select p_details ->> key as party
        from unnest(array['by', 'actor_id', 'created_by', 'user_id', 'profile_id', 'accepted_user_id']) as key
        union all
        select jsonb_array_elements_text(case when jsonb_typeof(p_details -> 'actor_ids') = 'array'
                                              then p_details -> 'actor_ids' else '[]' end)) as named
  where party is not null and party ~ '^[0-9a-f-]{36}$';
$$;

-- Every write keeps what the alert said before: a later sighting adds to the details, a NULL never erases a key, and
-- details.involved only ever grows.
create function internal.security_alerts_keep_parties() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  involved jsonb;
begin
  if tg_op = 'UPDATE' then
    new.details := old.details || jsonb_strip_nulls(new.details);
  end if;
  select coalesce(jsonb_agg(distinct party), '[]') into involved
  from (select jsonb_array_elements_text(internal.alert_parties(new.details)) as party
        union
        select jsonb_array_elements_text(case when tg_op = 'UPDATE' and jsonb_typeof(old.details -> 'involved') = 'array'
                                              then old.details -> 'involved' else '[]' end)) as parties;
  new.details := new.details || jsonb_build_object('involved', involved);
  return new;
end;
$$;
revoke execute on function internal.alert_parties(jsonb), internal.security_alerts_keep_parties()
  from public, anon, authenticated, service_role;
create trigger security_alerts_keep_parties before insert or update of details on public.security_alerts
  for each row execute function internal.security_alerts_keep_parties();
-- The alerts already raised learn whom they concern.
update public.security_alerts set details = details;

drop policy security_alerts_super_acknowledge on public.security_alerts;
create policy security_alerts_super_acknowledge on public.security_alerts for update to authenticated
  using (
    (select public.is_superadmin()) and acknowledged_at is null
    and not (severity in ('high', 'critical') and notified_at is null)
    and not (coalesce(details -> 'involved', '[]') ? (select auth.uid())::text)
  )
  with check ((select public.is_superadmin()) and acknowledged_by = (select auth.uid()));

-- Replaces the 0005 version: the invite's creator is named at every step, and the actor of the completed step is the
-- creator the acceptance runs under (accept_staff_invite), never a NULL.
create or replace function internal.record_superadmin_invite_step(p_invite_id uuid, p_stage text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  step jsonb := jsonb_build_object('change', 'superadmin_invite', 'stage', p_stage, 'invite_id', p_invite_id,
                                   'by', internal.current_actor_id(),
                                   'created_by', (select i.created_by from public.staff_invites i where i.id = p_invite_id));
  title text := case p_stage
    when 'requested' then 'Permintaan undangan superadmin'
    when 'completed' then 'Undangan superadmin diterima'
    when 'cancelled' then 'Undangan superadmin dicabut'
  end;
begin
  insert into public.security_events (event_type, severity, actor_id, entity_type, entity_id, details)
  values ('role_changed', 'critical', internal.current_actor_id(), 'staff_invites', p_invite_id::text, step);

  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values ('superadmin_invite', 'critical', 'superadmin_invite:' || p_invite_id, title, step)
  on conflict (fingerprint) where acknowledged_at is null do update
  set title = excluded.title, details = excluded.details, last_seen_at = now(),
      occurrences = public.security_alerts.occurrences + 1, notified_at = null;

  perform internal.log_audit('staff.superadmin_invite_' || p_stage, 'staff_invites', p_invite_id::text,
                             step - 'invite_id');
end;
$$;

-- Replaces the 20261029080000 version: the accepted superadmin invite's alert names the new superadmin too.
create or replace function internal.accept_staff_invite(p_user_id uuid, p_invite_code_hash text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  account record;
  invite record;
  previous_settings jsonb;
begin
  select p.id, p.email, p.role into account from public.profiles p where p.id = p_user_id for update;
  if not found or account.role <> 'none' then
    return jsonb_build_object('accepted', false);
  end if;
  select i.id, i.role, i.rw_id, i.created_by into invite
  from public.staff_invites i
  where i.invite_code_hash = p_invite_code_hash and i.email = account.email and i.accepted_at is null
    and i.revoked_at is null and i.expires_at > now()
  for update;
  if not found then
    insert into public.security_events (event_type, severity, actor_id, entity_type, entity_id, details)
    values ('login_failed', 'medium', p_user_id, 'profiles', p_user_id::text, '{"reason": "invite_code"}');
    return jsonb_build_object('accepted', false);
  end if;
  if not internal.has_verified_factor(p_user_id) then
    raise exception 'an invite is accepted once the account has its own verified authenticator'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  perform internal.take_audit_turn();
  previous_settings := internal.push_settings(jsonb_build_object('app.privileged_rpc', 'on',
                                                                 'app.actor_id', invite.created_by::text,
                                                                 'app.actor_role', 'service'));
  update public.staff_invites set accepted_at = now(), accepted_user_id = p_user_id where id = invite.id;
  update public.profiles set role = invite.role, rw_id = invite.rw_id, is_active = true where id = p_user_id;
  update public.security_alerts set details = details || jsonb_build_object('accepted_user_id', p_user_id)
  where fingerprint = 'superadmin_invite:' || invite.id and acknowledged_at is null;
  insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
  values ('role_changed', 'high', invite.created_by, invite.rw_id, 'profiles', p_user_id::text,
          jsonb_build_object('from_role', 'none', 'to_role', invite.role, 'to_rw_id', invite.rw_id,
                             'invite_id', invite.id));
  perform internal.restore_settings(previous_settings);
  return jsonb_build_object('accepted', true, 'role', invite.role, 'rw_id', invite.rw_id);
end;
$$;


-- ===== The anomaly scan's Lows =====

-- Replaces the 20261029080100 version: one open alert per rule and subject, however long it stays open.
create or replace function internal.raise_anomaly(
  p_rule text, p_severity public.alert_severity, p_subject text, p_title text, p_details jsonb
) returns void
  language sql
  set search_path = ''
as $$
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values (p_rule, p_severity, p_rule || ':' || coalesce(p_subject, '-'), p_title, coalesce(p_details, '{}'))
  on conflict (fingerprint) where acknowledged_at is null do update
  set details = excluded.details, last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1;
$$;

-- A short, one-way name for an order id: the out-of-band contacts get this, never the order or booking code.
create function internal.order_ref(p_order_id text) returns text
  language sql immutable
  set search_path = ''
as $$ select left(encode(extensions.digest(convert_to(p_order_id, 'UTF8'), 'sha256'), 'hex'), 12); $$;
revoke execute on function internal.order_ref(text) from public, anon, authenticated, service_role;

create or replace function internal.anomaly_signature_burst(p_since timestamptz) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  burst constant integer := 3;
  batch constant integer := 200;
  hit record;
  raised integer := 0;
begin
  for hit in
    select internal.order_ref(r.order_id) as order_ref, count(*) as attempts from public.webhook_rejections r
    where r.reason = 'signature_invalid' and r.received_at > p_since
      and exists (select 1 from public.payments p where p.order_id = r.order_id)
    group by r.order_id having count(*) >= burst
    limit batch
  loop
    perform internal.raise_anomaly('signature_burst', 'high', hit.order_ref, 'Lonjakan tanda tangan webhook palsu',
                                   jsonb_build_object('order_ref', hit.order_ref, 'attempts', hit.attempts));
    raised := raised + 1;
  end loop;
  return raised;
end;
$$;

create or replace function internal.anomaly_from_events(p_since timestamptz) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  batch constant integer := 200;
  hit record;
  raised integer := 0;
begin
  for hit in
    select e.event_type, e.entity_id, count(*) as seen, max(e.rw_id) as rw_id,
           coalesce(jsonb_agg(distinct e.actor_id) filter (where e.actor_id is not null), '[]') as actor_ids
    from public.security_events e
    where e.occurred_at > p_since
      and e.event_type in ('webhook_amount_mismatch', 'status_disagreement', 'session_changed_with_bookings',
                           'manual_checkin', 'mfa_enrolled', 'export_downloaded')
    group by e.event_type, e.entity_id
    limit batch
  loop
    perform internal.raise_anomaly(hit.event_type,
      case when hit.event_type in ('webhook_amount_mismatch', 'status_disagreement', 'mfa_enrolled') then 'high'
           else 'medium' end::public.alert_severity,
      hit.entity_id,
      case hit.event_type
        when 'webhook_amount_mismatch' then 'Jumlah pembayaran tidak cocok'
        when 'status_disagreement' then 'Status Midtrans berbeda'
        when 'session_changed_with_bookings' then 'Sesi berpemesanan diubah'
        when 'manual_checkin' then 'Check-in manual'
        when 'mfa_enrolled' then 'Autentikator baru didaftarkan'
        else 'Ekspor data' end,
      jsonb_build_object('entity_id', hit.entity_id, 'events', hit.seen, 'rw_id', hit.rw_id,
                         'actor_ids', hit.actor_ids));
    raised := raised + 1;
  end loop;
  return raised;
end;
$$;

create or replace function internal.anomaly_money_and_tickets() returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  batch constant integer := 200;
  hit record;
  raised integer := 0;
begin
  for hit in
    select b.id from public.bookings b
    where b.status = 'paid' and b.paid_at < now() - interval '10 minutes'
      and not exists (select 1 from public.tickets_qr t where t.booking_id = b.id)
    limit batch
  loop
    perform internal.raise_anomaly('paid_without_tickets', 'critical', hit.id::text, 'Lunas tanpa tiket',
                                   jsonb_build_object('booking_id', hit.id));
    raised := raised + 1;
  end loop;
  for hit in
    select t.id, t.booking_id from public.tickets_qr t
    where t.status = 'issued'
      and not exists (select 1 from public.payments p
                      where p.booking_id = t.booking_id and p.status in ('settled', 'partially_refunded'))
    limit batch
  loop
    perform internal.raise_anomaly('ticket_without_payment', 'critical', hit.id::text, 'Tiket tanpa pembayaran',
                                   jsonb_build_object('ticket_id', hit.id, 'booking_id', hit.booking_id));
    raised := raised + 1;
  end loop;
  return raised;
end;
$$;

create or replace function internal.anomaly_bookings(p_since timestamptz) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  held_share constant numeric := 0.8;
  large_total constant bigint := 20000000;
  large_pax constant integer := 150;
  refund_volume constant bigint := 5000000;
  batch constant integer := 200;
  hit record;
  raised integer := 0;
begin
  select count(*) as stale into hit from public.bookings b
  where b.status = 'pending_payment' and b.expires_at < now() - interval '15 minutes';
  if hit.stale > 0 then
    perform internal.raise_anomaly('hold_past_ttl', 'medium', null, 'Pemesanan melewati batas waktu',
                                   jsonb_build_object('bookings', hit.stale));
    raised := raised + 1;
  end if;
  for hit in
    select s.id, s.capacity, sum(l.pax_count) as held from public.visit_sessions s
    join public.booking_legs l on l.visit_session_id = s.id and l.status = 'reserved'
    join public.bookings b on b.id = l.booking_id and b.status = 'pending_payment'
    where s.session_date >= public.today_jkt()
    group by s.id, s.capacity having sum(l.pax_count) >= held_share * s.capacity
    limit batch
  loop
    perform internal.raise_anomaly('session_held_unpaid', 'medium', hit.id::text, 'Sesi tertahan pemesanan belum bayar',
                                   jsonb_build_object('session_id', hit.id, 'held', hit.held, 'capacity', hit.capacity));
    raised := raised + 1;
  end loop;
  for hit in
    select b.id, b.total_amount, b.pax_count from public.bookings b
    where b.created_at > p_since and (b.total_amount >= large_total or b.pax_count >= large_pax)
    limit batch
  loop
    perform internal.raise_anomaly('large_booking', 'medium', hit.id::text, 'Pemesanan besar',
                                   jsonb_build_object('booking_id', hit.id, 'total', hit.total_amount, 'pax', hit.pax_count));
    raised := raised + 1;
  end loop;
  select coalesce(sum(p.refunded_amount), 0) as refunded into hit from public.payments p
  where p.status in ('refunded', 'partially_refunded') and p.updated_at > now() - interval '24 hours';
  if hit.refunded >= refund_volume then
    perform internal.raise_anomaly('refund_volume', 'high', null, 'Volume refund tinggi',
                                   jsonb_build_object('refunded_24h', hit.refunded));
    raised := raised + 1;
  end if;
  for hit in
    select t.id, t.checked_in_by from public.tickets_qr t
    where t.status = 'used' and t.checked_in_at > p_since
      and (t.checked_in_at at time zone 'Asia/Jakarta')::date < t.valid_on
    limit batch
  loop
    perform internal.raise_anomaly('early_checkin', 'medium', hit.id::text, 'Check-in sebelum tanggal kunjungan',
                                   jsonb_build_object('ticket_id', hit.id, 'actor_id', hit.checked_in_by));
    raised := raised + 1;
  end loop;
  return raised;
end;
$$;

create or replace function internal.anomaly_staff(p_since timestamptz) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  lockout_spike constant integer := 3;
  batch constant integer := 200;
  hit record;
  raised integer := 0;
begin
  for hit in
    select e.entity_id, e.actor_id from public.security_events e
    where e.occurred_at > p_since and e.event_type = 'role_changed' and e.details ->> 'to_role' = 'superadmin'
    limit batch
  loop
    perform internal.raise_anomaly('new_superadmin', 'critical', hit.entity_id, 'Superadmin baru',
                                   jsonb_build_object('profile_id', hit.entity_id, 'actor_id', hit.actor_id));
    raised := raised + 1;
  end loop;
  select count(*) as locks into hit from public.security_events e
  where e.occurred_at > p_since and e.event_type in ('login_locked', 'mfa_locked', 'scanner_lockout');
  if hit.locks >= lockout_spike then
    perform internal.raise_anomaly('lockout_spike', 'high', null, 'Lonjakan penguncian akun',
                                   jsonb_build_object('lockouts', hit.locks));
    raised := raised + 1;
  end if;
  for hit in
    select counted.id, counted.factors
    from (select p.id, (select count(*) from auth.mfa_factors f
                        where f.user_id = p.id and f.factor_type = 'totp' and f.status = 'verified') as factors
          from public.profiles p
          where p.is_active and p.role <> 'none') as counted
    where counted.factors <> 1
    limit batch
  loop
    perform internal.raise_anomaly('staff_factor_count', 'high', hit.id::text, 'Staf tanpa tepat satu autentikator',
                                   jsonb_build_object('profile_id', hit.id, 'factors', hit.factors));
    raised := raised + 1;
  end loop;
  return raised;
end;
$$;

-- The chains are a call of their own, svc_run_chain_check, which the route makes in the first run of each hour whether
-- or not the scan succeeded, so the scan no longer takes a say in them.
drop function public.svc_run_anomaly_scan(boolean);
drop function internal.run_anomaly_scan(boolean);

-- {raised}: how many alerts this run raised or saw again.
create function internal.run_anomaly_scan() returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  since timestamptz := now() - interval '10 minutes';
begin
  return jsonb_build_object('raised',
    internal.anomaly_signature_burst(since) + internal.anomaly_from_events(since) + internal.anomaly_money_and_tickets()
    + internal.anomaly_bookings(since) + internal.anomaly_staff(since));
end;
$$;
revoke execute on function internal.run_anomaly_scan() from public, anon, authenticated, service_role;

create function public.svc_run_anomaly_scan() returns jsonb
  language sql security definer
  set search_path = ''
as $$ select internal.run_anomaly_scan(); $$;
revoke execute on function public.svc_run_anomaly_scan() from public, anon, authenticated;
grant execute on function public.svc_run_anomaly_scan() to service_role;

create function public.svc_run_chain_check() returns jsonb
  language sql security definer
  set search_path = ''
as $$ select jsonb_build_object('raised', internal.anomaly_chains()); $$;
revoke execute on function public.svc_run_chain_check() from public, anon, authenticated;
grant execute on function public.svc_run_chain_check() to service_role;
