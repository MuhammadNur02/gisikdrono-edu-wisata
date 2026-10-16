-- 0001_extensions: the extensions the schema relies on, the private `internal` schema, and
-- deny-by-default privileges for everything created after this file (docs/PRD.md §8.1, Task P1.2.01;
-- docs/Security.md AZ-02, AZ-11, DB-02, APP-04).

-- Extensions go into `extensions`, never `public` (Security Advisor: extension_in_public).
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pg_net with schema extensions;
-- pg_cron keeps its jobs in its own `cron` schema; Supabase installs the extension in pg_catalog.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists supabase_vault with schema vault;

-- Home of the SECURITY DEFINER transition functions. PostgREST never exposes it, and the API roles
-- get nothing here; service_role access is granted in 0005.
create schema internal;
revoke all on schema internal from public, anon, authenticated;

-- Supabase hands anon and authenticated every privilege on new tables, sequences and functions in
-- public. Take that back for the objects our migrations create, so the only access that exists is
-- what 0005_policies_grants grants on purpose.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- Postgres itself lets PUBLIC execute every new function, in every schema. A rule limited to one
-- schema cannot remove a global default, so this one has no `in schema`. It comes after the
-- extensions above, so citext comparisons and trigram search keep working for every role.
alter default privileges for role postgres
  revoke execute on functions from public;
