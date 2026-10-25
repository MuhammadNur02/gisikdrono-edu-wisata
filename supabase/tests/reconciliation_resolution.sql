-- Task P4.7.04 (20261103150000; docs/Security.md REC-01, REC-09): the superadmin closes a reconciliation issue as
-- resolved or ignored, in their own name and with a note; a closed issue stays closed and what the run found never
-- changes; an RW admin closes nothing.
begin;
select plan(10);
\ir helpers/rls_personas.psql

insert into public.reconciliation_runs (id, run_date, source) values
  ('00000000-0000-4000-8000-0000000c7001', public.today_jkt(), 'nightly');
insert into public.reconciliation_issues (id, run_id, issue_type, severity) values
  ('00000000-0000-4000-8000-0000000c7101', '00000000-0000-4000-8000-0000000c7001', 'amount_mismatch', 'high'),
  ('00000000-0000-4000-8000-0000000c7102', '00000000-0000-4000-8000-0000000c7001', 'pending_beyond_ttl', 'medium');

select has_column('public', 'reconciliation_issues', 'resolution', 'an issue says how it was closed');

reset role;
select pg_temp.act_as('admin_rw_05');
select is(pg_temp.row_count($$update public.reconciliation_issues set resolved_at = now(),
  resolved_by = '00000000-0000-4000-8000-00000000f005', resolution = 'resolved', resolution_note = 'Sudah dicek'
  where id = '00000000-0000-4000-8000-0000000c7101'$$), 0, 'an RW admin closes no issue');

reset role;
select pg_temp.act_as('superadmin_aal2');
select throws_ok($$update public.reconciliation_issues set resolved_at = now(),
  resolved_by = '00000000-0000-4000-8000-00000000f001', resolution_note = 'Sudah dicek'
  where id = '00000000-0000-4000-8000-0000000c7101'$$, '23514', null, 'a closing says whether it was resolved or ignored');
select throws_ok($$update public.reconciliation_issues set resolved_at = now(),
  resolved_by = '00000000-0000-4000-8000-00000000f001', resolution = 'later', resolution_note = 'Sudah dicek'
  where id = '00000000-0000-4000-8000-0000000c7101'$$, '23514', null, 'and nothing else');
select throws_ok($$update public.reconciliation_issues set resolved_at = now(),
  resolved_by = '00000000-0000-4000-8000-00000000f001', resolution = 'ignored', resolution_note = 'ok'
  where id = '00000000-0000-4000-8000-0000000c7101'$$, '23514', null, 'with a note of at least five characters');
select throws_ok($$update public.reconciliation_issues set resolution = 'ignored',
  resolved_by = '00000000-0000-4000-8000-00000000f001', resolution_note = 'Sudah dicek'
  where id = '00000000-0000-4000-8000-0000000c7101'$$, '23514', null, 'and never half a closing');
select is(pg_temp.row_count($$update public.reconciliation_issues set resolved_at = now(),
  resolved_by = '00000000-0000-4000-8000-00000000f001', resolution = 'ignored',
  resolution_note = 'Selisih pembulatan bank, tidak perlu tindakan'
  where id = '00000000-0000-4000-8000-0000000c7101'$$), 1, 'the superadmin ignores an issue in their own name');
select throws_ok($$update public.reconciliation_issues set resolution = 'resolved', resolution_note = 'Diganti lagi'
  where id = '00000000-0000-4000-8000-0000000c7101'$$, '42501', 'a closed reconciliation issue stays closed',
  'a closed issue stays closed');

reset role;
select throws_ok($$update public.reconciliation_issues set severity = 'info'
  where id = '00000000-0000-4000-8000-0000000c7102'$$, '42501',
  'what a run found never changes; only its closing is written', 'what a run found never changes');
select is((select resolution from public.reconciliation_issues where id = '00000000-0000-4000-8000-0000000c7101'),
  'ignored', 'and the closing is kept as written');

select * from finish();
rollback;
