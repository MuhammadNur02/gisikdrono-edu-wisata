-- Independent review of PR #57 (docs/PRD.md FR-ADMIN-05, REC-13, REC-14; docs/Security.md §11.4):
--   M1  a published combo could be cut to one RW and stay on sale: tour_packages_guard counts the legs only when a
--       combo becomes published, and save_package wrote no status that did not change. A published combo now keeps
--       two RWs or more whatever writes its legs: save_package refuses before it returns, and the deferred constraint
--       trigger combo_legs_on_sale checks every published combo a leg write touched, at commit.
--   M2  a tier's range could change without a trace, since its history recorded the price only. A tier's history
--       entry and price_changed event now carry its range (min_pax, max_pax) next to its price.
--   L1  the tiers' exclusion index is deferrable, and save_package_tiers defers it, so no order of writes can trip it
--       half-way; it still holds at commit.
--   L2  replaced legs keep their duration and notes: a combo's legs are matched by RW and only reordered, added or
--       removed.
--   L3  a tier id named twice is refused.
--   L5  an export refused as EXPORT_TOO_LARGE leaves a security event.


-- ===== M1: a published combo visits two RWs =====

create function internal.combo_legs_on_sale() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  target_package uuid := coalesce(new.package_id, old.package_id);
begin
  if exists (select 1 from public.tour_packages p
             where p.id = target_package and p.category = 'combo' and p.status = 'published')
     and (select count(distinct l.rw_id) from public.tour_package_legs l
          where l.package_id = target_package) < 2 then
    raise exception 'a published combo package visits at least two different RWs'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return null;
end;
$$;
revoke execute on function internal.combo_legs_on_sale() from public, anon, authenticated, service_role;
create constraint trigger combo_legs_on_sale after insert or update or delete on public.tour_package_legs
  deferrable initially deferred
  for each row execute function internal.combo_legs_on_sale();


-- ===== M2: a tier's range is part of its price =====

-- Replaces the 0004 version: a tier's range is recorded next to its price.
create or replace function internal.tour_package_tiers_price_history() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (new.price_per_pax, new.min_pax, new.max_pax) is not distinct from (old.price_per_pax, old.min_pax, old.max_pax)
  then
    return null;
  end if;
  perform internal.record_price_change(coalesce(new.package_id, old.package_id),
                                       case when tg_op <> 'DELETE' then new.id end,
                                       jsonb_build_object('price_per_pax', old.price_per_pax, 'min_pax', old.min_pax,
                                                          'max_pax', old.max_pax),
                                       jsonb_build_object('price_per_pax', new.price_per_pax, 'min_pax', new.min_pax,
                                                          'max_pax', new.max_pax));
  return null;
end;
$$;
drop trigger tour_packages_price_history on public.tour_package_price_tiers;
create trigger tour_packages_price_history after insert or update of price_per_pax, min_pax, max_pax or delete
  on public.tour_package_price_tiers
  for each row execute function internal.tour_package_tiers_price_history();


-- ===== L1: the exclusion index, deferrable =====

alter table public.tour_package_price_tiers drop constraint tour_package_price_tiers_package_id_int4range_excl;
alter table public.tour_package_price_tiers add constraint tour_package_price_tiers_package_id_int4range_excl
  exclude using gist (package_id with =, int4range(min_pax, coalesce(max_pax, 100000), '[]') with &&)
  deferrable initially immediate;


-- ===== save_package and its parts =====

-- Replaces the 20261028080100 version (L2): a combo's legs are matched by RW, so a kept leg keeps its duration and
-- notes; the kept ones step aside to free their places, then every leg takes its place in the order given.
create or replace function public.save_package_legs(
  p_package_id uuid, p_category public.package_category, p_leg_rw_ids smallint[]
) returns void
  language plpgsql security invoker
  set search_path = ''
as $$
declare
  free_places constant smallint := 1000;
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
  delete from public.tour_package_legs l where l.package_id = p_package_id and l.rw_id <> all (p_leg_rw_ids);
  update public.tour_package_legs l set leg_order = l.leg_order + free_places where l.package_id = p_package_id;
  insert into public.tour_package_legs as l (package_id, rw_id, leg_order)
  select p_package_id, leg.rw_id, leg.leg_order::smallint
  from unnest(p_leg_rw_ids) with ordinality as leg(rw_id, leg_order)
  on conflict (package_id, rw_id) do update set leg_order = excluded.leg_order;
end;
$$;

-- Replaces the 20261028080100 version: the exclusion index waits for the end of the transaction (L1), so the writes
-- go in any order; a tier id named twice is refused (L3).
create or replace function public.save_package_tiers(p_package_id uuid, p_tiers jsonb) returns void
  language plpgsql security invoker
  set search_path = ''
as $$
declare
  wanted jsonb := coalesce(p_tiers, '[]');
begin
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
$$;

-- Replaces the 20261028080100 version (M1): a published combo with fewer than two RWs is refused before the save
-- returns, whether or not its status changed.
create or replace function public.save_package(
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
  if fields.category = 'combo' and fields.status = 'published'
     and (select count(distinct l.rw_id) from public.tour_package_legs l where l.package_id = saved_id) < 2 then
    raise exception 'a published combo package visits at least two different RWs'
      using errcode = 'P0001', hint = 'STATE_INVALID';
  end if;
  return saved_id;
end;
$$;


-- ===== L5: an oversized export leaves a trace =====

-- Replaces the 20261028080000 version: the refusal is a security event too.
create or replace function public.rpc_create_export(
  p_kind public.export_kind, p_format text, p_filters jsonb, p_reason text
) returns jsonb
  language plpgsql security definer
  set search_path = ''
as $$
declare
  row_cap constant integer := 50000;
  hourly_cap constant integer := 10;
  hour_seconds constant integer := 3600;
  scope record;
  counted integer;
  recorded jsonb;
begin
  perform internal.require_export_request(p_kind, p_format, p_reason);
  select * into scope from internal.export_scope(p_filters);
  if not internal.rate_limit_hit('export:user:' || auth.uid()::text, hourly_cap, hour_seconds) then
    raise exception 'at most % exports an hour', hourly_cap using errcode = 'P0001', hint = 'RATE_LIMITED';
  end if;
  counted := internal.export_row_count(p_kind, scope.period_from, scope.period_to, scope.rw_id, row_cap + 1);
  if counted > row_cap then
    insert into public.security_events (event_type, severity, actor_id, rw_id, entity_type, details)
    values ('rate_limited', 'medium', auth.uid(), scope.rw_id, 'exports',
            jsonb_build_object('limit', 'export_rows', 'kind', p_kind, 'cap', row_cap,
                               'from', scope.period_from, 'to', scope.period_to));
    return jsonb_build_object('refused', 'EXPORT_TOO_LARGE', 'row_count', counted);
  end if;
  recorded := internal.record_export(p_kind, p_format, scope, p_reason, counted);
  return recorded || jsonb_build_object('row_count', counted,
    'rows', internal.export_rows(p_kind, scope.period_from, scope.period_to, scope.rw_id, row_cap));
end;
$$;
