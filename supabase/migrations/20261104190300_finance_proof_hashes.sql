-- Review of PR #80, M-4 (Task P4.7.04; docs/Security.md REC-09): one file backs one refund, adjustment or payout, by
-- its content and not only by its path. finance-documents.ts hashes every finance proof as it arrives (SHA-256 of the
-- bytes the superadmin uploaded, before any re-encoding) and stores the digest here with the documents path it chose,
-- through the service role. A proof whose digest already backs another refund, adjustment or payout is refused with
-- the existing PROOF_REUSED hint. The digest is the server's word bound to a path only the server writes (the
-- documents bucket has no API policy), so a caller of the RPCs cannot name another digest for a file.
--
-- A path with no digest (a proof stored before this migration) is judged by its path alone, as before.


create table public.finance_proofs (
  path      text primary key check (path ~ '^(bookings|payouts)/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$'),
  sha256    text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  stored_at timestamptz not null default now()
);
create index finance_proofs_sha256_idx on public.finance_proofs (sha256);
alter table public.finance_proofs enable row level security;
alter table public.finance_proofs force row level security;
-- No API role reads or writes it: finance-documents.ts writes it with the service role, the RPCs read it as owner.
revoke all on public.finance_proofs from anon, authenticated;
-- A finance table, so AAL2 is asked of every command as of the others (docs/Security.md AZ-08), ready for a grant.
create policy finance_proofs_aal2 on public.finance_proofs as restrictive for all to authenticated
  using ((select public.aal2()));


-- ===== What a proof backs =====

-- Whether the file at p_path backs a recorded refund, an adjustment that was not rejected (other than p_own_adjustment,
-- the one being applied), or a payout.
create function internal.proof_backs_something(p_path text, p_own_adjustment uuid) returns boolean
  language sql stable
  set search_path = ''
as $$
  select exists (select 1 from public.booking_events e
                 where e.reason = 'refund_recorded' and e.payload ->> 'proof_path' = p_path)
      or exists (select 1 from public.payment_adjustments a
                 where a.evidence_path = p_path and a.status <> 'rejected' and a.id is distinct from p_own_adjustment)
      or exists (select 1 from public.payout_batches b where b.proof_path = p_path);
$$;

-- PROOF_REUSED when another stored file with the same content already backs something. Proofs of one content take
-- turns, so two proposals naming copies of one file cannot both pass.
create function internal.require_unseen_proof(p_path text, p_own_adjustment uuid) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  digest text;
begin
  select f.sha256 into digest from public.finance_proofs f where f.path = p_path;
  if digest is null then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('finance_proof:' || digest));
  if exists (select 1 from public.finance_proofs f
             where f.sha256 = digest and f.path <> p_path
               and internal.proof_backs_something(f.path, p_own_adjustment)) then
    raise exception 'the content of % already backs another refund, adjustment or payout', p_path
      using errcode = 'P0001', hint = 'PROOF_REUSED';
  end if;
end;
$$;

-- Replaces the 20261101130200 version: the path check of a booking's proofs, and now their content too.
create or replace function internal.require_unused_proof(p_booking_id uuid, p_path text, p_own_adjustment uuid) returns void
  language plpgsql
  set search_path = ''
as $$
begin
  -- Every proof sits under its booking's folder, so the booking bounds the search (L2 d); a rejected adjustment backs
  -- nothing, so its evidence may back the next proposal (L2 b).
  if exists (select 1 from public.booking_events e
             where e.booking_id = p_booking_id and e.reason = 'refund_recorded' and e.payload ->> 'proof_path' = p_path)
     or exists (select 1 from public.payment_adjustments a
                where a.booking_id = p_booking_id and a.evidence_path = p_path and a.status <> 'rejected'
                  and a.id is distinct from p_own_adjustment) then
    raise exception 'the file % already backs another refund or adjustment', p_path
      using errcode = 'P0001', hint = 'PROOF_REUSED';
  end if;
  perform internal.require_unseen_proof(p_path, p_own_adjustment);
end;
$$;

revoke execute on function internal.proof_backs_something(text, uuid), internal.require_unseen_proof(text, uuid),
  internal.require_unused_proof(uuid, text, uuid)
  from public, anon, authenticated, service_role;
