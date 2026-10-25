-- Task P4.3.11's catalogue follow-ups (docs/PRD.md FR-ADMIN-05, REC-13, REC-14), P4.9.03's grants and P2.5.04:
--
--   save_package        a package, a combo's legs in order, its price tiers and its status in one transaction. It runs
--                       as the caller (security invoker), so the grants, policies and triggers of 0004 and 0005 decide
--                       exactly as they do for the dashboard's own writes: a combo stays the superadmin's and off sale
--                       until it visits two RWs, an RW package keeps its single leg, the price floor and the price
--                       history hold. Legs are replaced (deleted, then inserted in order), which no grant of an upsert
--                       needs; tiers keep their ids and are written in an order that never trips the exclusion index.
--   vendors, products   written by the superadmin only, as the dashboard already does (review of PR #45, finding 4).
--   deletes             only what is archived, or a banner switched off (review of PR #40); the services filter the same.
--   rw_units            the superadmin chooses an RW's accent, icon and schedule switch (P4.9.03); rw_units_guard keeps
--                       them from an RW admin like the RW's code and status.
--   location_estimated  on activity_points and rw_units: a position given by estimate, set by the demo seed and
--                       cleared by the trigger when staff move it (P2.5.04).


-- ===== save_package =====

-- The keys a package is saved with: all of them, so nothing is left to a default by accident. rw_id only on a new
-- package (p_package_id null), since a package never changes its RW.
create function public.save_package(
  p_package jsonb, p_package_id uuid default null, p_leg_rw_ids smallint[] default null, p_tiers jsonb default '[]'
) returns uuid
  language plpgsql security invoker
  set search_path = ''
as $$
declare
  shared_keys constant text[] := array['category', 'slug', 'name', 'tagline', 'description_md', 'highlights',
    'inclusions', 'itinerary', 'duration_minutes', 'pricing_basis', 'price_per_pax', 'flat_price', 'min_pax',
    'max_pax', 'image_paths', 'is_featured', 'status', 'sort_order', 'valid_from', 'valid_to'];
  expected_keys text[] := case when p_package_id is null then shared_keys || 'rw_id'::text else shared_keys end;
  fields public.tour_packages;
  saved_id uuid := p_package_id;
  editor uuid := auth.uid();
begin
  if jsonb_typeof(p_package) is distinct from 'object'
     or (select array_agg(k order by k) from jsonb_object_keys(p_package) as k)
        is distinct from (select array_agg(k order by k) from unnest(expected_keys) as k) then
    raise exception 'a package is saved with all of its fields and nothing else' using errcode = '22023';
  end if;
  fields := jsonb_populate_record(null::public.tour_packages, p_package);

  if saved_id is null then
    insert into public.tour_packages (rw_id, category, slug, name, tagline, description_md, highlights, inclusions,
      itinerary, duration_minutes, pricing_basis, price_per_pax, flat_price, min_pax, max_pax, image_paths,
      is_featured, status, sort_order, valid_from, valid_to, created_by, updated_by)
    values (fields.rw_id, fields.category, fields.slug, fields.name, fields.tagline, fields.description_md,
      fields.highlights, fields.inclusions, fields.itinerary, fields.duration_minutes, fields.pricing_basis,
      fields.price_per_pax, fields.flat_price, fields.min_pax, fields.max_pax, fields.image_paths, fields.is_featured,
      'draft', fields.sort_order, fields.valid_from, fields.valid_to, editor, editor)
    returning id into saved_id;
  else
    update public.tour_packages
    set category = fields.category, slug = fields.slug, name = fields.name, tagline = fields.tagline,
        description_md = fields.description_md, highlights = fields.highlights, inclusions = fields.inclusions,
        itinerary = fields.itinerary, duration_minutes = fields.duration_minutes, pricing_basis = fields.pricing_basis,
        price_per_pax = fields.price_per_pax, flat_price = fields.flat_price, min_pax = fields.min_pax,
        max_pax = fields.max_pax, image_paths = fields.image_paths, is_featured = fields.is_featured,
        sort_order = fields.sort_order, valid_from = fields.valid_from, valid_to = fields.valid_to,
        updated_by = editor
    where id = saved_id;
    if not found then
      raise exception 'package % does not exist or is not yours', saved_id using errcode = 'P0002';
    end if;
  end if;

  perform public.save_package_legs(saved_id, fields.category, p_leg_rw_ids);
  perform public.save_package_tiers(saved_id, p_tiers);
  -- Last, so a combo is published only once its legs are written (tour_packages_legs_guard).
  update public.tour_packages set status = fields.status, updated_by = editor
  where id = saved_id and status is distinct from fields.status;
  return saved_id;
end;
$$;

-- A combo's legs, in the order given, two different RWs or more before it is published; null keeps the legs it has.
-- An RW package keeps the leg its trigger wrote. Invoker, like save_package, whose part it is.
create function public.save_package_legs(p_package_id uuid, p_category public.package_category, p_leg_rw_ids smallint[])
  returns void
  language plpgsql security invoker
  set search_path = ''
as $$
begin
  if p_category <> 'combo' then
    if p_leg_rw_ids is not null and cardinality(p_leg_rw_ids) > 0 then
      raise exception 'an RW package visits its own RW only' using errcode = '22023';
    end if;
    return;
  end if;
  if p_leg_rw_ids is null then
    return;
  end if;
  if cardinality(p_leg_rw_ids) = 0 or array_position(p_leg_rw_ids, null) is not null
     or cardinality(p_leg_rw_ids) <> (select count(distinct r) from unnest(p_leg_rw_ids) as r) then
    raise exception 'a combo visits each of its RWs once, in order' using errcode = '22023';
  end if;
  delete from public.tour_package_legs l where l.package_id = p_package_id;
  insert into public.tour_package_legs (package_id, rw_id, leg_order)
  select p_package_id, leg.rw_id, leg.leg_order::smallint
  from unnest(p_leg_rw_ids) with ordinality as leg(rw_id, leg_order);
end;
$$;

-- The tiers as the form sends them: a tier with the id of one of the package's tiers keeps it, so a price or range
-- change is one history entry; one without an id is new; one the package does not have is refused. Deletes go first,
-- then the kept tiers that only narrow (they free sizes), one by one, then those that take sizes, then the new ones, so
-- a valid final set never trips the exclusion index on the way there (the order src/lib/utils/package-tiers.ts kept
-- before this function existed).
create function public.save_package_tiers(p_package_id uuid, p_tiers jsonb) returns void
  language plpgsql security invoker
  set search_path = ''
as $$
declare
  wanted jsonb := coalesce(p_tiers, '[]');
  tier record;
begin
  if jsonb_typeof(wanted) <> 'array' or exists (
       select 1 from jsonb_array_elements(wanted) as t
       where jsonb_typeof(t) <> 'object'
          or exists (select 1 from jsonb_object_keys(t) as k
                     where k not in ('id', 'min_pax', 'max_pax', 'price_per_pax'))
          or not (t ? 'min_pax' and t ? 'price_per_pax')
          or (t ->> 'id' is not null and not exists (select 1 from public.tour_package_price_tiers x
                                                     where x.package_id = p_package_id
                                                       and x.id = (t ->> 'id')::uuid))) then
    raise exception 'a price tier is an id of this package''s, min_pax, max_pax and price_per_pax' using errcode = '22023';
  end if;

  delete from public.tour_package_price_tiers x
  where x.package_id = p_package_id
    and not exists (select 1 from jsonb_array_elements(wanted) as t where (t ->> 'id')::uuid = x.id);
  for tier in
    select x.id, (t ->> 'min_pax')::integer as min_pax, (t ->> 'max_pax')::integer as max_pax,
           (t ->> 'price_per_pax')::bigint as price_per_pax,
           (t ->> 'min_pax')::integer >= x.min_pax
             and coalesce((t ->> 'max_pax')::integer, 2147483647) <= coalesce(x.max_pax, 2147483647) as narrows
    from public.tour_package_price_tiers x
    join jsonb_array_elements(wanted) as t on (t ->> 'id')::uuid = x.id
    where x.package_id = p_package_id
    order by 5 desc, x.min_pax
  loop
    update public.tour_package_price_tiers
    set min_pax = tier.min_pax, max_pax = tier.max_pax, price_per_pax = tier.price_per_pax
    where id = tier.id
      and (min_pax, max_pax, price_per_pax) is distinct from (tier.min_pax, tier.max_pax, tier.price_per_pax);
  end loop;
  insert into public.tour_package_price_tiers (package_id, min_pax, max_pax, price_per_pax)
  select p_package_id, (t ->> 'min_pax')::integer, (t ->> 'max_pax')::integer, (t ->> 'price_per_pax')::bigint
  from jsonb_array_elements(wanted) as t
  where t ->> 'id' is null;
end;
$$;

revoke execute on function public.save_package(jsonb, uuid, smallint[], jsonb),
  public.save_package_legs(uuid, public.package_category, smallint[]), public.save_package_tiers(uuid, jsonb)
  from public, anon, service_role;
grant execute on function public.save_package(jsonb, uuid, smallint[], jsonb),
  public.save_package_legs(uuid, public.package_category, smallint[]), public.save_package_tiers(uuid, jsonb)
  to authenticated;


-- ===== Vendors and products: the superadmin's =====

drop policy umkm_vendors_staff_insert on public.umkm_vendors;
drop policy umkm_vendors_staff_update on public.umkm_vendors;
create policy umkm_vendors_super_insert on public.umkm_vendors for insert to authenticated
  with check ((select public.is_superadmin()) and created_by = (select auth.uid()));
create policy umkm_vendors_super_update on public.umkm_vendors for update to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));

drop policy products_umkm_staff_insert on public.products_umkm;
drop policy products_umkm_staff_update on public.products_umkm;
create policy products_umkm_super_insert on public.products_umkm for insert to authenticated
  with check ((select public.is_superadmin()) and created_by = (select auth.uid()));
create policy products_umkm_super_update on public.products_umkm for update to authenticated
  using ((select public.is_superadmin())) with check ((select public.is_superadmin()));


-- ===== Deletes: archived first =====

drop policy galleries_staff_delete on public.galleries;
create policy galleries_staff_delete on public.galleries for delete to authenticated
  using ((select public.owns_rw(rw_id)) and status = 'archived');
drop policy articles_super_delete on public.articles;
create policy articles_super_delete on public.articles for delete to authenticated
  using ((select public.is_superadmin()) and status = 'archived');
drop policy booklets_super_delete on public.booklets;
create policy booklets_super_delete on public.booklets for delete to authenticated
  using ((select public.is_superadmin()) and status = 'archived');
drop policy performance_schedules_staff_delete on public.performance_schedules;
create policy performance_schedules_staff_delete on public.performance_schedules for delete to authenticated
  using ((select public.owns_rw(rw_id)) and status = 'archived');
drop policy hero_banners_super_delete on public.hero_banners;
create policy hero_banners_super_delete on public.hero_banners for delete to authenticated
  using ((select public.is_superadmin()) and not is_active);

-- activity_points_staff covered every command; the delete side now asks for an archived point.
drop policy activity_points_staff on public.activity_points;
create policy activity_points_staff_read on public.activity_points for select to authenticated
  using ((select public.owns_rw(rw_id)));
create policy activity_points_staff_insert on public.activity_points for insert to authenticated
  with check ((select public.owns_rw(rw_id)));
create policy activity_points_staff_update on public.activity_points for update to authenticated
  using ((select public.owns_rw(rw_id))) with check ((select public.owns_rw(rw_id)));
create policy activity_points_staff_delete on public.activity_points for delete to authenticated
  using ((select public.owns_rw(rw_id)) and status = 'archived');


-- ===== rw_units: the superadmin's look of an RW =====

grant update (accent_key, icon_key, schedule_enabled) on public.rw_units to authenticated;

-- Replaces the 0004 version: accent, icon and the schedule switch join what only the superadmin changes.
create or replace function internal.rw_units_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if (new.code, new.slug, new.is_active, new.treasury_bank_name, new.treasury_account_number, new.treasury_account_holder,
      new.accent_key, new.icon_key, new.schedule_enabled)
     is distinct from
     (old.code, old.slug, old.is_active, old.treasury_bank_name, old.treasury_account_number, old.treasury_account_holder,
      old.accent_key, old.icon_key, old.schedule_enabled)
     and not internal.is_superadmin_or_system() then
    raise exception 'only the superadmin changes an RW''s code, slug, status, look, schedule or treasury account'
      using errcode = '42501';
  end if;
  return new;
end;
$$;


-- ===== location_estimated =====

alter table public.activity_points add column location_estimated boolean not null default false;
alter table public.rw_units add column location_estimated boolean not null default false;
grant select (location_estimated) on public.activity_points to anon, authenticated;
grant select (location_estimated) on public.rw_units to anon, authenticated;

-- A position someone moves is no longer an estimate, unless the same write says it still is (the seed).
create function internal.clear_location_estimate() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  moved boolean := case tg_table_name
    when 'activity_points' then (to_jsonb(new) ->> 'lat', to_jsonb(new) ->> 'lng')
                                is distinct from (to_jsonb(old) ->> 'lat', to_jsonb(old) ->> 'lng')
    else (to_jsonb(new) ->> 'map_lat', to_jsonb(new) ->> 'map_lng')
         is distinct from (to_jsonb(old) ->> 'map_lat', to_jsonb(old) ->> 'map_lng')
  end;
begin
  if moved and new.location_estimated is not distinct from old.location_estimated then
    new.location_estimated := false;
  end if;
  return new;
end;
$$;
revoke execute on function internal.clear_location_estimate() from public, anon, authenticated, service_role;
create trigger clear_location_estimate before update on public.activity_points
  for each row execute function internal.clear_location_estimate();
create trigger clear_location_estimate before update on public.rw_units
  for each row execute function internal.clear_location_estimate();
