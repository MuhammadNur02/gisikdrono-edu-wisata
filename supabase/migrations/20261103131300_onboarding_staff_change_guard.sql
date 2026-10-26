-- M1 of the security review of PR #77 (docs/Security.md §5.1, §5.6; AUTH-09, R28): since the invite email creates the
-- invited account, a half-onboarded one (no role, inactive, perhaps with a factor someone enrolled under the claim)
-- shows in /dashboard/users, and set_staff_status(…, true) and set_staff_role(…, role) would have given it access
-- around onboarding: the takeover finding 1 of the design review closed. Both now refuse an account that never was
-- staff (internal.is_never_staff, 20261103131000) with the generic STATE_INVALID; only accept_staff_invite, from the
-- claiming session at AAL2, turns such an account into staff. Taking a role away (role none) and deactivating stay
-- open for every account.

-- Replaces the 0004 version: an account that never was staff is not activated here.
create or replace function public.set_staff_status(p_user_id uuid, p_is_active boolean, p_reason text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  previous record;
begin
  perform internal.require_superadmin_step_up();
  if p_is_active is null or length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'a status change needs a reason of 3 to 300 characters' using errcode = '22023';
  end if;
  select p.role, p.rw_id into previous from public.profiles p where p.id = p_user_id;
  if not found then
    raise exception 'no staff profile %', p_user_id using errcode = 'P0002';
  end if;
  if p_is_active and internal.is_never_staff(p_user_id) then
    raise exception 'an invited account becomes staff only by finishing onboarding'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  previous_settings := internal.push_settings('{"app.privileged_rpc": "on"}');
  update public.profiles
  set is_active = p_is_active,
      role = case when p_is_active then role else 'none' end,
      rw_id = case when p_is_active then rw_id end,
      mfa_reset_requested_at = case when p_is_active then mfa_reset_requested_at end,
      mfa_reset_requested_by = case when p_is_active then mfa_reset_requested_by end,
      promotion_requested_at = case when p_is_active then promotion_requested_at end,
      promotion_requested_by = case when p_is_active then promotion_requested_by end
  where id = p_user_id;
  perform internal.restore_settings(previous_settings);

  if not p_is_active then
    delete from auth.sessions where user_id = p_user_id;
    delete from auth.mfa_factors where user_id = p_user_id;
    insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
    values ('staff_disabled', 'high', auth.uid(), previous.rw_id, 'profiles', p_user_id::text,
            jsonb_build_object('from_role', previous.role, 'from_rw_id', previous.rw_id));
  end if;
  perform internal.log_audit(case when p_is_active then 'staff.reactivated' else 'staff.deactivated' end,
    'profiles', p_user_id::text, jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

-- Replaces the 20261029080200 version: a role goes to an account that never was staff only through onboarding.
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
  if p_role <> 'none' and internal.is_never_staff(p_user_id) then
    raise exception 'an invited account becomes staff only by finishing onboarding'
      using errcode = 'P0001', hint = 'STATE_INVALID';
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
