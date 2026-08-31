-- 0001_init_schema.sql
-- The Portal: initial multi-tenant schema
-- Organisation and site scoping applied from the first migration, per project instructions.

create extension if not exists "pgcrypto";

-- ORGANISATIONS AND SITES

create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_test_tenant boolean not null default false,
  created_at timestamptz not null default now()
);

create table sites (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- USERS AND ROLES
-- Extends Supabase auth.users. One row per staff member per organisation.

create type user_role as enum ('platform_superuser', 'approved_provider', 'centre_director', 'educator');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organisation_id uuid references organisations(id) on delete cascade,
  site_id uuid references sites(id) on delete set null,
  full_name text not null,
  email text not null,
  role user_role not null,
  start_date date,
  created_at timestamptz not null default now()
);

-- POLICIES AND SOPs

create type policy_status as enum ('in_library', 'must_be_written', 'does_not_exist');
create type sop_status as enum ('existing', 'partial', 'new_sop_required', 'new_policy_and_sop_required', 'trained_not_documented');
create type signoff_type as enum ('self', 'supervisor');

create table policies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  status policy_status not null,
  is_parent_facing boolean not null default false,
  current_version integer not null default 1,
  created_at timestamptz not null default now()
);

create table sops (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  status sop_status not null,
  signoff_type signoff_type not null,
  priority integer,
  notes text,
  current_version integer not null default 1,
  created_at timestamptz not null default now()
);

-- Many-to-many: several SOPs are governed by more than one policy (e.g. Medication Handling
-- draws on both the medication and first aid policies). Do not assume one-to-one.
create table policy_sop_links (
  policy_id uuid not null references policies(id) on delete cascade,
  sop_id uuid not null references sops(id) on delete cascade,
  primary key (policy_id, sop_id)
);

-- SIGN-OFF AND APPROVAL RECORDS

create table sign_offs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  sop_id uuid not null references sops(id) on delete cascade,
  sop_version integer not null,
  comprehension_check_passed boolean,
  verified_by uuid references profiles(id),
  signed_at timestamptz not null default now()
);

create table policy_approvals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  policy_id uuid not null references policies(id) on delete cascade,
  policy_version integer not null,
  centre_director_id uuid references profiles(id),
  centre_director_approved_at timestamptz,
  approved_provider_id uuid references profiles(id),
  approved_provider_approved_at timestamptz,
  parent_notification_sent_at timestamptz
);

-- CREDENTIALS (generic: WWCC, external course completions, anything else)

create table credential_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text
);

insert into credential_types (name, description) values
  ('WWCC', 'Working with Children Check, placeholder field only, no live verification yet'),
  ('Gecko Training', 'External training provider, placeholder, no live integration yet');

create table external_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  integration_status text not null default 'placeholder'
);

insert into external_providers (name, integration_status) values
  ('Gecko Training', 'placeholder'),
  ('NQAITS', 'placeholder'),
  ('MYOB', 'placeholder'),
  ('Xero', 'placeholder');

create table credentials (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  credential_type_id uuid not null references credential_types(id),
  external_reference text,
  issue_date date,
  expiry_date date,
  verification_status text not null default 'unverified',
  source text
);

-- STAFF IMPORT

create table staff_import_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  source text not null check (source in ('manual', 'csv', 'myob', 'xero', 'nqaits')),
  raw_data jsonb not null,
  matched_user_id uuid references profiles(id),
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

-- NOTIFICATIONS

create table notification_rules (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  rule_type text not null check (rule_type in ('sop_incomplete', 'credential_expiring', 'policy_pending_signoff')),
  target_entity_id uuid,
  cadence interval not null default '7 days',
  last_sent timestamptz
);

-- ROW LEVEL SECURITY
-- Every organisation-scoped table gets RLS enabled and a policy that filters on
-- the calling user's organisation_id, read from their profile row.

alter table sites enable row level security;
alter table profiles enable row level security;
alter table policies enable row level security;
alter table sops enable row level security;
alter table sign_offs enable row level security;
alter table policy_approvals enable row level security;
alter table credentials enable row level security;
alter table staff_import_records enable row level security;
alter table notification_rules enable row level security;

create or replace function current_user_organisation_id()
returns uuid
language sql
security definer
stable
as $$
  select organisation_id from profiles where id = auth.uid();
$$;

create or replace function current_user_role()
returns user_role
language sql
security definer
stable
as $$
  select role from profiles where id = auth.uid();
$$;

-- Example RLS policy, repeat this pattern per table.
-- Platform superuser bypasses organisation scoping entirely.
create policy "org_isolation_sops" on sops
  for all
  using (
    current_user_role() = 'platform_superuser'
    or organisation_id = current_user_organisation_id()
  );

create policy "org_isolation_policies" on policies
  for all
  using (
    current_user_role() = 'platform_superuser'
    or organisation_id = current_user_organisation_id()
  );

create policy "org_isolation_sign_offs" on sign_offs
  for all
  using (
    current_user_role() = 'platform_superuser'
    or organisation_id = current_user_organisation_id()
  );

-- Repeat equivalent policies for sites, profiles, policy_approvals, credentials,
-- staff_import_records, notification_rules before moving past step 1 of the build sequence.
