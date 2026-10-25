-- Task P3.12.01 (review of PR #27, N1): the pay page /reservasi/<code>/bayar (P3.7.03) and the status hub
-- /reservasi/<code> (P3.12.01) both exist now, so booking opens again, reversing 20261023090000. A hold and a
-- quotation land on pages that answer. The superadmin can still close it from /dashboard/settings.
--
-- The migration runs as postgres, outside RLS, like 20261023090000; site_settings_required_keys guards three other keys.
update public.site_settings set value = to_jsonb(true) where key = 'booking_enabled';
