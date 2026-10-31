-- docs/PRD.md §13.1 A30, docs/Security.md AZ-16: what every staff member reads to work in the dashboard, now for the
-- Kopdes admin too, and nothing more.
--
--   rw_units   the RWs, offline ones included, so the Kopdes admin files a vendor or product under the right one; the
--              same columns every staff member reads (0005), none of them personal data. Writes stay the RW's and the
--              superadmin's.
--   profiles   their own row only, to read and to edit their name, phone and avatar (the grants of 0005); never a
--              colleague's, and never their role, RW or status (profiles_guard).


drop policy rw_units_staff_read on public.rw_units;
create policy rw_units_staff_read on public.rw_units for select to authenticated
  using ((select public.is_staff()) or (select public.is_admin_kopdes()));

drop policy profiles_staff_read on public.profiles;
create policy profiles_staff_read on public.profiles for select to authenticated using (
  (select public.is_superadmin())
  or ((select public.is_admin_rw()) and (id = (select auth.uid()) or rw_id = (select public.app_rw_id())))
  or ((select public.is_admin_kopdes()) and id = (select auth.uid()))
);

drop policy profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select public.is_superadmin())
         or (((select public.is_staff()) or (select public.is_admin_kopdes())) and id = (select auth.uid())))
  with check ((select public.is_superadmin())
              or (((select public.is_staff()) or (select public.is_admin_kopdes())) and id = (select auth.uid())));
