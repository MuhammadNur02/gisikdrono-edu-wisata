-- Independent review of PR #79 (20261104121000_bank_and_legs_review.sql; docs/Security.md STAFF-02, PAY-16, MON-07):
-- a short account number keeps only its last two digits, the tables refuse a number that is not 5 to 20 digits, a
-- reveal of either kind is audited, counted and a pii_revealed event, a session without its authenticator writes
-- nothing, a changed vendor account raises payout_account_changed, no audit row or alert ever holds a number, and a
-- combo visits at most four RWs.
begin;
select plan(17);
\ir helpers/rls_personas.psql

insert into public.umkm_vendors (id, rw_id, slug, name) values
  ('00000000-0000-4000-8000-0000000f6151', 5, 'uji-rekening-tinjau', 'Vendor Tinjau');
insert into public.tour_packages (id, category, slug, name, pricing_basis, price_per_pax, status) values
  ('00000000-0000-4000-8000-0000000f6152', 'combo', 'uji-kombo-tinjau', 'Kombo Tinjau', 'per_pax', 30000, 'draft');

create function pg_temp.reveals(p_action text) returns integer
  language sql stable security definer
as $$ select count(*)::int from public.audit_logs a
      where a.action = p_action and a.actor_id = '00000000-0000-4000-8000-00000000f001'; $$;
grant execute on function pg_temp.reveals(text) to authenticated;

-- ===== Writes through the functions =====
select pg_temp.act_as('superadmin_aal1');
select throws_ok($$select public.set_vendor_bank_account('00000000-0000-4000-8000-0000000f6151', 'BRI', '97531864',
  'Ibu Tinjau')$$, '42501', null, 'a superadmin session without its authenticator writes no account');
reset role;
select pg_temp.act_as('superadmin_aal2');
select lives_ok($$select public.set_vendor_bank_account('00000000-0000-4000-8000-0000000f6151', 'BRI', '97531864',
  'Ibu Tinjau')$$, 'the superadmin sets the vendor''s account');
select lives_ok($$select public.set_rw_treasury_account(8::smallint, 'BNI', '86420975319', 'Kas RW 08')$$,
  'and RW 08''s treasury account');
select is((select public.get_vendor_bank_account('00000000-0000-4000-8000-0000000f6151') ->> 'account_masked'),
  '••••64', 'a number of eight digits shows its last two only');
select is((select public.get_rw_treasury_account(8::smallint) ->> 'account_masked'), '••••5319',
  'a longer one its last four');
reset role;
select is((select count(*)::int from public.security_alerts a
           where a.rule = 'payout_account_changed' and a.severity = 'high'
             and a.details ->> 'vendor_id' = '00000000-0000-4000-8000-0000000f6151'), 1,
  'a changed vendor account raises the high payout_account_changed alert');

-- ===== Reveals =====
select pg_temp.act_as('superadmin_aal2');
select is((select public.get_rw_treasury_account(8::smallint, true, 'Cek pencairan RW 08') ->> 'account_number'),
  '86420975319', 'a treasury reveal answers the number');
select is(pg_temp.reveals('rw_treasury.revealed'), 1, 'and is audited and counted as a treasury reveal');
select is((select public.get_vendor_bank_account('00000000-0000-4000-8000-0000000f6151', true, 'Cek pencairan UMKM')
           ->> 'account_number'), '97531864', 'a vendor reveal answers the number');
reset role;
select is((select array_agg(e.entity_type || ':' || e.entity_id || ':' || e.rw_id order by e.entity_type)
           from public.security_events e
           where e.event_type = 'pii_revealed' and e.actor_id = pg_temp.persona_id('superadmin_aal2')
             and e.entity_type in ('umkm_vendors', 'rw_units')),
  array['rw_units:8:8', 'umkm_vendors:00000000-0000-4000-8000-0000000f6151:5'],
  'each reveal is a pii_revealed event under the account''s RW');

-- ===== The numbers stay out of every trail =====
select is((select count(*)::int from public.audit_logs a
           where concat_ws(' ', a.before::text, a.after::text, a.metadata::text) ~ '(97531864|86420975319)'), 0,
  'no audit row holds an account number, before, after or in its metadata');
select is((select count(*)::int from public.security_alerts a where a.details::text ~ '(97531864|86420975319)'), 0,
  'nor does any alert');
select is((select count(*)::int from public.security_events e where e.details::text ~ '(97531864|86420975319)'), 0,
  'nor any security event');

-- ===== The tables' own check =====
select throws_ok($$update public.umkm_vendors set bank_account_number = '12-34-56'
  where id = '00000000-0000-4000-8000-0000000f6151'$$, '23514', null,
  'a vendor''s account number is digits only, even written straight into the table');
select throws_ok($$update public.rw_units set treasury_account_number = '1234' where id = 8$$, '23514', null,
  'and a treasury''s is 5 digits at least');

-- ===== A combo visits at most four RWs =====
select throws_ok($$select public.save_package_legs('00000000-0000-4000-8000-0000000f6152', 'combo',
  array[5, 8, 13, 1, 2]::smallint[])$$, '22023', null, 'save_package_legs refuses a fifth RW');
select lives_ok($$select public.save_package_legs('00000000-0000-4000-8000-0000000f6152', 'combo',
  array[5, 8]::smallint[])$$, 'and takes two');

select * from finish();
rollback;
