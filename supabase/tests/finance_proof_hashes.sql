-- Review of PR #80, M-4 (Task P4.7.04; docs/Security.md REC-09; 20261104190300): finance_proofs keeps the SHA-256 the
-- server took of each finance proof, under RLS with no API access, and a proof whose content already backs a refund,
-- an adjustment or a payout is refused (PROOF_REUSED), at the payout as at the refund and adjustment checks. A path
-- the server never hashed is judged by its path alone.
begin;
select plan(13);
\ir helpers/rls_personas.psql

-- The hint a statement is refused with, or null when it runs.
create function pg_temp.hint_of(p_sql text) returns text
  language plpgsql
as $$
declare
  raised_hint text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics raised_hint = pg_exception_hint;
  return raised_hint;
end;
$$;
grant execute on function pg_temp.hint_of(text) to authenticated;

-- ===== The table =====
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.finance_proofs'::regclass),
  'finance_proofs has RLS enabled and forced');
select ok(not has_table_privilege('anon', 'public.finance_proofs', 'select, insert, update, delete'),
  'anon has no privilege on it');
select ok(not has_table_privilege('authenticated', 'public.finance_proofs', 'select, insert, update, delete'),
  'nor has authenticated: only the server writes it, with the service role');
select throws_ok($$insert into public.finance_proofs (path, sha256)
  values ('payouts/00000000-0000-4000-8000-0000000f7001/bukti.pdf', 'abc')$$, '23514', null,
  'a digest is 64 hex characters');
select throws_ok($$insert into public.finance_proofs (path, sha256)
  values ('exports/00000000-0000-4000-8000-0000000f7001/x.csv', repeat('a', 64))$$, '23514', null,
  'and only a booking''s or a payout''s proof is hashed here');

-- ===== Fixtures: one file paid out already, a copy of it, another file =====
insert into public.payout_batches (id, beneficiary_key, period_from, period_to, total_amount, paid_at, reference,
  proof_path, created_by)
values ('00000000-0000-4000-8000-0000000f7001', 'rw:5', public.today_jkt() - 7, public.today_jkt() - 1, 50000, now(),
        'TRF-HASH-1', 'payouts/00000000-0000-4000-8000-0000000f7001/bukti.pdf', '00000000-0000-4000-8000-00000000f001');
insert into public.finance_proofs (path, sha256) values
  ('payouts/00000000-0000-4000-8000-0000000f7001/bukti.pdf', repeat('a', 64)),
  ('payouts/00000000-0000-4000-8000-0000000f7002/bukti.pdf', repeat('a', 64)),
  ('bookings/00000000-0000-4000-8000-0000000f7101/adjustment-00000000-0000-4000-8000-0000000f7102.pdf', repeat('a', 64)),
  ('payouts/00000000-0000-4000-8000-0000000f7003/bukti.pdf', repeat('b', 64));
insert into storage.objects (bucket_id, name) values
  ('documents', 'payouts/00000000-0000-4000-8000-0000000f7002/bukti.pdf'),
  ('documents', 'payouts/00000000-0000-4000-8000-0000000f7003/bukti.pdf');

-- ===== The checks =====
select is(pg_temp.hint_of($$select internal.require_unseen_proof(
  'payouts/00000000-0000-4000-8000-0000000f7002/bukti.pdf', null)$$), 'PROOF_REUSED',
  'a copy of a file that backs a payout is refused');
select is(pg_temp.hint_of($$select internal.require_unused_proof('00000000-0000-4000-8000-0000000f7101',
  'bookings/00000000-0000-4000-8000-0000000f7101/adjustment-00000000-0000-4000-8000-0000000f7102.pdf', null)$$),
  'PROOF_REUSED', 'so is a copy named as an adjustment''s evidence, under another booking''s folder');
select lives_ok($$select internal.require_unseen_proof('payouts/00000000-0000-4000-8000-0000000f7003/bukti.pdf', null)$$,
  'a file of other content passes');
select lives_ok($$select internal.require_unseen_proof('payouts/00000000-0000-4000-8000-0000000f7004/bukti.pdf', null)$$,
  'a path the server never hashed is judged by its path alone');
select lives_ok($$select internal.require_unseen_proof('payouts/00000000-0000-4000-8000-0000000f7001/bukti.pdf', null)$$,
  'and a file is never its own copy');
insert into public.finance_proofs (path, sha256) values
  ('payouts/00000000-0000-4000-8000-0000000f7005/bukti.pdf', repeat('c', 64)),
  ('payouts/00000000-0000-4000-8000-0000000f7006/bukti.pdf', repeat('c', 64));
select lives_ok($$select internal.require_unseen_proof('payouts/00000000-0000-4000-8000-0000000f7006/bukti.pdf', null)$$,
  'a copy of a file that backs nothing passes');

-- settle_revenue_entries checks the content before it stamps anything.
select pg_temp.act_as('superadmin_aal2');
select is(pg_temp.hint_of($$select public.settle_revenue_entries('rw:5', public.today_jkt() - 1, public.today_jkt(),
  'TRF-HASH-2', 'payouts/00000000-0000-4000-8000-0000000f7002/bukti.pdf', 50000)$$), 'PROOF_REUSED',
  'a payout whose proof is a copy of another payout''s is refused');
reset role;
select is((select count(*)::int from public.payout_batches where reference = 'TRF-HASH-2'), 0, 'and writes nothing');

select * from finish();
rollback;
