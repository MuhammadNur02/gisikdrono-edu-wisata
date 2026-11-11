-- The public-media files no content row shows any more (Task P2.9.11, decision of 2026-10-21 on the independent
-- review of PR #18; docs/Security.md R34 and §13.1 #25). The CMS removes a file a row stops showing in the same
-- action, but some are left: photos and booklets finalize published for a form that was closed without saving,
-- the attempts of a booklet whose pages broke off (R20), and anything a failed removal left behind. The hourly
-- api/jobs/purge-storage asks here for them and deletes them through the Storage API, since Supabase refuses a delete
-- from storage.objects.
--
-- A file counts only when finalize named it (src/lib/uploads/paths.ts, publicMediaPathFor): `<owner>/gallery/<uuid>.webp`
-- and `<owner>/hero/<uuid>.webp`, `<owner>/<articles|activity-points|packages|products>/<row id>/<uuid>.webp`, each with
-- its `-thumb` copy, and a booklet's `<owner>/booklets/<id>/booklet.pdf` and `pages/<nnnn>.webp`. Seeded photos and
-- any other name are never touched. A file is kept while any row points at it, by the path columns of
-- 20261021090100_content_media_paths.sql and 20261105170200_product_variants.sql and the image nodes of
-- articles.body_json; a thumbnail is kept with its photo; a booklet's folder is kept whole while its row exists.
-- A file younger than 24 hours is kept too, since its form may still be open.

create function internal.referenced_public_media() returns table (path text)
  language sql stable security definer
  set search_path = ''
as $$
  select g.storage_path from public.galleries g
  union all select g.thumbnail_path from public.galleries g
  union all select r.hero_image_path from public.rw_units r
  union all select s.image_path from public.performance_schedules s
  union all select h.image_path from public.hero_banners h
  union all select h.mobile_image_path from public.hero_banners h
  union all select p.image_path from public.activity_points p
  union all select a.cover_path from public.articles a
  union all
  select found.src #>> '{}'
  from public.articles a,
       jsonb_path_query(a.body_json, 'lax $.** ? (@.type == "image").attrs.src') as found(src)
  where jsonb_typeof(found.src) = 'string'
  union all select unnest(t.image_paths) from public.tour_packages t
  union all select unnest(u.image_paths) from public.products_umkm u
  union all select v.image_path from public.product_variants v
  union all select m.logo_path from public.umkm_vendors m
  union all select f.avatar_path from public.profiles f;
$$;

create function internal.orphan_public_media(p_limit integer) returns table (path text)
  language sql stable security definer
  set search_path = ''
as $$
  with referenced as (
    select distinct r.path from internal.referenced_public_media() r where r.path is not null
  )
  select o.name
  from storage.objects o
  where o.bucket_id = 'public-media'
    and o.created_at < now() - interval '24 hours'
    and o.name ~ ('^(rw-(0[1-9]|[1-9][0-9])|kelurahan)/('
                  || '(gallery|hero)/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}(-thumb)?\.webp'
                  || '|(articles|activity-points|packages|products)/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}'
                  || '/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}(-thumb)?\.webp'
                  || '|booklets/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/(booklet\.pdf|pages/[0-9]{4}\.webp)'
                  || ')$')
    and not exists (
      select 1 from referenced r
      where r.path in (o.name, regexp_replace(o.name, '-thumb\.webp$', '.webp'))
    )
    and not exists (
      select 1 from public.booklets b
      where starts_with(o.name, internal.media_owner(b.rw_id) || '/booklets/' || b.id || '/')
    )
  order by o.created_at
  limit greatest(p_limit, 0);
$$;

create function public.svc_orphan_public_media(p_limit integer) returns table (path text)
  language sql security definer
  set search_path = ''
as $$ select * from internal.orphan_public_media(p_limit); $$;

revoke execute on function internal.referenced_public_media(), internal.orphan_public_media(integer),
  public.svc_orphan_public_media(integer)
  from public, anon, authenticated;
grant execute on function public.svc_orphan_public_media(integer) to service_role;
