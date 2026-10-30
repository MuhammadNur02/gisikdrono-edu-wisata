-- Decision of 2026-10-30 (product owner; docs/PRD.md §13.1 A29 decision 7, §8.6, FR-PUB-13): the UMKM product prices
-- are not known yet, so the public site shows none until the superadmin turns this switch on in /dashboard/settings.
--
--   catalogue.show_product_prices  false: no product price leaves the server for a public page, card, JSON-LD or OG
--                                  image; true: each product shows its own price, or "Harga belum ditentukan" while
--                                  it has none (products_umkm.price NULL, 20261105170100)
--
-- Ticket package prices are not touched by it. The public product reads ask for it through the anon client, so it is a
-- public key, and the public-key allow-list of 20261105160200 grows by exactly this name.
alter table public.site_settings drop constraint site_settings_public_keys;
alter table public.site_settings add constraint site_settings_public_keys check (
  not is_public or key in ('booking_enabled', 'maintenance_mode', 'booking.min_lead_hours', 'booking.max_advance_days',
                           'booking.max_pax', 'contact.whatsapp_number', 'contact.email', 'kelurahan.address',
                           'seo.default_description', 'privacy.dpo_name', 'privacy.dpo_email',
                           'booking.cancel_refund_schedule', 'booking.weather_reschedule_max',
                           'booking.weather_window_hours', 'contact.kopdes_whatsapp_number', 'contact.kopdes_address',
                           'catalogue.show_product_prices')
);

-- A switch is a JSON boolean and nothing else, so a typo in the SQL editor cannot read as "on" in one place and "off"
-- in another. Built-in operators only, like site_settings_kopdes_values.
alter table public.site_settings add constraint site_settings_catalogue_values check (
  key <> 'catalogue.show_product_prices' or jsonb_typeof(value) = 'boolean'
);

-- Off until the owner knows the prices. A value someone already set is kept.
insert into public.site_settings (key, value, is_public, description) values
  ('catalogue.show_product_prices', 'false', true, 'Tampilkan harga produk UMKM di situs publik')
on conflict (key) do nothing;
