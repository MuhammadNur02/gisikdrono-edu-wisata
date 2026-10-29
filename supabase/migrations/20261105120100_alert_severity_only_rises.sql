-- Deferred Low of the review of PR #105 (L4; docs/Security.md MON-*): raise_anomaly's ON CONFLICT (20261029080400) kept
-- the severity an open alert was first raised at, so a later sighting that is worse never made it worse. The
-- reconciliation_digest worked round it with an update of its own (raise_reconciliation_digest, 20261105090000). The
-- rule now lives in raise_anomaly for every alert it raises: an open alert's severity only ever rises (greatest),
-- never drops, and a rise has it delivered again at once (notified_at and the sender's lease cleared), as the digest
-- did; a repeat at the same or a lower severity changes as before (alert_due_again). Every other caller passes one
-- fixed severity per rule (anomaly_scan, staff_review_fixes, anomaly_reenrolment_overdue, onboarding_state,
-- check_chains), so none of them sees a change.
--
-- raise_anomaly is made again from 20261029080400 and raise_reconciliation_digest from 20261105090000, which now leaves
-- the rise to raise_anomaly; everything else in them is unchanged.

create or replace function internal.raise_anomaly(
  p_rule text, p_severity public.alert_severity, p_subject text, p_title text, p_details jsonb
) returns void
  language sql
  set search_path = ''
as $$
  insert into public.security_alerts (rule, severity, fingerprint, title, details)
  values (p_rule, p_severity, p_rule || ':' || coalesce(p_subject, '-'), p_title, coalesce(p_details, '{}'))
  on conflict (fingerprint) where acknowledged_at is null do update
  set details = excluded.details, last_seen_at = now(), occurrences = public.security_alerts.occurrences + 1,
      severity = greatest(public.security_alerts.severity, excluded.severity),
      notified_at = case when excluded.severity > public.security_alerts.severity
                              or internal.alert_due_again(public.security_alerts.severity,
                                                          public.security_alerts.notified_at)
                         then null else public.security_alerts.notified_at end,
      delivery_claimed_at = case when excluded.severity > public.security_alerts.severity
                                      or internal.alert_due_again(public.security_alerts.severity,
                                                                  public.security_alerts.notified_at)
                                 then null else public.security_alerts.delivery_claimed_at end;
$$;

-- One digest alert per Jakarta day with new issues, at least high so the alert sender mails it. A later run of the day
-- that finds something worse raises the open digest to it through raise_anomaly, which has it mailed again.
create or replace function internal.raise_reconciliation_digest(p_run_id uuid, p_written integer,
  p_worst public.alert_severity, p_by_type jsonb) returns void
  language plpgsql
  set search_path = ''
as $$
begin
  perform internal.raise_anomaly('reconciliation_digest', greatest('high'::public.alert_severity, p_worst),
    public.today_jkt()::text, 'Rekonsiliasi pembayaran menemukan selisih baru',
    jsonb_build_object('run_id', p_run_id, 'new_issues', p_written, 'by_type', p_by_type,
                       'open_issues', (select count(*) from public.reconciliation_issues i where i.resolved_at is null)));
end;
$$;
