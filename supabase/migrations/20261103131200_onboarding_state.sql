-- Task P4.8.01 (security review of the onboarding design, (9) and O5; docs/Security.md §5.1, §11.2):
--
--   (9) public.onboarding_state(): what /onboarding needs to know about the signed-in account and nothing more, as
--       booleans: whether it never was staff and an invite for its address is open, whether this session holds the
--       claim, and whether it has exactly one verified authenticator. It is a staff-RPC allow-list entry of its own;
--       an account in onboarding stays refused by every other policy and RPC (rls_onboarding_persona.sql).
--   O5  A claim that ended another session of an account being onboarded is a high anomaly: the mailbox may be in
--       someone else's hands too.

create function public.onboarding_state()
  returns table (invite_open boolean, claim_held boolean, factor_verified boolean)
  language sql stable security definer
  set search_path = ''
as $$
  select
    coalesce(account.is_onboarding and exists (
      select 1 from public.staff_invites i
      where i.email = account.email and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    ), false),
    coalesce(account.is_onboarding
             and internal.held_claim(account.id, nullif(auth.jwt() ->> 'session_id', '')::uuid) is not null, false),
    coalesce(account.is_onboarding and internal.has_exactly_one_factor(account.id), false)
  from (select 1) as once
  left join lateral (
    select p.id, p.email, internal.is_never_staff(p.id) as is_onboarding
    from public.profiles p where p.id = auth.uid()
  ) as account on true;
$$;
revoke execute on function public.onboarding_state() from public, anon, service_role;
grant execute on function public.onboarding_state() to authenticated;

-- Replaces the 20261029080200 version: invite_claimed events that ended another session are raised too.
create or replace function internal.anomaly_from_events(p_since timestamptz) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  batch constant integer := 200;
  hit record;
  raised integer := 0;
begin
  for hit in
    select e.event_type, e.entity_id, count(*) as seen, max(e.rw_id) as rw_id,
           coalesce(jsonb_agg(distinct e.actor_id) filter (where e.actor_id is not null), '[]') as actor_ids
    from public.security_events e
    where e.occurred_at > p_since
      and (e.event_type in ('webhook_amount_mismatch', 'status_disagreement', 'session_changed_with_bookings',
                            'manual_checkin', 'mfa_enrolled', 'export_downloaded')
           or (e.event_type = 'invite_claimed' and coalesce((e.details ->> 'sessions_ended')::integer, 0) > 0))
    group by e.event_type, e.entity_id
    limit batch
  loop
    perform internal.raise_anomaly(hit.event_type,
      case when hit.event_type in ('webhook_amount_mismatch', 'status_disagreement', 'mfa_enrolled', 'invite_claimed')
           then 'high' else 'medium' end::public.alert_severity,
      hit.entity_id,
      case hit.event_type
        when 'webhook_amount_mismatch' then 'Jumlah pembayaran tidak cocok'
        when 'status_disagreement' then 'Status Midtrans berbeda'
        when 'session_changed_with_bookings' then 'Sesi berpemesanan diubah'
        when 'manual_checkin' then 'Check-in manual'
        when 'mfa_enrolled' then 'Autentikator baru didaftarkan'
        when 'invite_claimed' then 'Klaim undangan mengakhiri sesi lain'
        else 'Ekspor data' end,
      jsonb_build_object('entity_id', hit.entity_id, 'events', hit.seen, 'rw_id', hit.rw_id,
                         'actor_ids', hit.actor_ids));
    raised := raised + 1;
  end loop;
  return raised;
end;
$$;
