-- Review of PR #115, L4: a product saved while catalogue.show_product_prices is being turned off could keep its
-- public_price. Its BEFORE trigger (products_umkm_public_price) read the switch as still on, because the settings
-- transaction had not committed yet, and the settings trigger's bulk update could not see the product, because the
-- product's transaction had not committed yet either; both then committed, and anon could read that one price.
--
-- The settings trigger now takes a SHARE ROW EXCLUSIVE lock on products_umkm before its bulk update. That lock waits for
-- every product write already under way (they hold ROW EXCLUSIVE) to commit, so the update that follows sees them, and
-- it holds back every product write that starts later until the switch has committed, so their trigger reads the new
-- value. Product reads are never blocked (ACCESS SHARE does not conflict), and two flips of the switch take turns. The
-- other way round, having each product write read the setting row FOR SHARE, would make every product save wait on and
-- lock the settings row, and would still need the settings side to see writes in flight; one lock in the rare flip is the
-- smaller change.

-- Replaces the 20261105170300 version: the lock before the bulk update.
create or replace function internal.site_settings_product_prices() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  is_shown boolean;
begin
  if coalesce(new.key, old.key) <> 'catalogue.show_product_prices' then
    return null;
  end if;
  lock table public.products_umkm in share row exclusive mode;
  is_shown := internal.setting_is_on('catalogue.show_product_prices');
  update public.products_umkm p set public_price = p.price
  where p.public_price is distinct from case when is_shown then p.price end;
  return null;
end;
$$;
revoke execute on function internal.site_settings_product_prices() from public, anon, authenticated;
