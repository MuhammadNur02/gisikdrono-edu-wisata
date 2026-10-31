-- docs/PRD.md §13.1 A30, FR-ADMIN-09, docs/Security.md AZ-16: the Kopdes admin manages the UMKM catalogue of every RW,
-- as the superadmin does: umkm_vendors, products_umkm and product_variants. Nothing else of the catalogue (packages,
-- legs, tiers, price history) changes, and an RW admin keeps reading their own RW's vendors and products only.
--
-- The write policies the superadmin held alone (20261028080100, 20261105170200) become the UMKM managers' (manages_umkm():
-- the superadmin or the Kopdes admin); the reads add the Kopdes admin beside owns_rw(). The restrictive AAL2 policy of
-- each table stays, so neither role reads or writes anything at AAL1. The column grants are unchanged: the vendors' bank
-- columns stay granted to no API role and move only through the bank RPCs (20261105180300).
-- save_product_variants, security invoker, refused anyone but the superadmin before it read anything (20261105170400);
-- it now refuses anyone who does not manage UMKM, and save_product, which calls it, follows.
--
-- No hard delete for the Kopdes admin (review of PR #117, L1): deleting a product cascades into its product-scoped
-- revenue_share_rules and their lines, and RLS does not apply to a cascade, so the superadmin-only, fresh-TOTP delete
-- policies of those tables would never run. umkm_vendors_super_delete and products_umkm_super_delete stay the
-- superadmin's as they were (0005); the Kopdes admin archives a product through its status and takes a seller off
-- through is_active. product_variants keeps its delete for the UMKM managers: save_product_variants replaces a
-- product's variants by deleting them, and nothing references a variant.


-- ===== umkm_vendors =====

drop policy umkm_vendors_staff_read on public.umkm_vendors;
drop policy umkm_vendors_super_insert on public.umkm_vendors;
drop policy umkm_vendors_super_update on public.umkm_vendors;

create policy umkm_vendors_staff_read on public.umkm_vendors for select to authenticated
  using ((select public.owns_rw(rw_id)) or (select public.is_admin_kopdes()));
create policy umkm_vendors_manager_insert on public.umkm_vendors for insert to authenticated
  with check ((select public.manages_umkm()) and created_by = (select auth.uid()));
create policy umkm_vendors_manager_update on public.umkm_vendors for update to authenticated
  using ((select public.manages_umkm())) with check ((select public.manages_umkm()));


-- ===== products_umkm =====

drop policy products_umkm_staff_read on public.products_umkm;
drop policy products_umkm_super_insert on public.products_umkm;
drop policy products_umkm_super_update on public.products_umkm;

create policy products_umkm_staff_read on public.products_umkm for select to authenticated
  using ((select public.owns_rw(rw_id)) or (select public.is_admin_kopdes()));
create policy products_umkm_manager_insert on public.products_umkm for insert to authenticated
  with check ((select public.manages_umkm()) and created_by = (select auth.uid()));
create policy products_umkm_manager_update on public.products_umkm for update to authenticated
  using ((select public.manages_umkm())) with check ((select public.manages_umkm()));


-- ===== product_variants =====

drop policy product_variants_staff_read on public.product_variants;
drop policy product_variants_super_insert on public.product_variants;
drop policy product_variants_super_update on public.product_variants;
drop policy product_variants_super_delete on public.product_variants;

create policy product_variants_staff_read on public.product_variants for select to authenticated using (
  exists (select 1 from public.products_umkm p
          where p.id = product_variants.product_id
            and ((select public.owns_rw(p.rw_id)) or (select public.is_admin_kopdes())))
);
create policy product_variants_manager_insert on public.product_variants for insert to authenticated
  with check ((select public.manages_umkm()));
create policy product_variants_manager_update on public.product_variants for update to authenticated
  using ((select public.manages_umkm())) with check ((select public.manages_umkm()));
create policy product_variants_manager_delete on public.product_variants for delete to authenticated
  using ((select public.manages_umkm()));


-- ===== save_product_variants =====

-- Replaces the 20261105170400 version: the UMKM managers at AAL2, nobody else, before anything is read.
create or replace function public.save_product_variants(p_product_id uuid, p_variants jsonb) returns void
  language plpgsql security invoker
  set search_path = ''
as $$
declare
  wanted jsonb := coalesce(p_variants, '[]');
  current_list jsonb;
begin
  if not ((select public.manages_umkm()) and (select public.aal2())) then
    raise exception 'only the superadmin or the Kopdes admin saves a product''s variants' using errcode = '42501';
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
