-- docs/PRD.md §13.1 A30, docs/Security.md AZ-16, DATA-14: the Kopdes runs the UMKM finance, so its admin keeps the
-- sellers' payout accounts beside the superadmin. The columns themselves stay granted to no API role (20261104120000):
-- they move only through set_vendor_bank_account and are read masked, or whole with a reason and an audit row, through
-- get_vendor_bank_account, at AAL2 and, for a change or a reveal, with a TOTP code from the last five minutes. Each
-- change still raises the high payout_account_changed alert to the superadmin. The RW treasury accounts stay the
-- superadmin's alone (require_bank_superadmin is unchanged).


-- The vendor half of require_bank_superadmin (20261104120000): the UMKM managers instead of the superadmin alone.
create function internal.require_vendor_bank_manager(p_fresh boolean) returns void
  language plpgsql stable
  set search_path = ''
as $$
begin
  if not (public.manages_umkm() and public.aal2()) then
    raise exception 'a seller''s bank account is the superadmin''s or the Kopdes admin''s' using errcode = '42501';
  end if;
  if p_fresh and not public.fresh_totp() then
    raise exception 'a fresh authenticator code is needed' using errcode = '42501', hint = 'FRESH_TOTP';
  end if;
end;
$$;
revoke execute on function internal.require_vendor_bank_manager(boolean) from public, anon, authenticated, service_role;

-- Replaces the 20261104121000 version: require_vendor_bank_manager instead of require_bank_superadmin.
create or replace function public.set_vendor_bank_account(p_vendor_id uuid, p_bank_name text, p_account_number text,
                                                          p_account_holder text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous record;
begin
  perform internal.require_vendor_bank_manager(true);
  perform internal.require_bank_account(p_bank_name, p_account_number, p_account_holder);
  select v.bank_name, v.bank_account_number, v.bank_account_holder into previous
  from public.umkm_vendors v where v.id = p_vendor_id for update;
  if not found then
    raise exception 'vendor % does not exist', p_vendor_id using errcode = 'P0002';
  end if;
  update public.umkm_vendors
  set bank_name = btrim(p_bank_name), bank_account_number = p_account_number,
      bank_account_holder = btrim(p_account_holder)
  where id = p_vendor_id;
  if (previous.bank_name, previous.bank_account_number, previous.bank_account_holder)
     is distinct from (btrim(p_bank_name), p_account_number, btrim(p_account_holder)) then
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('payout_account_changed', 'high', 'payout_account_changed:vendor:' || p_vendor_id || ':' || now(),
            'Rekening UMKM diubah; pastikan perubahan ini diminta oleh pemiliknya',
            jsonb_build_object('vendor_id', p_vendor_id, 'actor_id', auth.uid(),
                               'previous_masked', internal.masked_account_number(previous.bank_account_number),
                               'new_masked', internal.masked_account_number(p_account_number)));
  end if;
end;
$$;

-- Replaces the 20261104120000 version: require_vendor_bank_manager instead of require_bank_superadmin.
create or replace function public.get_vendor_bank_account(p_vendor_id uuid, p_reveal boolean default false,
                                                          p_reason text default null) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  vendor record;
begin
  perform internal.require_vendor_bank_manager(coalesce(p_reveal, false));
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

-- Replaces the 0004 version: the bank columns are written by the system or by a UMKM manager (through
-- set_vendor_bank_account, the only path an API role has), never by anyone else.
create or replace function internal.umkm_vendors_bank_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  bank_touched boolean := case tg_op
    when 'INSERT' then (new.bank_name, new.bank_account_number, new.bank_account_holder) is distinct from (null, null, null)
    else (new.bank_name, new.bank_account_number, new.bank_account_holder)
         is distinct from (old.bank_name, old.bank_account_number, old.bank_account_holder)
  end;
begin
  if bank_touched and not (coalesce(current_setting('role', true), 'none') = 'none' or public.manages_umkm()) then
    raise exception 'only the superadmin or the Kopdes admin records a seller''s bank account' using errcode = '42501';
  end if;
  return new;
end;
$$;
