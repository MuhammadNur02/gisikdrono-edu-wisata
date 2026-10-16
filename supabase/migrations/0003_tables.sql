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
