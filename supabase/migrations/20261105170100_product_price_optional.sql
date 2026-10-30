-- Decision of 2026-10-30 (product owner; docs/PRD.md §13.1 A29 decision 7): the owner does not know the UMKM prices
-- yet, so a product may be saved without one. Since A29 no UMKM money passes through the app (add-ons are off and the
-- Koperasi Merah Putih is paid at its counter), so a product's price is a catalogue fact only:
--
--   price NULL   "belum ditentukan": the product page says so while catalogue.show_product_prices is on
--   price > 0    whole rupiah per unit_label (CLAUDE.md §7.1)
--
-- A price of 0 rupiah was what the form sent for "unknown" before this, so it becomes NULL: no product is given away,
-- and a public "Rp 0" can no longer be shown. The bookings that hold add-ons keep their own price snapshot
-- (booking_addons.unit_price), so nothing booked changes.

alter table public.products_umkm alter column price drop not null;
update public.products_umkm set price = null where price = 0;
alter table public.products_umkm drop constraint products_umkm_price_check;
alter table public.products_umkm add constraint products_umkm_price_positive check (price > 0);

-- An add-on is priced from this column by internal.booking_quote and computeBookingQuote, so a product without a price
-- is never on sale as one: it reads as unavailable there, never as a free line. products_umkm_addons_switched_off
-- holds every product off today; this check stays when add-ons return and that one is dropped.
alter table public.products_umkm add constraint products_umkm_addon_has_price check (
  not is_addon_eligible or price is not null
);
