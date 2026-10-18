-- The Pejabat Pelindungan Data contact on /privasi (docs/Security.md §7.6, docs/PRD.md §8.6, Task P2.4.12,
-- decision of 2026-10-18). The kelurahan has not named the officer or the mailbox yet, so both keys start as
-- placeholders that cannot pass for the real thing: bracketed fill-in text and an example.invalid address.
-- internal.placeholder_site_settings() already flags both shapes, so production's /api/health and go-live check
-- #19 stay red until they are filled in. The officer's WhatsApp is the public contact.whatsapp_number.

-- Both are public, so the public-key allow-list of 0005 grows by exactly these two names.
alter table public.site_settings drop constraint site_settings_public_keys;
alter table public.site_settings add constraint site_settings_public_keys check (
  not is_public or key in ('booking_enabled', 'maintenance_mode', 'booking.min_lead_hours', 'booking.max_advance_days',
                           'booking.max_pax', 'contact.whatsapp_number', 'contact.email', 'kelurahan.address',
                           'seo.default_description', 'privacy.dpo_name', 'privacy.dpo_email')
);

-- The officer's name and mailbox are personal data, so the audit log keeps them out just as it keeps out the
-- contact.* values (CLAUDE.md §7.6). The body is 0004's with one more key pattern, replaced before the insert
-- below so not even the placeholders are logged. create or replace keeps the owner and the revoked grants.
create or replace function internal.log_audit() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  allowed text[] := internal.audit_columns(tg_table_name);
  before_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  after_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  subject jsonb := coalesce(after_row, before_row);
  names_only boolean := coalesce(current_setting('app.audit_mode', true), '') = 'names_only';
  changed text[];
  kept_before jsonb;
  kept_after jsonb;
begin
  if tg_op = 'UPDATE' then
    select array_agg(column_name order by column_name) into changed
    from jsonb_object_keys(after_row) as column_name
    where before_row -> column_name is distinct from after_row -> column_name and column_name <> 'updated_at';
    if changed is null then
      return null;
    end if;
  end if;

  if not names_only then
    select jsonb_object_agg(column_name, before_row -> column_name) into kept_before
    from unnest(allowed) as column_name
    where before_row ? column_name and (changed is null or column_name = any (changed));
    select jsonb_object_agg(column_name, after_row -> column_name) into kept_after
    from unnest(allowed) as column_name
    where after_row ? column_name and (changed is null or column_name = any (changed));
  end if;

  -- Public contact numbers in site_settings are still phone numbers, and the data protection officer is a named
  -- person with a mailbox; their values stay out too.
  if tg_table_name = 'site_settings'
     and (subject ->> 'key' like 'contact.%' or subject ->> 'key' like 'privacy.dpo\_%') then
    kept_before := kept_before - 'value';
    kept_after := kept_after - 'value';
  end if;

  perform internal.write_audit_row(
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    coalesce(subject ->> 'id', subject ->> 'key'),
    coalesce((subject ->> 'rw_id')::smallint, (subject -> 'rw_ids' ->> 0)::smallint),
    kept_before,
    kept_after,
    jsonb_strip_nulls(jsonb_build_object('changed_columns', to_jsonb(changed), 'audit_mode', nullif(current_setting('app.audit_mode', true), '')))
  );
  return null;
end;
$$;

-- A value someone already set is kept.
insert into public.site_settings (key, value, is_public, description) values
  ('privacy.dpo_name', '"[Nama Pejabat Pelindungan Data]"', true, 'Nama Pejabat Pelindungan Data di /privasi'),
  ('privacy.dpo_email', '"privasi@example.invalid"', true, 'Email Pejabat Pelindungan Data di /privasi')
on conflict (key) do nothing;
