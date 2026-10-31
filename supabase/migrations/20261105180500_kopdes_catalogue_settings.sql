-- docs/PRD.md §13.1 A30, §8.6, docs/Security.md AZ-16: the Kopdes admin edits the three catalogue settings that are its
-- own business and no other key: catalogue.show_product_prices (A29 decision 7), contact.kopdes_whatsapp_number and
-- contact.kopdes_address (A29 decision 3). The superadmin keeps every key.
--
-- The restrictive policies of 0005 stay in force for it too: AAL2 for any read or write, and a TOTP code from the last
-- five minutes for the update (site_settings_fresh_totp_update). It reads those three rows only, and of them it changes
-- the value alone, signed with its own id: a policy cannot narrow columns, so site_settings_kopdes_guard refuses a change
-- of is_public or description (is_public off would hide the Kopdes number from the product pages). The value is still
-- checked by site_settings_kopdes_values and site_settings_catalogue_values, and turning the price switch runs
-- site_settings_product_prices as it does for the superadmin.


create policy site_settings_kopdes_read on public.site_settings for select to authenticated using (
  (select public.is_admin_kopdes())
  and key in ('catalogue.show_product_prices', 'contact.kopdes_whatsapp_number', 'contact.kopdes_address')
);

create policy site_settings_kopdes_update on public.site_settings for update to authenticated
  using ((select public.is_admin_kopdes())
         and key in ('catalogue.show_product_prices', 'contact.kopdes_whatsapp_number', 'contact.kopdes_address'))
  with check ((select public.is_admin_kopdes())
              and key in ('catalogue.show_product_prices', 'contact.kopdes_whatsapp_number', 'contact.kopdes_address')
              and updated_by = (select auth.uid()));

create function internal.site_settings_kopdes_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if public.is_admin_kopdes()
     and (new.key, new.is_public, new.description) is distinct from (old.key, old.is_public, old.description) then
    raise exception 'the Kopdes admin changes the value of a catalogue setting, nothing else' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function internal.site_settings_kopdes_guard() from public, anon, authenticated, service_role;

create trigger site_settings_kopdes_guard before update on public.site_settings
  for each row execute function internal.site_settings_kopdes_guard();
