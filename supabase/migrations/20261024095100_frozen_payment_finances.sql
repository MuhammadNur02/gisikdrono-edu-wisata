-- The independent security review of PR #39, L7 (docs/Security.md §3.6, REC-03): what a payment records of the money
-- it moved stays as recorded once Midtrans has settled it, whatever happens to it next. 0004 froze those columns for a
-- settled payment only, so a refunded, partly refunded, disputed or duplicate one could still have its transaction
-- id, method, times or Virtual Account rewritten. Now only its status and refunded amount move, as for a settled
-- payment, outside an approved adjustment. Replaces the 0004 version; nothing else in it changes.
create or replace function internal.payments_immutable_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'payments are never deleted' using errcode = '42501';
  end if;
  if (new.gross_amount, new.order_id, new.provider, new.booking_id, new.attempt_no)
     is distinct from (old.gross_amount, old.order_id, old.provider, old.booking_id, old.attempt_no) then
    raise exception 'gross_amount, order_id, provider, booking_id and attempt_no never change'
      using errcode = '42501';
  end if;
  if old.status in ('settled', 'refunded', 'partially_refunded', 'disputed', 'duplicate')
     and not internal.in_adjustment()
     and (to_jsonb(new) - 'status' - 'refunded_amount' - 'updated_at')
         is distinct from (to_jsonb(old) - 'status' - 'refunded_amount' - 'updated_at') then
    raise exception 'a payment Midtrans settled only changes its status and refunded amount'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return new;
end;
$$;
