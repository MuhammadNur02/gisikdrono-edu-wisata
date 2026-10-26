-- Lows of the independent review of PR #81 (docs/Security.md §5.1, §5.6):
--   Low-1  became_staff_at is what "never staff" means, so a profile that holds a role, or is active, has it: two
--          checks say so for every row, existing ones included, and release_unused_profile keeps role = 'none' as a
--          second guard beside internal.is_never_staff.
--   Low-2  release_unused_profile locks the profile before it decides, the order claim_staff_invite and
--          accept_staff_invite lock in, so an acceptance in flight either finishes first (and the delete is refused)
--          or waits for the delete.

alter table public.profiles
  add constraint profiles_role_implies_became_staff check (role = 'none' or became_staff_at is not null),
  add constraint profiles_active_implies_became_staff check (not is_active or became_staff_at is not null);

-- Replaces the 20261103131600 version.
create or replace function internal.release_unused_profile() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
begin
  -- The profile row first, as claim_staff_invite and accept_staff_invite take it: the check below then sees an
  -- acceptance that committed while this delete waited, never one half-way.
  perform 1 from public.profiles p where p.id = old.id for update;
  if not internal.is_never_staff(old.id)
     or exists (select 1 from public.profiles p where p.id = old.id and p.role <> 'none') then
    return old;
  end if;
  previous_settings := internal.push_settings(jsonb_build_object('app.actor_id', old.id::text,
                                                                 'app.actor_role', 'service'));
  delete from public.profiles where id = old.id;
  perform internal.restore_settings(previous_settings);
  return old;
end;
$$;
