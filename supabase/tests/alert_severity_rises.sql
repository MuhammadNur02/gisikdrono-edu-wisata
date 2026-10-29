-- Deferred Low of the review of PR #105 (L4, 20261105120100): an open alert's severity only ever rises through
-- raise_anomaly, never drops, and a rise has it delivered again at once; a repeat at the same or a lower severity
-- keeps its delivery, as before. The reconciliation digest of a day rises to critical through it and stays there.
begin;
select plan(9);

create function pg_temp.alert(p_fingerprint text) returns public.security_alerts
  language sql
as $$ select a.* from public.security_alerts a where a.fingerprint = p_fingerprint and a.acknowledged_at is null; $$;

-- ===== raise_anomaly =====
select internal.raise_anomaly('uji_naik', 'medium', 'subjek-1', 'Uji tingkat', '{"seen": 1}');
update public.security_alerts set notified_at = now() - interval '10 minutes'
where fingerprint = 'uji_naik:subjek-1';
select internal.raise_anomaly('uji_naik', 'high', 'subjek-1', 'Uji tingkat', '{"seen": 2}');
select is((pg_temp.alert('uji_naik:subjek-1')).severity::text, 'high', 'a worse sighting raises the open alert');
select is((pg_temp.alert('uji_naik:subjek-1')).notified_at, null, 'and has it delivered again at once');

update public.security_alerts set notified_at = now() - interval '10 minutes'
where fingerprint = 'uji_naik:subjek-1';
select internal.raise_anomaly('uji_naik', 'medium', 'subjek-1', 'Uji tingkat', '{"seen": 3}');
select is((pg_temp.alert('uji_naik:subjek-1')).severity::text, 'high', 'a milder one never lowers it');
select is((pg_temp.alert('uji_naik:subjek-1')).notified_at, now() - interval '10 minutes',
  'nor sends it again within the hour');
select is((pg_temp.alert('uji_naik:subjek-1')).occurrences, 3, 'every sighting still counts');

-- ===== The reconciliation digest of the day =====
create temporary table digest_run on commit drop as
  select gen_random_uuid() as id;
select internal.raise_reconciliation_digest((select id from digest_run), 1, 'medium', '{"amount_mismatch": 1}');
select is((pg_temp.alert('reconciliation_digest:' || public.today_jkt())).severity::text, 'high',
  'the digest is at least high');
update public.security_alerts set notified_at = now() - interval '5 minutes'
where fingerprint = 'reconciliation_digest:' || public.today_jkt();
select internal.raise_reconciliation_digest((select id from digest_run), 1, 'critical', '{"chain_broken": 1}');
select is((pg_temp.alert('reconciliation_digest:' || public.today_jkt())).severity::text || ':'
          || coalesce((pg_temp.alert('reconciliation_digest:' || public.today_jkt())).notified_at::text, 'due'),
  'critical:due', 'a later run of the day that finds something critical raises it and has it mailed again');
select internal.raise_reconciliation_digest((select id from digest_run), 1, 'high', '{"amount_mismatch": 1}');
select is((pg_temp.alert('reconciliation_digest:' || public.today_jkt())).severity::text, 'critical',
  'and a later run that finds only high issues leaves it critical');
select is((select count(*)::int from public.security_alerts
           where fingerprint = 'reconciliation_digest:' || public.today_jkt() and acknowledged_at is null), 1,
  'one open digest for the day throughout');

select * from finish();
rollback;
