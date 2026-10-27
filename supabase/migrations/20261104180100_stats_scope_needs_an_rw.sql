-- Review of PR #93, L-4 (docs/Security.md REC-07, AZ-13): internal.stats_scope hands visit_stats and revenue_recap the
-- RW to count, where NULL means every RW. Anyone but the superadmin gets public.app_rw_id(), which is NULL without an
-- RW claim. Today is_staff() already refuses such a session, since is_admin_rw() needs the claim, so the NULL never
-- reaches a count; this states it in the function itself, so a later change to the role helpers cannot turn an RW
-- admin without an RW into a reader of the whole kelurahan. Same signature, attributes and grants as 20261027080200.

create or replace function internal.stats_scope(p_from date, p_to date, p_rw_id smallint) returns smallint
  language plpgsql stable
  set search_path = ''
as $$
begin
  if not (public.is_staff() and public.aal2()) then
    raise exception 'figures are read by staff with a verified authenticator' using errcode = '42501';
  end if;
  if not public.is_superadmin() and public.app_rw_id() is null then
    raise exception 'an RW admin reads the figures of their own RW only' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to >= p_from + interval '12 months' then
    raise exception 'figures cover a period of at most 12 months' using errcode = '22023';
  end if;
  return case when public.is_superadmin() then p_rw_id else public.app_rw_id() end;
end;
$$;
revoke execute on function internal.stats_scope(date, date, smallint) from public, anon, authenticated, service_role;
