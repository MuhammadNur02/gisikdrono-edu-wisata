-- Review of PR #80, M-3 (owner decision: evidence links live 300 s; docs/Security.md §6.6, §10.3): the superadmin at
-- AAL2 opens the evidence of an adjustment (documents/bookings/<id>/adjustment-*) or the proof of a payout
-- (documents/payouts/*). This RPC names the file and writes the pii_revealed security event of the view, with
-- entity_type payment_adjustments or payout_batches, so the booking reveals' daily cap (entity_type bookings,
-- 20261104180000) is not spent by it; document-service.ts then signs a 300 s link to the private documents bucket
-- with the service role. There is no evidence_viewed event type, so the view is a pii_revealed event like the bank
-- account reveals of 20261104121000.

create function public.rpc_reveal_finance_evidence(p_kind text, p_id uuid) returns text
  language plpgsql security definer
  set search_path = ''
as $$
declare
  path text;
begin
  if not (public.is_superadmin() and public.aal2()) then
    raise exception 'finance evidence is opened by the superadmin at AAL2' using errcode = '42501';
  end if;
  if p_kind = 'adjustment' then
    select a.evidence_path into path from public.payment_adjustments a where a.id = p_id;
  elsif p_kind = 'payout' then
    select b.proof_path into path from public.payout_batches b where b.id = p_id;
  else
    raise exception 'evidence is that of an adjustment or a payout' using errcode = '22023';
  end if;
  if path is null or path !~ '^(bookings/[0-9a-f-]{36}/adjustment-|payouts/[0-9a-f-]{36}/)' then
    raise exception 'no evidence for % %', p_kind, p_id using errcode = 'P0002';
  end if;
  insert into public.security_events (event_type, severity, actor_id, actor_role, entity_type, entity_id, details)
  values ('pii_revealed', 'info', auth.uid(), 'superadmin',
          case p_kind when 'adjustment' then 'payment_adjustments' else 'payout_batches' end, p_id::text,
          jsonb_build_object('document', 'evidence'));
  return path;
end;
$$;
revoke execute on function public.rpc_reveal_finance_evidence(text, uuid) from public, anon, service_role;
grant execute on function public.rpc_reveal_finance_evidence(text, uuid) to authenticated;
