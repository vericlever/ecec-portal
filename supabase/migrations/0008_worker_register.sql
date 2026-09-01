-- 0008_worker_register.sql
-- Step 5a: the NQAITS Worker Register schema.
--
-- Full field detail and the verified dropdown lists are in
-- STAFF_ONBOARDING_NQAITS.md. In short:
--   * worker_details holds one row per staff member: personal and contact
--     details, home and postal address, position, WWCC exemption.
--   * wwcc_checks / teacher_registrations / qualifications / training_records
--     hold the repeating structures. The six training categories share the one
--     training_records table (training_type column), not six tables.
--   * Each verifiable record carries sighted_at / sighted_by. The staff member
--     enters the document details; a person with the HR sign-off flag records
--     that they have physically sighted the document during onboarding. A
--     trigger stops anyone without that flag (or admin) from setting those two
--     fields. The flag is a per-person toggle an admin controls
--     (profiles.hr_verifier), deliberately not tied to job role or access tier,
--     so organisations can assign it however suits them.
--   * Enum labels are the exact NQAITS strings so import and export line up with
--     the Worker Register template without re-mapping.
--   * The three role concepts stay separate: access_tier (0007), job_role
--     (0007), and nqaits_position (here).

-- ---------------------------------------------------------------------------
-- Enums (NQAITS validation lists)
-- ---------------------------------------------------------------------------

create type public.title_prefix as enum
  ('Br', 'Dr', 'Fr', 'Master', 'Miss', 'Mr', 'Mrs', 'Ms', 'Sr', 'Mx');

create type public.nqaits_position as enum
  ('Educator', 'Volunteer', 'Student', 'Non-Educator Staff',
   'Early Childhood Teacher', 'Co-ordinator', 'Assistant', 'Contractor');

create type public.non_educator_role as enum
  ('Bus Driver', 'Centre Director', 'Cook', 'Cleaner', 'Gardener', 'Other');

create type public.au_state as enum
  ('ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA');

create type public.qualification_type as enum
  ('Certificate III', 'Certificate IV', 'Diploma', 'ECT', 'Degree', 'Masters');

create type public.sighted_by as enum ('Provider', 'Nominated Supervisor');

create type public.employment_nature as enum ('Direct', 'Indirect');

create type public.training_type as enum
  ('First Aid', 'Anaphylaxis', 'Asthma', 'Child Safety', 'Child Protection', 'Other');

create type public.service_type as enum ('Centre Based Day Care', 'Family Day Care');

alter table public.services
  add column service_type public.service_type not null default 'Centre Based Day Care';

-- HR sign-off: whoever an admin flags here can record that onboarding documents
-- have been sighted. A per-person toggle, independent of access tier and job
-- role. Admins always have it implicitly.
alter table public.profiles
  add column hr_verifier boolean not null default false;

comment on column public.profiles.hr_verifier is
  'Admin-controlled toggle. When true, this person can sight and verify onboarding documents (WWCC, qualifications, training). Not tied to access tier or job role.';

-- ---------------------------------------------------------------------------
-- worker_details (one row per staff member)
-- ---------------------------------------------------------------------------

create table public.worker_details (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,

  -- personal and contact
  ref_number text,
  title public.title_prefix,
  first_name text,
  middle_name text,
  last_name text,
  previously_known_as text,
  other_names text,
  date_of_birth date,
  phone text,
  mobile text,

  -- home address
  home_line1 text,
  home_line2 text,
  home_suburb text,
  home_state public.au_state,
  home_postcode text,

  -- postal address (defaults to same as home)
  postal_same_as_home boolean not null default true,
  postal_line1 text,
  postal_line2 text,
  postal_suburb text,
  postal_state public.au_state,
  postal_postcode text,

  -- Family Day Care address (only for FDC services)
  fdc_location_type text,
  fdc_venue_address_id text,
  fdc_residence_line1 text,
  fdc_residence_line2 text,
  fdc_residence_suburb text,
  fdc_residence_state public.au_state,
  fdc_residence_postcode text,

  -- position details
  nqaits_position public.nqaits_position,
  non_educator_role public.non_educator_role,
  employment_nature public.employment_nature,
  on_probation boolean,

  -- WWCC exemption
  wwcc_exempt boolean not null default false,
  wwcc_exemption_reason text,

  -- qualifications
  has_no_qualifications boolean not null default false,

  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.worker_details is
  'One row per staff member: the NQAITS Worker Register personal, address and position fields. Filled by the staff member during onboarding.';

create trigger worker_details_set_updated_at
  before update on public.worker_details
  for each row execute function public.set_updated_at();

-- Keep profiles.full_name in step with the worker's entered name.
create or replace function public.sync_profile_name()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(new.first_name, '') <> '' or coalesce(new.last_name, '') <> '' then
    update public.profiles
    set full_name = trim(both ' ' from
          coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, ''))
    where id = new.profile_id;
  end if;
  return new;
end $$;

create trigger worker_details_sync_name
  after insert or update of first_name, last_name on public.worker_details
  for each row execute function public.sync_profile_name();

-- ---------------------------------------------------------------------------
-- Verifiable records
-- ---------------------------------------------------------------------------

create table public.wwcc_checks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  check_number text,
  expiry_date date,
  state_of_issue public.au_state,
  sighted_at date,
  sighted_by public.sighted_by,
  created_at timestamptz not null default now()
);

create table public.teacher_registrations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  check_number text,
  expiry_date date,
  state_of_issue public.au_state,
  sighted_at date,
  sighted_by public.sighted_by,
  created_at timestamptz not null default now()
);

create table public.qualifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  qualification_type public.qualification_type,
  rto_name text,
  rto_number text,
  course_code text,
  working_towards boolean not null default false,
  date_attained date,
  date_commenced date,
  sighted_at date,
  sighted_by public.sighted_by,
  created_at timestamptz not null default now()
);

create table public.training_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  training_type public.training_type not null,
  other_description text,
  rto_name text,
  rto_number text,
  course_code text,
  date_attained date,
  expiry_date date,
  sighted_at date,
  sighted_by public.sighted_by,
  created_at timestamptz not null default now()
);

comment on table public.training_records is
  'First Aid, Anaphylaxis, Asthma, Child Safety, Child Protection and Other training - one table, training_type column. Feeds staff self-service training tracking (step 10).';

create index worker_details_organisation_id_idx on public.worker_details (organisation_id);
create index wwcc_checks_profile_id_idx on public.wwcc_checks (profile_id);
create index teacher_registrations_profile_id_idx on public.teacher_registrations (profile_id);
create index qualifications_profile_id_idx on public.qualifications (profile_id);
create index training_records_profile_id_idx on public.training_records (profile_id);
create index wwcc_checks_unsighted_idx on public.wwcc_checks (organisation_id) where sighted_at is null;
create index teacher_registrations_unsighted_idx on public.teacher_registrations (organisation_id) where sighted_at is null;
create index qualifications_unsighted_idx on public.qualifications (organisation_id) where sighted_at is null;
create index training_records_unsighted_idx on public.training_records (organisation_id) where sighted_at is null;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The service a staff member belongs to (for RLS on their records).
create or replace function public.worker_service(p_profile uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select service_id from public.profiles where id = p_profile;
$$;

-- May record that a document has been sighted: an admin, or anyone an admin has
-- given the HR sign-off flag.
create or replace function public.can_verify(target_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.in_org(target_org)
     and (
       public.current_tier() = 'admin'
       or coalesce(
            (select hr_verifier from public.profiles where id = (select auth.uid())),
            false)
     );
$$;

grant execute on function public.worker_service(uuid), public.can_verify(uuid)
  to authenticated, anon;

-- Stops a non-verifier (typically the staff member themselves) from setting or
-- changing sighted_at / sighted_by. Trusted server-side callers (auth.uid()
-- null) are not restricted.
create or replace function public.protect_sighted_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if public.can_verify(new.organisation_id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.sighted_at := null;
    new.sighted_by := null;
  elsif tg_op = 'UPDATE' then
    new.sighted_at := old.sighted_at;
    new.sighted_by := old.sighted_by;
  end if;
  return new;
end $$;

create trigger wwcc_checks_protect_sighted
  before insert or update on public.wwcc_checks
  for each row execute function public.protect_sighted_fields();
create trigger teacher_registrations_protect_sighted
  before insert or update on public.teacher_registrations
  for each row execute function public.protect_sighted_fields();
create trigger qualifications_protect_sighted
  before insert or update on public.qualifications
  for each row execute function public.protect_sighted_fields();
create trigger training_records_protect_sighted
  before insert or update on public.training_records
  for each row execute function public.protect_sighted_fields();

-- ---------------------------------------------------------------------------
-- RLS
-- A staff member reads and writes their own record. Managers and Directors see
-- and act on records for staff at their service. Setting sighted_at /
-- sighted_by is additionally gated by the trigger above.
-- ---------------------------------------------------------------------------

alter table public.worker_details        enable row level security;
alter table public.wwcc_checks           enable row level security;
alter table public.teacher_registrations enable row level security;
alter table public.qualifications        enable row level security;
alter table public.training_records      enable row level security;

create policy worker_details_rw on public.worker_details
  for all
  using (
    profile_id = (select auth.uid())
    or public.covers_service(organisation_id, public.worker_service(profile_id))
  )
  with check (
    profile_id = (select auth.uid())
    or public.covers_service(organisation_id, public.worker_service(profile_id))
  );

do $$
declare t text;
begin
  foreach t in array array['wwcc_checks', 'teacher_registrations', 'qualifications', 'training_records']
  loop
    execute format($f$
      create policy %1$s_rw on public.%1$s
        for all
        using (
          profile_id = (select auth.uid())
          or public.covers_service(organisation_id, public.worker_service(profile_id))
        )
        with check (
          profile_id = (select auth.uid())
          or public.covers_service(organisation_id, public.worker_service(profile_id))
        )
    $f$, t);
  end loop;
end $$;
