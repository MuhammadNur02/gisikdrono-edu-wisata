-- Decision of 2026-10-29 (product owner; docs/PRD.md §8.6, FR-PUB-13a): a visitor orders UMKM products through the
-- WhatsApp of the Koperasi Merah Putih (Kopdes), the kelurahan's cooperative, and picks them up and pays there. The
-- product pages read two public settings for it:
--
--   contact.kopdes_whatsapp_number  the one Kopdes number the "Pesan via WhatsApp" link opens (E.164 +62)
--   contact.kopdes_address          the Kopdes address where the goods are picked up and paid for
--
-- Under contact.*, like the kelurahan's own contact number: internal.log_audit keeps a contact value out of the audit
-- log (20261018061037), and the number is a phone number all the same. Both start as placeholders that
-- internal.placeholder_site_settings() flags (an all-zero number, bracketed fill-in text), so production's /api/health
-- and the go-live checklist stay red until the superadmin fills them in on /dashboard/settings, and the site shows no
-- order button until then.

-- Both are public, so the public-key allow-list of 20261104080100 grows by exactly these two names.
alter table public.site_settings drop constraint site_settings_public_keys;
alter table public.site_settings add constraint site_settings_public_keys check (
  not is_public or key in ('booking_enabled', 'maintenance_mode', 'booking.min_lead_hours', 'booking.max_advance_days',
                           'booking.max_pax', 'contact.whatsapp_number', 'contact.email', 'kelurahan.address',
                           'seo.default_description', 'privacy.dpo_name', 'privacy.dpo_email',
                           'booking.cancel_refund_schedule', 'booking.weather_reschedule_max',
                           'booking.weather_window_hours', 'contact.kopdes_whatsapp_number', 'contact.kopdes_address')
);

-- The public page builds a wa.me link from the number, so the row itself holds only a +62 number in the form's own
-- pattern (src/lib/validations/settings.ts) and an address of plain text the form's length allows. Built-in operators
-- only, so the check needs no function the API roles would have to be granted; the type is tested before the text.
alter table public.site_settings add constraint site_settings_kopdes_values check (
  case
    when key = 'contact.kopdes_whatsapp_number' then
      jsonb_typeof(value) = 'string' and (value #>> '{}') ~ '^\+62[0-9]{8,13}$'
    when key = 'contact.kopdes_address' then
      jsonb_typeof(value) = 'string' and char_length(btrim(value #>> '{}')) between 1 and 300
    else true
  end
);

-- A value someone already set is kept.
insert into public.site_settings (key, value, is_public, description) values
  ('contact.kopdes_whatsapp_number', '"+620000000000"', true,
   'Nomor WhatsApp Koperasi Merah Putih untuk pesanan produk UMKM'),
  ('contact.kopdes_address', '"[Alamat Koperasi Merah Putih]"', true,
   'Alamat Koperasi Merah Putih, tempat produk UMKM diambil dan dibayar')
on conflict (key) do nothing;
