-- Decision of 2026-10-29 (product owner; docs/PRD.md §13.1): UMKM products are no longer add-ons of a visit booking.
-- They are ordered through the WhatsApp of the Koperasi Merah Putih and paid and picked up there, so no UMKM money
-- passes through the app. The switch is the data: no product is addon-eligible, so listAddonProducts offers nothing,
-- the wizard leaves out its Tambahan step, and internal.create_booking refuses any add-on line it is sent.
--
-- Nothing else changes: booking_addons, the add-on revenue rules and every code path stay, so a booking that already
-- holds add-ons still shows, settles, refunds and reverses as before. The column default has been false since 0003, so
-- a new product starts switched off too.
update public.products_umkm
set is_addon_eligible = false
where is_addon_eligible;
