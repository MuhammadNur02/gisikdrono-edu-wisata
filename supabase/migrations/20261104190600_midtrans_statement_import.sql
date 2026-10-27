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
-- refund. The import needs the superadmin with a fresh authenticator code, and is in the audit log.

alter table public.reconciliation_issues drop constraint reconciliation_issues_issue_type_check;
alter table public.reconciliation_issues add constraint reconciliation_issues_issue_type_check check (issue_type in (
  'paid_without_tickets', 'ticket_without_payment', 'amount_mismatch', 'status_disagreement', 'pending_beyond_ttl',
  'ledger_sum_mismatch', 'chain_broken', 'payout_mismatch', 'duplicate_settlement', 'unknown_order'));


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
  if stated is distinct from payment.status
     and not (stated = 'settled' and payment.status = 'duplicate') then
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

-- {run_id, rows_checked, issues_found}. p_rows is [{order_id, status, gross_amount}], at most 5 000 rows, each order once.
create function public.import_midtrans_statement(p_file_name text, p_rows jsonb) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  max_rows constant integer := 5000;
  file_name text := left(btrim(coalesce(p_file_name, '')), 200);
  new_run_id uuid;
  rows_checked integer;
  issue_count integer;
begin
  if not (public.is_superadmin() and public.fresh_totp()) then
    raise exception 'a statement is imported by the superadmin with a fresh authenticator code' using errcode = '42501';
  end if;
  perform internal.take_audit_turn();
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0
     or jsonb_array_length(p_rows) > max_rows then
    raise exception 'a statement holds 1 to % rows', max_rows using errcode = 'P0001', hint = 'STATEMENT_INVALID';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) as r
             where jsonb_typeof(r) <> 'object'
                or coalesce(r ->> 'order_id', '') !~ '^[A-Za-z0-9_.:-]{1,64}$'
                or coalesce(r ->> 'status', '') !~ '^[a-z_]{1,40}$'
                or coalesce(r ->> 'gross_amount', '') !~ '^[0-9]{1,15}$')
     or (select count(distinct r ->> 'order_id') from jsonb_array_elements(p_rows) as r) <> jsonb_array_length(p_rows) then
    raise exception 'each statement row names one order once, its status and its whole-rupiah amount'
      using errcode = 'P0001', hint = 'STATEMENT_INVALID';
  end if;

  rows_checked := jsonb_array_length(p_rows);
  insert into public.reconciliation_runs (run_date, source, payments_checked, summary, created_by)
  values (public.today_jkt(), 'csv_import', rows_checked, jsonb_build_object('file_name', file_name), auth.uid())
  returning id into new_run_id;
  insert into public.reconciliation_issues (run_id, booking_id, payment_id, issue_type, severity, details)
  select new_run_id, raised.booking_id, raised.payment_id, raised.issue_type, raised.severity, raised.details
  from jsonb_array_elements(p_rows) as r, internal.statement_row_issues(r, file_name) as raised;
  get diagnostics issue_count = row_count;
  update public.reconciliation_runs set issues_found = issue_count, finished_at = now() where id = new_run_id;
  perform internal.log_audit('reconciliation.csv_import', 'reconciliation_runs', new_run_id::text,
                             jsonb_build_object('file_name', file_name, 'rows', rows_checked, 'issues', issue_count));
  return jsonb_build_object('run_id', new_run_id, 'rows_checked', rows_checked, 'issues_found', issue_count);
end;
$$;
revoke execute on function public.import_midtrans_statement(text, jsonb) from public, anon, service_role;
grant execute on function public.import_midtrans_statement(text, jsonb) to authenticated;
