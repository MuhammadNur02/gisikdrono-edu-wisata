-- Independent review of PR #79 (Task P4.3.05, P4.3.06; docs/Security.md STAFF-02, PAY-16, MON-07; docs/PRD.md A4,
-- REC-14), the Lows that live in the database:
--   L-1  a combo visits at most four RWs (MAX_PACKAGE_LEGS), in save_package_legs and in combo_legs_on_sale;
--   L-2  a bank reveal is also a pii_revealed security event, so it reaches MON-07 and the reveal counters;
--   L-3  an account number is 5 to 20 digits in the tables too, and a short one shows only its last two digits;
--   and the owner's decision of 2026-10-26: a changed vendor account raises payout_account_changed as a treasury does.
-- Every function replaces its latest version; the rest of each body is unchanged.

-- ===== L-1: at most four RWs a combo =====

create or replace function public.save_package_legs(
  p_package_id uuid, p_category public.package_category, p_leg_rw_ids smallint[]
) returns void
  language plpgsql security invoker
  set search_path = ''
as $$
declare
  free_places constant smallint := 1000;
  max_legs constant integer := 4;
begin
  if p_category <> 'combo' then
    if p_leg_rw_ids is not null and cardinality(p_leg_rw_ids) > 0 then
      raise exception 'an RW package visits its own RW only' using errcode = '22023';
    end if;
    return;
  end if;
  if p_leg_rw_ids is null then
    return;
  end if;
  if cardinality(p_leg_rw_ids) = 0 or cardinality(p_leg_rw_ids) > max_legs
     or array_position(p_leg_rw_ids, null) is not null
     or cardinality(p_leg_rw_ids) <> (select count(distinct r) from unnest(p_leg_rw_ids) as r) then
    raise exception 'a combo visits each of its RWs once, in order, at most % of them', max_legs
      using errcode = '22023';
  end if;
  delete from public.tour_package_legs l where l.package_id = p_package_id and l.rw_id <> all (p_leg_rw_ids);
  update public.tour_package_legs l set leg_order = l.leg_order + free_places where l.package_id = p_package_id;
  insert into public.tour_package_legs as l (package_id, rw_id, leg_order)
  select p_package_id, leg.rw_id, leg.leg_order::smallint
  from unnest(p_leg_rw_ids) with ordinality as leg(rw_id, leg_order)
  on conflict (package_id, rw_id) do update set leg_order = excluded.leg_order;
end;
$$;

-- A leg written any other way meets the same ceiling at commit, published or not.
create or replace function internal.combo_legs_on_sale() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  max_legs constant integer := 4;
  target_package uuid := coalesce(new.package_id, old.package_id);
  legs integer;
begin
  select count(distinct l.rw_id) into legs from public.tour_package_legs l where l.package_id = target_package;
  if exists (select 1 from public.tour_packages p where p.id = target_package and p.category = 'combo') and legs > max_legs then
    raise exception 'a combo package visits at most % RWs', max_legs using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if exists (select 1 from public.tour_packages p
             where p.id = target_package and p.category = 'combo' and p.status = 'published')
     and legs < 2 then
    raise exception 'a published combo package visits at least two different RWs'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return null;
end;
$$;


-- ===== L-3: the shape of an account number =====

-- Created not valid, then validated, so a table with rows is checked without holding its lock for the whole scan.
alter table public.umkm_vendors add constraint umkm_vendors_bank_account_number_ok
  check (bank_account_number is null or bank_account_number ~ '^[0-9]{5,20}$') not valid;
alter table public.umkm_vendors validate constraint umkm_vendors_bank_account_number_ok;
alter table public.rw_units add constraint rw_units_treasury_account_number_ok
  check (treasury_account_number is null or treasury_account_number ~ '^[0-9]{5,20}$') not valid;
alter table public.rw_units validate constraint rw_units_treasury_account_number_ok;

-- The last four digits, or the last two of a number of eight digits or fewer, where four would be half of it.
create or replace function internal.masked_account_number(p_number text) returns text
  language sql immutable
  set search_path = ''
as $$
  select case when p_number is null then null
              when length(p_number) <= 8 then '••••' || right(p_number, 2)
              else '••••' || right(p_number, 4) end;
$$;


-- ===== L-2: a reveal is a pii_revealed event =====

-- Replaces the 20261104120000 version: besides the audit row and the cap of 20 a day, each reveal writes the
-- pii_revealed security event the booking reveals write (ids only), under the account's RW.
create or replace function internal.record_bank_reveal(p_entity_type text, p_entity_id text, p_reason text)
  returns void
  language plpgsql
  set search_path = ''
as $$
declare
  daily_cap constant integer := 20;
  revealed_today integer;
  account_rw smallint;
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
  account_rw := case when p_entity_type = 'umkm_vendors'
                     then (select v.rw_id from public.umkm_vendors v where v.id = p_entity_id::uuid)
                     else p_entity_id::smallint end;
  insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, entity_id, details)
  values ('pii_revealed', 'info', auth.uid(), account_rw, p_entity_type, p_entity_id,
          jsonb_build_object('count', 'bank_account'));
  if revealed_today + 1 >= daily_cap then
    insert into public.security_alerts (rule, severity, fingerprint, title, details)
    values ('bank_account_reveal_cap', 'medium',
            'bank_account_reveal_cap:' || auth.uid() || ':' || public.today_jkt(),
            'Batas harian buka rekening tercapai', jsonb_build_object('actor_id', auth.uid(), 'cap', daily_cap))
    on conflict (fingerprint) where acknowledged_at is null do nothing;
  end if;
end;
$$;


-- ===== A changed vendor account (owner's decision of 2026-10-26) =====

-- Replaces the 20261104120000 version: a vendor's payout account that changes raises the high alert
-- payout_account_changed like an RW treasury's (PAY-16), with the masked numbers only.
create or replace function public.set_vendor_bank_account(p_vendor_id uuid, p_bank_name text,
  p_account_number text, p_account_holder text) returns void
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous record;
begin
  perform internal.require_bank_superadmin(true);
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
