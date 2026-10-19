-- booklet_page_claims: one api/uploads/sign-pages per booklet at a time (docs/Security.md §8.4; security review of
-- PR #14, L11 and N4). The claim was an object placed in Storage, whose stale-lock replacement (remove, then place
-- again) let two requests both pass. Here a single INSERT ... ON CONFLICT DO UPDATE decides: the unique index lets
-- one row exist per booklet and owner, and the update takes an existing row only when its claim is older than the
-- signed URLs' lifetime. Two requests at once serialise on that row, and the second sees the first's fresh claim.
-- Only the service role reaches it, through svc_claim_booklet_pages; no API role holds any right on the table.

-- rw_id NULL is a kelurahan booklet. The booklet row itself is written by the booklet form after the upload, so the
-- claim names the id the upload pipeline was given, not a foreign key.
create table public.booklet_page_claims (
  id          uuid primary key default gen_random_uuid(),
  booklet_id  uuid not null,
  rw_id       smallint references public.rw_units(id),
  claimed_by  uuid not null references public.profiles(id),
  claimed_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index booklet_page_claims_booklet_owner
  on public.booklet_page_claims (booklet_id, (coalesce(rw_id, 0)));
alter table public.booklet_page_claims enable row level security;
alter table public.booklet_page_claims force row level security;
revoke all on public.booklet_page_claims from anon, authenticated;
create trigger set_updated_at before update on public.booklet_page_claims
  for each row execute function public.set_updated_at();

-- True when the caller now holds the claim: no claim existed for this booklet and owner, or the one there is older
-- than p_hold_seconds, the lifetime of the signed upload URLs it guarded.
create function internal.claim_booklet_pages(
  p_booklet_id uuid, p_actor_id uuid, p_hold_seconds integer, p_rw_id smallint default null
) returns boolean
  language plpgsql security definer
  set search_path = ''
as $$
declare
  claimed boolean;
begin
  if p_booklet_id is null or p_actor_id is null or p_hold_seconds is null or p_hold_seconds < 1 then
    raise exception 'a booklet page claim needs a booklet, an actor and a positive hold' using errcode = '22023';
  end if;

  insert into public.booklet_page_claims as claim (booklet_id, rw_id, claimed_by, claimed_at)
  values (p_booklet_id, p_rw_id, p_actor_id, now())
  on conflict (booklet_id, (coalesce(rw_id, 0))) do update
    set claimed_by = excluded.claimed_by, claimed_at = excluded.claimed_at
    where claim.claimed_at < now() - make_interval(secs => p_hold_seconds)
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

revoke execute on function internal.claim_booklet_pages(uuid, uuid, integer, smallint)
  from public, anon, authenticated;

-- PostgREST exposes public only (decision of 2026-10-16).
create function public.svc_claim_booklet_pages(
  p_booklet_id uuid, p_actor_id uuid, p_hold_seconds integer, p_rw_id smallint default null
) returns boolean
  language sql security definer
  set search_path = ''
as $$ select internal.claim_booklet_pages(p_booklet_id, p_actor_id, p_hold_seconds, p_rw_id); $$;

revoke execute on function public.svc_claim_booklet_pages(uuid, uuid, integer, smallint)
  from public, anon, authenticated;
grant execute on function public.svc_claim_booklet_pages(uuid, uuid, integer, smallint) to service_role;
