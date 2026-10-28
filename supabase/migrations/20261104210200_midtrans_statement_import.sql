-- Task P4.7.05 (docs/Security.md REC-02): the superadmin compares the transaction statement the Midtrans dashboard
-- exports (CSV) with the payments the database holds, by order_id. The superadmin's browser reads the file down to
-- {order_id, status, gross_amount} per row (src/lib/midtrans/statement-csv.ts); the action and this function check that
-- shape again. A statement is only what Midtrans says, so its rows are compared, never applied. The comparison is a
-- reconciliation run of its own (source csv_import) whose issues land beside the nightly ones:
--
--   unknown_order        an order_id Midtrans lists that no payment holds
--   amount_mismatch      Midtrans' amount differs from the payment's
--   status_disagreement  Midtrans' status, mapped as apply_payment_event maps it, differs from the payment's; high
--                        when either side holds money (settled, refunded, partly refunded, disputed, duplicate)
--
-- Nothing is applied: a disagreement is for the superadmin to look into, with "Cek status Midtrans" or a recorded
-- refund. The import needs the superadmin with a fresh authenticator code, at most five an hour, and is in the audit
-- log.
--
-- Review of PR #99:
--   M1   a statement is imported once: the run keeps the fingerprint of its rows (statement_fingerprint, one
--        csv_import run per fingerprint), and the same rows again answer with that run (already_imported). A row
--        raises no issue while a statement issue of its type is still open for the same payment, or for the same order
--        when no payment holds it, with the same Midtrans status and amount, so overlapping weekly statements
--        (docs/runbooks/payouts.md) raise each difference once; a changed or worsened one is a new issue (delta review,
--        M-A)
--   L2   a row whose status midtrans_payment_status does not map is refused (STATEMENT_INVALID)
--   L4   at most five imports an hour per superadmin (statement_import:<user>), counted in the transaction, so a
--        limiter that cannot answer refuses
--   Info the statement's period, from its transaction times when the file has them, is kept in the run's summary;
--        a duplicate payment Midtrans reports refunded, wholly or in part, raises nothing, as a settled one does not

alter table public.reconciliation_issues drop constraint reconciliation_issues_issue_type_check;
alter table public.reconciliation_issues add constraint reconciliation_issues_issue_type_check check (issue_type in (
  'paid_without_tickets', 'ticket_without_payment', 'amount_mismatch', 'status_disagreement', 'pending_beyond_ttl',
  'ledger_sum_mismatch', 'chain_broken', 'payout_mismatch', 'duplicate_settlement', 'unknown_order'));

-- M1: the sha256 of a statement's rows, normalised and ordered by order_id; written only by import_midtrans_statement.
alter table public.reconciliation_runs add column statement_fingerprint text
  constraint reconciliation_runs_statement_fingerprint_shape check (statement_fingerprint ~ '^[0-9a-f]{64}$');
create unique index reconciliation_runs_statement_fingerprint on public.reconciliation_runs (statement_fingerprint)
  where source = 'csv_import';
-- M1: the open issue a statement row would repeat, found by its type and its payment, or its order.
create index reconciliation_issues_open_subject on public.reconciliation_issues
  (issue_type, (coalesce(payment_id::text, details ->> 'order_id'))) where resolved_at is null;


-- A statement row's status, as the payment it describes would read it; NULL for a status Midtrans' map does not know.
-- The dashboard does not export fraud_status, so a capture reads as settled, as an accepted capture is.
create function internal.statement_payment_status(p_status text) returns public.payment_status
  language sql immutable
  set search_path = ''
as $$
  select internal.midtrans_payment_status(lower(btrim(p_status)),
                                          case when lower(btrim(p_status)) = 'capture' then 'accept' end);
$$;
revoke execute on function internal.statement_payment_status(text) from public, anon, authenticated, service_role;

-- Info: a duplicate payment keeps its status whatever Midtrans later does with it (record_refund_core shows its refund
-- in refunded_amount alone), so Midtrans settling or refunding it is no disagreement.
create function internal.statement_status_agrees(p_stated public.payment_status, p_ours public.payment_status)
  returns boolean
  language sql immutable
  set search_path = ''
as $$
  select p_stated is not distinct from p_ours
         or (p_ours = 'duplicate' and p_stated in ('settled', 'refunded', 'partially_refunded'));
$$;
revoke execute on function internal.statement_status_agrees(public.payment_status, public.payment_status)
  from public, anon, authenticated, service_role;

-- The issues one statement row raises against the payment of its order, as rows of (issue_type, severity, details).
create function internal.statement_row_issues(p_row jsonb, p_file_name text)
  returns table (issue_type text, severity public.alert_severity, details jsonb, booking_id uuid, payment_id uuid)
  language plpgsql stable
  set search_path = ''
as $$
declare
  stated_order text := btrim(p_row ->> 'order_id');
  amount bigint := (p_row ->> 'gross_amount')::bigint;
  stated public.payment_status := internal.statement_payment_status(p_row ->> 'status');
  payment public.payments;
  facts jsonb := jsonb_build_object('order_id', stated_order, 'midtrans_status', p_row ->> 'status',
                                    'midtrans_amount', amount, 'file_name', p_file_name);
begin
  select p.* into payment from public.payments p where p.order_id = stated_order;
  if not found then
    return query select 'unknown_order', 'medium'::public.alert_severity, facts, null::uuid, null::uuid;
    return;
  end if;
  facts := facts || jsonb_build_object('our_status', payment.status, 'our_amount', payment.gross_amount);
  if amount is distinct from payment.gross_amount then
    return query select 'amount_mismatch', 'high'::public.alert_severity, facts, payment.booking_id, payment.id;
  end if;
  if not internal.statement_status_agrees(stated, payment.status) then
    return query select 'status_disagreement',
                        (case when stated in ('settled', 'refunded', 'partially_refunded', 'disputed')
                                    or payment.status in ('settled', 'refunded', 'partially_refunded', 'disputed',
                                                          'duplicate') then 'high'
                              else 'medium' end)::public.alert_severity,
                        facts, payment.booking_id, payment.id;
  end if;
end;
$$;
revoke execute on function internal.statement_row_issues(jsonb, text) from public, anon, authenticated, service_role;

-- The shape a statement must have: 1 to 5 000 rows, each order once, each status one Midtrans' map knows (L2), and a
-- period that names both days or neither, in order.
create function internal.check_statement(p_rows jsonb, p_period_from date, p_period_to date) returns void
  language plpgsql stable
  set search_path = ''
as $$
declare
  max_rows constant integer := 5000;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0
     or jsonb_array_length(p_rows) > max_rows then
    raise exception 'a statement holds 1 to % rows', max_rows using errcode = 'P0001', hint = 'STATEMENT_INVALID';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) as r
             where jsonb_typeof(r) <> 'object'
                or coalesce(r ->> 'order_id', '') !~ '^[A-Za-z0-9_.:-]{1,64}$'
                or coalesce(r ->> 'status', '') !~ '^[a-z_]{1,40}$'
                or internal.statement_payment_status(r ->> 'status') is null
                or coalesce(r ->> 'gross_amount', '') !~ '^[0-9]{1,15}$')
     or (select count(distinct r ->> 'order_id') from jsonb_array_elements(p_rows) as r) <> jsonb_array_length(p_rows) then
    raise exception 'each statement row names one order once, a status Midtrans uses and its whole-rupiah amount'
      using errcode = 'P0001', hint = 'STATEMENT_INVALID';
  end if;
  if (p_period_from is null) <> (p_period_to is null) or p_period_from > p_period_to then
    raise exception 'a statement''s period names its first and last day, in order'
      using errcode = 'P0001', hint = 'STATEMENT_INVALID';
  end if;
end;
$$;
revoke execute on function internal.check_statement(jsonb, date, date) from public, anon, authenticated, service_role;

-- M1: the rows as the comparison reads them, ordered by order_id, hashed.
create function internal.statement_fingerprint(p_rows jsonb) returns text
  language sql immutable
  set search_path = ''
as $$
  select encode(extensions.digest(
    (select jsonb_agg(jsonb_build_object('order_id', btrim(r ->> 'order_id'), 'status', r ->> 'status',
                                         'gross_amount', r ->> 'gross_amount')
                      order by btrim(r ->> 'order_id'))
     from jsonb_array_elements(p_rows) as r)::text, 'sha256'), 'hex');
$$;
revoke execute on function internal.statement_fingerprint(jsonb) from public, anon, authenticated, service_role;

-- The open issues of a statement row's type and subject: its payment, or its order when no payment holds it.
create function internal.open_statement_subject_issues(p_issue_type text, p_payment_id uuid, p_details jsonb)
  returns setof public.reconciliation_issues
  language sql stable
  set search_path = ''
as $$
  select o.* from public.reconciliation_issues o
  where o.resolved_at is null and o.issue_type = p_issue_type
    and coalesce(o.payment_id::text, o.details ->> 'order_id') = coalesce(p_payment_id::text, p_details ->> 'order_id');
$$;
revoke execute on function internal.open_statement_subject_issues(text, uuid, jsonb)
  from public, anon, authenticated, service_role;

-- M1: a run's issues, but none a still-open statement issue already says in the same words: Midtrans' status and
-- amount both as before (delta review of PR #99, M-A). An issue no statement opened (the key gap of
-- open_key_gap_issue, a nightly one) hides nothing, and a changed figure is a new issue, at the severity of the
-- worst issue still open for that subject when that is higher. How many the rows raised and how many were written.
create function internal.insert_statement_issues(p_run_id uuid, p_rows jsonb, p_file_name text,
  out raised integer, out written integer)
  language plpgsql
  set search_path = ''
as $$
begin
  with found_issues as (
    select i.issue_type, i.severity, i.details, i.booking_id, i.payment_id
    from jsonb_array_elements(p_rows) as r, internal.statement_row_issues(r, p_file_name) as i
  ), new_issues as (
    insert into public.reconciliation_issues (run_id, booking_id, payment_id, issue_type, severity, details)
    select p_run_id, f.booking_id, f.payment_id, f.issue_type,
           greatest(f.severity, (select max(o.severity)
                                 from internal.open_statement_subject_issues(f.issue_type, f.payment_id, f.details) o)),
           f.details
    from found_issues f
    where not exists (select 1 from internal.open_statement_subject_issues(f.issue_type, f.payment_id, f.details) o
                      where o.details ? 'midtrans_status'
                        and o.details ->> 'midtrans_status' = f.details ->> 'midtrans_status'
                        and o.details -> 'midtrans_amount' = f.details -> 'midtrans_amount')
    returning 1
  )
  select (select count(*) from found_issues)::integer, (select count(*) from new_issues)::integer
  into raised, written;
end;
$$;
revoke execute on function internal.insert_statement_issues(uuid, jsonb, text)
  from public, anon, authenticated, service_role;

-- {run_id, rows_checked, issues_found, issues_already_open, already_imported}. p_rows is
-- [{order_id, status, gross_amount}], at most 5 000 rows, each order once; p_period_from and p_period_to are the first
-- and last day of its transactions, when the file says.
create function public.import_midtrans_statement(p_file_name text, p_rows jsonb, p_period_from date default null,
  p_period_to date default null) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  imports_per_hour constant integer := 5;
  hour_seconds constant integer := 3600;
  file_name text := left(btrim(coalesce(p_file_name, '')), 200);
  fingerprint text;
  earlier public.reconciliation_runs;
  new_run_id uuid;
  rows_checked integer;
  counted record;
begin
  if not (public.is_superadmin() and public.fresh_totp()) then
    raise exception 'a statement is imported by the superadmin with a fresh authenticator code' using errcode = '42501';
  end if;
  if not internal.rate_limit_hit('statement_import:' || auth.uid(), imports_per_hour, hour_seconds) then
    raise exception 'at most % statements an hour', imports_per_hour using errcode = 'P0001', hint = 'RATE_LIMITED';
  end if;
  perform internal.take_audit_turn();
  perform internal.check_statement(p_rows, p_period_from, p_period_to);
  rows_checked := jsonb_array_length(p_rows);

  -- M1: the same rows again are the run they already made.
  fingerprint := internal.statement_fingerprint(p_rows);
  select r.* into earlier from public.reconciliation_runs r
  where r.source = 'csv_import' and r.statement_fingerprint = fingerprint;
  if earlier.id is not null then
    perform internal.log_audit('reconciliation.csv_import_repeated', 'reconciliation_runs', earlier.id::text,
                               jsonb_build_object('file_name', file_name, 'rows', rows_checked));
    return jsonb_build_object('run_id', earlier.id, 'rows_checked', earlier.payments_checked,
                              'issues_found', earlier.issues_found, 'issues_already_open', 0,
                              'already_imported', true);
  end if;

  insert into public.reconciliation_runs (run_date, source, payments_checked, summary, created_by,
    statement_fingerprint)
  values (public.today_jkt(), 'csv_import', rows_checked,
          jsonb_strip_nulls(jsonb_build_object('file_name', file_name, 'period_from', p_period_from,
                                               'period_to', p_period_to)),
          auth.uid(), fingerprint)
  returning id into new_run_id;
  select i.raised, i.written into counted from internal.insert_statement_issues(new_run_id, p_rows, file_name) as i;
  update public.reconciliation_runs set issues_found = counted.written, finished_at = now() where id = new_run_id;
  perform internal.log_audit('reconciliation.csv_import', 'reconciliation_runs', new_run_id::text,
                             jsonb_build_object('file_name', file_name, 'rows', rows_checked,
                                                'issues', counted.written,
                                                'issues_already_open', counted.raised - counted.written));
  return jsonb_build_object('run_id', new_run_id, 'rows_checked', rows_checked, 'issues_found', counted.written,
                            'issues_already_open', counted.raised - counted.written, 'already_imported', false);
end;
$$;
revoke execute on function public.import_midtrans_statement(text, jsonb, date, date) from public, anon, service_role;
grant execute on function public.import_midtrans_statement(text, jsonb, date, date) to authenticated;
