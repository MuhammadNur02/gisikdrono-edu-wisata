-- 0003_tables: every table of docs/PRD.md §8.4, group by group (Task P1.2.03–P1.2.13).
--
-- Every table is born with RLS enabled and forced and with no rights for anon or authenticated, so it
-- refuses everything until 0005_policies_grants adds its grants and policies (decision of 2026-10-16).
-- Policies, log_audit and append-only triggers come later because the helpers and internal.log_audit
-- they call are created in 0004_functions.

-- Keeps updated_at truthful on every update (docs/PRD.md §8.1, Task P1.2.13). Trigger functions are
-- never called directly, so nobody needs EXECUTE on it.
create function public.set_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ===== Configuration and staff (docs/PRD.md §8.4.1, Task P1.2.03) =====

-- rw_units (A): the neighbourhood units; public profile + private treasury columns.
create table public.rw_units (
  id                      smallint primary key,                                  -- 5, 8
  code                    text not null unique check (code ~ '^RW[0-9]{2}$'),    -- 'RW05'
  slug                    text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name                    text not null,                                         -- 'RW 05 Ecowastreme'
  theme_label             text not null,                                         -- 'Ekowisata & Lingkungan'
  tagline                 text,
  description_md          text,
  vision_md               text,
  hero_image_path         text,
  contact_phone           text check (contact_phone ~ '^\+62[0-9]{8,13}$'),
  contact_email           citext,
  treasury_bank_name      text,                                                  -- private: superadmin only
  treasury_account_number text,                                                  -- private
  treasury_account_holder text,                                                  -- private
  map_lat                 numeric(9,6),
  map_lng                 numeric(9,6),
  is_active               boolean not null default true,
  sort_order              smallint not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
alter table public.rw_units enable row level security;
alter table public.rw_units force row level security;
revoke all on public.rw_units from anon, authenticated;
create trigger set_updated_at before update on public.rw_units
  for each row execute function public.set_updated_at();

-- profiles (A): staff identity only, 1:1 with auth.users. Visitors never appear here.
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete restrict,
  email          citext not null unique,
  full_name      text not null,
  phone          text check (phone ~ '^\+62[0-9]{8,13}$'),
  role           public.app_role not null default 'none',
  rw_id          smallint references public.rw_units(id),
  is_active      boolean not null default true,
  mfa_required   boolean not null default true,
  claims_version integer not null default 1,        -- bumped on every role/RW/status change; copied into the JWT
  avatar_path    text,
  last_login_at  timestamptz,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint profiles_role_rw_ok check (
    (role = 'superadmin' and rw_id is null) or (role = 'admin_rw' and rw_id is not null) or (role = 'none' and rw_id is null))
);
create index profiles_rw_idx on public.profiles (rw_id) where is_active;
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
revoke all on public.profiles from anon, authenticated;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- staff_invites (A): invite-only onboarding; the code is shown once in the UI and stored hashed.
create table public.staff_invites (
  id               uuid primary key default gen_random_uuid(),
  email            citext not null,
  role             public.app_role not null check (role <> 'none'),
  rw_id            smallint references public.rw_units(id),
  invite_code_hash text not null unique,                      -- sha256(code)
  expires_at       timestamptz not null,                      -- created_at + 72 h
  accepted_at      timestamptz,
  accepted_user_id uuid references public.profiles(id),
  revoked_at       timestamptz,
  created_by       uuid not null references public.profiles(id),
  created_at       timestamptz not null default now(),
  constraint staff_invites_role_rw_ok check ((role = 'superadmin' and rw_id is null) or (role = 'admin_rw' and rw_id is not null))
);
create unique index staff_invites_open_email on public.staff_invites (email) where accepted_at is null and revoked_at is null;
alter table public.staff_invites enable row level security;
alter table public.staff_invites force row level security;
revoke all on public.staff_invites from anon, authenticated;

-- site_settings (A): typed jsonb key/value; is_public rows readable by anon. Keys listed in §8.6.
create table public.site_settings (
  key         text primary key check (key ~ '^[a-z0-9_.]+$'),
  value       jsonb not null,
  is_public   boolean not null default false,
  description text,
  updated_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now()
);
alter table public.site_settings enable row level security;
alter table public.site_settings force row level security;
revoke all on public.site_settings from anon, authenticated;
create trigger set_updated_at before update on public.site_settings
  for each row execute function public.set_updated_at();


-- ===== Sessions and quota (docs/PRD.md §8.4.2, Task P1.2.04) =====

-- session_templates (A): weekly recurring pattern per RW, materialised into visit_sessions.
create table public.session_templates (
  id         uuid primary key default gen_random_uuid(),
  rw_id      smallint not null references public.rw_units(id),
  weekday    smallint not null check (weekday between 0 and 6),             -- 0 = Sunday
  label      text not null,                                                 -- 'Sesi Pagi'
  start_time time not null,
  end_time   time not null check (end_time > start_time),
  capacity   integer not null check (capacity between 1 and 2000),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rw_id, weekday, start_time)
);
alter table public.session_templates enable row level security;
alter table public.session_templates force row level security;
revoke all on public.session_templates from anon, authenticated;
create trigger set_updated_at before update on public.session_templates
  for each row execute function public.set_updated_at();

-- visit_sessions (A): one bookable window per RW per date. reserved_pax is the quota counter.
create table public.visit_sessions (
  id             uuid primary key default gen_random_uuid(),
  rw_id          smallint not null references public.rw_units(id),
  session_date   date not null,
  start_time     time not null,
  end_time       time not null check (end_time > start_time),
  label          text not null,
  capacity       integer not null check (capacity >= 0),
  reserved_pax   integer not null default 0 check (reserved_pax >= 0),     -- written only by internal quota functions
  checked_in_pax integer not null default 0 check (checked_in_pax >= 0),   -- written only by check_in_ticket / undo_check_in
  status         public.session_status not null default 'open',
  template_id    uuid references public.session_templates(id) on delete set null,
  notes          text,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint visit_sessions_not_oversold check (reserved_pax <= capacity),
  unique (rw_id, session_date, start_time)
);
create index visit_sessions_avail_idx on public.visit_sessions (rw_id, session_date) where status = 'open';
-- trigger visit_sessions_guard: while reserved_pax > 0 forbid DELETE, status 'cancelled', and any change of
-- rw_id / session_date / start_time / end_time; capacity may not go below reserved_pax; logs security event
-- session_changed_with_bookings when label/notes/capacity change on a session with reservations.
alter table public.visit_sessions enable row level security;
alter table public.visit_sessions force row level security;
revoke all on public.visit_sessions from anon, authenticated;
create trigger set_updated_at before update on public.visit_sessions
  for each row execute function public.set_updated_at();


-- ===== Catalogue (docs/PRD.md §8.4.3, Task P1.2.05) =====

-- tour_packages (A)
create table public.tour_packages (
  id               uuid primary key default gen_random_uuid(),
  rw_id            smallint references public.rw_units(id),          -- NULL = kelurahan-owned (combo)
  category         public.package_category not null,
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name             text not null,
  tagline          text,
  description_md   text,
  highlights       text[] not null default '{}',
  inclusions       text[] not null default '{}',
  itinerary        jsonb not null default '[]',    -- [{"order":1,"rw_id":5,"time":"08:00","title":"…","description":"…"}]
  duration_minutes integer check (duration_minutes > 0),
  pricing_basis    public.pricing_basis not null default 'per_pax',
  price_per_pax    bigint check (price_per_pax >= 0),
  flat_price       bigint check (flat_price >= 0),
  min_pax          integer not null default 1 check (min_pax >= 1),
  max_pax          integer not null default 200 check (max_pax >= min_pax),
  image_paths      text[] not null default '{}',
  is_featured      boolean not null default false,
  status           public.content_status not null default 'draft',
  sort_order       smallint not null default 0,
  valid_from       date,
  valid_to         date,
  created_by       uuid references public.profiles(id),
  updated_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint tour_packages_price_ok check (
    (pricing_basis = 'per_pax' and price_per_pax is not null) or (pricing_basis = 'flat_group' and flat_price is not null)),
  constraint tour_packages_owner_ok check (
    (category = 'combo' and rw_id is null) or (category <> 'combo' and rw_id is not null))
);
create index tour_packages_public_idx on public.tour_packages (status, is_featured, sort_order);
create index tour_packages_rw_idx on public.tour_packages (rw_id);
-- trigger tour_packages_legs_guard: auto-insert the single leg for non-combo; block publishing a combo with < 2 distinct RW legs.
-- trigger tour_packages_price_floor: price_per_pax (and tiers) >= site_settings 'pricing.min_price_per_pax'.
-- trigger tour_packages_price_history: any change of price_per_pax / flat_price inserts package_price_history + security event price_changed.
alter table public.tour_packages enable row level security;
alter table public.tour_packages force row level security;
revoke all on public.tour_packages from anon, authenticated;
create trigger set_updated_at before update on public.tour_packages
  for each row execute function public.set_updated_at();

-- tour_package_legs: which RW(s) a package visits (1 row for RW packages, >= 2 for combo).
create table public.tour_package_legs (
  id               uuid primary key default gen_random_uuid(),
  package_id       uuid not null references public.tour_packages(id) on delete cascade,
  rw_id            smallint not null references public.rw_units(id),
  leg_order        smallint not null check (leg_order >= 1),
  duration_minutes integer,
  notes            text,
  unique (package_id, rw_id),
  unique (package_id, leg_order)
);
alter table public.tour_package_legs enable row level security;
alter table public.tour_package_legs force row level security;
revoke all on public.tour_package_legs from anon, authenticated;

-- tour_package_price_tiers: optional volume pricing; non-overlapping pax ranges per package.
create table public.tour_package_price_tiers (
  id            uuid primary key default gen_random_uuid(),
  package_id    uuid not null references public.tour_packages(id) on delete cascade,
  min_pax       integer not null check (min_pax >= 1),
  max_pax       integer check (max_pax >= min_pax),                        -- NULL = open-ended
  price_per_pax bigint not null check (price_per_pax >= 0),
  exclude using gist (package_id with =, int4range(min_pax, coalesce(max_pax, 100000), '[]') with &&)
);
alter table public.tour_package_price_tiers enable row level security;
alter table public.tour_package_price_tiers force row level security;
revoke all on public.tour_package_price_tiers from anon, authenticated;

-- package_price_history (AO): written by trigger on every price change.
create table public.package_price_history (
  id                bigint generated always as identity primary key,
  package_id        uuid not null references public.tour_packages(id),
  tier_id           uuid references public.tour_package_price_tiers(id) on delete set null,
  changed_by        uuid references public.profiles(id),
  old_price_per_pax bigint,
  new_price_per_pax bigint,
  old_flat_price    bigint,
  new_flat_price    bigint,
  reason            text,
  changed_at        timestamptz not null default now()
);
create index package_price_history_pkg_idx on public.package_price_history (package_id, changed_at desc);
alter table public.package_price_history enable row level security;
alter table public.package_price_history force row level security;
revoke all on public.package_price_history from anon, authenticated;

-- umkm_vendors (A): the micro-business / PKK unit behind products; revenue-share beneficiary.
create table public.umkm_vendors (
  id                  uuid primary key default gen_random_uuid(),
  rw_id               smallint not null references public.rw_units(id),
  slug                text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name                text not null,                                       -- 'PKK RW 05'
  owner_name          text,                                                -- private
  phone               text check (phone ~ '^\+62[0-9]{8,13}$'),            -- private
  description_md      text,
  logo_path           text,
  bank_name           text,                                                -- private: superadmin only (column grant + trigger)
  bank_account_number text,                                                -- private
  bank_account_holder text,                                                -- private
  is_active           boolean not null default true,
  created_by          uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.umkm_vendors enable row level security;
alter table public.umkm_vendors force row level security;
revoke all on public.umkm_vendors from anon, authenticated;
create trigger set_updated_at before update on public.umkm_vendors
  for each row execute function public.set_updated_at();

-- products_umkm (A): marketplace items and bookable add-ons (pre-order snacks / souvenirs). No stock tracking (made to order).
create table public.products_umkm (
  id                uuid primary key default gen_random_uuid(),
  rw_id             smallint not null references public.rw_units(id),
  vendor_id         uuid not null references public.umkm_vendors(id),
  slug              text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name              text not null,
  category          public.product_category not null,
  description_md    text,
  price             bigint not null check (price >= 0),
  unit_label        text not null default 'pcs',
  min_order_qty     integer not null default 1 check (min_order_qty >= 1),
  max_order_qty     integer check (max_order_qty >= min_order_qty),
  lead_time_days    smallint not null default 0,
  is_addon_eligible boolean not null default false,
  is_available      boolean not null default true,
  is_featured       boolean not null default false,
  image_paths       text[] not null default '{}',
  status            public.content_status not null default 'draft',
  sort_order        smallint not null default 0,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index products_umkm_public_idx on public.products_umkm (status, rw_id, is_addon_eligible);
-- trigger products_umkm_vendor_rw_guard: vendor.rw_id must equal products_umkm.rw_id.
alter table public.products_umkm enable row level security;
alter table public.products_umkm force row level security;
revoke all on public.products_umkm from anon, authenticated;
create trigger set_updated_at before update on public.products_umkm
  for each row execute function public.set_updated_at();


-- ===== Booking engine (docs/PRD.md §8.4.4, Task P1.2.06) =====

-- bookings (A): the reservation aggregate. Holds the only booker PII. Never deleted.
create table public.bookings (
  id                  uuid primary key default gen_random_uuid(),
  booking_code        text not null unique check (booking_code ~ '^GSK-[0-9A-HJKMNP-TV-Z]{8}$'),
  status              public.booking_status not null,
  channel             public.booking_channel not null default 'web',
  package_id          uuid not null references public.tour_packages(id) on delete restrict,
  package_snapshot    jsonb not null,                       -- {name, category, pricing_basis, unit_price, tier}
  rw_ids              smallint[] not null check (cardinality(rw_ids) >= 1),   -- RLS scope; immutable
  booker_type         public.booker_type not null,
  institution_name    text,
  pic_name            text not null,
  pic_phone           text not null check (pic_phone ~ '^\+62[0-9]{8,13}$'),
  pic_email           citext not null,
  pax_count           integer not null check (pax_count between 1 and 1000),
  visit_date          date not null,                        -- earliest leg date
  visit_date_end      date not null,                        -- latest leg date
  notes               text check (length(notes) <= 1000),
  subtotal_package    bigint not null check (subtotal_package >= 0),
  subtotal_addons     bigint not null default 0 check (subtotal_addons >= 0),
  discount_amount     bigint not null default 0 check (discount_amount >= 0),
  discount_note       text,
  total_amount        bigint not null,
  amount_paid         bigint not null default 0 check (amount_paid >= 0),
  currency            char(3) not null default 'IDR' check (currency = 'IDR'),
  expires_at          timestamptz,                          -- hold deadline; written once when the hold starts
  quoted_at           timestamptz,
  paid_at             timestamptz,
  checked_in_at       timestamptz,                          -- first leg check-in
  completed_at        timestamptz,
  cancelled_at        timestamptz,
  cancelled_by        uuid references public.profiles(id),
  cancel_reason       text,
  expired_at          timestamptz,
  refunded_at         timestamptz,
  needs_review        boolean not null default false,
  review_reason       text,
  phone_verified_at   timestamptz,                          -- set by internal.verify_phone_otp
  email_verified_at   timestamptz,                          -- set by one-click email confirmation
  consent_version     text not null,                        -- privacy notice version accepted
  consented_at        timestamptz not null,
  token_version       integer not null default 1,           -- bump to revoke every guest link
  idempotency_key     text unique,                          -- client UUID per wizard mount
  ticket_pdf_path     text,                                 -- documents/bookings/<id>/ticket-<code>.pdf
  admin_notes         text,                                 -- the only column staff may UPDATE directly
  created_by          uuid references public.profiles(id), -- staff id when channel = 'admin'
  source_ip           inet,
  user_agent          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint bookings_total_ok check (total_amount = subtotal_package + subtotal_addons - discount_amount and total_amount > 0),
  constraint bookings_hold_has_deadline check (status <> 'pending_payment' or expires_at is not null),
  constraint bookings_dates_ok check (visit_date_end >= visit_date)
);
create index bookings_status_expiry_idx on public.bookings (expires_at) where status = 'pending_payment';
create index bookings_visit_date_idx    on public.bookings (visit_date, status);
create index bookings_rw_ids_idx        on public.bookings using gin (rw_ids);
create index bookings_pic_phone_idx     on public.bookings (pic_phone);
create index bookings_pic_email_idx     on public.bookings (pic_email);
create index bookings_created_idx       on public.bookings (created_at desc);
create index bookings_search_idx        on public.bookings using gin ((coalesce(institution_name,'') || ' ' || pic_name) gin_trgm_ops);
-- trigger bookings_immutable_guard: rw_ids, package_id, booking_code, created_at, consent_version never change;
--   money columns frozen once paid_at is set; status only when app.in_rpc = '1'.
-- trigger bookings_discount_guard: discount columns only by superadmin while status in ('quoted','pending_payment').
alter table public.bookings enable row level security;
alter table public.bookings force row level security;
revoke all on public.bookings from anon, authenticated;
create trigger set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

-- booking_legs (A): one row per RW visited; holds the quota reservation state.
create table public.booking_legs (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references public.bookings(id) on delete restrict,
  rw_id             smallint not null references public.rw_units(id),
  visit_session_id  uuid not null references public.visit_sessions(id) on delete restrict,
  leg_order         smallint not null check (leg_order >= 1),
  pax_count         integer not null check (pax_count >= 1),
  status            public.booking_leg_status not null default 'unreserved',
  quota_reserved_at timestamptz,
  quota_released_at timestamptz,
  checked_in_at     timestamptz,
  unique (booking_id, rw_id),
  unique (booking_id, leg_order),
  constraint booking_legs_reserved_stamp check (status <> 'reserved' or quota_reserved_at is not null)
);
create index booking_legs_session_idx on public.booking_legs (visit_session_id, status);
create index booking_legs_rw_idx      on public.booking_legs (rw_id, visit_session_id);
alter table public.booking_legs enable row level security;
alter table public.booking_legs force row level security;
revoke all on public.booking_legs from anon, authenticated;

-- booking_addons: pre-ordered UMKM items with price snapshot (frozen after settlement).
create table public.booking_addons (
  id                    uuid primary key default gen_random_uuid(),
  booking_id            uuid not null references public.bookings(id) on delete restrict,
  product_id            uuid not null references public.products_umkm(id) on delete restrict,
  rw_id                 smallint not null references public.rw_units(id),
  vendor_id             uuid not null references public.umkm_vendors(id),
  product_name_snapshot text not null,
  unit_price            bigint not null check (unit_price >= 0),
  qty                   integer not null check (qty >= 1),
  line_total            bigint not null check (line_total = unit_price * qty),
  notes                 text,
  fulfillment_status    public.addon_fulfillment_status not null default 'pending',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (booking_id, product_id)
);
create index booking_addons_rw_idx on public.booking_addons (rw_id, fulfillment_status);
alter table public.booking_addons enable row level security;
alter table public.booking_addons force row level security;
revoke all on public.booking_addons from anon, authenticated;
create trigger set_updated_at before update on public.booking_addons
  for each row execute function public.set_updated_at();

-- booking_participants (A): optional participant list -> per-participant certificates. PII; purged visit_date + 90 d.
create table public.booking_participants (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete restrict,
  seq_no      integer not null check (seq_no >= 1),
  full_name   text not null check (length(full_name) between 2 and 120),   -- column encryption (PARTICIPANT_PII_KEYS) is a "should"
  group_label text check (length(group_label) <= 60),                      -- class / department
  role_label  text check (role_label in ('student','teacher','chaperone','participant')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (booking_id, seq_no)
);
alter table public.booking_participants enable row level security;
alter table public.booking_participants force row level security;
revoke all on public.booking_participants from anon, authenticated;
create trigger set_updated_at before update on public.booking_participants
  for each row execute function public.set_updated_at();

-- booking_events (AO): append-only status timeline written by every transition.
create table public.booking_events (
  id          bigint generated always as identity primary key,
  booking_id  uuid not null references public.bookings(id) on delete restrict,
  from_status public.booking_status,
  to_status   public.booking_status not null,
  actor_type  text not null check (actor_type in ('system','webhook','admin','cron','visitor')),
  actor_id    uuid,
  reason      text,
  payload     jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);
create index booking_events_booking_idx on public.booking_events (booking_id, occurred_at);
alter table public.booking_events enable row level security;
alter table public.booking_events force row level security;
revoke all on public.booking_events from anon, authenticated;

-- guest_otps: hashed one-time codes for phone verification and DSR identity; pruned after 24 h.
create table public.guest_otps (
  id           uuid primary key default gen_random_uuid(),
  purpose      public.otp_purpose not null,
  phone        text check (phone ~ '^\+62[0-9]{8,13}$'),
  email        citext,
  booking_id   uuid references public.bookings(id) on delete restrict,
  code_hash    text not null,                                   -- sha256(code || OTP_PEPPER || id)
  attempts     smallint not null default 0,
  max_attempts smallint not null default 5,
  expires_at   timestamptz not null,                            -- created_at + 5 min
  verified_at  timestamptz,
  consumed_at  timestamptz,
  ip           inet,
  created_at   timestamptz not null default now(),
  constraint guest_otps_target_ok check (phone is not null or email is not null)
);
create index guest_otps_phone_idx on public.guest_otps (phone, created_at desc);
alter table public.guest_otps enable row level security;
alter table public.guest_otps force row level security;
revoke all on public.guest_otps from anon, authenticated;
