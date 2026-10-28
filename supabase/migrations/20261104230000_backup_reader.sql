-- Review of PR #98, M3, and its later reviews (delta N3, L2; third D1; fourth H1, H2) (Task P5.5.04;
-- docs/Security.md §7.8, RES-01): the weekly backup runs as a role of its own, never as postgres. backup_reader is the
-- group that role belongs to.
--
-- pg_dump reads public alone, the one schema the role really uses. Supabase gives postgres USAGE on auth without the
-- right to pass it on, so a grant on auth here would grant nothing (fourth review, H1), and a dump of auth would also
-- reach its serial sequences (H2). The staff accounts of auth come instead from internal.backup_auth_snapshot(): the
-- rows of the five auth tables the backup keeps (the staff accounts, their identities and the SSO settings), read as
-- postgres for the backup role alone. Visitors have no accounts, so it is a handful of rows.
--
-- The role also asks which environment the database belongs to (internal.environment(), the Vault marker of 0007),
-- so the job refuses a database that is not production before it dumps anything. It cannot log in, write, use auth,
-- cron, vault or net, or call any other internal function. The login role gisikdrono_backup, with BYPASSRLS so
-- pg_dump sees every row of the forced-RLS tables, is created by the owner on the production project only, its
-- password set from psql's \password (docs/runbooks/restore-drills.md, part A).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'backup_reader') then
    create role backup_reader nologin;
  end if;
end;
$$;
-- Whatever an earlier hand may have given it, the group itself never logs in or holds a power.
alter role backup_reader nologin nobypassrls nocreaterole nocreatedb noreplication;
-- postgres may grant pg_read_all_data, so it takes it back here; pg_write_all_data it can neither grant nor revoke,
-- so no migration could have given it, and pgTAP backup_reader.sql asserts the role holds neither.
revoke pg_read_all_data from backup_reader;

grant usage on schema public to backup_reader;
grant select on all tables in schema public to backup_reader;
grant select on all sequences in schema public to backup_reader;
-- The tables later migrations add to public are readable to it too, as postgres creates them.
alter default privileges for role postgres in schema public grant select on tables to backup_reader;
alter default privileges for role postgres in schema public grant select on sequences to backup_reader;

-- {users, identities, sso_providers, sso_domains, saml_providers}: every row of each, whole, for the backup role. The
-- caller is its session's login role, which must belong to backup_reader; pooler and psql connect as that role.
create function internal.backup_auth_snapshot() returns jsonb
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  -- One-time links (password reset, email or phone change, reauthentication) are never carried: whoever decrypts a
  -- backup must not be able to use them. Blank, not null, because Auth refuses null in these columns on restore.
  internal_blank_tokens constant jsonb := jsonb_build_object('recovery_token', '', 'confirmation_token', '',
    'email_change_token_new', '', 'email_change_token_current', '', 'phone_change_token', '', 'reauthentication_token', '');
begin
  if not pg_has_role(session_user, 'backup_reader', 'member') then
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

grant usage on schema internal to backup_reader;
grant execute on function internal.environment(), internal.backup_auth_snapshot() to backup_reader;
