-- Task P4.3.06 (from P1.4; docs/Security.md STAFF-02, PAY-16, REC-10; decisions of 2026-10-26): a UMKM vendor's bank
-- account and an RW's treasury account are granted to no API role (0005), so the superadmin reads and writes them
-- here, at AAL2.
-- * Read: masked by default (••••1234). The full number needs p_reveal, a fresh TOTP and a reason of 3–300 characters.
--   Each reveal is audited with the reason and counted: 20 a Jakarta day per superadmin. The 20th raises the medium
--   alert bank_account_reveal_cap, and the 21st is refused.
-- * Write: also a fresh TOTP. The row's audit trigger records it (column names only, never the values).
--   A changed treasury account, where an RW's payout goes, raises the high alert payout_account_changed, delivered
--   out of band. It reminds the superadmin to compare it with site_settings.finance.expected_payout_account_masked,
--   which this function never touches.

-- ===== Shared steps =====

create function internal.masked_account_number(p_number text) returns text
  language sql immutable
  set search_path = ''
as $$ select case when p_number is null then null else '••••' || right(p_number, 4) end; $$;

-- The superadmin at AAL2 reads masked; a reveal or a write also needs a TOTP code from the last five minutes.
create function internal.require_bank_superadmin(p_fresh boolean) returns void
  language plpgsql stable
  set search_path = ''
as $$
begin
  if not (public.is_superadmin() and public.aal2()) then
    raise exception 'bank accounts are the superadmin''s' using errcode = '42501';
  end if;
  if p_fresh and not public.fresh_totp() then
    raise exception 'a fresh authenticator code is needed' using errcode = '42501', hint = 'FRESH_TOTP';
  end if;
end;
$$;

-- One reveal: its reason, the cap of the caller's Jakarta day, and the audit row that names both.
create function internal.record_bank_reveal(p_entity_type text, p_entity_id text, p_reason text) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  daily_cap constant integer := 20;
  revealed_today integer;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'a reveal needs a reason of 3 to 300 characters' using errcode = '22023';
  end if;
  -- One superadmin's reveals take turns, so parallel calls cannot all count below the cap.
  perform pg_advisory_xact_lock(hashtext('bank_reveal:' || auth.uid()::text));
  select count(*) into revealed_today from public.audit_logs a
  where a.action in ('vendor_bank.revealed', 'rw_treasury.revealed') and a.actor_id = auth.uid()
    and a.occurred_at >= public.today_jkt()::timestamp at time zone 'Asia/Jakarta';
  if revealed_today >= daily_cap then
    raise exception 'the daily limit of % bank account reveals is reached', daily_cap
      using errcode = 'P0001', hint = 'RATE_LIMITED';
  end if;
  perform internal.log_audit(
    case when p_entity_type = 'umkm_vendors' then 'vendor_bank.revealed' else 'rw_treasury.revealed' end,
    p_entity_type, p_entity_id, jsonb_build_object('reason', btrim(p_reason)));
  if revealed_today + 1 >= daily_cap then
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('bank_account_reveal_cap', 'medium',
            'bank_account_reveal_cap:' || auth.uid() || ':' || public.today_jkt(),
            'Batas harian buka rekening tercapai', jsonb_build_object('actor_id', auth.uid(), 'cap', daily_cap))
    on conflict (fingerprint) where acknowledged_at is null do nothing;
  end if;
end;
$$;

-- An account number is 5 to 20 digits; the bank and the holder are short plain text.
create function internal.require_bank_account(p_bank_name text, p_account_number text, p_account_holder text)
  returns void
  language plpgsql immutable
  set search_path = ''
as $$
begin
  if p_account_number is null or p_account_number !~ '^[0-9]{5,20}$'
     or length(btrim(coalesce(p_bank_name, ''))) not between 2 and 60
     or length(btrim(coalesce(p_account_holder, ''))) not between 2 and 120 then
    raise exception 'a bank account needs a bank, 5 to 20 digits and a holder' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function internal.masked_account_number(text), internal.require_bank_superadmin(boolean),
  internal.record_bank_reveal(text, text, text), internal.require_bank_account(text, text, text)
  from public, anon, authenticated, service_role;


-- ===== Vendors =====

create function public.get_vendor_bank_account(p_vendor_id uuid, p_reveal boolean default false,
  p_reason text default null) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  vendor record;
begin
  perform internal.require_bank_superadmin(coalesce(p_reveal, false));
  select v.bank_name, v.bank_account_number, v.bank_account_holder into vendor
  from public.umkm_vendors v where v.id = p_vendor_id;
  if not found then
    raise exception 'vendor % does not exist', p_vendor_id using errcode = 'P0002';
  end if;
  if coalesce(p_reveal, false) then
    perform internal.record_bank_reveal('umkm_vendors', p_vendor_id::text, p_reason);
  end if;
  return jsonb_build_object(
    'bank_name', vendor.bank_name,
    'account_holder', vendor.bank_account_holder,
    'account_masked', internal.masked_account_number(vendor.bank_account_number),
    'account_number', case when coalesce(p_reveal, false) then vendor.bank_account_number end);
end;
$$;

create function public.set_vendor_bank_account(p_vendor_id uuid, p_bank_name text, p_account_number text,
  p_account_holder text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
begin
  perform internal.require_bank_superadmin(true);
  perform internal.require_bank_account(p_bank_name, p_account_number, p_account_holder);
  update public.umkm_vendors
  set bank_name = btrim(p_bank_name), bank_account_number = p_account_number,
      bank_account_holder = btrim(p_account_holder)
  where id = p_vendor_id;
  if not found then
    raise exception 'vendor % does not exist', p_vendor_id using errcode = 'P0002';
  end if;
end;
$$;


-- ===== RW treasuries =====

create function public.get_rw_treasury_account(p_rw_id smallint, p_reveal boolean default false,
  p_reason text default null) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  rw record;
begin
  perform internal.require_bank_superadmin(coalesce(p_reveal, false));
  select r.treasury_bank_name, r.treasury_account_number, r.treasury_account_holder into rw
  from public.rw_units r where r.id = p_rw_id;
  if not found then
    raise exception 'RW % does not exist', p_rw_id using errcode = 'P0002';
  end if;
  if coalesce(p_reveal, false) then
    perform internal.record_bank_reveal('rw_units', p_rw_id::text, p_reason);
  end if;
  return jsonb_build_object(
    'bank_name', rw.treasury_bank_name,
    'account_holder', rw.treasury_account_holder,
    'account_masked', internal.masked_account_number(rw.treasury_account_number),
    'account_number', case when coalesce(p_reveal, false) then rw.treasury_account_number end);
end;
$$;

create function public.set_rw_treasury_account(p_rw_id smallint, p_bank_name text, p_account_number text,
  p_account_holder text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous record;
begin
  perform internal.require_bank_superadmin(true);
  perform internal.require_bank_account(p_bank_name, p_account_number, p_account_holder);
  select r.treasury_bank_name, r.treasury_account_number, r.treasury_account_holder into previous
  from public.rw_units r where r.id = p_rw_id for update;
  if not found then
    raise exception 'RW % does not exist', p_rw_id using errcode = 'P0002';
  end if;
  update public.rw_units
  set treasury_bank_name = btrim(p_bank_name), treasury_account_number = p_account_number,
      treasury_account_holder = btrim(p_account_holder)
  where id = p_rw_id;
  -- PAY-16, REC-10: a payout account that changes is the classic way money is redirected.
  if (previous.treasury_bank_name, previous.treasury_account_number, previous.treasury_account_holder)
     is distinct from (btrim(p_bank_name), p_account_number, btrim(p_account_holder)) then
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('payout_account_changed', 'high', 'payout_account_changed:rw:' || p_rw_id || ':' || now(),
            'Rekening kas RW diubah; bandingkan dengan rekening pencairan yang diharapkan di Pengaturan',
            jsonb_build_object('rw_id', p_rw_id, 'actor_id', auth.uid(),
                               'previous_masked', internal.masked_account_number(previous.treasury_account_number),
                               'new_masked', internal.masked_account_number(p_account_number)));
  end if;
end;
$$;

revoke execute on function public.get_vendor_bank_account(uuid, boolean, text),
  public.set_vendor_bank_account(uuid, text, text, text),
  public.get_rw_treasury_account(smallint, boolean, text),
  public.set_rw_treasury_account(smallint, text, text, text)
  from public, anon, service_role;
grant execute on function public.get_vendor_bank_account(uuid, boolean, text),
  public.set_vendor_bank_account(uuid, text, text, text),
  public.get_rw_treasury_account(smallint, boolean, text),
  public.set_rw_treasury_account(smallint, text, text, text)
  to authenticated;
