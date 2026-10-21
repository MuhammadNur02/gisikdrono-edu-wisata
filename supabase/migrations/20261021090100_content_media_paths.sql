-- Every public-media path a content row keeps lies in its owner's own folder (independent review of PR #18,
-- finding 2, decision of 2026-10-21; docs/Security.md §8.4). The CMS checks the same before it writes
-- (isPublishedImagePathFor in src/lib/uploads/paths.ts); these triggers hold it for a direct PostgREST call with a
-- staff token too, and for every other writer. A path is `<owner>/<folder>/...` built of safe segments only:
-- lowercase letters, digits, `-`, `_` and `.`, never `..`, no scheme, no empty segment. The owner is `rw-05`,
-- `rw-08` or `kelurahan` (rw_id NULL); the folders are those api/uploads/finalize writes: `gallery`, `hero`,
-- `articles/<id>`, `activity-points/<id>`, `packages/<id>`, `products/<id>` and `booklets/<id>`, where a booklet
-- keeps exactly `booklet.pdf` and `pages/`. Vendor logos and staff avatars have no upload purpose yet, so they stay
-- within their owner until they get one (Task P4.3.06). Triggers rather than CHECK constraints: a constraint would
-- call these helpers with the writer's own rights, and API roles hold nothing on `internal`.

create function internal.media_owner(p_rw_id smallint) returns text
  language sql immutable
  set search_path = ''
as $$
  select case when p_rw_id is null then 'kelurahan' else 'rw-' || lpad(p_rw_id::text, 2, '0') end;
$$;
revoke execute on function internal.media_owner(smallint) from public, anon, authenticated;

-- Whether a path is a file of the owner's folder, or anywhere under the owner when the folder is null.
create function internal.is_owned_media_path(p_path text, p_rw_id smallint, p_folder text) returns boolean
  language sql immutable
  set search_path = ''
as $$
  select p_path ~ '^(rw-[0-9]{2}|kelurahan)(/[a-z0-9][a-z0-9_.-]*)+$'
     and strpos(p_path, '..') = 0
     and starts_with(p_path, internal.media_owner(p_rw_id) || '/' || coalesce(p_folder || '/', ''));
$$;
revoke execute on function internal.is_owned_media_path(text, smallint, text) from public, anon, authenticated;

create function internal.require_owned_media_path(p_path text, p_rw_id smallint, p_folder text, p_column text)
  returns void
  language plpgsql immutable
  set search_path = ''
as $$
begin
  if p_path is not null and not internal.is_owned_media_path(p_path, p_rw_id, p_folder) then
    raise exception '% must be a file of %/%', p_column, internal.media_owner(p_rw_id), coalesce(p_folder, '')
      using errcode = '23514';
  end if;
end;
$$;
revoke execute on function internal.require_owned_media_path(text, smallint, text, text)
  from public, anon, authenticated;

-- ===== galleries: the RW's gallery folder; a video without a still of its own keeps its YouTube address =====
create function internal.galleries_media_paths() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if new.media_type = 'video' and new.storage_path = new.video_url then
    if new.video_url !~ '^https://(www\.)?youtube\.com/[^[:space:]\\]*$' then
      raise exception 'a video keeps its own YouTube address' using errcode = '23514';
    end if;
  else
    perform internal.require_owned_media_path(new.storage_path, new.rw_id, 'gallery', 'storage_path');
  end if;
  perform internal.require_owned_media_path(new.thumbnail_path, new.rw_id, 'gallery', 'thumbnail_path');
  return new;
end;
$$;
revoke execute on function internal.galleries_media_paths() from public, anon, authenticated;
create trigger galleries_media_paths
  before insert or update of rw_id, media_type, storage_path, thumbnail_path, video_url on public.galleries
  for each row execute function internal.galleries_media_paths();

-- ===== articles: the cover and every image of the body in the article's own folder =====
create function internal.articles_media_paths() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  folder text := 'articles/' || new.id;
  image_src text;
begin
  perform internal.require_owned_media_path(new.cover_path, new.rw_id, folder, 'cover_path');
  for image_src in
    select src #>> '{}' from jsonb_path_query(new.body_json, 'lax $.** ? (@.type == "image").attrs.src') as found(src)
    where jsonb_typeof(src) = 'string'
  loop
    perform internal.require_owned_media_path(image_src, new.rw_id, folder, 'body_json');
  end loop;
  return new;
end;
$$;
revoke execute on function internal.articles_media_paths() from public, anon, authenticated;
create trigger articles_media_paths
  before insert or update of id, rw_id, cover_path, body_json on public.articles
  for each row execute function internal.articles_media_paths();

-- ===== booklets: exactly its own PDF and pages =====
create function internal.booklets_media_paths() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  folder text := internal.media_owner(new.rw_id) || '/booklets/' || new.id;
begin
  if new.pdf_path is distinct from folder || '/booklet.pdf' then
    raise exception 'pdf_path must be %/booklet.pdf', folder using errcode = '23514';
  end if;
  if new.page_images_prefix is not null and new.page_images_prefix <> folder || '/pages' then
    raise exception 'page_images_prefix must be %/pages', folder using errcode = '23514';
  end if;
  perform internal.require_owned_media_path(new.cover_path, new.rw_id, 'booklets/' || new.id || '/pages',
                                            'cover_path');
  return new;
end;
$$;
revoke execute on function internal.booklets_media_paths() from public, anon, authenticated;
create trigger booklets_media_paths
  before insert or update of id, rw_id, pdf_path, page_images_prefix, cover_path on public.booklets
  for each row execute function internal.booklets_media_paths();

-- ===== hero banners, activity points, schedules, RW pages =====
create function internal.hero_banners_media_paths() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  perform internal.require_owned_media_path(new.image_path, null, 'hero', 'image_path');
  perform internal.require_owned_media_path(new.mobile_image_path, null, 'hero', 'mobile_image_path');
  return new;
end;
$$;
revoke execute on function internal.hero_banners_media_paths() from public, anon, authenticated;
create trigger hero_banners_media_paths
  before insert or update of image_path, mobile_image_path on public.hero_banners
  for each row execute function internal.hero_banners_media_paths();

create function internal.activity_points_media_paths() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  perform internal.require_owned_media_path(new.image_path, new.rw_id, 'activity-points/' || new.id, 'image_path');
  return new;
end;
$$;
revoke execute on function internal.activity_points_media_paths() from public, anon, authenticated;
create trigger activity_points_media_paths
  before insert or update of id, rw_id, image_path on public.activity_points
  for each row execute function internal.activity_points_media_paths();

-- A schedule and an RW page show a photo of their RW's gallery folder (they have no upload folder of their own).
create function internal.performance_schedules_media_paths() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  perform internal.require_owned_media_path(new.image_path, new.rw_id, 'gallery', 'image_path');
  return new;
end;
$$;
revoke execute on function internal.performance_schedules_media_paths() from public, anon, authenticated;
create trigger performance_schedules_media_paths
  before insert or update of rw_id, image_path on public.performance_schedules
  for each row execute function internal.performance_schedules_media_paths();

create function internal.rw_units_media_paths() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  perform internal.require_owned_media_path(new.hero_image_path, new.id, 'gallery', 'hero_image_path');
  return new;
end;
$$;
revoke execute on function internal.rw_units_media_paths() from public, anon, authenticated;
create trigger rw_units_media_paths
  before insert or update of id, hero_image_path on public.rw_units
  for each row execute function internal.rw_units_media_paths();

-- ===== catalogue and people: packages, products, vendor logos, staff avatars =====
create function internal.catalogue_media_paths() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  folder text := case tg_table_name when 'tour_packages' then 'packages/' else 'products/' end || new.id;
  image_path text;
begin
  foreach image_path in array new.image_paths loop
    perform internal.require_owned_media_path(image_path, new.rw_id, folder, 'image_paths');
  end loop;
  return new;
end;
$$;
revoke execute on function internal.catalogue_media_paths() from public, anon, authenticated;
create trigger tour_packages_media_paths
  before insert or update of id, rw_id, image_paths on public.tour_packages
  for each row execute function internal.catalogue_media_paths();
create trigger products_umkm_media_paths
  before insert or update of id, rw_id, image_paths on public.products_umkm
  for each row execute function internal.catalogue_media_paths();

create function internal.owner_media_paths() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if tg_table_name = 'umkm_vendors' then
    perform internal.require_owned_media_path(new.logo_path, new.rw_id, null, 'logo_path');
  else
    perform internal.require_owned_media_path(new.avatar_path, new.rw_id, null, 'avatar_path');
  end if;
  return new;
end;
$$;
revoke execute on function internal.owner_media_paths() from public, anon, authenticated;
create trigger umkm_vendors_media_paths
  before insert or update of rw_id, logo_path on public.umkm_vendors
  for each row execute function internal.owner_media_paths();
create trigger profiles_media_paths
  before insert or update of rw_id, avatar_path on public.profiles
  for each row execute function internal.owner_media_paths();

-- ===== Rows written before these rules: the migration stops on the first one that breaks them =====
do $$
begin
  perform internal.require_owned_media_path(storage_path, rw_id, 'gallery', 'galleries.storage_path')
    from public.galleries where not (media_type = 'video' and storage_path = video_url);
  perform internal.require_owned_media_path(thumbnail_path, rw_id, 'gallery', 'galleries.thumbnail_path')
    from public.galleries;
  perform internal.require_owned_media_path(cover_path, rw_id, 'articles/' || id, 'articles.cover_path')
    from public.articles;
  perform internal.require_owned_media_path(found.src #>> '{}', a.rw_id, 'articles/' || a.id, 'articles.body_json')
    from public.articles a,
         jsonb_path_query(a.body_json, 'lax $.** ? (@.type == "image").attrs.src') as found(src)
    where jsonb_typeof(found.src) = 'string';
  if exists (
    select 1 from public.booklets b
    where b.pdf_path <> internal.media_owner(b.rw_id) || '/booklets/' || b.id || '/booklet.pdf'
       or b.page_images_prefix <> internal.media_owner(b.rw_id) || '/booklets/' || b.id || '/pages'
       or not coalesce(internal.is_owned_media_path(b.cover_path, b.rw_id, 'booklets/' || b.id || '/pages'), true)
  ) then
    raise exception 'a booklet points at files outside its own folder' using errcode = '23514';
  end if;
  perform internal.require_owned_media_path(image_path, null, 'hero', 'hero_banners.image_path')
    from public.hero_banners;
  perform internal.require_owned_media_path(mobile_image_path, null, 'hero', 'hero_banners.mobile_image_path')
    from public.hero_banners;
  perform internal.require_owned_media_path(image_path, rw_id, 'activity-points/' || id, 'activity_points.image_path')
    from public.activity_points;
  perform internal.require_owned_media_path(image_path, rw_id, 'gallery', 'performance_schedules.image_path')
    from public.performance_schedules;
  perform internal.require_owned_media_path(hero_image_path, id, 'gallery', 'rw_units.hero_image_path')
    from public.rw_units;
  perform internal.require_owned_media_path(path, rw_id, 'packages/' || id, 'tour_packages.image_paths')
    from public.tour_packages, unnest(image_paths) as path;
  perform internal.require_owned_media_path(path, rw_id, 'products/' || id, 'products_umkm.image_paths')
    from public.products_umkm, unnest(image_paths) as path;
  perform internal.require_owned_media_path(logo_path, rw_id, null, 'umkm_vendors.logo_path') from public.umkm_vendors;
  perform internal.require_owned_media_path(avatar_path, rw_id, null, 'profiles.avatar_path') from public.profiles;
end;
$$;
