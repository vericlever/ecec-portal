-- 0002_rls_policies.sql
-- Row-level security for every table that holds tenant data.
--
-- Model:
--   * A platform superuser (Understorey Learning) bypasses organisation scoping
--     entirely.
--   * Everyone else is scoped to the organisation_id on their profile row.
--   * Reads are open to any member of the organisation. Writes to governing
--     data (sites, profiles, policies, SOPs, links, approvals, credentials,
--     imports, notification rules) are limited to organisation admins
--     (approved_provider, centre_director). Sign-offs may be written by the
--     staff member they belong to.
--   * Finer intra-organisation rules (which admin, invite flows, self-service
--     profile edits) are deliberately out of scope here and land in step 4.
--
-- credential_types and external_providers are platform-level lookups: readable
-- by any authenticated user, writable only by a platform superuser.

-- ---------------------------------------------------------------------------
-- Helper functions
-- SECURITY DEFINER so they can read profiles without recursing through the
-- profiles RLS policy. search_path is pinned and every reference is schema
-- qualified. auth.uid() is wrapped in a scalar subselect so the planner
-- evaluates it once per statement.
-- ---------------------------------------------------------------------------

create or replace function public.current_user_organisation_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organisation_id from public.profiles where id = (select auth.uid());
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create or replace function public.is_platform_superuser()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'platform_superuser'
  );
$$;

-- Non-definer wrappers used directly in policies. They call the definer
-- functions above for the privileged reads.
create or replace function public.has_org_access(target_org uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_platform_superuser()
      or (target_org is not null
          and target_org = public.current_user_organisation_id());
$$;

create or replace function public.has_org_admin_access(target_org uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_platform_superuser()
      or (target_org is not null
          and target_org = public.current_user_organisation_id()
          and public.current_user_role() in ('approved_provider', 'centre_director'));
$$;

grant execute on function
  public.current_user_organisation_id(),
  public.current_user_role(),
  public.is_platform_superuser(),
  public.has_org_access(uuid),
  public.has_org_admin_access(uuid)
to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

alter table public.organisations        enable row level security;
alter table public.sites                enable row level security;
alter table public.profiles             enable row level security;
alter table public.policies             enable row level security;
alter table public.sops                 enable row level security;
alter table public.policy_sop_links     enable row level security;
alter table public.sign_offs            enable row level security;
alter table public.policy_approvals     enable row level security;
alter table public.credential_types     enable row level security;
alter table public.external_providers   enable row level security;
alter table public.credentials          enable row level security;
alter table public.staff_import_records enable row level security;
alter table public.notification_rules   enable row level security;

-- ---------------------------------------------------------------------------
-- organisations
-- A member sees only their own organisation. Only a platform superuser can
-- create, rename or delete organisations.
-- ---------------------------------------------------------------------------

create policy organisations_select on public.organisations
  for select
  using (public.is_platform_superuser() or id = public.current_user_organisation_id());

create policy organisations_modify on public.organisations
  for all
  using (public.is_platform_superuser())
  with check (public.is_platform_superuser());

-- ---------------------------------------------------------------------------
-- sites
-- ---------------------------------------------------------------------------

create policy sites_select on public.sites
  for select using (public.has_org_access(organisation_id));

create policy sites_modify on public.sites
  for all
  using (public.has_org_admin_access(organisation_id))
  with check (public.has_org_admin_access(organisation_id));

-- ---------------------------------------------------------------------------
-- profiles
-- A member always sees their own row and every other row in their organisation.
-- Only organisation admins (or a superuser) may create or change profiles.
-- ---------------------------------------------------------------------------

create policy profiles_select on public.profiles
  for select
  using (id = (select auth.uid()) or public.has_org_access(organisation_id));

create policy profiles_modify on public.profiles
  for all
  using (public.has_org_admin_access(organisation_id))
  with check (public.has_org_admin_access(organisation_id));

-- ---------------------------------------------------------------------------
-- policies / sops / policy_sop_links
-- ---------------------------------------------------------------------------

create policy policies_select on public.policies
  for select using (public.has_org_access(organisation_id));
create policy policies_modify on public.policies
  for all
  using (public.has_org_admin_access(organisation_id))
  with check (public.has_org_admin_access(organisation_id));

create policy sops_select on public.sops
  for select using (public.has_org_access(organisation_id));
create policy sops_modify on public.sops
  for all
  using (public.has_org_admin_access(organisation_id))
  with check (public.has_org_admin_access(organisation_id));

create policy policy_sop_links_select on public.policy_sop_links
  for select using (public.has_org_access(organisation_id));
create policy policy_sop_links_modify on public.policy_sop_links
  for all
  using (public.has_org_admin_access(organisation_id))
  with check (public.has_org_admin_access(organisation_id));

-- ---------------------------------------------------------------------------
-- sign_offs
-- Any organisation member may read sign-offs for their organisation. A staff
-- member may create and amend their own sign-off; admins may act for anyone in
-- the organisation. Only admins may delete.
-- ---------------------------------------------------------------------------

create policy sign_offs_select on public.sign_offs
  for select using (public.has_org_access(organisation_id));

create policy sign_offs_insert on public.sign_offs
  for insert
  with check (
    public.has_org_access(organisation_id)
    and (user_id = (select auth.uid()) or public.has_org_admin_access(organisation_id))
  );

create policy sign_offs_update on public.sign_offs
  for update
  using (public.has_org_access(organisation_id))
  with check (
    public.has_org_access(organisation_id)
    and (user_id = (select auth.uid()) or public.has_org_admin_access(organisation_id))
  );

create policy sign_offs_delete on public.sign_offs
  for delete using (public.has_org_admin_access(organisation_id));

-- ---------------------------------------------------------------------------
-- policy_approvals
-- ---------------------------------------------------------------------------

create policy policy_approvals_select on public.policy_approvals
  for select using (public.has_org_access(organisation_id));
create policy policy_approvals_modify on public.policy_approvals
  for all
  using (public.has_org_admin_access(organisation_id))
  with check (public.has_org_admin_access(organisation_id));

-- ---------------------------------------------------------------------------
-- credentials
-- Readable across the organisation (a director needs to see what is expiring).
-- Writable by admins only in this phase; the step 10 webhook receiver uses the
-- service role and bypasses RLS.
-- ---------------------------------------------------------------------------

create policy credentials_select on public.credentials
  for select using (public.has_org_access(organisation_id));
create policy credentials_modify on public.credentials
  for all
  using (public.has_org_admin_access(organisation_id))
  with check (public.has_org_admin_access(organisation_id));

-- ---------------------------------------------------------------------------
-- staff_import_records / notification_rules
-- Administrative data. Admin-only for both read and write.
-- ---------------------------------------------------------------------------

create policy staff_import_records_all on public.staff_import_records
  for all
  using (public.has_org_admin_access(organisation_id))
  with check (public.has_org_admin_access(organisation_id));

create policy notification_rules_all on public.notification_rules
  for all
  using (public.has_org_admin_access(organisation_id))
  with check (public.has_org_admin_access(organisation_id));

-- ---------------------------------------------------------------------------
-- Platform-level lookups
-- ---------------------------------------------------------------------------

create policy credential_types_read on public.credential_types
  for select using ((select auth.uid()) is not null);
create policy credential_types_modify on public.credential_types
  for all
  using (public.is_platform_superuser())
  with check (public.is_platform_superuser());

create policy external_providers_read on public.external_providers
  for select using ((select auth.uid()) is not null);
create policy external_providers_modify on public.external_providers
  for all
  using (public.is_platform_superuser())
  with check (public.is_platform_superuser());
