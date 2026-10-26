-- Independent review of PR #85 (docs/Security.md §6.6, DATA-04, MON-07), L-b: since 20261104121000 a bank account
-- reveal is also a pii_revealed security event (entity_type umkm_vendors or rw_units). The contact and participant
-- reveals' daily cap of 50 counted every pii_revealed event of the caller, so the superadmin's bank reveals spent that
-- budget too. The count now takes only the events of bookings, which is what the cap is for; the bank reveals keep
-- their own cap of 20 a day (internal.record_bank_reveal, counted from audit_logs).
--
-- I-1, a correction to the header comment of 20261104121000, which stays as merged: its account-number checks were
-- added not valid and validated in the same migration, and one migration is one transaction, so the ACCESS EXCLUSIVE
-- lock the ADD CONSTRAINT takes is held until commit. The pair is therefore no lighter there than a plain
-- ADD CONSTRAINT; the weaker lock of VALIDATE CONSTRAINT (SHARE UPDATE EXCLUSIVE) only helps when the validation runs
-- in a transaction of its own. The tables are small, so the order stays as it is.

create or replace function internal.record_pii_reveal(p_booking_id uuid, p_rw_id smallint, p_details jsonb)
  returns void
  language plpgsql
  set search_path = ''
as $$
declare
  daily_cap constant integer := 50;
  revealed_today integer;
begin
  -- One staff member's reveals take turns, so parallel calls cannot all count below the cap.
  perform pg_advisory_xact_lock(hashtext('pii_reveal:' || auth.uid()::text));
  select count(*) into revealed_today from public.security_events e
  where e.event_type = 'pii_revealed' and e.entity_type = 'bookings' and e.actor_id = auth.uid()
    and e.occurred_at >= public.today_jkt()::timestamp at time zone 'Asia/Jakarta';
  if revealed_today >= daily_cap then
    raise exception 'the daily limit of % personal-data reveals is reached', daily_cap
      using errcode = 'P0001', hint = 'RATE_LIMITED';
  end if;

  insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
  values ('pii_revealed', 'info', auth.uid(), p_rw_id, 'bookings', p_booking_id::text, p_details);
  if revealed_today + 1 >= daily_cap then
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('pii_reveal_cap', 'high', 'pii_reveal_cap:' || auth.uid() || ':' || public.today_jkt(),
            'Batas harian buka data pribadi tercapai', jsonb_build_object('actor_id', auth.uid(), 'cap', daily_cap))
    on conflict (fingerprint) where acknowledged_at is null do nothing;
  end if;
end;
$$;
