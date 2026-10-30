-- Decision of 2026-10-29 (docs/PRD.md §13.1 A29 decision 2, FR-BOOK-04), review of PR #114, L-1: UMKM products are no
-- add-ons of a visit booking, and no UMKM money passes through the app. 20261105160100 switched every product off and
-- the dashboard form no longer offers the switch; this holds it at the row, so a crafted write (a superadmin's PATCH
-- through PostgREST, the SQL editor) cannot turn an add-on, and with it UMKM money, back on. Turning add-ons on again is
-- a decision for the owner, made with the Kopdes's own Midtrans account and role: a migration that drops this check.
-- booking_addons, the add-on rules and every code path stay, so the bookings that hold add-ons keep them.
alter table public.products_umkm
  add constraint products_umkm_addons_switched_off check (not is_addon_eligible);
