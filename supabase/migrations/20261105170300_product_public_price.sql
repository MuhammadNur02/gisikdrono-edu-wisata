-- Review of PR #115, H1 (decision of the coordinator, 2026-10-31): masking the UMKM prices only in the server's public
-- reads left products_umkm.price readable to anyone holding the public anon key (/rest/v1/products_umkm?select=price),
-- whatever catalogue.show_product_prices says. The price the public may see is now a column of its own:
--
--   public_price  the product's price while catalogue.show_product_prices is on, NULL while it is off (or while the
--                 product has no price); written only by the triggers below, never by a client
--
-- anon loses price and reads public_price instead; staff keep price. No view and no RPC is opened to anon (CLAUDE.md
-- §5.4, §6.2). internal.booking_quote and internal.create_booking keep reading price as the server's definer functions,
-- so they do not depend on anon's grant.

alter table public.products_umkm add column public_price bigint;
alter table public.products_umkm add constraint products_umkm_public_price_is_price check (
  public_price is null or public_price = price
);

-- Every write of a product sets its public price from the switch, so no client can set it, through any column list.
create function internal.products_umkm_public_price() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  new.public_price := case when internal.setting_is_on('catalogue.show_product_prices') then new.price end;
  return new;
end;
$$;
revoke execute on function internal.products_umkm_public_price() from public, anon, authenticated;
create trigger products_umkm_public_price before insert or update on public.products_umkm
  for each row execute function internal.products_umkm_public_price();

-- Turning the switch on or off (or removing it, which reads as off) shows or hides every product's price at once. The
-- products' own BEFORE trigger reads the new value, which this AFTER trigger's statement already sees; only the rows
-- whose public price changes are written.
create function internal.site_settings_product_prices() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  is_shown boolean := internal.setting_is_on('catalogue.show_product_prices');
begin
  if coalesce(new.key, old.key) <> 'catalogue.show_product_prices' then
    return null;
  end if;
  update public.products_umkm p set public_price = p.price
  where p.public_price is distinct from case when is_shown then p.price end;
  return null;
end;
$$;
revoke execute on function internal.site_settings_product_prices() from public, anon, authenticated;
create trigger site_settings_product_prices after insert or update or delete on public.site_settings
  for each row execute function internal.site_settings_product_prices();

-- Replaces the 20261024100300 version: like updated_at and last_polled_at, products_umkm.public_price follows a
-- switch the site_settings audit row already records, so a flip of catalogue.show_product_prices writes no audit row per
-- product; public_price is not in audit_columns either. Everything else is unchanged.
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
    where before_row -> column_name is distinct from after_row -> column_name
      and column_name not in ('updated_at', 'last_polled_at', 'public_price');
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

-- Backfill, under the log_audit above: the switch is off unless someone already turned it on.
update public.products_umkm p set public_price = p.price;

revoke select (price) on public.products_umkm from anon;
grant select (public_price) on public.products_umkm to anon;
