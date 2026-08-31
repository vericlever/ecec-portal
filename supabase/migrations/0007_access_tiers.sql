-- 0007_access_tiers.sql
-- Step 4 rework (BUILD_PLAN v2).
--
--   * "sites" become "services" - the NQF / NQAITS term. Timboon and Mortlake
--     are two services of the Ready Set Go organisation.
--   * The user_role enum (educator / centre_director / approved_provider /
--     platform_superuser) is replaced by four fixed access tiers:
--       staff | manager_staff | manager_policy | admin
--     All four are organisation-scoped. There is no cross-organisation super
--     tier in this build; managing multiple organisations stays a seed / SQL
--     job for now.
--   * Access tier, job role and (later) NQAITS position are three separate
--     concepts. This migration adds the job-role structure (job_roles,
--     job_role_sops, profiles.job_role_id) so the two are never conflated, even
--     though the job-role management UI is a later step.
--   * comprehension_questions is created empty now so the parked feature does
--     not need a schema rework later.
--
-- Written to run once on the current schema (migrations 0001-0006 applied).

-- ---------------------------------------------------------------------------
-- 1. sites -> services
-- ---------------------------------------------------------------------------

alter table public.sites rename to services;

alter table public.profiles      rename column site_id to service_id;
alter table public.sign_offs     rename column site_id to service_id;
alter table public.policies      rename column site_id to service_id;
alter table public.sops          rename column site_id to service_id;
alter table public.policy_views  rename column site_id to service_id;

alter index if exists sites_organisation_id_idx   rename to services_organisation_id_idx;
alter index if exists profiles_site_id_idx        rename to profiles_service_id_idx;
alter index if exists sign_offs_site_id_idx       rename to sign_offs_service_id_idx;
alter index if exists policies_site_id_idx        rename to policies_service_id_idx;
alter index if exists sops_site_id_idx            rename to sops_service_id_idx;
alter index if exists policy_views_site_id_idx    rename to policy_views_service_id_idx;

comment on table public.services is
  'An approved service (a physical centre). Timboon and Mortlake are services of Ready Set Go.';
comment on column public.profiles.service_id is
  'The service a staff member or manager belongs to. Null for an organisation-wide admin.';
comment on column public.sops.service_id is
  'Null means the SOP applies at every service (multi-service). Set means that service only.';
comment on column public.policies.service_id is
  'Null means the policy applies at every service. Set means that service only.';

-- ---------------------------------------------------------------------------
-- 2. Drop every existing RLS policy and helper - they all reference the old
--    role model. Rebuilt in sections 6 and 7.
-- ---------------------------------------------------------------------------

do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

drop function if exists public.has_org_admin_access(uuid);
drop function if exists public.has_org_access(uuid);
drop function if exists public.is_platform_superuser();
drop function if exists public.current_user_role();
drop function if exists public.current_user_organisation_id();

-- ---------------------------------------------------------------------------
-- 3. Access tier enum, on profiles
-- ---------------------------------------------------------------------------

create type public.access_tier as enum (
  'staff',
  'manager_staff',
  'manager_policy',
  'admin'
);

alter table public.profiles add column access_tier public.access_tier;

update public.profiles set access_tier = case role
  when 'educator'           then 'staff'
  when 'centre_director'    then 'manager_staff'
  when 'approved_provider'  then 'admin'
  when 'platform_superuser' then 'admin'
end::public.access_tier;

alter table public.profiles
  alter column access_tier set not null,
  alter column access_tier set default 'staff';

alter table public.profiles drop column role;
drop type public.user_role;

comment on column public.profiles.access_tier is
  'What the person can do in the Portal. Separate from job role (which SOP suite applies) and from NQAITS position (the regulatory category).';

-- ---------------------------------------------------------------------------
-- 4. Job roles (structure only; management UI is a later step)
-- ---------------------------------------------------------------------------

create table public.job_roles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  is_placeholder boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organisation_id, name),
  unique (id, organisation_id)
);

comment on table public.job_roles is
  'A job a person does (Educator, Room Leader, Cook). Configurable per organisation. Determines the SOP suite a staff member must complete. Independent of access_tier.';
comment on column public.job_roles.is_placeholder is
  'True for starter roles created for every organisation that may have no SOPs attached yet (e.g. Kitchen, Cleaning).';

create table public.job_role_sops (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  job_role_id uuid not null,
  sop_id uuid not null,
  primary key (job_role_id, sop_id),
  foreign key (job_role_id, organisation_id)
    references public.job_roles(id, organisation_id) on delete cascade,
  foreign key (sop_id, organisation_id)
    references public.sops(id, organisation_id) on delete cascade
);

comment on table public.job_role_sops is
  'The SOP suite for a job role. Assigning a staff member a job role gives them every SOP linked here.';

alter table public.profiles
  add column job_role_id uuid references public.job_roles(id) on delete set null;

comment on column public.profiles.job_role_id is
  'The staff member''s job role. Drives which SOPs they must sign. A manager and a staff-tier user can hold the same job role.';

create index job_roles_organisation_id_idx on public.job_roles (organisation_id);
create index job_role_sops_organisation_id_idx on public.job_role_sops (organisation_id);
create index job_role_sops_sop_id_idx on public.job_role_sops (sop_id);
create index profiles_job_role_id_idx on public.profiles (job_role_id);

-- ---------------------------------------------------------------------------
-- 5. Comprehension questions - parked, schema only
-- ---------------------------------------------------------------------------

create table public.comprehension_questions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  sop_id uuid not null,
  sop_version integer not null,
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct_option integer,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (sop_id, organisation_id)
    references public.sops(id, organisation_id) on delete cascade
);

comment on table public.comprehension_questions is
  'Parked feature. Questions a staff member answers after reading a SOP. Unused until the comprehension-check step is picked up.';

create index comprehension_questions_sop_id_idx on public.comprehension_questions (sop_id);

-- ---------------------------------------------------------------------------
-- 6. Helper functions
-- SECURITY DEFINER so they read profiles without recursing through its RLS.
-- ---------------------------------------------------------------------------

create or replace function public.current_org()
returns uuid language sql stable security definer set search_path = '' as $$
  select organisation_id from public.profiles where id = (select auth.uid());
$$;

create or replace function public.current_tier()
returns public.access_tier language sql stable security definer set search_path = '' as $$
  select access_tier from public.profiles where id = (select auth.uid());
$$;

create or replace function public.current_service()
returns uuid language sql stable security definer set search_path = '' as $$
  select service_id from public.profiles where id = (select auth.uid());
$$;

-- Member of this organisation (any tier).
create or replace function public.in_org(target_org uuid)
returns boolean language sql stable set search_path = '' as $$
  select target_org is not null and target_org = public.current_org();
$$;

-- Manager (either kind) or admin, in this organisation.
create or replace function public.is_manager(target_org uuid)
returns boolean language sql stable set search_path = '' as $$
  select public.in_org(target_org)
     and public.current_tier() in ('manager_staff', 'manager_policy', 'admin');
$$;

-- Admin of this organisation.
create or replace function public.is_admin(target_org uuid)
returns boolean language sql stable set search_path = '' as $$
  select public.in_org(target_org) and public.current_tier() = 'admin';
$$;

-- May add or edit policies, SOPs and links: manager_policy or admin.
create or replace function public.can_edit_content(target_org uuid)
returns boolean language sql stable set search_path = '' as $$
  select public.in_org(target_org)
     and public.current_tier() in ('manager_policy', 'admin');
$$;

-- A manager's reach: their own service, plus organisation-wide rows. Admin: all.
create or replace function public.covers_service(target_org uuid, target_service uuid)
returns boolean language sql stable set search_path = '' as $$
  select public.is_admin(target_org)
      or (public.is_manager(target_org)
          and (target_service is null or target_service = public.current_service()));
$$;

grant execute on function
  public.current_org(), public.current_tier(), public.current_service(),
  public.in_org(uuid), public.is_manager(uuid), public.is_admin(uuid),
  public.can_edit_content(uuid), public.covers_service(uuid, uuid)
to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 7. RLS policies
-- ---------------------------------------------------------------------------

alter table public.job_roles               enable row level security;
alter table public.job_role_sops           enable row level security;
alter table public.comprehension_questions enable row level security;

-- organisations: a member sees their own. No one writes via RLS yet.
create policy organisations_select on public.organisations
  for select using (id = public.current_org());

-- services
create policy services_select on public.services
  for select using (public.in_org(organisation_id));
create policy services_write on public.services
  for all using (public.is_admin(organisation_id))
  with check (public.is_admin(organisation_id));

-- profiles
create policy profiles_select on public.profiles
  for select using (
    id = (select auth.uid())
    or public.is_admin(organisation_id)
    or (public.is_manager(organisation_id)
        and (service_id is null or service_id = public.current_service()))
  );
create policy profiles_write on public.profiles
  for all using (
    public.is_admin(organisation_id)
    or (public.is_manager(organisation_id) and service_id = public.current_service())
  )
  with check (
    public.is_admin(organisation_id)
    or (public.is_manager(organisation_id)
        and service_id = public.current_service()
        and access_tier = 'staff')
  );

-- policies / sops / links: everyone in the org reads; manager_policy + admin write.
create policy policies_select on public.policies
  for select using (public.in_org(organisation_id));
create policy policies_write on public.policies
  for all using (public.can_edit_content(organisation_id))
  with check (public.can_edit_content(organisation_id));

create policy sops_select on public.sops
  for select using (public.in_org(organisation_id));
create policy sops_write on public.sops
  for all using (public.can_edit_content(organisation_id))
  with check (public.can_edit_content(organisation_id));

create policy policy_sop_links_select on public.policy_sop_links
  for select using (public.in_org(organisation_id));
create policy policy_sop_links_write on public.policy_sop_links
  for all using (public.can_edit_content(organisation_id))
  with check (public.can_edit_content(organisation_id));

-- job roles
create policy job_roles_select on public.job_roles
  for select using (public.in_org(organisation_id));
create policy job_roles_write on public.job_roles
  for all using (public.can_edit_content(organisation_id))
  with check (public.can_edit_content(organisation_id));

create policy job_role_sops_select on public.job_role_sops
  for select using (public.in_org(organisation_id));
create policy job_role_sops_write on public.job_role_sops
  for all using (public.can_edit_content(organisation_id))
  with check (public.can_edit_content(organisation_id));

-- comprehension questions (parked)
create policy comprehension_questions_select on public.comprehension_questions
  for select using (public.in_org(organisation_id));
create policy comprehension_questions_write on public.comprehension_questions
  for all using (public.can_edit_content(organisation_id))
  with check (public.can_edit_content(organisation_id));

-- sign-offs: you see and write your own; managers see and act for their service;
-- admins across the organisation.
create policy sign_offs_select on public.sign_offs
  for select using (
    user_id = (select auth.uid())
    or public.covers_service(organisation_id, service_id)
  );
create policy sign_offs_insert on public.sign_offs
  for insert with check (
    public.in_org(organisation_id)
    and (user_id = (select auth.uid())
         or public.covers_service(organisation_id, service_id))
  );
create policy sign_offs_update on public.sign_offs
  for update using (
    user_id = (select auth.uid())
    or public.covers_service(organisation_id, service_id)
  )
  with check (
    user_id = (select auth.uid())
    or public.covers_service(organisation_id, service_id)
  );
create policy sign_offs_delete on public.sign_offs
  for delete using (public.covers_service(organisation_id, service_id));

-- policy views: same shape as sign-offs.
create policy policy_views_select on public.policy_views
  for select using (
    user_id = (select auth.uid())
    or public.covers_service(organisation_id, service_id)
  );
create policy policy_views_insert on public.policy_views
  for insert with check (
    public.in_org(organisation_id)
    and (user_id = (select auth.uid())
         or public.covers_service(organisation_id, service_id))
  );
create policy policy_views_update on public.policy_views
  for update using (
    user_id = (select auth.uid())
    or public.covers_service(organisation_id, service_id)
  )
  with check (
    user_id = (select auth.uid())
    or public.covers_service(organisation_id, service_id)
  );
create policy policy_views_delete on public.policy_views
  for delete using (public.covers_service(organisation_id, service_id));

-- policy approvals: manager_policy + admin
create policy policy_approvals_select on public.policy_approvals
  for select using (public.in_org(organisation_id));
create policy policy_approvals_write on public.policy_approvals
  for all using (public.can_edit_content(organisation_id))
  with check (public.can_edit_content(organisation_id));

-- credentials: managers and admin for now (staff self-service is a later step).
create policy credentials_select on public.credentials
  for select using (public.is_manager(organisation_id));
create policy credentials_write on public.credentials
  for all using (public.is_manager(organisation_id))
  with check (public.is_manager(organisation_id));

-- staff imports and notification rules: managers and admin.
create policy staff_import_records_all on public.staff_import_records
  for all using (public.is_manager(organisation_id))
  with check (public.is_manager(organisation_id));

create policy notification_rules_all on public.notification_rules
  for all using (public.is_manager(organisation_id))
  with check (public.is_manager(organisation_id));

-- platform lookups: any authenticated user reads; only seed / service role writes.
create policy credential_types_read on public.credential_types
  for select using ((select auth.uid()) is not null);
create policy external_providers_read on public.external_providers
  for select using ((select auth.uid()) is not null);
