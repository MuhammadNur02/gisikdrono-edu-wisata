-- L3 of the delta2 review of PR #77 (docs/Security.md §5.1, §5.6): release_unused_profile (20261029080300) still read
-- "never staff" as role none, inactive and claims_version <= 1, while every other check reads internal.is_never_staff,
-- which since 20261103131500 is profiles.became_staff_at. One rule now: an Auth user whose profile never became staff,
-- and that accepted no invite, is deleted with its profile; one that ever held a role keeps the restriction.

-- Replaces the 20261029080300 version.
create or replace function internal.release_unused_profile() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
begin
  if not internal.is_never_staff(old.id) then
    return old;
  end if;
  previous_settings := internal.push_settings(jsonb_build_object('app.actor_id', old.id::text,
                                                                 'app.actor_role', 'service'));
  delete from public.profiles where id = old.id;
  perform internal.restore_settings(previous_settings);
  return old;
end;
$$;
