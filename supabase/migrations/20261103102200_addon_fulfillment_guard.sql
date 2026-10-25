-- Review of PR #75, F-75-2 (Task P4.3.02): staff mark an add-on line pending, prepared or handed over through their
-- column grant (0005, booking_addons_staff_fulfil), but a cancelled line is a change to what was paid for, which only
-- an approved adjustment may make (P4.7.03). So an API session may neither set `cancelled` nor take a line out of it;
-- the functions that cancel or restore a line run under app.in_rpc and are not held back.

create function internal.addon_fulfillment_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if new.fulfillment_status is distinct from old.fulfillment_status
     and 'cancelled' in (old.fulfillment_status, new.fulfillment_status)
     and coalesce(current_setting('role', true), 'none') in ('authenticated', 'anon')
     and current_setting('app.in_rpc', true) is distinct from '1' then
    raise exception 'a cancelled add-on changes only through an approved adjustment'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return new;
end;
$$;

revoke execute on function internal.addon_fulfillment_guard() from public, anon, authenticated, service_role;

create trigger addon_fulfillment_guard before update of fulfillment_status on public.booking_addons
  for each row execute function internal.addon_fulfillment_guard();
