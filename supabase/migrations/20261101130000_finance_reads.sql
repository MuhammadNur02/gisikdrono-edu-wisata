-- Task P4.7.01 (docs/PRD.md §8.7.1, §10.3; docs/Security.md REC-07, STAFF-02). No API role reads a payment's amounts,
-- an invoice's or a quotation's (0005), and v_finance_daily is granted to nobody, so the superadmin's finance pages read
-- money through these two security definer functions, at AAL2 only:
--
--   finance_overview   the payment totals per Jakarta day of a period from v_finance_daily, their sums, and the
--                      recap invariant of §10.3 over the bookings paid in the period
--   finance_booking    one booking's payments, invoices and ledger rows with their amounts, for the refund and
--                      adjustment dialogs
--
-- Neither hands out a contact detail: a booking is named by its code and institution only.


-- ===== finance_overview =====

-- The superadmin at AAL2, a period of at most 12 months.
create function internal.require_finance_reader(p_from date, p_to date) returns void
  language plpgsql stable
  set search_path = ''
as $$
begin
  if not (public.is_superadmin() and public.aal2()) then
    raise exception 'the finance figures are the superadmin''s, with a verified authenticator' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to >= p_from + interval '12 months' then
    raise exception 'figures cover a period of at most 12 months' using errcode = '22023';
  end if;
end;
$$;
revoke execute on function internal.require_finance_reader(date, date) from public, anon, authenticated, service_role;

-- §10.3: for the bookings paid in the period, what the ledger holds (settlement, reversal and adjustment rows) equals
-- what they were paid less what was refunded. A booking whose split was refused into a review has no ledger yet and
-- shows here until it is resolved.
create function internal.recap_invariant(p_from date, p_to date) returns jsonb
  language sql stable
  set search_path = ''
as $$
  with paid as (
    select b.id, b.total_amount,
           -- Only refunds of a payment the ledger settled from: a duplicate payment's refund gives back money the
           -- ledger never held (review of PR #68, M1). A booking without any settlement row (its split refused) counts
           -- the refunds of its own payment, so refunding it whole settles the invariant.
           coalesce((select sum(p.refunded_amount) from public.payments p
                     where p.booking_id = b.id
                       and (p.id in (select e.payment_id from public.revenue_share_entries e
                                     where e.booking_id = b.id and e.entry_type = 'settlement')
                            or (p.status <> 'duplicate'
                                and not exists (select 1 from public.revenue_share_entries e
                                                where e.booking_id = b.id and e.entry_type = 'settlement')))), 0)
             as refunded,
           coalesce((select sum(e.amount) from public.revenue_share_entries e where e.booking_id = b.id), 0) as ledger
    from public.bookings b
    where b.paid_at is not null
      and (b.paid_at at time zone 'Asia/Jakarta')::date between p_from and p_to
  )
  select jsonb_build_object(
    'bookings', count(*),
    'expected', coalesce(sum(total_amount - refunded), 0)::bigint,
    'ledger', coalesce(sum(ledger), 0)::bigint,
    'mismatched_bookings', count(*) filter (where ledger <> total_amount - refunded))
  from paid;
$$;
revoke execute on function internal.recap_invariant(date, date) from public, anon, authenticated, service_role;

-- {daily: [{day, gross_settled, refunds, net, payments_count, qris_count, va_count}], totals: {...}, invariant: {...}}.
create function public.finance_overview(p_from date, p_to date) returns jsonb
  language plpgsql stable security definer
  set search_path = ''
as $$
begin
  perform internal.require_finance_reader(p_from, p_to);
  return (
    select jsonb_build_object(
      'daily', coalesce(jsonb_agg(to_jsonb(d) order by d.day), '[]'),
      'totals', jsonb_build_object(
        'gross_settled', coalesce(sum(d.gross_settled), 0)::bigint,
        'refunds', coalesce(sum(d.refunds), 0)::bigint,
        'net', coalesce(sum(d.net), 0)::bigint,
        'payments_count', coalesce(sum(d.payments_count), 0)::bigint,
        'qris_count', coalesce(sum(d.qris_count), 0)::bigint,
        'va_count', coalesce(sum(d.va_count), 0)::bigint),
      'invariant', internal.recap_invariant(p_from, p_to))
    from public.v_finance_daily d
    where d.day between p_from and p_to);
end;
$$;


-- ===== finance_booking =====

-- {booking: {...}, payments: [...], invoices: [...], ledger: [...], adjustments: [...]} or NULL for an unknown id.
create function public.finance_booking(p_booking_id uuid) returns jsonb
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  booking record;
begin
  if not (public.is_superadmin() and public.aal2()) then
    raise exception 'the finance figures are the superadmin''s, with a verified authenticator' using errcode = '42501';
  end if;
  select b.id, b.booking_code, b.status, b.institution_name, b.total_amount, b.paid_at, b.visit_date, b.needs_review,
         b.review_reason
    into booking
  from public.bookings b where b.id = p_booking_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'booking', to_jsonb(booking),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', p.id, 'order_id', p.order_id, 'provider', p.provider, 'method', p.method, 'status', p.status,
                   'gross_amount', p.gross_amount, 'refunded_amount', p.refunded_amount,
                   'settlement_time', p.settlement_time) order by p.attempt_no), '[]')
                 from public.payments p where p.booking_id = p_booking_id),
    'invoices', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', i.id, 'invoice_number', i.invoice_number, 'status', i.status, 'amount_due', i.amount_due,
                   'amount_paid', i.amount_paid, 'credit_note_number', i.credit_note_number) order by i.created_at), '[]')
                 from public.invoices i where i.booking_id = p_booking_id),
    'ledger', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', e.id, 'entry_type', e.entry_type, 'line_ref', e.line_ref, 'beneficiary_key', e.beneficiary_key,
                 'amount', e.amount, 'created_at', e.created_at) order by e.id), '[]')
               from public.revenue_share_entries e where e.booking_id = p_booking_id),
    'adjustments', (select coalesce(jsonb_agg(jsonb_build_object(
                      'id', a.id, 'type', a.type, 'status', a.status, 'amount', a.amount, 'proposed_at', a.proposed_at)
                      order by a.proposed_at), '[]')
                    from public.payment_adjustments a where a.booking_id = p_booking_id));
end;
$$;

revoke execute on function public.finance_overview(date, date), public.finance_booking(uuid)
  from public, anon, service_role;
grant execute on function public.finance_overview(date, date), public.finance_booking(uuid) to authenticated;
