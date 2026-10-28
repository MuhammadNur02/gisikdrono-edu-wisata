-- The production release job's pre-flight (Task P5.7.02, .github/workflows/release.yml; the checks are listed in
-- docs/runbooks/release-checklist.md). Run through the Management API (supabase db query --linked) before any
-- migration: it reads, never writes, and raises when a row would stop a migration that adds a check every existing
-- row must pass. It reports counts only, never an id, a name or an account number. A column the target does not
-- have yet is skipped: the migration that adds it decides what its rows hold.
do $$
declare
  problems text[] := '{}';
  found bigint;
begin
  -- Read only from here on, whatever the connection's default (review of PR #98, L4).
  perform set_config('transaction_read_only', 'on', true);

  -- 20261104140000: a profile that holds a role, or is active, has became_staff_at.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'became_staff_at') then
    execute 'select count(*) from public.profiles where (role <> ''none'' or is_active) and became_staff_at is null'
      into found;
    if found > 0 then
      problems := problems || format('%s profiles hold a role or are active without became_staff_at', found);
    end if;
  end if;

  -- 20261104121000 (L-3): an account number is 5 to 20 digits, a vendor's and an RW treasury's alike.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'umkm_vendors' and column_name = 'bank_account_number') then
    execute 'select count(*) from public.umkm_vendors
             where bank_account_number is not null and bank_account_number !~ ''^[0-9]{5,20}$''' into found;
    if found > 0 then
      problems := problems || format('%s UMKM vendors have an account number that is not 5 to 20 digits', found);
    end if;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'rw_units' and column_name = 'treasury_account_number') then
    execute 'select count(*) from public.rw_units
             where treasury_account_number is not null and treasury_account_number !~ ''^[0-9]{5,20}$''' into found;
    if found > 0 then
      problems := problems || format('%s RW treasuries have an account number that is not 5 to 20 digits', found);
    end if;
  end if;

  if cardinality(problems) > 0 then
    raise exception 'release pre-flight: %', array_to_string(problems, '; ')
      using hint = 'docs/runbooks/release-checklist.md, the production release job''s pre-flight';
  end if;
end;
$$;
