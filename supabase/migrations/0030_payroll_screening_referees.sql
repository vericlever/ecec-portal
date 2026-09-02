-- 0030_payroll_screening_referees.sql
--
-- Step 18. The sensitive tail of onboarding: the ATO Tax File Number
-- declaration, superannuation, banking, pre-employment screening declarations,
-- and referees. These are visible only to Admin, an HR manager for staff at
-- their own service, and the staff member for their own record. A Manager
-- (staff) or Manager (policy) cannot see any of it, unlike the rest of the HR
-- record.

-- Admin anywhere in the organisation, or an HR manager for staff at their own
-- service. Tighter than can_manage_worker, which lets any manager through.
create or replace function public.can_manage_hr(
  target_org uuid,
  target_service uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_admin(target_org)
      or (public.can_verify(target_org)
          and target_service is not null
          and target_service = public.current_service());
$$;

grant execute on function public.can_manage_hr(uuid, uuid) to authenticated, anon;

-- Tax File Number declaration, superannuation and banking. One row per person.
create table public.worker_payroll (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  tfn text,
  claims_tax_free_threshold boolean,
  has_help_ssl_tsl_debt boolean,
  has_financial_supplement_debt boolean,
  super_fund_name text,
  super_member_number text,
  bank_bsb text,
  bank_account_number text,
  bank_account_name text,
  updated_at timestamptz not null default now(),
  foreign key (profile_id, organisation_id)
    references public.profiles(id, organisation_id) on delete cascade
);

create trigger worker_payroll_set_updated_at
  before update on public.worker_payroll
  for each row execute function public.set_updated_at();

-- Pre-employment screening declarations. The question text is snapshotted at
-- answer time, so re-wording a question later never rewrites what someone
-- previously declared.
create table public.worker_screening (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  child_protection_history boolean,
  child_protection_detail text,
  child_protection_question text,
  criminal_history boolean,
  criminal_detail text,
  criminal_question text,
  answered_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (profile_id, organisation_id)
    references public.profiles(id, organisation_id) on delete cascade
);

create trigger worker_screening_set_updated_at
  before update on public.worker_screening
  for each row execute function public.set_updated_at();

-- Referees. Two slots per person, upserted by slot.
create table public.worker_referees (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  slot smallint not null check (slot in (1, 2)),
  name text,
  organisation text,
  job_title text,
  relationship text,
  phone text,
  email text,
  check_completed_at date,
  check_completed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, slot),
  foreign key (profile_id, organisation_id)
    references public.profiles(id, organisation_id) on delete cascade
);

create trigger worker_referees_set_updated_at
  before update on public.worker_referees
  for each row execute function public.set_updated_at();

create index worker_referees_profile_id_idx
  on public.worker_referees (profile_id);

-- ---------------------------------------------------------------------------
-- RLS: the person for their own, otherwise Admin or an HR manager at the
-- person's service. No manager tier without the HR manager flag.
-- ---------------------------------------------------------------------------

alter table public.worker_payroll enable row level security;
alter table public.worker_screening enable row level security;
alter table public.worker_referees enable row level security;

create policy worker_payroll_rw on public.worker_payroll
  for all
  using (
    profile_id = (select auth.uid())
    or public.can_manage_hr(organisation_id, public.worker_service(profile_id))
  )
  with check (
    profile_id = (select auth.uid())
    or public.can_manage_hr(organisation_id, public.worker_service(profile_id))
  );

create policy worker_screening_rw on public.worker_screening
  for all
  using (
    profile_id = (select auth.uid())
    or public.can_manage_hr(organisation_id, public.worker_service(profile_id))
  )
  with check (
    profile_id = (select auth.uid())
    or public.can_manage_hr(organisation_id, public.worker_service(profile_id))
  );

-- Referees: the person fills them in, an HR manager or admin reads them and
-- records the check. Not visible to the person's manager tiers.
create policy worker_referees_rw on public.worker_referees
  for all
  using (
    profile_id = (select auth.uid())
    or public.can_manage_hr(organisation_id, public.worker_service(profile_id))
  )
  with check (
    profile_id = (select auth.uid())
    or public.can_manage_hr(organisation_id, public.worker_service(profile_id))
  );
