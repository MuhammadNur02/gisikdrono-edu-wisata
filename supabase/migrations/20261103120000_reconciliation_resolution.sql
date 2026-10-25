-- Task P4.7.04 (docs/Security.md REC-01, REC-09): /dashboard/finance/reconciliation closes an issue in one of two
-- ways, resolved (the cause was fixed) or ignored (checked and no action is needed), always with a note. The note and
-- the superadmin's own id were already the row's (reconciliation_issues_super_resolve, 0005); what kind of closing it
-- was is new, and a closed issue stays closed: a second look is a new issue from the next run, not an edited one.


-- A text column with its CHECK rather than an enum: the two values are this page's own, not part of the enum
-- registry of docs/PRD.md §8.3.
alter table public.reconciliation_issues add column resolution text
  constraint reconciliation_issues_resolution_known check (resolution in ('resolved', 'ignored'));

-- Issues closed before this column existed were resolved with a note. NOT VALID leaves older closings as they
-- were written; the trigger below keeps every closed row as it is, so the check holds for every closing from now on.
update public.reconciliation_issues set resolution = 'resolved' where resolved_at is not null;

alter table public.reconciliation_issues
  add constraint reconciliation_issues_closed_whole check (
    (resolved_at is null and resolution is null and resolved_by is null)
    or (resolved_at is not null and resolution is not null and resolved_by is not null
        and length(btrim(coalesce(resolution_note, ''))) >= 5)) not valid;

grant select (resolution) on public.reconciliation_issues to authenticated;
grant update (resolution) on public.reconciliation_issues to authenticated;


-- ===== A closed issue stays closed =====

create function internal.reconciliation_issue_closed_once() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if old.resolved_at is not null then
    raise exception 'a closed reconciliation issue stays closed' using errcode = '42501';
  end if;
  if (new.run_id, new.booking_id, new.payment_id, new.issue_type, new.severity, new.details, new.created_at)
     is distinct from
     (old.run_id, old.booking_id, old.payment_id, old.issue_type, old.severity, old.details, old.created_at) then
    raise exception 'what a run found never changes; only its closing is written' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function internal.reconciliation_issue_closed_once() from public, anon, authenticated, service_role;

create trigger reconciliation_issue_closed_once before update on public.reconciliation_issues
  for each row execute function internal.reconciliation_issue_closed_once();
