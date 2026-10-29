-- Deferred Low of the review of PR #103 (Task P4.7.03; docs/Security.md "Refunds"): /dashboard/finance/adjustments
-- marked an applied manual refund as blocked while its latest refund_key_mismatch alert carried no release note, even
-- after the database stopped blocking it (Midtrans later listed exactly the adjustment's amount under its key), so the
-- badge could stay for ever. The page now asks the database which of its rows record_refund would refuse for them:
-- refund_key_blocked_adjustments, the same test refund_key_mismatch makes, for the superadmin at AAL2 who reads the
-- adjustments page (payment_adjustments_super_read).
--
-- refund_key_mismatch is made again from 20261104190200 on the shared per-adjustment test below; what it returns is
-- unchanged.

-- L6, L-1, L-a: whether p_answer lists another figure under the adjustment's key, released (p_released) or still
-- blocking: listed, not the adjustment's amount, and the figure a release accepted or not.
create function internal.key_listing_differs(p_adjustment public.payment_adjustments, p_answer jsonb,
  p_released boolean) returns boolean
  language sql stable
  set search_path = ''
as $$
  select k.listed is not null and k.listed <> p_adjustment.amount
         and coalesce(internal.released_key_sum(p_adjustment.id) = k.listed, false) = p_released
  from (select internal.key_refund_sum(p_answer, p_adjustment.id::text) as listed) as k;
$$;
revoke execute on function internal.key_listing_differs(public.payment_adjustments, jsonb, boolean)
  from public, anon, authenticated, service_role;

-- The first applied manual_refund of the payment whose key the latest answer lists with another amount, released or
-- still blocking as p_released asks (20261104190200).
create or replace function internal.refund_key_mismatch(p_payment public.payments, p_answer jsonb,
  p_released boolean default false) returns uuid
  language sql stable
  set search_path = ''
as $$
  select a.id from public.payment_adjustments a
  where a.payment_id = p_payment.id and a.type = 'manual_refund' and a.status = 'applied'
    and internal.key_listing_differs(a, internal.latest_refund_answer(p_payment, p_answer), p_released)
  order by a.applied_at, a.id
  limit 1;
$$;

-- The adjustments among p_adjustment_ids (at most 200) whose key Midtrans' latest answer still lists with another
-- amount than they booked and no release accepted: the ones record_refund refuses with REFUND_KEY_MISMATCH.
create function public.refund_key_blocked_adjustments(p_adjustment_ids uuid[]) returns uuid[]
  language plpgsql stable security definer
  set search_path = ''
as $$
declare
  max_ids constant integer := 200;
begin
  if not (public.is_superadmin() and public.aal2()) then
    raise exception 'refund blocks are read by the superadmin at AAL2' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_adjustment_ids), 0) > max_ids then
    raise exception 'at most % adjustments at a time', max_ids using errcode = '22023';
  end if;
  return coalesce((
    select array_agg(a.id order by a.id)
    from public.payment_adjustments a
    join public.payments p on p.id = a.payment_id
    where a.id = any (p_adjustment_ids) and a.type = 'manual_refund' and a.status = 'applied'
      and internal.key_listing_differs(a, internal.latest_refund_answer(p, null), false)), '{}');
end;
$$;
revoke execute on function public.refund_key_blocked_adjustments(uuid[]) from public, anon, service_role;
grant execute on function public.refund_key_blocked_adjustments(uuid[]) to authenticated;
