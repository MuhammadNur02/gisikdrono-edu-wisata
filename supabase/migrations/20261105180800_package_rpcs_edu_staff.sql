-- Review of PR #117, L2: save_package, save_package_legs and save_package_tiers are security invoker, so RLS (owns_rw)
-- already stops anyone outside the edu-wisata staff from writing a package, its legs or its tiers. Called with nothing
-- to write, though, the two helpers answered success to the Kopdes admin, and save_package refused only after
-- checking its input. Each now refuses at once (42501) anyone who is not the superadmin or an RW admin at AAL2
-- (docs/PRD.md §13.1 A30, docs/Security.md AZ-16); a session without an API role (postgres, the development seed)
-- is unaffected. The bodies are otherwise those in force (20261028080100, 20261028080200, 20261104121000).


-- ===== save_package_legs =====

create or replace function public.save_package_legs(p_package_id uuid, p_category public.package_category, p_leg_rw_ids smallint[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  free_places constant smallint := 1000;
  max_legs constant integer := 4;
begin
  -- 20261105180800: the edu-wisata staff alone (and the system, for the seed); the Kopdes admin edits no package.
  if coalesce(current_setting('role', true), 'none') <> 'none'
     and not ((select public.is_staff()) and (select public.aal2())) then
    raise exception 'only the superadmin or an RW admin at AAL2 saves a package' using errcode = '42501';
  end if;
  if p_category <> 'combo' then
    if p_leg_rw_ids is not null and cardinality(p_leg_rw_ids) > 0 then
      raise exception 'an RW package visits its own RW only' using errcode = '22023';
    end if;
    return;
  end if;
  if p_leg_rw_ids is null then
    return;
  end if;
  if cardinality(p_leg_rw_ids) = 0 or cardinality(p_leg_rw_ids) > max_legs
     or array_position(p_leg_rw_ids, null) is not null
     or cardinality(p_leg_rw_ids) <> (select count(distinct r) from unnest(p_leg_rw_ids) as r) then
    raise exception 'a combo visits each of its RWs once, in order, at most % of them', max_legs
      using errcode = '22023';
  end if;
  delete from public.tour_package_legs l where l.package_id = p_package_id and l.rw_id <> all (p_leg_rw_ids);
  update public.tour_package_legs l set leg_order = l.leg_order + free_places where l.package_id = p_package_id;
  insert into public.tour_package_legs as l (package_id, rw_id, leg_order)
  select p_package_id, leg.rw_id, leg.leg_order::smallint
  from unnest(p_leg_rw_ids) with ordinality as leg(rw_id, leg_order)
  on conflict (package_id, rw_id) do update set leg_order = excluded.leg_order;
end;
$function$;


-- ===== save_package_tiers =====

create or replace function public.save_package_tiers(p_package_id uuid, p_tiers jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  wanted jsonb := coalesce(p_tiers, '[]');
begin
  -- 20261105180800: the edu-wisata staff alone (and the system, for the seed); the Kopdes admin edits no package.
  if coalesce(current_setting('role', true), 'none') <> 'none'
     and not ((select public.is_staff()) and (select public.aal2())) then
    raise exception 'only the superadmin or an RW admin at AAL2 saves a package' using errcode = '42501';
  end if;
  if jsonb_typeof(wanted) <> 'array' or exists (
       select 1 from jsonb_array_elements(wanted) as t
       where jsonb_typeof(t) <> 'object'
          or exists (select 1 from jsonb_object_keys(t) as k
                     where k not in ('id', 'min_pax', 'max_pax', 'price_per_pax'))
          or not (t ? 'min_pax' and t ? 'price_per_pax')
          or (t ->> 'id' is not null and not exists (select 1 from public.tour_package_price_tiers x
                                                     where x.package_id = p_package_id
                                                       and x.id = (t ->> 'id')::uuid)))
     or exists (select 1 from jsonb_array_elements(wanted) as t where t ->> 'id' is not null
                group by t ->> 'id' having count(*) > 1) then
    raise exception 'a price tier is an id of this package''s, named once, min_pax, max_pax and price_per_pax'
      using errcode = '22023';
  end if;

  set constraints public.tour_package_price_tiers_package_id_int4range_excl deferred;
  delete from public.tour_package_price_tiers x
  where x.package_id = p_package_id
    and not exists (select 1 from jsonb_array_elements(wanted) as t where (t ->> 'id')::uuid = x.id);
  update public.tour_package_price_tiers x
  set min_pax = (t ->> 'min_pax')::integer, max_pax = (t ->> 'max_pax')::integer,
      price_per_pax = (t ->> 'price_per_pax')::bigint
  from jsonb_array_elements(wanted) as t
  where x.package_id = p_package_id and (t ->> 'id')::uuid = x.id
    and (x.min_pax, x.max_pax, x.price_per_pax)
        is distinct from ((t ->> 'min_pax')::integer, (t ->> 'max_pax')::integer, (t ->> 'price_per_pax')::bigint);
  insert into public.tour_package_price_tiers (package_id, min_pax, max_pax, price_per_pax)
  select p_package_id, (t ->> 'min_pax')::integer, (t ->> 'max_pax')::integer, (t ->> 'price_per_pax')::bigint
  from jsonb_array_elements(wanted) as t
  where t ->> 'id' is null;
end;
$function$;


-- ===== save_package =====

create or replace function public.save_package(p_package jsonb, p_package_id uuid DEFAULT NULL::uuid, p_leg_rw_ids smallint[] DEFAULT NULL::smallint[], p_tiers jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  shared_keys constant text[] := array['category', 'slug', 'name', 'tagline', 'description_md', 'highlights',
    'inclusions', 'itinerary', 'duration_minutes', 'pricing_basis', 'price_per_pax', 'flat_price', 'min_pax',
    'max_pax', 'image_paths', 'is_featured', 'status', 'sort_order', 'valid_from', 'valid_to'];
  expected_keys text[] := case when p_package_id is null then shared_keys || 'rw_id'::text else shared_keys end;
  fields public.tour_packages;
  saved_id uuid := p_package_id;
  editor uuid := auth.uid();
begin
  -- 20261105180800: the edu-wisata staff alone (and the system, for the seed); the Kopdes admin edits no package.
  if coalesce(current_setting('role', true), 'none') <> 'none'
     and not ((select public.is_staff()) and (select public.aal2())) then
    raise exception 'only the superadmin or an RW admin at AAL2 saves a package' using errcode = '42501';
  end if;
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
  if fields.category = 'combo' and fields.status = 'published'
     and (select count(distinct l.rw_id) from public.tour_package_legs l where l.package_id = saved_id) < 2 then
    raise exception 'a published combo package visits at least two different RWs'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return saved_id;
end;
$function$;
