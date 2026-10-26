-- Task P4.3.06 (20261104120000_bank_account_rpcs.sql; docs/Security.md STAFF-02, PAY-16): the superadmin's
-- view and edit of a vendor's bank account and an RW's treasury account. Masked by default; a reveal needs a fresh
-- TOTP and a reason, is audited, and is capped at 20 a day with a medium alert at the 20th; a write needs a fresh TOTP
-- and is audited by the row's trigger; a changed treasury account raises the high alert payout_account_changed.
begin;
select plan(23);
\ir helpers/rls_personas.psql

insert into public.umkm_vendors (id, rw_id, slug, name, bank_name, bank_account_number, bank_account_holder) values
  ('00000000-0000-4000-8000-0000000f6051', 5, 'uji-rekening-vendor', 'Vendor Rekening', 'BRI', '0123456789',
   'Ibu Rekening');
update public.rw_units set treasury_bank_name = 'BCA', treasury_account_number = '9876543210',
  treasury_account_holder = 'Kas RW 05' where id = 5;

create function pg_temp.vendor_read(p_reveal boolean, p_reason text) returns jsonb
  language sql
as $$ select public.get_vendor_bank_account('00000000-0000-4000-8000-0000000f6051', p_reveal, p_reason); $$;
grant execute on function pg_temp.vendor_read(boolean, text) to authenticated;

create function pg_temp.reveals() returns integer
  language sql stable security definer
as $$ select count(*)::int from public.audit_logs a
      where a.action in ('vendor_bank.revealed', 'rw_treasury.revealed')
        and a.actor_id = '00000000-0000-4000-8000-00000000f001'; $$;
grant execute on function pg_temp.reveals() to authenticated;

-- ===== Who may read =====
select pg_temp.act_as('admin_rw_05');
select throws_ok($$select pg_temp.vendor_read(false, null)$$, '42501', null, 'an RW officer reads no bank account');
select throws_ok($$select public.set_rw_treasury_account(5::smallint, 'BCA', '1111122222', 'Kas RW 05')$$, '42501',
  null, 'nor sets a treasury account');
reset role;
select pg_temp.act_as('superadmin_aal1');
select throws_ok($$select pg_temp.vendor_read(false, null)$$, '42501', null, 'nor does a superadmin at AAL1');
reset role;
select ok(not has_function_privilege('anon', 'public.get_vendor_bank_account(uuid, boolean, text)', 'execute'),
  'anon may not call it');

-- ===== Masked, then revealed =====
select pg_temp.act_as('superadmin_stale_totp');
select is(pg_temp.vendor_read(false, null) ->> 'account_masked', '••••6789',
  'the superadmin reads the account masked, even with an older authenticator code');
select is(pg_temp.vendor_read(false, null) ->> 'account_number', null, 'without the number itself');
select throws_ok($$select pg_temp.vendor_read(true, 'Cek pencairan')$$, '42501', null,
  'but a reveal needs a fresh authenticator code');
reset role;
select is(pg_temp.reveals(), 0, 'a masked read is no reveal');
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select pg_temp.vendor_read(true, ' ')$$, '22023', null, 'a reveal needs a reason');
select is(pg_temp.vendor_read(true, 'Cek pencairan bulan ini') ->> 'account_number', '0123456789',
  'a fresh code and a reason reveal the number');
reset role;
select is((select a.metadata ->> 'reason' from public.audit_logs a
           where a.action = 'vendor_bank.revealed' and a.entity_id = '00000000-0000-4000-8000-0000000f6051'
             and a.actor_id = pg_temp.persona_id('superadmin_aal2')),
  'Cek pencairan bulan ini', 'and the reveal is audited with its reason, under the superadmin''s name');

-- ===== Writes =====
select pg_temp.act_as('superadmin_stale_totp');
select throws_ok($$select public.set_vendor_bank_account('00000000-0000-4000-8000-0000000f6051', 'BNI', '5555566666',
  'Ibu Rekening')$$, '42501', null, 'a write needs a fresh authenticator code');
reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$select public.set_vendor_bank_account('00000000-0000-4000-8000-0000000f6051', 'BNI', '55-55',
  'Ibu Rekening')$$, '22023', null, 'an account number is 5 to 20 digits');
select lives_ok($$select public.set_vendor_bank_account('00000000-0000-4000-8000-0000000f6051', 'BNI', '5555566666',
  'Ibu Rekening')$$, 'the superadmin changes a vendor''s account');
reset role;
select is((select count(*)::int from public.audit_logs a
           where a.entity_type = 'umkm_vendors' and a.entity_id = '00000000-0000-4000-8000-0000000f6051'
             and a.action = 'umkm_vendors.update' and a.actor_id = pg_temp.persona_id('superadmin_aal2')), 1,
  'and the write is audited');

select pg_temp.act_as('superadmin_aal2');
select lives_ok($$select public.set_rw_treasury_account(5::smallint, 'BCA', '1111122222', 'Kas RW 05')$$,
  'the superadmin changes RW 05''s treasury account');
select lives_ok($$select public.set_rw_treasury_account(5::smallint, 'BCA', '1111122222', 'Kas RW 05')$$,
  'and saves it again unchanged');
reset role;
select is((select (count(*), min(a.severity::text))::text from public.security_alerts a
           where a.rule = 'payout_account_changed' and a.details ->> 'rw_id' = '5'),
  '(1,high)', 'only the change raises the high payout_account_changed alert');
select is((select r.treasury_account_number from public.rw_units r where r.id = 5), '1111122222',
  'which holds the new account');

-- ===== The daily cap =====
select pg_temp.act_as('superadmin_aal2');
do $$ begin for i in 1..18 loop perform pg_temp.vendor_read(true, 'Cek ' || i); end loop; end $$;
select is(pg_temp.reveals(), 19, 'nineteen reveals so far today');
select lives_ok($$select pg_temp.vendor_read(true, 'Cek ke-20')$$, 'the twentieth reveal goes through');
select throws_ok($$select pg_temp.vendor_read(true, 'Cek ke-21')$$, 'P0001', null,
  'the twenty-first is refused');
reset role;
select is((select (count(*), min(a.severity::text))::text from public.security_alerts a
           where a.rule = 'bank_account_reveal_cap' and a.details ->> 'actor_id' = pg_temp.persona_id('superadmin_aal2')::text),
  '(1,medium)', 'and the twentieth raised the medium bank_account_reveal_cap alert');

select * from finish();
rollback;
