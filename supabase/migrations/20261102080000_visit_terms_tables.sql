-- Task P3.12.01–P3.12.02 with the owner's visit terms (docs/PRD.md §13.1 A16–A18, FR-BOOK-23..25; decisions of
-- 2026-10-25): the rows a paid cancellation, a weather notice and a weather refund leave behind, and the settings their
-- rules read. The functions that write them follow in 20261102080100.


-- ===== Settings (CLAUDE.md §4 rule 3: tunable values live in site_settings) =====

-- The refund schedule of a paid cancellation (A16): the first entry whose min_days the days left reach gives the
-- percentage of the package part returned. Public, since the wizard and the status hub show the terms.
-- The weather rules (A17) and the Midtrans fee per method (A18), which the superadmin sets; a fee left at JSON null keeps
-- the weather refund closed, so no rate is ever guessed.
alter table public.site_settings drop constraint site_settings_public_keys;
alter table public.site_settings add constraint site_settings_public_keys check (
  not is_public or key in ('booking_enabled', 'maintenance_mode', 'booking.min_lead_hours', 'booking.max_advance_days',
                           'booking.max_pax', 'contact.whatsapp_number', 'contact.email', 'kelurahan.address',
                           'seo.default_description', 'privacy.dpo_name', 'privacy.dpo_email',
                           'booking.cancel_refund_schedule', 'booking.weather_reschedule_max',
                           'booking.weather_window_hours')
);
insert into public.site_settings (key, value, is_public, description) values
  ('booking.cancel_refund_schedule',
   '[{"min_days": 3, "pct": 90}, {"min_days": 2, "pct": 80}, {"min_days": 1, "pct": 50}, {"min_days": 0, "pct": 0}]',
   true, 'Persentase pengembalian paket saat pembatalan menurut hari sebelum kunjungan (H-3, H-2, H-1, H-0)'),
  ('booking.weather_reschedule_max', '3', true, 'Paling banyak berapa kali satu reservasi dijadwal ulang karena cuaca'),
  ('booking.weather_window_hours', '24', true, 'Berapa jam setelah pemberitahuan cuaca rombongan boleh memilih jadwal baru atau pengembalian'),
  ('midtrans.fee_qris_permille', 'null', false, 'Biaya Midtrans untuk QRIS dalam permil dari nominal (diisi superadmin)'),
  ('midtrans.fee_va_idr', 'null', false, 'Biaya Midtrans untuk Virtual Account dalam rupiah per transaksi (diisi superadmin)')
on conflict (key) do nothing;


-- The placeholder check of 0008 reads a bracketed value ("[nama pejabat]") as a placeholder; the refund schedule is a
-- JSON array, so only text values are tested now.
create or replace function internal.placeholder_site_settings() returns setof text
  language sql stable security definer
  set search_path = ''
as $$
  select s.key from public.site_settings s
  where jsonb_typeof(s.value) = 'string'
    and (s.value #>> '{}' ~* 'example\.invalid'
      or s.value #>> '{}' ~ '^\+620+$'
      or s.value #>> '{}' ~ '^\[.*\]$'
      or s.value #>> '{}' = 'BCA ****1234')
  order by s.key;
$$;
revoke execute on function internal.placeholder_site_settings() from public, anon, authenticated, service_role;

-- ===== Weather notices (A17) =====

-- One notice per session: an RW admin of the session's RW or the superadmin says the weather stopped it. The bookings on
-- it may then move or take the weather refund within booking.weather_window_hours. Written only by
-- public.declare_weather_disruption; append-only, audited.
create table public.weather_notices (
  id               uuid primary key default gen_random_uuid(),
  visit_session_id uuid not null unique references public.visit_sessions(id) on delete restrict,
  rw_id            smallint not null references public.rw_units(id),
  declared_by      uuid not null references public.profiles(id),
  declared_at      timestamptz not null default now(),
  reason           text check (reason is null or length(reason) between 1 and 300)
);
create index weather_notices_rw_idx on public.weather_notices (rw_id, declared_at);
alter table public.weather_notices enable row level security;
alter table public.weather_notices force row level security;
revoke all on public.weather_notices from anon, authenticated;
-- 0005 grants by column, so a column added later stays private until a migration grants it.
grant select (id, visit_session_id, rw_id, declared_by, declared_at, reason) on public.weather_notices to authenticated;
create policy weather_notices_staff_read on public.weather_notices for select to authenticated
  using ((select public.is_superadmin()) or (select public.owns_rw(rw_id)));
create policy weather_notices_aal2 on public.weather_notices as restrictive for all to authenticated
  using ((select public.aal2()));
create trigger append_only before update or delete on public.weather_notices
  for each row execute function internal.append_only();
create trigger log_audit after insert or update or delete on public.weather_notices
  for each row execute function internal.log_audit();

-- What a notice gives one booking (decision of 2026-10-25 on the weather, rules 1-3): the leg the weather stopped, the
-- window (booking.weather_window_hours from the notice), the moves used of booking.weather_reschedule_max and how it
-- ended. The rights belong to the booking and the notice, so a move keeps them: the leg may move again, or the
-- booking take the weather refund, until the window closes. resolution: refunded (the weather refund), cancelled (an
-- ordinary cancellation), kept (the window closed after a move), auto_refunded (the window closed with no choice, and
-- payments-poll requested the weather refund). Written only by the weather functions.
create table public.weather_notice_bookings (
  id             uuid primary key default gen_random_uuid(),
  notice_id      uuid not null references public.weather_notices(id) on delete restrict,
  booking_id     uuid not null references public.bookings(id) on delete restrict,
  booking_leg_id uuid not null references public.booking_legs(id) on delete restrict,
  rw_id          smallint not null references public.rw_units(id),
  open_until     timestamptz not null,
  moves_used     smallint not null default 0 check (moves_used >= 0),
  resolution     text check (resolution in ('refunded', 'cancelled', 'kept', 'auto_refunded')),
  resolved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (notice_id, booking_id),
  constraint weather_notice_bookings_resolved_ok check ((resolution is null) = (resolved_at is null))
);
create index weather_notice_bookings_booking_idx on public.weather_notice_bookings (booking_id);
create index weather_notice_bookings_open_idx on public.weather_notice_bookings (open_until)
  where resolved_at is null;
alter table public.weather_notice_bookings enable row level security;
alter table public.weather_notice_bookings force row level security;
revoke all on public.weather_notice_bookings from anon, authenticated;
grant select (id, notice_id, booking_id, booking_leg_id, rw_id, open_until, moves_used, resolution, resolved_at,
  created_at, updated_at) on public.weather_notice_bookings to authenticated;
create policy weather_notice_bookings_staff_read on public.weather_notice_bookings for select to authenticated
  using ((select public.is_superadmin()) or (select public.owns_rw(rw_id)));
create policy weather_notice_bookings_aal2 on public.weather_notice_bookings as restrictive for all to authenticated
  using ((select public.aal2()));
create trigger set_updated_at before update on public.weather_notice_bookings
  for each row execute function public.set_updated_at();
create trigger guard_status_writes before update on public.weather_notice_bookings
  for each row execute function internal.guard_status_writes('moves_used', 'resolution', 'open_until');
create trigger log_audit after insert or update or delete on public.weather_notice_bookings
  for each row execute function internal.log_audit();


-- ===== Refund requests (A16, A18) =====

create type public.refund_request_kind as enum ('cancellation', 'weather');
-- requested: written by the cancellation; a Virtual Account refund waits here for the treasurer's transfer.
-- submitted: Midtrans accepted the refund call (QRIS). failed: Midtrans refused it in so many words; the superadmin
-- takes over. A call that timed out or reached nobody leaves the request requested, for payments-poll to ask again.
-- recorded: the refund is booked (the refund notification, or record_refund for a transfer).
create type public.refund_request_status as enum ('requested', 'submitted', 'failed', 'recorded');

-- Money promised back, not money paid: a row is the refund the terms give at the moment of cancelling, the parts it is
-- made of, and how far it got. amount = package_refund + addon_refund for a cancellation; for the weather it is the
-- amount paid minus fee_amount. Only the transition functions write it; the parts never change once written.
create table public.refund_requests (
  id                   uuid primary key default gen_random_uuid(),
  booking_id           uuid not null references public.bookings(id) on delete restrict,
  payment_id           uuid not null references public.payments(id) on delete restrict,
  kind                 public.refund_request_kind not null,
  status               public.refund_request_status not null default 'requested',
  method               public.payment_method not null,
  refund_key           text not null unique check (refund_key ~ '^GSK-[0-9A-HJKMNP-TV-Z]{8}-[0-9]{2}-R[0-9]{2}$'),
  amount               bigint not null check (amount > 0),
  package_refund       bigint not null default 0 check (package_refund >= 0),
  addon_refund         bigint not null default 0 check (addon_refund >= 0),
  fee_amount           bigint not null default 0 check (fee_amount >= 0),
  refund_pct           smallint check (refund_pct between 0 and 100),
  days_before          integer,
  requested_by         uuid references public.profiles(id),
  requested_at         timestamptz not null default now(),
  submitted_at         timestamptz,
  recorded_at          timestamptz,
  provider_status_code text check (provider_status_code is null or provider_status_code ~ '^[0-9]{3}$'),
  failure_reason       text check (failure_reason is null or length(failure_reason) <= 200),
  -- Calls to Midtrans' refund API so far and when the last one was made: payments-poll asks again for a QRIS request
  -- no answer came for (review of PR #69, H1, M1).
  attempts             smallint not null default 0 check (attempts >= 0),
  last_attempt_at      timestamptz,
  updated_at           timestamptz not null default now(),
  constraint refund_requests_parts_ok check (
    (kind = 'cancellation' and amount = package_refund + addon_refund and fee_amount = 0)
    or (kind = 'weather' and package_refund = 0 and addon_refund = 0)),
  constraint refund_requests_stamps_ok check (
    (status <> 'submitted' or submitted_at is not null) and (status <> 'recorded' or recorded_at is not null))
);
-- One refund at a time per payment: a second waits until the first is booked.
create unique index refund_requests_one_open on public.refund_requests (payment_id)
  where status in ('requested', 'submitted', 'failed');
create index refund_requests_open_idx on public.refund_requests (status, requested_at)
  where status <> 'recorded';
alter table public.refund_requests enable row level security;
alter table public.refund_requests force row level security;
revoke all on public.refund_requests from anon, authenticated;
grant select (id, booking_id, payment_id, kind, status, method, refund_key, amount, package_refund, addon_refund,
  fee_amount, refund_pct, days_before, requested_by, requested_at, submitted_at, recorded_at, provider_status_code,
  failure_reason, attempts, last_attempt_at, updated_at) on public.refund_requests to authenticated;
create policy refund_requests_super_read on public.refund_requests for select to authenticated
  using ((select public.is_superadmin()));
create policy refund_requests_aal2 on public.refund_requests as restrictive for all to authenticated
  using ((select public.aal2()));
create trigger set_updated_at before update on public.refund_requests
  for each row execute function public.set_updated_at();
create trigger guard_status_writes before update on public.refund_requests
  for each row execute function internal.guard_status_writes('status');
create trigger log_audit after insert or update or delete on public.refund_requests
  for each row execute function internal.log_audit();

-- What a refund request is made of never changes after it is written, and no request is ever deleted.
create function internal.refund_requests_immutable_guard() returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'refund requests are never deleted' using errcode = '42501';
  end if;
  if (new.booking_id, new.payment_id, new.kind, new.method, new.refund_key, new.amount, new.package_refund,
      new.addon_refund, new.fee_amount, new.refund_pct, new.days_before, new.requested_by, new.requested_at)
     is distinct from
     (old.booking_id, old.payment_id, old.kind, old.method, old.refund_key, old.amount, old.package_refund,
      old.addon_refund, old.fee_amount, old.refund_pct, old.days_before, old.requested_by, old.requested_at) then
    raise exception 'a refund request keeps what it was written with' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function internal.refund_requests_immutable_guard() from public, anon, authenticated;
create trigger refund_requests_immutable_guard before update or delete on public.refund_requests
  for each row execute function internal.refund_requests_immutable_guard();

-- The refunds the superadmin still has to finish (A16: a Virtual Account waits for the treasurer's transfer and
-- record_refund; a refused QRIS refund too), for the finance screens of Task P4.7.03. security_invoker, so the
-- superadmin's own policies decide what it shows.
create view public.v_refund_requests_open with (security_invoker = true) as
select r.id, r.booking_id, b.booking_code, r.kind, r.status, r.method, r.amount, r.package_refund, r.addon_refund,
       r.fee_amount, r.refund_pct, r.days_before, r.requested_at, r.submitted_at, r.failure_reason, r.attempts,
       r.last_attempt_at
from public.refund_requests r
join public.bookings b on b.id = r.booking_id
where r.status <> 'recorded';
revoke all on public.v_refund_requests_open from anon, authenticated;
grant select on public.v_refund_requests_open to authenticated;
