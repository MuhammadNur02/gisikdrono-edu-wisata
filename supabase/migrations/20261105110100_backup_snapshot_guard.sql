-- Follow-up of the review of PR #98 (20261104230000_backup_reader.sql; Task P5.5.04; docs/Security.md §7.8, RES-01):
-- internal.backup_auth_snapshot() is taken only by a session whose login role may act as backup_reader.
--
-- The guard asked pg_has_role(session_user, 'backup_reader', 'member'). Since Postgres 16, MEMBER counts any
-- membership, including the ADMIN-only one Postgres gives the role that created the group (postgres here), which can
-- neither use the group's privileges nor become it. SET is the membership the backup's login role really has
-- (gisikdrono_backup is created IN ROLE backup_reader, restore-drills.md part A), so the guard asks for it, and pgTAP
-- backup_reader.sql now proves that a session without it is refused. The body is otherwise the same.

create or replace function internal.backup_auth_snapshot() returns jsonb
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  -- One-time links (password reset, email or phone change, reauthentication) are never carried: whoever decrypts a
  -- backup must not be able to use them. Blank, not null, because Auth refuses null in these columns on restore.
  internal_blank_tokens constant jsonb := jsonb_build_object('recovery_token', '', 'confirmation_token', '',
    'email_change_token_new', '', 'email_change_token_current', '', 'phone_change_token', '', 'reauthentication_token', '');
begin
  if not pg_has_role(session_user, 'backup_reader', 'set') then
    raise exception 'the auth snapshot is read by the backup role only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'users', (select coalesce(jsonb_agg(to_jsonb(r) || internal_blank_tokens order by r.id), '[]') from auth.users r),
    'identities', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]') from auth.identities r),
    'sso_providers', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]') from auth.sso_providers r),
    'sso_domains', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]') from auth.sso_domains r),
    'saml_providers', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]') from auth.saml_providers r));
end;
$$;
revoke execute on function internal.backup_auth_snapshot() from public, anon, authenticated, service_role;
grant execute on function internal.backup_auth_snapshot() to backup_reader;
