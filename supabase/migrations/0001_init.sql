-- =============================================================================
-- AI Phone Receptionist — initial schema
--
-- Design notes:
--   * All tables have RLS enabled. The voice-service and any other trusted
--     backend uses the Supabase service-role key, which bypasses RLS by
--     design — so these policies only govern the admin dashboard (apps/web),
--     which authenticates real staff users via Supabase Auth.
--   * admin_roles gates every policy: only rows for a signed-in user present
--     in admin_roles can read/write business data through the anon/authenticated
--     client. There is no public/anonymous access to any table here.
--   * Money is stored as numeric to avoid floating point rounding.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type repair_ticket_status as enum (
  'received',
  'diagnosing',
  'awaiting_parts',
  'in_progress',
  'ready_for_pickup',
  'completed',
  'cancelled'
);

create type booking_status as enum ('requested', 'confirmed', 'cancelled', 'completed');

create type service_request_status as enum ('new', 'contacted', 'converted', 'closed');

create type call_outcome as enum (
  'completed_by_ai',
  'transferred_to_human',
  'transfer_failed_callback_taken',
  'abandoned',
  'error'
);

create type customer_request_type as enum (
  'pricing_inquiry',
  'repair_status',
  'booking',
  'service_request',
  'shop_information',
  'human_transfer',
  'other'
);

create type admin_role as enum ('admin', 'staff');

-- ---------------------------------------------------------------------------
-- admin_roles — gates dashboard access. Provisioned manually by a project
-- owner (see README) after a staff member signs up via Supabase Auth.
-- ---------------------------------------------------------------------------
create table admin_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role admin_role not null default 'staff',
  created_at timestamptz not null default now()
);

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admin_roles where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- shop_config — single source of truth for shop identity/policy. Enforced
-- as a singleton via the check constraint on id.
-- ---------------------------------------------------------------------------
create table shop_config (
  id integer primary key default 1 check (id = 1),
  shop_name text not null,
  address text not null,
  phone_number text not null,
  greeting text not null default '',
  hours jsonb not null default '[]'::jsonb,
  holidays jsonb not null default '[]'::jsonb,
  services jsonb not null default '[]'::jsonb,
  accepted_payment_methods jsonb not null default '[]'::jsonb,
  warranty_policy text not null default '',
  repair_policy text not null default '',
  human_transfer_number text not null,
  updated_at timestamptz not null default now()
);

alter table shop_config enable row level security;
create policy "admins manage shop_config" on shop_config for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- device_pricing — the ONLY approved source of repair pricing.
-- ---------------------------------------------------------------------------
create table device_pricing (
  id uuid primary key default gen_random_uuid(),
  model text not null,
  variant text,
  part text not null,
  quality text not null default 'standard',
  price numeric(10, 2) not null check (price >= 0),
  labor_charge numeric(10, 2) not null default 0 check (labor_charge >= 0),
  currency text not null default 'INR',
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint valid_date_range check (valid_until is null or valid_until > valid_from)
);

create index idx_device_pricing_lookup on device_pricing (model, part) where active;

alter table device_pricing enable row level security;
create policy "admins manage device_pricing" on device_pricing for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- part_availability
-- ---------------------------------------------------------------------------
create table part_availability (
  id uuid primary key default gen_random_uuid(),
  model text not null,
  part text not null,
  quality text not null default 'standard',
  in_stock boolean not null default false,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  unique (model, part, quality)
);

create index idx_part_availability_lookup on part_availability (model, part);

alter table part_availability enable row level security;
create policy "admins manage part_availability" on part_availability for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- customers — minimal PII, phone number is the natural key.
-- ---------------------------------------------------------------------------
create table customers (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,
  name text,
  created_at timestamptz not null default now()
);

create index idx_customers_phone on customers (phone_number);

alter table customers enable row level security;
create policy "admins manage customers" on customers for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- repair_tickets
-- ---------------------------------------------------------------------------
create table repair_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique,
  customer_id uuid not null references customers (id) on delete restrict,
  device_model text not null,
  issue text not null,
  status repair_ticket_status not null default 'received',
  estimated_price numeric(10, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_repair_tickets_customer on repair_tickets (customer_id);
create index idx_repair_tickets_ticket_number on repair_tickets (ticket_number);

alter table repair_tickets enable row level security;
create policy "admins manage repair_tickets" on repair_tickets for all using (is_admin()) with check (is_admin());

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger repair_tickets_set_updated_at
before update on repair_tickets
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- bookings / service_requests — idempotency_key lets the voice service
-- safely retry a tool call (e.g. after a network hiccup) without creating
-- duplicate records.
-- ---------------------------------------------------------------------------
create table bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete restrict,
  service text not null,
  requested_at timestamptz not null,
  status booking_status not null default 'requested',
  notes text,
  idempotency_key uuid unique,
  created_at timestamptz not null default now()
);

create index idx_bookings_customer on bookings (customer_id);
create index idx_bookings_requested_at on bookings (requested_at);

alter table bookings enable row level security;
create policy "admins manage bookings" on bookings for all using (is_admin()) with check (is_admin());

create table service_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete restrict,
  device_model text not null,
  issue text not null,
  status service_request_status not null default 'new',
  idempotency_key uuid unique,
  created_at timestamptz not null default now()
);

create index idx_service_requests_customer on service_requests (customer_id);
create index idx_service_requests_status on service_requests (status);

alter table service_requests enable row level security;
create policy "admins manage service_requests" on service_requests for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- calls — one row per phone call, minimal metadata only (no audio by
-- default; see docs/SECURITY.md for retention/consent considerations).
-- ---------------------------------------------------------------------------
create table calls (
  id uuid primary key default gen_random_uuid(),
  call_id text not null unique,
  provider_call_id text unique,
  caller_phone text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer,
  outcome call_outcome,
  transferred_to_human boolean not null default false,
  transfer_reason text,
  customer_request_type customer_request_type,
  created_service_request_id uuid references service_requests (id) on delete set null,
  created_booking_id uuid references bookings (id) on delete set null,
  error_code text,
  language_detected text
);

create index idx_calls_started_at on calls (started_at desc);
create index idx_calls_caller_phone on calls (caller_phone);

alter table calls enable row level security;
create policy "admins manage calls" on calls for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- call_events — structured, append-only observability trail per call.
-- Payload must never contain secrets; keep it to event metadata.
-- ---------------------------------------------------------------------------
create table call_events (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references calls (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_call_events_call_id on call_events (call_id, created_at);

alter table call_events enable row level security;
create policy "admins manage call_events" on call_events for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- webhook_events — idempotency ledger for inbound provider webhooks.
-- ---------------------------------------------------------------------------
create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

alter table webhook_events enable row level security;
create policy "admins read webhook_events" on webhook_events for select using (is_admin());
