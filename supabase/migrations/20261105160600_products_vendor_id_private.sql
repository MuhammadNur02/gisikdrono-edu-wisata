-- Decision of 2026-10-29 (docs/PRD.md §13.1 A29 decision 5, docs/Security.md DATA-14), review of PR #114, L-7: the
-- seller behind a product is no public information. 20261105160300 closed umkm_vendors to anon; products_umkm.vendor_id
-- was left readable on the claim that the add-on quote hash binds it, which it does not (internal.booking_quote_hash
-- and src/lib/pricing/quote-hash.ts hash kind, id, unit price, quantity and line total only). No public read needs it
-- any more, and an id shared by several products would still tell the public which of them one seller makes, so anon
-- loses it too. Staff keep it (the authenticated grants of 0005), and the server prices every booking from the rows
-- itself (internal.booking_quote, security definer), so nothing a visitor does reads it.
revoke select (vendor_id) on public.products_umkm from anon;
