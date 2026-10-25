-- Review of PR #58 (the integration run of 20261029080200): since 20261029080000 every new Auth user gets a profile
-- (handle_new_auth_user), and profiles.id references auth.users on delete restrict, so no Auth user could be deleted
-- any more, not even one that never became staff (a mistyped invite, a stray sign-up, a test account).
--
-- An Auth user whose profile never became staff (no role, inactive, its claims_version never bumped past the first,
-- no invite accepted) is deleted with its profile. A profile that ever held a role keeps the restriction on purpose: a staff member who
-- leaves is deactivated by set_staff_status (AUTH-07), and the audit trail, the ledger and every created_by keep
-- naming them, so deleting their Auth user stays refused. Anonymising a departed staff member's name, address and
-- phone is not decided yet (raised with the review of PR #58).

create function internal.release_unused_profile() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
begin
  if not exists (select 1 from public.profiles p
                 where p.id = old.id and p.role = 'none' and not p.is_active and p.claims_version <= 1)
     or exists (select 1 from public.staff_invites i where i.accepted_user_id = old.id) then
    return old;
  end if;
  previous_settings := internal.push_settings(jsonb_build_object('app.actor_id', old.id::text,
                                                                 'app.actor_role', 'service'));
  delete from public.profiles where id = old.id;
  perform internal.restore_settings(previous_settings);
  return old;
end;
$$;
revoke execute on function internal.release_unused_profile() from public, anon, authenticated, service_role;
create trigger release_unused_profile before delete on auth.users
  for each row execute function internal.release_unused_profile();
