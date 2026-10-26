-- booklet_page_claims after 20261019080000_booklet_page_claims (docs/Security.md §8.4; security review of PR #14, N4):
-- no API role reaches the table or the claim, one claim exists per booklet and owner, a fresh claim refuses a
-- second, and only a claim older than the hold is taken over. tests/integration/uploads.test.ts runs concurrent
-- requests against it.
begin;
select plan(15);

insert into auth.users (id, email) values ('00000000-0000-4000-9000-0000000c1a01', 'klaim-halaman@example.test');
insert into public.profiles (id, email, full_name, role, rw_id, is_active)
values ('00000000-0000-4000-9000-0000000c1a01', 'klaim-halaman@example.test', 'Petugas Klaim', 'admin_rw', 5, true);

select is(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.booklet_page_claims'::regclass),
  true,
  'row level security is enabled and forced'
);
select is(
  array(select distinct privilege_type::text from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'booklet_page_claims' and grantee in ('anon', 'authenticated')),
  array[]::text[],
  'anon and authenticated hold no right on the table'
);
select is(
  has_function_privilege('anon', 'public.svc_claim_booklet_pages(uuid, uuid, integer, smallint)', 'execute'),
  false,
  'anon cannot claim'
);
select is(
  has_function_privilege('authenticated', 'public.svc_claim_booklet_pages(uuid, uuid, integer, smallint)', 'execute'),
  false,
  'a signed-in staff member cannot claim directly either'
);
select is(
  has_function_privilege('service_role', 'public.svc_claim_booklet_pages(uuid, uuid, integer, smallint)', 'execute'),
  true,
  'the service role claims through svc_claim_booklet_pages'
);
select is(
  has_function_privilege('service_role', 'internal.claim_booklet_pages(uuid, uuid, integer, smallint)', 'execute'),
  false,
  'and holds no right on the internal function itself'
);

select is(
  public.svc_claim_booklet_pages('00000000-0000-4000-9000-0000000c1b01', '00000000-0000-4000-9000-0000000c1a01', 7200, 5::smallint),
  true,
  'the first claim on a booklet is taken'
);
select is(
  public.svc_claim_booklet_pages('00000000-0000-4000-9000-0000000c1b01', '00000000-0000-4000-9000-0000000c1a01', 7200, 5::smallint),
  false,
  'a second claim while the first is fresh is refused'
);
select is(
  public.svc_claim_booklet_pages('00000000-0000-4000-9000-0000000c1b01', '00000000-0000-4000-9000-0000000c1a01', 7200, 8::smallint),
  true,
  'the same id under another RW is a booklet of its own'
);
select is(
  public.svc_claim_booklet_pages('00000000-0000-4000-9000-0000000c1b01', '00000000-0000-4000-9000-0000000c1a01', 7200, null),
  true,
  'and so is a kelurahan booklet'
);
select is(
  public.svc_claim_booklet_pages('00000000-0000-4000-9000-0000000c1b01', '00000000-0000-4000-9000-0000000c1a01', 7200, null),
  false,
  'a kelurahan claim is held like any other'
);

update public.booklet_page_claims set claimed_at = now() - interval '3 hours'
where booklet_id = '00000000-0000-4000-9000-0000000c1b01' and rw_id = 5;
select is(
  public.svc_claim_booklet_pages('00000000-0000-4000-9000-0000000c1b01', '00000000-0000-4000-9000-0000000c1a01', 7200, 5::smallint),
  true,
  'a claim older than the hold is taken over'
);
select is(
  (select count(*)::int from public.booklet_page_claims where booklet_id = '00000000-0000-4000-9000-0000000c1b01'),
  3,
  'taking a claim over updates its row instead of adding one'
);

select throws_ok(
  $$insert into public.booklet_page_claims (booklet_id, rw_id, claimed_by)
    values ('00000000-0000-4000-9000-0000000c1b01', 5, '00000000-0000-4000-9000-0000000c1a01')$$,
  '23505', null,
  'the unique index lets one claim exist per booklet and owner'
);
select throws_ok(
  $$select public.svc_claim_booklet_pages('00000000-0000-4000-9000-0000000c1b02', '00000000-0000-4000-9000-0000000c1a01', 0, 5::smallint)$$,
  '22023', null,
  'a claim needs a positive hold'
);

select * from finish();
rollback;
