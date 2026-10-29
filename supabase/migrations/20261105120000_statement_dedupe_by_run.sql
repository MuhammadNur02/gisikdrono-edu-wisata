-- Deferred Lows of the review of PR #99 (Task P4.7.05; docs/Security.md REC-02), the dedupe of
-- internal.insert_statement_issues (20261104210200):
--
--   L-1  a statement row was held back by any open issue of its subject with the same Midtrans status and amount, so
--        a rise on our side was swallowed: an old export saying pending against our expired payment opens a medium
--        status_disagreement; a late settlement makes ours settled, and an overlapping export still saying pending
--        is the same Midtrans figures, though the finding is now high. The open issue now holds a row back only when
--        it also names the same status of ours and is at least as severe; otherwise the row is a new issue, at the
--        severity of the worst one still open for that subject when that is higher (unchanged).
--   L-2  statement and nightly issues were told apart from the others by the key midtrans_status in their details,
--        which every nightly issue (20261105090000) carries too. The source is now read from the issue's run
--        (reconciliation_runs.source csv_import or nightly), never from the keys of its details, so an issue of a
--        manual run (the key gap of open_key_gap_issue, a manual transfer left unmatched) hides nothing, whatever it
--        holds. The decision of 2026-10-29 stands: an open nightly issue saying the same holds a statement row back.
--        A finding's reason is compared as well, so the nightly refund_amount mismatch (reason refund_amount) never
--        stands for a statement's amount_mismatch (no reason).
--
-- insert_statement_issues is made again from 20261104210200 with this test; everything else in it is unchanged.

-- L-1, L-2: whether an open issue of a statement or nightly run already says what a statement row finds: the same
-- type and subject (open_statement_subject_issues), Midtrans' status and amount, our status and the reason all the
-- same, at the finding's severity or above.
create function internal.statement_issue_said(p_issue_type text, p_payment_id uuid, p_details jsonb,
  p_severity public.alert_severity) returns boolean
  language sql stable
  set search_path = ''
as $$
  select exists (
    select 1 from internal.open_statement_subject_issues(p_issue_type, p_payment_id, p_details) o
    join public.reconciliation_runs r on r.id = o.run_id
    where r.source in ('csv_import', 'nightly')
      and o.details ->> 'midtrans_status' is not distinct from p_details ->> 'midtrans_status'
      and o.details -> 'midtrans_amount' is not distinct from p_details -> 'midtrans_amount'
      and o.details ->> 'our_status' is not distinct from p_details ->> 'our_status'
      and o.details ->> 'reason' is not distinct from p_details ->> 'reason'
      and o.severity >= p_severity);
$$;
revoke execute on function internal.statement_issue_said(text, uuid, jsonb, public.alert_severity)
  from public, anon, authenticated, service_role;

-- A run's issues, but none an open statement or nightly issue already says (statement_issue_said). A changed figure,
-- a changed status of ours or a worse finding is a new issue, at the severity of the worst issue still open for that
-- subject when that is higher. How many the rows raised and how many were written.
create or replace function internal.insert_statement_issues(p_run_id uuid, p_rows jsonb, p_file_name text,
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
    where not internal.statement_issue_said(f.issue_type, f.payment_id, f.details, f.severity)
    returning 1
  )
  select (select count(*) from found_issues)::integer, (select count(*) from new_issues)::integer
  into raised, written;
end;
$$;
