-- A published article belongs to the superadmin's review (independent review of PR #18, finding 1, decision of
-- 2026-10-21; docs/PRD.md FR-ADMIN-11). 0004 let an RW admin take a live article off the site, archive it, send it
-- back to review without any change, or move it to another address, because the guard looked only at the moment
-- an article became published. Now, for a published article, an RW admin may only change its content, which takes
-- it back to review whatever status the request asked for; any other status change, or any change of its slug, is
-- refused. The superadmin (and the system) keeps every choice.

create or replace function internal.articles_moderation_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  is_moderator boolean := internal.is_superadmin_or_system();
  becomes_published boolean := new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published');
  is_live_change boolean := tg_op = 'UPDATE' and old.status = 'published' and not is_moderator;
begin
  if becomes_published and not is_moderator then
    raise exception 'only the superadmin publishes an article' using errcode = '42501';
  end if;

  if becomes_published then
    new.published_at := coalesce(new.published_at, now());
    new.reviewed_by := coalesce(auth.uid(), new.reviewed_by);
  end if;

  if not is_live_change then
    return new;
  end if;
  if new.slug is distinct from old.slug then
    raise exception 'only the superadmin moves a published article to another address' using errcode = '42501';
  end if;
  if (new.title, new.excerpt, new.body_json, new.cover_path, new.category, new.tags, new.seo_title, new.seo_description)
     is distinct from
     (old.title, old.excerpt, old.body_json, old.cover_path, old.category, old.tags, old.seo_title, old.seo_description) then
    new.status := 'pending_review';
  elsif new.status is distinct from old.status then
    raise exception 'only the superadmin takes a published article off the site' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function internal.articles_moderation_guard() from public, anon, authenticated;
