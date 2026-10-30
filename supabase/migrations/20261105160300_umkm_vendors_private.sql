-- Decision of 2026-10-29 (product owner; docs/PRD.md §13.1 A29, docs/Security.md DATA-14): the sellers behind
-- the UMKM products stay in the system but never reach the public site. Only the Kopdes, which takes the orders, knows
-- who they are. The products stay public; the seller behind each one does not.
--
-- So the anonymous role reads nothing of umkm_vendors any more: 0005 granted it the name, slug, story and logo of an
-- active vendor through umkm_vendors_public_read, and both go. No view or function exposes a vendor to anon (none is
-- granted to it), and the public product reads no longer embed one. products_umkm.vendor_id goes too, in
-- 20261105160600 (no public read needs it).
--
-- Staff keep what they had: the superadmin every vendor, an RW admin the vendors of their own RW (umkm_vendors_staff_read),
-- which the finance policies of revenue_share_entries and payout_batches read to show that RW's vendor rows; the bank
-- columns stay granted to no API role (20261104120000).
drop policy umkm_vendors_public_read on public.umkm_vendors;
revoke all on public.umkm_vendors from anon;
