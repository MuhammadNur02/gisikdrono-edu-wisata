-- Development seed (Task P1.8.02), run by pnpm db:seed (scripts/seed-dev.ts) inside one transaction on the local
-- stack only. Reference data every environment needs lives in supabase/migrations/0008_seed.sql.
--
-- It creates staff accounts with a DEV-ONLY password and TOTP secret. Their values live in scripts/dev-accounts.ts
-- alone; seed-dev.ts hands them over as the transaction settings dev_seed.password and dev_seed.totp_secret, so
-- neither this file nor any migration holds them. Every statement skips what is already there, so running
-- pnpm db:seed again changes nothing.

-- A database pnpm db:seed reaches on 127.0.0.1 is local. The marker keeps an application job without its Vault
-- secrets quiet here (0007_cron.sql); a database marked anything else, under any spelling, refuses the seed below.
select vault.create_secret('local', 'environment')
where not exists (select 1 from vault.secrets where name = 'environment');
select internal.require_local_database();

-- The scanner's attestation key (20261026090000_scanner_attestation.sql) derives from CRON_SECRET, which a hosted
-- project keeps in Vault as cron_secret. Locally it is the CRON_SECRET the Next.js server runs with
-- (scripts/local-server-env.ts); without the setting nothing changes.
select vault.update_secret(s.id, current_setting('dev_seed.cron_secret', true))
from vault.secrets s
where s.name = 'cron_secret' and nullif(current_setting('dev_seed.cron_secret', true), '') is not null;
select vault.create_secret(current_setting('dev_seed.cron_secret', true), 'cron_secret')
where nullif(current_setting('dev_seed.cron_secret', true), '') is not null
  and not exists (select 1 from vault.secrets where name = 'cron_secret');


-- ===== Development staff accounts =====
-- Complete Auth users with a verified TOTP factor, so they reach AAL2.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
select '00000000-0000-0000-0000-000000000000', account.id::uuid, 'authenticated', 'authenticated', account.email,
       extensions.crypt(current_setting('dev_seed.password'), extensions.gen_salt('bf')), now(),
       '{"provider": "email", "providers": ["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '', false, false
from (values
  ('0de00000-0000-4000-8000-000000000001', 'superadmin@dev.gisikdrono.test'),
  ('0de00000-0000-4000-8000-000000000005', 'admin-rw05@dev.gisikdrono.test'),
  ('0de00000-0000-4000-8000-000000000013', 'admin-rw13@dev.gisikdrono.test'),
  ('0de00000-0000-4000-8000-000000000008', 'admin-rw08@dev.gisikdrono.test')
) as account(id, email)
on conflict do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email',
       now(), now(), now()
from auth.users u where u.email like '%@dev.gisikdrono.test'
on conflict do nothing;

-- The system path may give a new profile its role (profiles_guard); claims_version starts at 1.
insert into public.profiles (id, email, full_name, role, rw_id, claims_version) values
  ('0de00000-0000-4000-8000-000000000001', 'superadmin@dev.gisikdrono.test', 'Superadmin Dev', 'superadmin', null, 1),
  ('0de00000-0000-4000-8000-000000000005', 'admin-rw05@dev.gisikdrono.test', 'Admin RW 05 Dev', 'admin_rw', 5, 1),
  ('0de00000-0000-4000-8000-000000000013', 'admin-rw13@dev.gisikdrono.test', 'Admin RW 13 Dev', 'admin_rw', 13, 1),
  ('0de00000-0000-4000-8000-000000000008', 'admin-rw08@dev.gisikdrono.test', 'Admin RW 08 Dev', 'admin_rw', 8, 1)
on conflict (id) do nothing;

-- After the profiles: a factor of an account without a role is verified only under a claimed invite
-- (mfa_factor_verification_guard, 20261103131000), and these accounts have their roles by now.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
select gen_random_uuid(), u.id, 'DEV-ONLY authenticator', 'totp', 'verified', now(), now(),
       current_setting('dev_seed.totp_secret')
from auth.users u
where u.email like '%@dev.gisikdrono.test'
  and not exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.factor_type = 'totp');


-- ===== Old local layout (local only) =====
-- A local database seeded before Task P2.10.03 holds the arts demo under RW 08; staging and production never had that
-- layout, so this stays here rather than in scripts/seed-demo-content.sql. Those rows go first, by their own ids and
-- names, so the inserts of seed-demo-content.sql write them again for RW 13 and the combo ends up visiting RW 05 and
-- RW 13 (independent review of PR #23, 3). None of them has a booking, since the seed never writes one; the combo is
-- a draft while its RW 08 leg goes, and seed-demo-content.sql publishes it again.
update public.tour_packages set status = 'draft'
where id = '0de00000-0000-4000-8000-0000000000c9'
  and exists (select 1 from public.tour_package_legs l
              where l.package_id = '0de00000-0000-4000-8000-0000000000c9' and l.rw_id = 8);
delete from public.tour_package_legs where package_id = '0de00000-0000-4000-8000-0000000000c9' and rw_id = 8;
-- A package's price history is append-only; removing a demo package removes its history with it.
select set_config('app.purge', 'on', true);
delete from public.tour_packages where id = '0de00000-0000-4000-8000-0000000000c8' and rw_id = 8;
delete from public.products_umkm where slug = 'gantungan-kunci-batik' and rw_id = 8;
delete from public.umkm_vendors where id = '0de00000-0000-4000-8000-0000000000a8' and rw_id = 8;
select set_config('app.purge', 'off', true);
delete from public.visit_sessions s using public.session_templates t
where s.template_id = t.id and t.rw_id = 8 and t.label in ('Sesi Pagi', 'Sesi Siang') and s.reserved_pax = 0;
delete from public.session_templates where rw_id = 8 and label in ('Sesi Pagi', 'Sesi Siang');

-- The demo content follows in scripts/seed-demo-content.sql, which seed-dev.ts runs next in the same transaction.
