-- Independent review of PR #27, N1: booking opens by default (0008_seed), but a hold sends the visitor to
-- /reservasi/<code>/bayar and a quotation to /reservasi/<code>, which do not exist before Tasks P3.7.03 and P3.12.01.
-- Until then a fresh database, staging or a production deploy where nobody turned the flag off would take real holds
-- whose links answer 404, their seats held until they lapse. The flag is now off until the migration of P3.12.01
-- turns it back on, once both pages exist. A superadmin may still open it by hand (fresh TOTP) for a trial.
--
-- The migration runs as postgres, outside RLS, like every other settings migration (20261022080000); the only
-- trigger on the table, site_settings_required_keys, guards three other keys.
update public.site_settings set value = to_jsonb(false) where key = 'booking_enabled';
