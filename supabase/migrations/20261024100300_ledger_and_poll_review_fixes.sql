-- Independent reviews of PR #42, 2026-10-24 (docs/Security.md §3.7, §3.8, §9.1; REC-05, REC-06, REC-08, WH-13,
-- MON-04): the fixes to the ledger, the poll and the tickets of 20261024100000 to 20261024100200.
--   H1  a rule that pays one party twice in a line is refused when written, and at settlement it is refused into the
--       review instead of failing the whole notification;
--   M2  a refund's reversal follows what each ledger row still holds, under the booking's lock, once per refund;
--   M3  the poll retries a refused split until a rule covers the settlement's day, leaving the review to staff;
--   M4  the poll asks the attempts it has not asked for longest first, and leaves an attempt under review to staff;
--   M5  an attempt is asked until a day past its hold's deadline, however far the hold was extended;
--   M6  a refund made at Midtrans of the whole amount suspends the tickets of a visit still ahead;
--   and the low ones: the settlement day never falls back to now(), the poll's list is the server's alone, and the
--   ledger is out of the purge's reach, its first row anchoring the chain.


-- ===== H1: one beneficiary per line =====

-- The key a ledger row pays (revenue_share_entries.beneficiary_key): the kelurahan, an RW's treasury or a vendor.
create function internal.revenue_beneficiary_key(p_beneficiary public.revenue_beneficiary, p_rw_id smallint,
  p_vendor_id uuid) returns text
  language sql immutable
  set search_path = ''
as $$
  select case p_beneficiary when 'kelurahan' then 'kelurahan'
                            when 'rw_treasury' then 'rw:' || p_rw_id
                            else 'vendor:' || p_vendor_id end;
$$;

-- A line's parts as the ledger writes them. A vendor line without a vendor stands for the product's own vendor
-- (rule_line_target_ok), which p_vendor_id names; a package has none.
create function internal.settlement_parts(p_rule_id uuid, p_base bigint, p_legs smallint[], p_vendor_id uuid)
  returns table (part_order integer, beneficiary public.revenue_beneficiary, beneficiary_key text, rw_id smallint,
                 vendor_id uuid, pct numeric, amount bigint)
  language sql stable
  set search_path = ''
as $$
  select s.part_order, s.beneficiary, internal.revenue_beneficiary_key(s.beneficiary, s.rw_id, paid.vendor_id),
         case when s.beneficiary = 'rw_treasury' then s.rw_id end, paid.vendor_id, s.pct, s.amount
  from internal.revenue_split(p_rule_id, p_base, p_legs) as s
  cross join lateral (select case when s.beneficiary = 'umkm_vendor' then coalesce(s.vendor_id, p_vendor_id) end
                        as vendor_id) as paid;
$$;

-- Replaces the 20261024100000 version. A named vendor line beside "the product's vendor" pays one vendor twice when
-- the product is that vendor's, and the second row would fail revenue_entries_settlement_once with 23505, which
-- rolled the whole notification back (H1). Two parts for one party are now refused as STATE_INVALID, so the settlement
-- stands under review like any other refused split.
create or replace function internal.insert_settlement_rows(p_booking_id uuid, p_payment_id uuid, p_line_ref text,
  p_addon_id uuid, p_rule_id uuid, p_base bigint, p_legs smallint[], p_vendor_id uuid) returns bigint
  language plpgsql
  set search_path = ''
as $$
declare
  version jsonb := internal.revenue_rule_version(p_rule_id);
  written bigint;
begin
  if exists (select 1 from internal.settlement_parts(p_rule_id, p_base, p_legs, p_vendor_id) as s
             where s.beneficiary = 'umkm_vendor' and s.vendor_id is null) then
    raise exception 'revenue rule % pays a vendor line % has none of', p_rule_id, p_line_ref
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if exists (select 1 from internal.settlement_parts(p_rule_id, p_base, p_legs, p_vendor_id) as s
             group by s.beneficiary_key having count(*) > 1) then
    raise exception 'revenue rule % pays one beneficiary twice in line %', p_rule_id, p_line_ref
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  with inserted as (
    insert into public.revenue_share_entries (booking_id, payment_id, entry_type, line_ref, booking_addon_id, rule_id,
      rule_version, beneficiary, beneficiary_key, rw_id, vendor_id, base_amount, pct, amount)
    select p_booking_id, p_payment_id, 'settlement', p_line_ref, p_addon_id, p_rule_id, version, s.beneficiary,
           s.beneficiary_key, s.rw_id, s.vendor_id, p_base, s.pct, s.amount
    from internal.settlement_parts(p_rule_id, p_base, p_legs, p_vendor_id) as s
    order by s.part_order
    returning amount)
  select coalesce(sum(amount), 0) into written from inserted;
  if written <> p_base then
    raise exception 'line % split into % of %', p_line_ref, written, p_base using errcode = 'P0001',
      hint = 'STATE_INVALID';
  end if;
  return written;
end;
$$;

-- Replaces the 20261024100100 version. Besides the rules' own refusals, a split it cannot divide (22023 from
-- largest_remainder_split) and a second row for one beneficiary, which insert_settlement_rows refuses first, also
-- leave the settlement standing under review rather than rolling the notification back (H1).
create or replace function internal.try_allocate_revenue_share(p_booking_id uuid, p_payment_id uuid) returns boolean
  language plpgsql
  set search_path = ''
as $$
begin
  perform internal.allocate_revenue_share(p_booking_id, p_payment_id);
  return true;
exception when sqlstate 'P0001' or sqlstate 'P0002' or sqlstate '22023' or unique_violation then
  return false;
end;
$$;

-- Replaces the 20261022100000 version with one more refusal: a rule pays either the product's own vendor or named
-- vendors, never both, since the two meet whenever the product is a named vendor's (H1). Everything else is unchanged.
create or replace function internal.revenue_rule_shape_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  affected_rule uuid;
  rule_scope public.revenue_rule_scope;
  has_equal_line boolean;
  fixed_lines integer;
begin
  -- The trigger fires on a rule's lines and on a change of the rule's scope.
  if tg_table_name = 'revenue_share_rules' then
    affected_rule := new.id;
  else
    affected_rule := new.rule_id;
  end if;
  -- Two writers committing lines of one rule at once take turns here, so the second counts the first one's lines
  -- (independent review of PR #24, 6). An advisory lock, not a row lock on the rule: that would wait for the other
  -- writer's foreign-key lock on the rule while the other waits for this writer's audit chain lock, a deadlock
  -- (tests/integration/revenue-rule-writers.test.ts).
  perform pg_advisory_xact_lock(hashtext('revenue_rule:' || affected_rule::text));
  if exists (select 1 from public.revenue_share_rule_lines l
             where l.rule_id = affected_rule and l.beneficiary = 'umkm_vendor' and l.vendor_id is null)
     and exists (select 1 from public.revenue_share_rule_lines l
                 where l.rule_id = affected_rule and l.beneficiary = 'umkm_vendor' and l.vendor_id is not null) then
    raise exception 'a revenue rule pays the product''s own vendor or named vendors, not both'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  select r.scope into rule_scope from public.revenue_share_rules r where r.id = affected_rule;
  select coalesce(bool_or(l.rw_id is null), false), count(*) filter (where l.rw_id is not null)
    into has_equal_line, fixed_lines
  from public.revenue_share_rule_lines l where l.rule_id = affected_rule and l.beneficiary = 'rw_treasury';
  if not has_equal_line then
    return null;
  end if;
  if fixed_lines > 0 then
    raise exception 'a revenue rule splits the RWs'' share equally in one line, with no RW named beside it'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if rule_scope not in ('package_default', 'package') then
    raise exception 'only a package''s rule may split the RWs'' share equally over the booking''s legs'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return null;
end;
$$;


-- ===== The settlement's day =====

-- Replaces the 20261024090100 version: a settlement Midtrans gave no settlement_time is dated by its
-- transaction_time, never by the moment the answer arrived, since that day picks the revenue rule. Everything else is
-- unchanged.
create or replace function internal.store_payment_answer(p_payment_id uuid, p_status public.payment_status,
  p_answer jsonb) returns public.payments
  language plpgsql
  set search_path = ''
as $$
declare
  payment_type text := p_answer ->> 'payment_type';
  stored public.payments;
begin
  update public.payments p set
    status = p_status,
    provider_txn_id = coalesce(p.provider_txn_id, p_answer ->> 'transaction_id'),
    payment_type_raw = coalesce(payment_type, p.payment_type_raw),
    method = coalesce(case when payment_type = 'qris' then 'qris'
                           when payment_type in ('bank_transfer', 'echannel', 'permata') then 'virtual_account'
                      end::public.payment_method, p.method),
    va_bank = coalesce(p_answer #>> '{va_numbers,0,bank}',
                       case when p_answer ? 'permata_va_number' then 'permata'
                            when payment_type = 'echannel' then 'mandiri' end, p.va_bank),
    va_number = coalesce(p_answer #>> '{va_numbers,0,va_number}', p_answer ->> 'permata_va_number',
                         p_answer ->> 'bill_key', p.va_number),
    transaction_time = coalesce(internal.midtrans_time(p_answer ->> 'transaction_time'), p.transaction_time),
    settlement_time = case when p_status = 'settled'
                           then coalesce(internal.midtrans_time(p_answer ->> 'settlement_time'),
                                         internal.midtrans_time(p_answer ->> 'transaction_time'), p.transaction_time)
                           else p.settlement_time end,
    fraud_status = coalesce(p_answer ->> 'fraud_status', p.fraud_status),
    status_code = coalesce(p_answer ->> 'status_code', p.status_code),
    last_payload = p_answer
  where p.id = p_payment_id
  returning * into stored;
  return stored;
end;
$$;

-- Replaces the 20261024100000 version: the rule day is the Jakarta day of the settlement, or of the transaction when
-- Midtrans gave no settlement time, and a payment with neither is refused into the review rather than dated today.
-- Everything else is unchanged.
create or replace function internal.allocate_revenue_share(p_booking_id uuid, p_payment_id uuid) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  booking public.bookings;
  payment public.payments;
  rule_day date;
  legs smallint[];
  package_base bigint;
  addon record;
  written bigint := 0;
begin
  if exists (select 1 from public.revenue_share_entries e
             where e.booking_id = p_booking_id and e.entry_type = 'settlement') then
    return jsonb_build_object('result', 'already_allocated');
  end if;
  select * into booking from public.bookings b where b.id = p_booking_id;
  select * into payment from public.payments p where p.id = p_payment_id and p.booking_id = p_booking_id;
  if payment.id is null or payment.status <> 'settled' then
    raise exception 'payment % of booking % is not settled', p_payment_id, p_booking_id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  rule_day := (coalesce(payment.settlement_time, payment.transaction_time) at time zone 'Asia/Jakarta')::date;
  if rule_day is null then
    raise exception 'payment % has no settlement or transaction time to pick its revenue rule by', p_payment_id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  legs := array(select l.rw_id from public.booking_legs l where l.booking_id = p_booking_id order by l.leg_order);
  package_base := booking.subtotal_package - booking.discount_amount;
  if package_base < 0 then
    raise exception 'the discount of booking % is larger than its package line', p_booking_id
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;

  if package_base > 0 then
    written := internal.insert_settlement_rows(p_booking_id, p_payment_id, 'package', null,
      internal.resolve_package_rule(booking.package_id, rule_day), package_base, legs, null);
  end if;
  for addon in
    select a.id, a.product_id, a.rw_id, a.vendor_id, a.line_total from public.booking_addons a
    where a.booking_id = p_booking_id and a.line_total > 0 order by a.created_at, a.id
  loop
    written := written + internal.insert_settlement_rows(p_booking_id, p_payment_id, 'addon:' || addon.id, addon.id,
      internal.resolve_addon_rule(addon.product_id, addon.rw_id, rule_day), addon.line_total, legs, addon.vendor_id);
  end loop;
  if written <> payment.gross_amount then
    raise exception 'the ledger of booking % adds up to %, not %', p_booking_id, written, payment.gross_amount
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return jsonb_build_object('result', 'allocated', 'amount', written);
end;
$$;

-- Replaces the 20261024100100 version: paid_at keeps the time the money settled, and the time the answer arrived only
-- when Midtrans gave neither a settlement nor a transaction time, since a booking's money freezes once paid_at is set.
-- Everything else is unchanged.
create or replace function internal.settle_payment(p_booking public.bookings, p_payment public.payments,
  p_answer jsonb, p_actor_type text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  payment public.payments;
  booking public.bookings;
  closed_orders text[];
  has_seats boolean := true;
begin
  if p_payment.gross_amount <> p_booking.total_amount then
    return internal.hold_for_review(p_booking, p_payment, 'AMOUNT_MISMATCH', 'webhook_amount_mismatch', 'high',
                                    p_actor_type);
  end if;
  if exists (select 1 from public.payments p
             where p.booking_id = p_booking.id and p.status = 'settled' and p.id <> p_payment.id) then
    return internal.record_duplicate_settlement(p_booking, p_payment, p_answer, p_actor_type);
  end if;
  payment := internal.store_payment_answer(p_payment.id, 'settled', p_answer);
  with closed as (
    update public.payments set status = 'cancelled'
    where booking_id = p_booking.id and id <> payment.id and status in ('initiated', 'pending')
    returning order_id)
  select coalesce(array_agg(order_id order by order_id), '{}') into closed_orders from closed;

  if p_booking.status not in ('pending_payment', 'expired') then
    perform internal.flag_payment_review(p_booking, payment, 'PAID_WHILE_' || upper(p_booking.status::text), 'high',
                                         p_actor_type);
    return jsonb_build_object('result', 'needs_review', 'processing_result', 'paid_while_' || p_booking.status,
                              'payment_status', 'settled', 'booking_status', p_booking.status,
                              'close_orders', to_jsonb(closed_orders));
  end if;
  if p_booking.status = 'expired' then
    has_seats := internal.revive_expired_hold(p_booking.id);
  end if;
  update public.bookings
  set status = 'paid', paid_at = coalesce(payment.settlement_time, now()), amount_paid = payment.gross_amount,
      review_reason = case when p_booking.status <> 'expired' then review_reason
                           when has_seats then 'LATE_SETTLEMENT_REQUOTA' else 'PAID_AFTER_EXPIRY_NO_QUOTA' end
  where id = p_booking.id
  returning * into booking;
  insert into public.booking_events (booking_id, from_status, to_status, actor_type, reason, payload)
  values (booking.id, p_booking.status, 'paid', p_actor_type,
          case when p_booking.status = 'pending_payment' then 'payment_settled'
               when has_seats then 'revived_late_settlement' else 'paid_after_expiry_no_quota' end,
          jsonb_build_object('order_id', payment.order_id, 'amount', payment.gross_amount));
  perform internal.issue_paid_invoice(booking, payment);
  if not internal.try_allocate_revenue_share(booking.id, payment.id) then
    perform internal.flag_payment_review(booking, payment, 'REVENUE_RULE_REFUSED', 'high', p_actor_type);
  end if;
  if has_seats then
    perform internal.issue_booking_tickets(booking.id);
    perform internal.enqueue_notification(booking.id, 'payment_received_ticket', 'whatsapp', '{"link_scope": "view"}');
    perform internal.enqueue_notification(booking.id, 'payment_received_ticket', 'email', '{"link_scope": "view"}');
    perform internal.notify_staff(booking, 'admin_new_paid_booking', null);
  else
    perform internal.flag_payment_review(booking, payment, 'PAID_AFTER_EXPIRY_NO_QUOTA', 'high', p_actor_type);
  end if;
  return jsonb_build_object('result', 'applied', 'processing_result', 'settled', 'payment_status', 'settled',
                            'booking_status', 'paid', 'close_orders', to_jsonb(closed_orders));
end;
$$;


-- ===== M2: a refund's reversal =====

drop function internal.reverse_revenue_share(uuid, bigint, text);

-- One set of reversal rows per refund: record_refund retried with the same reference finds the rows it wrote, and a
-- second set for one reference is refused here.
create unique index revenue_entries_reversal_once on public.revenue_share_entries
  (booking_id, (rule_version ->> 'refund_reference'), line_ref, beneficiary_key) where entry_type = 'reversal';

-- A refund's reversal rows (docs/PRD.md §11.2). p_amount goes over what each settlement row still holds after the
-- reversals before it, by largest remainder in the rows' order, so a run of partial refunds never takes more from a
-- row than it holds and a refund of everything left gives each row back exactly its rest (M2). The booking's lock
-- comes after the audit turn, as for every writer of a booking. p_reference names the refund (its Midtrans refund key
-- or bank transfer reference); the same reference with the same amount is the same refund and writes nothing again.
-- Written by record_refund (Task P4.7.03), in the refund's own transaction.
create function internal.reverse_revenue_share(p_booking_id uuid, p_amount bigint, p_reference text, p_reason text)
  returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  reference text := btrim(coalesce(p_reference, ''));
  already_reversed bigint;
  settled_ids bigint[];
  remaining numeric[];
  parts bigint[];
begin
  if reference = '' or length(reference) > 100 then
    raise exception 'a reversal names its refund in 1 to 100 characters' using errcode = '22023';
  end if;
  perform internal.take_audit_turn();
  perform 1 from public.bookings b where b.id = p_booking_id for update;
  select -sum(e.amount) into already_reversed from public.revenue_share_entries e
  where e.booking_id = p_booking_id and e.entry_type = 'reversal' and e.rule_version ->> 'refund_reference' = reference;
  if already_reversed is not null then
    if already_reversed <> p_amount then
      raise exception 'refund % of booking % gave back %, not %', reference, p_booking_id, already_reversed, p_amount
        using errcode = 'P0001', hint = 'STATE_INVALID';
    end if;
    return jsonb_build_object('result', 'already_reversed', 'amount', -p_amount);
  end if;

  select array_agg(s.id order by s.id), array_agg(s.amount + coalesce(given_back.amount, 0) order by s.id)
    into settled_ids, remaining
  from public.revenue_share_entries s
  left join lateral (select sum(r.amount) as amount from public.revenue_share_entries r
                     where r.booking_id = s.booking_id and r.entry_type = 'reversal'
                       and r.line_ref = s.line_ref and r.beneficiary_key = s.beneficiary_key) as given_back on true
  where s.booking_id = p_booking_id and s.entry_type = 'settlement';
  if settled_ids is null then
    raise exception 'booking % has no ledger to reverse', p_booking_id using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > (select sum(w.amount) from unnest(remaining) as w(amount)) then
    raise exception 'booking % cannot give back % more', p_booking_id, p_amount
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  parts := internal.largest_remainder_split(p_amount, remaining);

  insert into public.revenue_share_entries (booking_id, payment_id, entry_type, line_ref, booking_addon_id, rule_id,
    rule_version, beneficiary, beneficiary_key, rw_id, vendor_id, base_amount, pct, amount)
  select s.booking_id, s.payment_id, 'reversal', s.line_ref, s.booking_addon_id, s.rule_id,
         s.rule_version || jsonb_build_object('reason', left(p_reason, 200), 'refund_reference', reference),
         s.beneficiary, s.beneficiary_key, s.rw_id, s.vendor_id, -p_amount, s.pct, -part.amount
  from unnest(settled_ids, parts) as part(settled_id, amount)
  join public.revenue_share_entries s on s.id = part.settled_id
  where part.amount > 0
  order by s.id;
  return jsonb_build_object('result', 'reversed', 'amount', -p_amount);
end;
$$;


-- ===== M6: a refund made at Midtrans =====

-- Replaces the 20261024100100 version. A refund Midtrans reports before record_refund keeps the payment settled and
-- alerts the superadmin (decision Q1 of 2026-10-24). A refund of the whole amount now also suspends the tickets of a
-- visit still ahead, so a refunded group cannot pass the gate before record_refund revokes them (M6); a partial refund
-- keeps them. The refund of a duplicate payment returns money the booking's own payment does not cover, so its
-- tickets stay. Everything else is unchanged.
create or replace function internal.apply_payment_status(p_booking public.bookings, p_payment public.payments,
  p_target public.payment_status, p_answer jsonb, p_actor_type text) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  is_open boolean := p_payment.status in ('initiated', 'pending');
  is_whole_refund boolean := p_target = 'refunded'
    or (coalesce(p_answer ->> 'refund_amount', '') ~ '^[0-9]{1,15}(\.0{1,2})?$'
        and split_part(p_answer ->> 'refund_amount', '.', 1)::bigint >= p_payment.gross_amount);
  ignored jsonb := jsonb_build_object('result', 'ignored', 'processing_result', 'ignored_transition',
                                      'payment_status', p_payment.status, 'booking_status', p_booking.status);
  applied jsonb := jsonb_build_object('result', 'applied', 'processing_result', p_target,
                                      'payment_status', p_target, 'booking_status', p_booking.status);
begin
  if p_target = 'settled' then
    if p_payment.status = 'settled' then
      return internal.complete_paid_booking(p_booking, p_payment, p_actor_type);
    end if;
    if p_payment.status in ('refunded', 'partially_refunded', 'disputed', 'duplicate') then
      return ignored;
    end if;
    return internal.settle_payment(p_booking, p_payment, p_answer, p_actor_type);
  elsif p_target in ('refunded', 'partially_refunded') then
    if is_whole_refund and p_payment.status in ('settled', 'partially_refunded') then
      perform internal.suspend_booking_tickets(p_booking.id, 'refund_seen');
    end if;
    return internal.note_refund_seen(p_payment, p_target);
  elsif p_target = 'disputed' then
    if p_payment.status in ('duplicate', 'refunded') then
      perform internal.flag_payment_review(p_booking, p_payment, 'CHARGEBACK', 'critical', p_actor_type);
      return jsonb_build_object('result', 'needs_review', 'processing_result', 'chargeback_on_' || p_payment.status,
                                'payment_status', p_payment.status, 'booking_status', p_booking.status);
    end if;
    if p_payment.status not in ('settled', 'partially_refunded') then
      return ignored;
    end if;
    update public.payments set status = 'disputed' where id = p_payment.id;
    perform internal.suspend_booking_tickets(p_booking.id, 'chargeback');
    perform internal.flag_payment_review(p_booking, p_payment, 'CHARGEBACK', 'critical', p_actor_type);
  elsif p_target = 'pending' then
    if not is_open then
      return ignored;
    end if;
    perform internal.store_payment_answer(p_payment.id, 'pending', p_answer);
  elsif p_target = 'needs_review' then
    if not is_open then
      return ignored;
    end if;
    perform internal.store_payment_answer(p_payment.id, 'needs_review', p_answer);
    perform internal.flag_payment_review(p_booking, p_payment, 'PAYMENT_CHALLENGE', 'high', p_actor_type);
  else
    -- denied, failed, cancelled, expired: the attempt closes and the booking stays pending_payment.
    if not (is_open or p_payment.status = 'needs_review') then
      return ignored;
    end if;
    perform internal.store_payment_answer(p_payment.id, p_target, p_answer);
    insert into public.booking_events (booking_id, from_status, to_status, actor_type, reason, payload)
    values (p_booking.id, p_booking.status, p_booking.status, p_actor_type, 'payment_' || p_target,
            jsonb_build_object('order_id', p_payment.order_id));
  end if;
  return applied;
end;
$$;


-- ===== M3, M4, M5: what the poll asks about =====

-- When the poll last asked Midtrans about an open attempt, so each run asks the ones it asked longest ago (M4).
alter table public.payments add column last_polled_at timestamptz;
create index payments_poll_order_idx on public.payments (last_polled_at nulls first, created_at)
  where status = 'pending';

-- Replaces the 20261018061037 version: like updated_at, payments.last_polled_at is the poll's own bookkeeping, so a
-- row whose only change is that stamp writes no audit row; otherwise each run would add up to 20 rows to the chain
-- every five minutes and say nothing anyone acts on. Everything else is unchanged.
create or replace function internal.log_audit() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  allowed text[] := internal.audit_columns(tg_table_name);
  before_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  after_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  subject jsonb := coalesce(after_row, before_row);
  names_only boolean := coalesce(current_setting('app.audit_mode', true), '') = 'names_only';
  changed text[];
  kept_before jsonb;
  kept_after jsonb;
begin
  if tg_op = 'UPDATE' then
    select array_agg(column_name order by column_name) into changed
    from jsonb_object_keys(after_row) as column_name
    where before_row -> column_name is distinct from after_row -> column_name
      and column_name not in ('updated_at', 'last_polled_at');
    if changed is null then
      return null;
    end if;
  end if;

  if not names_only then
    select jsonb_object_agg(column_name, before_row -> column_name) into kept_before
    from unnest(allowed) as column_name
    where before_row ? column_name and (changed is null or column_name = any (changed));
    select jsonb_object_agg(column_name, after_row -> column_name) into kept_after
    from unnest(allowed) as column_name
    where after_row ? column_name and (changed is null or column_name = any (changed));
  end if;

  -- Public contact numbers in site_settings are still phone numbers, and the data protection officer is a named
  -- person with a mailbox; their values stay out too.
  if tg_table_name = 'site_settings'
     and (subject ->> 'key' like 'contact.%' or subject ->> 'key' like 'privacy.dpo\_%') then
    kept_before := kept_before - 'value';
    kept_after := kept_after - 'value';
  end if;

  perform internal.write_audit_row(
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    coalesce(subject ->> 'id', subject ->> 'key'),
    coalesce((subject ->> 'rw_id')::smallint, (subject -> 'rw_ids' ->> 0)::smallint),
    kept_before,
    kept_after,
    jsonb_strip_nulls(jsonb_build_object('changed_columns', to_jsonb(changed), 'audit_mode', nullif(current_setting('app.audit_mode', true), '')))
  );
  return null;
end;
$$;

-- Replaces the 20261024100200 version, and is the server's alone now. The open attempts are pending ones from two
-- minutes old until a day past their hold's deadline, which follows a hold extended up to 14 days (M5), asked in the
-- order the poll last asked them, never asked first, and stamped as asked, so no attempt waits behind others for more
-- than a few runs (M4). An attempt under review waits for its superadmin. A paid booking that lacks a leg's ticket or
-- its ledger is listed too, under review when only its refused split keeps it there, so the poll retries the split
-- once a rule covers the settlement's day (M3).
create or replace function internal.payments_to_poll(p_limit integer) returns table (order_id text, reason text)
  language plpgsql security definer
  set search_path = ''
as $$
declare
  -- A payment made just before its hold's deadline can settle a little after it, and a late settlement still revives
  -- the booking or puts it under review, so an attempt is asked until a day past the deadline.
  asked_after_deadline constant interval := interval '24 hours';
  -- Younger than this, the visitor is still paying and the webhook usually comes first.
  still_paying constant interval := interval '2 minutes';
begin
  perform internal.require_server_caller('payments_to_poll');
  return query
  with asked as (
    update public.payments p set last_polled_at = now()
    where p.id in (
      select o.id from public.payments o join public.bookings b on b.id = o.booking_id
      where o.provider = 'midtrans' and o.status = 'pending' and o.created_at < now() - still_paying
        and now() < b.expires_at + asked_after_deadline
      order by o.last_polled_at nulls first, o.created_at
      limit p_limit
      for update of o skip locked)
    returning p.order_id)
  select asked.order_id, 'open'::text from asked
  union all
  (select p.order_id, 'paid_incomplete'::text from public.payments p
   join public.bookings b on b.id = p.booking_id
   where p.provider = 'midtrans' and p.status = 'settled' and b.status in ('paid', 'checked_in')
     and (not b.needs_review or b.review_reason = 'REVENUE_RULE_REFUSED')
     and coalesce(p.settlement_time, p.updated_at) < now() - still_paying
     and (exists (select 1 from public.booking_legs l
                  where l.booking_id = b.id and l.status in ('reserved', 'checked_in')
                    and not exists (select 1 from public.tickets_qr t where t.booking_leg_id = l.id))
          or not exists (select 1 from public.revenue_share_entries e
                         where e.booking_id = b.id and e.entry_type = 'settlement'))
   order by coalesce(p.settlement_time, p.updated_at)
   limit p_limit);
end;
$$;

-- Replaces the 20261024100100 version: a paid booking under review only for its refused split is completed too, and
-- the split is tried again without raising the review a second time (complete_paid_booking flags only a booking not
-- under review); the review itself stays for staff to close (M3). A run that writes nothing leaves no audit row, so a
-- split refused until a rule is fixed does not fill the audit log every five minutes.
create or replace function internal.complete_paid_order(p_order_id text, p_key_id text) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  previous_settings jsonb;
  owner_booking_id uuid;
  booking public.bookings;
  payment public.payments;
  outcome jsonb := '{"result": "ignored", "processing_result": "not_a_paid_order"}';
begin
  perform internal.require_server_caller('complete_paid_order');
  if p_key_id is null or p_key_id !~ '^[a-z0-9]+$' then
    raise exception 'a QR signing key id is lowercase letters and digits' using errcode = '22023';
  end if;
  perform internal.take_audit_turn();
  previous_settings := internal.push_settings(jsonb_build_object('app.in_rpc', '1', 'app.actor_role', 'cron',
                                                                 'app.qr_key_id', p_key_id));
  select p.booking_id into owner_booking_id from public.payments p where p.order_id = p_order_id;
  if owner_booking_id is not null then
    select * into booking from public.bookings b where b.id = owner_booking_id for update;
    select * into payment from public.payments p where p.order_id = p_order_id for update;
    if payment.status = 'settled'
       and (not booking.needs_review or booking.review_reason = 'REVENUE_RULE_REFUSED') then
      outcome := internal.complete_paid_booking(booking, payment, 'cron');
    end if;
  end if;
  if outcome ->> 'result' = 'applied' then
    perform internal.log_audit('payment.paid_booking_completed', 'payments', payment.id::text,
      jsonb_build_object('order_id', p_order_id, 'tickets_issued', outcome -> 'tickets_issued',
                         'ledger_written', outcome -> 'ledger_written'));
  end if;
  perform internal.restore_settings(previous_settings);
  return outcome;
end;
$$;


-- ===== The ledger out of the purge's reach =====

-- Replaces the 0004 version: the purge bypass, which retention uses on its logs, no longer reaches
-- revenue_share_entries, whose rows are money and are never pruned. Everything else is unchanged.
create or replace function internal.append_only() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  allowed text;
  column_name text;
  frozen_old jsonb;
  frozen_new jsonb;
begin
  if internal.in_purge() and tg_table_name <> 'revenue_share_entries' then
    return coalesce(new, old);
  end if;
  if tg_op = 'TRUNCATE' or tg_op = 'DELETE' then
    raise exception '% is append-only: rows are never deleted', tg_table_name using errcode = '42501';
  end if;

  frozen_old := to_jsonb(old);
  frozen_new := to_jsonb(new);
  -- tg_argv is NULL, not an empty array, when the trigger names no columns.
  foreach allowed in array coalesce(tg_argv, '{}') loop
    column_name := split_part(allowed, ':', 1);
    if frozen_old -> column_name is distinct from frozen_new -> column_name then
      if allowed like '%:once' and frozen_old -> column_name <> 'null'::jsonb then
        raise exception '%.% is set once and never changed', tg_table_name, column_name using errcode = '42501';
      end if;
      if allowed like '%:cleared' and frozen_new -> column_name <> 'null'::jsonb then
        raise exception '%.% may only be cleared', tg_table_name, column_name using errcode = '42501';
      end if;
    end if;
    frozen_old := frozen_old - column_name;
    frozen_new := frozen_new - column_name;
  end loop;

  if frozen_old is distinct from frozen_new then
    raise exception '% is append-only: only % may change', tg_table_name,
      coalesce(nullif(array_to_string(tg_argv, ', '), ''), 'nothing') using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Replaces the 0004 version. The ledger is never pruned, so its first row starts the chain: a first row that points
-- back to another means the oldest rows were deleted behind the triggers, which verify_chain alone accepts as the
-- anchor a pruned log leaves.
create or replace function internal.verify_ledger_chain() returns jsonb
  language sql stable
  set search_path = ''
as $$
  select case when first_row.prev_hash is not null
              then jsonb_build_object('ok', false, 'checked', 0, 'first_broken_id', first_row.id)
              else internal.verify_chain('revenue_share_entries') end
  from (select 1) as anchor
  left join lateral (select e.id, e.prev_hash from public.revenue_share_entries e order by e.id limit 1) as first_row
    on true;
$$;

revoke execute on function internal.revenue_beneficiary_key(public.revenue_beneficiary, smallint, uuid),
  internal.settlement_parts(uuid, bigint, smallint[], uuid),
  internal.reverse_revenue_share(uuid, bigint, text, text)
  from public, anon, authenticated;
