-- Official document numbers and the two hash chains (Task P1.9.05; docs/Security.md REC-05, REC-11). Numbers run
-- without gaps, a rolled-back transaction gives its number back, and an edit or a deletion made behind the
-- append-only triggers' back, the way only a database owner could, is reported at the row where it happened. Two
-- sessions taking numbers at the same moment are in tests/integration/document-numbers.test.ts.
begin;
select plan(18);

create function pg_temp.outcome(p_statement text) returns text
  language plpgsql
as $$
begin
  execute p_statement;
  return 'allowed';
exception when others then
  return sqlstate;
end;
$$;

-- ===== Gapless numbers =====
-- A period no other suite and no real document uses.
select is(
  array[internal.next_document_number('invoice', '2031-03-15 10:00+07'),
        internal.next_document_number('invoice', '2031-03-20 10:00+07'),
        internal.next_document_number('invoice', '2031-03-31 23:59+07')],
  array['INV/GSK/2031/03/0001', 'INV/GSK/2031/03/0002', 'INV/GSK/2031/03/0003'],
  'invoices of one month are numbered one after another'
);
select is(
  pg_temp.outcome($$select internal.next_document_number('invoice', '2031-03-21 10:00+07'); select 1 / 0$$),
  '22012',
  'a transaction that takes a number and then fails is rolled back'
);
select is(
  internal.next_document_number('invoice', '2031-03-22 10:00+07'),
  'INV/GSK/2031/03/0004',
  'and its number goes to the next document, so no number is skipped'
);
select is(
  (select last_value from public.document_sequences where kind = 'invoice' and period = '2031-03'),
  4,
  'the counter holds the last number actually issued'
);
select is(
  internal.next_document_number('invoice', '2031-04-01 00:05+07'),
  'INV/GSK/2031/04/0001',
  'a new Jakarta month starts again at 0001'
);

-- ===== Ledger chain =====
create temp table ledger_start as select coalesce(max(id), 0) as id from public.revenue_share_entries;
insert into public.tour_packages (id, rw_id, category, slug, name, tagline, duration_minutes, price_per_pax, status)
values ('00000000-0000-4000-9000-000000000501', 5, 'student', 'uji-rantai-paket', 'Paket Uji Rantai', 'Uji', 120, 25000,
        'published');
select set_config('app.in_rpc', '1', true);
insert into public.bookings (id, booking_code, status, package_id, package_snapshot, rw_ids, booker_type, pic_name,
  pic_phone, pic_email, pax_count, visit_date, visit_date_end, subtotal_package, total_amount, amount_paid,
  consent_version, consented_at, paid_at)
values ('00000000-0000-4000-9000-000000000521', 'GSK-RANTA021', 'paid', '00000000-0000-4000-9000-000000000501', '{}',
        '{5}', 'school', 'Bu Rani', '+6281234560521', 'rani@example.test', 4, public.today_jkt() + 30,
        public.today_jkt() + 30, 100000, 100000, 100000, 'v1', now(), now());
select set_config('app.in_rpc', '', true);
insert into public.revenue_share_entries (booking_id, entry_type, line_ref, rule_version, beneficiary, beneficiary_key,
  rw_id, base_amount, pct, amount, entry_hash)
select '00000000-0000-4000-9000-000000000521', 'settlement', 'package:' || n, '{"lines": 4}', 'rw_treasury', 'rw:5', 5,
       100000, 25, 25000, 'chosen-by-the-caller'
from generate_series(1, 4) as n;
create temp table ledger_rows as
  select row_number() over (order by id) as n, id from public.revenue_share_entries where id > (select id from ledger_start);

select is(
  (select count(*)::int from public.revenue_share_entries where id > (select id from ledger_start)
     and entry_hash ~ '^[0-9a-f]{64}$'),
  4,
  'the chain computes each hash itself, whatever the caller sent'
);
select is((internal.verify_ledger_chain() ->> 'ok')::boolean, true, 'an untouched ledger verifies');

-- A database owner edits an amount behind the append-only trigger's back.
alter table public.revenue_share_entries disable trigger append_only;
update public.revenue_share_entries set amount = 99000 where id = (select id from ledger_rows where n = 2);
alter table public.revenue_share_entries enable trigger append_only;
select is(
  (internal.verify_ledger_chain() ->> 'first_broken_id')::bigint,
  (select id from ledger_rows where n = 2),
  'verify_ledger_chain names the edited entry'
);
alter table public.revenue_share_entries disable trigger append_only;
update public.revenue_share_entries set amount = 25000 where id = (select id from ledger_rows where n = 2);
alter table public.revenue_share_entries enable trigger append_only;
select is((internal.verify_ledger_chain() ->> 'ok')::boolean, true, 'putting the amount back repairs it');

-- The retention run's purge bypass does not reach the ledger, whose rows are money (review of PR #42).
select set_config('app.purge', 'on', true);
select throws_ok($$delete from public.revenue_share_entries where id = (select id from ledger_rows where n = 3)$$,
  '42501', null, 'not even a retention run deletes a ledger entry');
select set_config('app.purge', '', true);

-- An owner deletes the ledger's oldest entries behind the triggers: the ledger is never pruned, so its first row must
-- start the chain. Done inside a block that rolls itself back, so the entries are there again afterwards.
create function pg_temp.verify_without_first_entry() returns jsonb
  language plpgsql
as $$
begin
  alter table public.revenue_share_entries disable trigger append_only;
  delete from public.revenue_share_entries where id = (select min(id) from public.revenue_share_entries);
  alter table public.revenue_share_entries enable trigger append_only;
  raise exception using errcode = 'P0001', message = internal.verify_ledger_chain()::text;
exception when sqlstate 'P0001' then
  return sqlerrm::jsonb;
end;
$$;
select is(
  (pg_temp.verify_without_first_entry() ->> 'ok')::boolean,
  false,
  'deleting the oldest entries is caught, since the ledger''s first row anchors its chain'
);

-- The same owner deletes an entry from the middle.
alter table public.revenue_share_entries disable trigger append_only;
delete from public.revenue_share_entries where id = (select id from ledger_rows where n = 3);
alter table public.revenue_share_entries enable trigger append_only;
select is(
  (internal.verify_ledger_chain() ->> 'first_broken_id')::bigint,
  (select id from ledger_rows where n = 4),
  'a deleted entry is reported at the entry that pointed back to it'
);

-- ===== Audit chain =====
create temp table audit_start as select coalesce(max(id), 0) as id from public.audit_logs;
select internal.log_audit('test.chain', 'test', 'rantai-' || n, jsonb_build_object('n', n)) from generate_series(1, 4) as n;
create temp table audit_rows as
  select row_number() over (order by id) as n, id from public.audit_logs where id > (select id from audit_start);

select is(
  (select count(*)::int from public.audit_logs a join public.audit_logs previous
     on previous.id = (select max(id) from public.audit_logs where id < a.id)
   where a.id > (select id from audit_start) and a.prev_hash = previous.entry_hash),
  4,
  'each audit row carries the hash of the row before it'
);
select is((internal.verify_audit_chain() ->> 'ok')::boolean, true, 'an untouched audit log verifies');

alter table public.audit_logs disable trigger append_only;
update public.audit_logs set metadata = '{"n": 99}' where id = (select id from audit_rows where n = 2);
alter table public.audit_logs enable trigger append_only;
select is(
  (internal.verify_audit_chain() ->> 'first_broken_id')::bigint,
  (select id from audit_rows where n = 2),
  'verify_audit_chain names the row whose details were rewritten'
);
alter table public.audit_logs disable trigger append_only;
update public.audit_logs set metadata = '{"n": 2}' where id = (select id from audit_rows where n = 2);
alter table public.audit_logs enable trigger append_only;
select is((internal.verify_audit_chain() ->> 'ok')::boolean, true, 'and verifies again once it is put back');

select set_config('app.purge', 'on', true);
delete from public.audit_logs where id = (select id from audit_rows where n = 3);
select set_config('app.purge', '', true);
select is(
  (internal.verify_audit_chain() ->> 'first_broken_id')::bigint,
  (select id from audit_rows where n = 4),
  'a row deleted from the middle is reported at the row after it'
);
select is(
  pg_temp.outcome($$update public.audit_logs set actor_role = 'anon' where id = (select id from audit_rows where n = 4)$$),
  '42501',
  'while the append-only trigger is on, nobody edits an audit row at all'
);

select * from finish();
rollback;
