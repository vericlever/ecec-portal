-- 0001_init_schema.sql
-- The Portal: initial multi-tenant schema.
--
-- Organisation and site scoping are applied from the first migration, not as a
-- later change. Row-level security is added in 0002_rls_policies.sql and indexes
-- in 0003_indexes.sql. Those three files together are step 1 of the build.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organisations and sites
-- An organisation is a tenant boundary. A site is a physical centre within an
-- organisation. They are different boundaries and are never conflated.
-- ---------------------------------------------------------------------------

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_test_tenant boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.organisations is
  'Tenant root. Every organisation-scoped table carries organisation_id and is filtered by RLS.';
comment on column public.organisations.is_test_tenant is
  'True for dummy tenants such as Science Kinder, used only to prove organisation-level RLS isolation.';

create trigger organisations_set_updated_at
  before update on public.organisations
  for each row execute function public.set_updated_at();

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, name),
  -- Target for the composite foreign keys that keep site-scoped rows in the
  -- same organisation as their site.
  unique (id, organisation_id)
);

create trigger sites_set_updated_at
  before update on public.sites
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Users and roles
-- profiles extends Supabase auth.users: one profile row per staff member.
-- Platform superusers (Understorey Learning) may have a null organisation_id;
-- they are not scoped to a tenant.
-- ---------------------------------------------------------------------------

create type public.user_role as enum (
  'platform_superuser',
  'approved_provider',
  'centre_director',
  'educator'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  full_name text not null,
  email text not null,
  role public.user_role not null,
  start_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Target for composite foreign keys from organisation-scoped user references.
  unique (id, organisation_id)
);

comment on column public.profiles.site_id is
  'Primary site the staff member is assigned to. Site and organisation are separate boundaries; this column is FK-checked against sites but not composite-checked against organisation_id, that consistency is enforced in the admin flow (step 4).';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Policies and SOPs
-- Two separate tiers, never conflated:
--   Policies  - govern, carry parent-facing obligations for a defined subset,
--               subject to Reg 172 parent notification at the policy tier only.
--   SOPs      - what staff train on and sign off against. All interactive
--               features (read-and-sign, text-to-speech, comprehension checks)
--               belong at the SOP tier only.
-- ---------------------------------------------------------------------------

create type public.policy_status as enum (
  'in_library',
  'must_be_written',
  'does_not_exist'
);

create type public.sop_status as enum (
  'existing',
  'partial',
  'new_sop_required',
  'new_policy_and_sop_required',
  'trained_not_documented'
);

create type public.signoff_type as enum ('self', 'supervisor');

create table public.policies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  status public.policy_status not null,
  is_parent_facing boolean not null default false,
  body text,
  current_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, name),
  unique (id, organisation_id)
);

comment on column public.policies.is_parent_facing is
  'True for the defined subset of policies that carry parent-facing obligations. Reg 172 notification only ever concerns these.';

create trigger policies_set_updated_at
  before update on public.policies
  for each row execute function public.set_updated_at();

create table public.sops (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  status public.sop_status not null,
  signoff_type public.signoff_type not null,
  priority integer,
  notes text,
  body text,
  current_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, name),
  unique (id, organisation_id)
);

comment on column public.sops.body is
  'The SOP content staff read and sign off against. Rendered by the SOP page (step 3).';

create trigger sops_set_updated_at
  before update on public.sops
  for each row execute function public.set_updated_at();

-- Many-to-many. Several SOPs are governed by more than one policy, so this is
-- never assumed to be one-to-one. The composite foreign keys force both sides of
-- a link to belong to the same organisation.
create table public.policy_sop_links (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  policy_id uuid not null,
  sop_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (policy_id, sop_id),
  foreign key (policy_id, organisation_id)
    references public.policies(id, organisation_id) on delete cascade,
  foreign key (sop_id, organisation_id)
    references public.sops(id, organisation_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Sign-off and approval records
-- ---------------------------------------------------------------------------

-- SOP read-and-sign. site_id is carried for site-specific sign-off reporting.
create table public.sign_offs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  user_id uuid not null,
  sop_id uuid not null,
  sop_version integer not null,
  comprehension_check_passed boolean,
  verified_by uuid references public.profiles(id) on delete set null,
  signed_at timestamptz not null default now(),
  foreign key (user_id, organisation_id)
    references public.profiles(id, organisation_id) on delete cascade,
  foreign key (sop_id, organisation_id)
    references public.sops(id, organisation_id) on delete cascade,
  -- One sign-off per staff member per SOP version. Re-signing a new version
  -- creates a new row.
  unique (user_id, sop_id, sop_version)
);

-- Policy approval workflow. A policy version is finalised only when both the
-- centre director and the approved provider have signed off. Reg 172 parent
-- notification (step 8) may only ever fire on a finalised row.
create table public.policy_approvals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  policy_id uuid not null,
  policy_version integer not null,
  centre_director_id uuid references public.profiles(id) on delete set null,
  centre_director_approved_at timestamptz,
  approved_provider_id uuid references public.profiles(id) on delete set null,
  approved_provider_approved_at timestamptz,
  finalised_at timestamptz,
  parent_notification_sent_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (policy_id, organisation_id)
    references public.policies(id, organisation_id) on delete cascade,
  unique (policy_id, policy_version)
);

comment on column public.policy_approvals.finalised_at is
  'Set only once both centre_director_approved_at and approved_provider_approved_at are recorded. The Reg 172 trigger (step 8) gates on this plus parent_notification_sent_at being null.';

-- ---------------------------------------------------------------------------
-- Credentials
-- One generic table for every credential type: WWCC, external course
-- completions (Gecko Training or equivalent), and any future type. Keyed to a
-- platform-level credential_types lookup, never one-off columns on profiles.
-- credential_types and external_providers are platform-level and not
-- organisation scoped.
-- ---------------------------------------------------------------------------

create table public.credential_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

insert into public.credential_types (name, description) values
  ('WWCC', 'Working with Children Check. Placeholder field only. No live verification against any external register yet.'),
  ('Gecko Training', 'External training provider completion. Named placeholder only, no live integration yet.');

create table public.external_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  integration_status text not null default 'placeholder'
    check (integration_status in ('placeholder', 'live')),
  created_at timestamptz not null default now()
);

insert into public.external_providers (name, integration_status) values
  ('Gecko Training', 'placeholder'),
  ('NQAITS', 'placeholder'),
  ('MYOB', 'placeholder'),
  ('Xero', 'placeholder');

create table public.credentials (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null,
  credential_type_id uuid not null references public.credential_types(id),
  external_provider_id uuid references public.external_providers(id),
  external_reference text,
  issue_date date,
  expiry_date date,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified', 'rejected', 'expired')),
  source text not null default 'manual'
    check (source in ('manual', 'csv', 'webhook')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, organisation_id)
    references public.profiles(id, organisation_id) on delete cascade
);

comment on column public.credentials.verification_status is
  'Manual states only. No automated verification exists for any credential type, including WWCC.';
comment on column public.credentials.source is
  'How the row was created. "webhook" is reserved for the external course completion receiver (step 10), which writes here without touching core schema.';

create trigger credentials_set_updated_at
  before update on public.credentials
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Staff import
-- CSV is the only path built end to end initially. myob, xero and nqaits are
-- accepted source values now so the schema does not need migrating when those
-- connectors are built.
-- ---------------------------------------------------------------------------

create table public.staff_import_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  source text not null check (source in ('manual', 'csv', 'myob', 'xero', 'nqaits')),
  raw_data jsonb not null,
  matched_user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'imported', 'rejected')),
  error_detail text,
  created_at timestamptz not null default now()
);

comment on column public.staff_import_records.error_detail is
  'Human-readable reason a row was rejected (missing email, unknown site, and so on), so failed rows are never silently dropped.';

-- ---------------------------------------------------------------------------
-- Notifications
-- Rule rows only. The reminder engine that reads them and sends through Resend
-- is step 6 and is not built here.
-- ---------------------------------------------------------------------------

create table public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  rule_type text not null
    check (rule_type in ('sop_incomplete', 'credential_expiring', 'policy_pending_signoff')),
  target_entity_id uuid,
  cadence interval not null default '7 days',
  is_active boolean not null default true,
  last_sent timestamptz,
  created_at timestamptz not null default now()
);

comment on column public.notification_rules.target_entity_id is
  'Optional narrowing of the rule to a single SOP, credential type or policy. Null means the rule applies organisation-wide.';
