-- The heading of an RW page's product section becomes content of the RW (decision of 2026-10-21, Task P2.10.02):
-- the arts programme sells mostly souvenirs from its sanggar and says so ("Suvenir dan produk UMKM RW 08"), every
-- other RW keeps "Produk UMKM RW NN". Until now that one difference sat in src/components/marketing/rw-page.tsx,
-- keyed by RW number; it moves into rw_units with the rest of the RW's identity, so the page stays the same.
alter table public.rw_units
  add column products_heading text,
  add constraint rw_units_products_heading_trimmed
    check (products_heading ~ '^\S(.*\S)?$' and char_length(products_heading) <= 60);

-- Only while RW 08 is still the arts programme 0008 seeded; RW 13 takes the heading over with the programme.
update public.rw_units set products_heading = 'Suvenir dan produk UMKM'
where id = 8 and slug = 'rw-08-kampung-seni-budaya';

-- Everyone who reads an RW page reads it; the superadmin may give a new RW one. The RW's admin edits it once the RW
-- page form has the field.
grant select (products_heading) on public.rw_units to anon, authenticated;
grant insert (products_heading) on public.rw_units to authenticated;
