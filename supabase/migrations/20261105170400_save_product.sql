-- Review of PR #115, L1 to L3: a product and its variants are saved in one transaction, as save_package saves a
-- package with its legs and tiers, so a refused variant list never leaves a product written without it; and
-- save_product_variants says plainly who may call it and takes the product's row lock before it replaces anything.
--
--   save_product            the product with every field (rw_id on a new one only, created_by the caller), then its
--                           variants, in one transaction. Security invoker: the grants, policies and triggers of a
--                           direct write decide, so the superadmin at AAL2 alone (20261028080100).
--   save_product_variants   replaced: refuses anyone but the superadmin at AAL2 (42501) before it reads anything, so
--                           an RW admin calling it with an empty list is no silent success, and locks the product's row
--                           first, so two saves of one product take turns.


-- ===== save_product_variants =====

create or replace function public.save_product_variants(p_product_id uuid, p_variants jsonb) returns void
  language plpgsql security invoker
  set search_path = ''
as $$
declare
  wanted jsonb := coalesce(p_variants, '[]');
  current_list jsonb;
begin
  if not ((select public.is_superadmin()) and (select public.aal2())) then
    raise exception 'only the superadmin saves a product''s variants' using errcode = '42501';
  end if;
  if jsonb_typeof(wanted) <> 'array' or exists (
       select 1 from jsonb_array_elements(wanted) as v
       where jsonb_typeof(v) <> 'object'
          or (select array_agg(k order by k) from jsonb_object_keys(v) as k)
             is distinct from array['image_path', 'is_available', 'label']
          or jsonb_typeof(v -> 'label') <> 'string'
          or jsonb_typeof(v -> 'is_available') <> 'boolean'
          or jsonb_typeof(v -> 'image_path') not in ('string', 'null')) then
    raise exception 'a variant is a label, an image_path and is_available' using errcode = '22023';
  end if;

  perform 1 from public.products_umkm p where p.id = p_product_id for update;
  if not found then
    raise exception 'product % does not exist', p_product_id using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('label', v.label, 'image_path', v.image_path,
                                               'is_available', v.is_available) order by v.sort_order, v.label), '[]')
    into current_list
  from public.product_variants v where v.product_id = p_product_id;
  if current_list = wanted then
    return;
  end if;

  delete from public.product_variants v where v.product_id = p_product_id;
  insert into public.product_variants (product_id, label, image_path, sort_order, is_available)
  select p_product_id, v ->> 'label', v ->> 'image_path', (seq - 1)::smallint, (v ->> 'is_available')::boolean
  from jsonb_array_elements(wanted) with ordinality as listed(v, seq);
end;
$$;


-- ===== save_product =====

-- The keys a product is saved with: all of them, so nothing is left to a default by accident. rw_id only on a new
-- product (p_product_id null), since a product never changes its RW; public_price is the triggers' alone.
create function public.save_product(p_product jsonb, p_product_id uuid default null, p_variants jsonb default '[]')
  returns uuid
  language plpgsql security invoker
  set search_path = ''
as $$
declare
  shared_keys constant text[] := array['vendor_id', 'slug', 'name', 'category', 'description_md', 'price',
    'unit_label', 'min_order_qty', 'max_order_qty', 'lead_time_days', 'is_addon_eligible', 'is_available',
    'is_featured', 'image_paths', 'status', 'sort_order'];
  expected_keys text[] := case when p_product_id is null then shared_keys || 'rw_id'::text else shared_keys end;
  fields public.products_umkm;
  saved_id uuid := p_product_id;
begin
  if jsonb_typeof(p_product) is distinct from 'object'
     or (select array_agg(k order by k) from jsonb_object_keys(p_product) as k)
        is distinct from (select array_agg(k order by k) from unnest(expected_keys) as k) then
    raise exception 'a product is saved with all of its fields and nothing else' using errcode = '22023';
  end if;
  fields := jsonb_populate_record(null::public.products_umkm, p_product);

  if saved_id is null then
    insert into public.products_umkm (rw_id, vendor_id, slug, name, category, description_md, price, unit_label,
      min_order_qty, max_order_qty, lead_time_days, is_addon_eligible, is_available, is_featured, image_paths, status,
      sort_order, created_by)
    values (fields.rw_id, fields.vendor_id, fields.slug, fields.name, fields.category, fields.description_md,
      fields.price, fields.unit_label, fields.min_order_qty, fields.max_order_qty, fields.lead_time_days,
      fields.is_addon_eligible, fields.is_available, fields.is_featured, fields.image_paths, fields.status,
      fields.sort_order, (select auth.uid()))
    returning id into saved_id;
  else
    update public.products_umkm
    set vendor_id = fields.vendor_id, slug = fields.slug, name = fields.name, category = fields.category,
        description_md = fields.description_md, price = fields.price, unit_label = fields.unit_label,
        min_order_qty = fields.min_order_qty, max_order_qty = fields.max_order_qty,
        lead_time_days = fields.lead_time_days, is_addon_eligible = fields.is_addon_eligible,
        is_available = fields.is_available, is_featured = fields.is_featured, image_paths = fields.image_paths,
        status = fields.status, sort_order = fields.sort_order
    where id = saved_id;
    if not found then
      raise exception 'product % does not exist or is not yours', saved_id using errcode = 'P0002';
    end if;
  end if;

  -- After the row: a photo the row just took off has left its variants (products_umkm_variant_photos), and one it
  -- just added may be picked.
  perform public.save_product_variants(saved_id, p_variants);
  return saved_id;
end;
$$;

revoke execute on function public.save_product(jsonb, uuid, jsonb) from public, anon, service_role;
grant execute on function public.save_product(jsonb, uuid, jsonb) to authenticated;
