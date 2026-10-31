-- docs/PRD.md §13.1 A30 (decision of the product owner, 2026-10-31): the Koperasi Merah Putih (Kopdes) runs every UMKM
-- matter, from a product's upload to its finance, so it gets a staff role of its own, admin_kopdes. It works for the
-- whole kelurahan (no RW) and only on UMKM: vendors, products and their variants, and three catalogue settings.
--
-- A new enum value cannot be used in the transaction that adds it, so this file adds the value and nothing else; the
-- helpers, constraints and policies that name it follow in 20261105180100 and after.
alter type public.app_role add value 'admin_kopdes' before 'none';
