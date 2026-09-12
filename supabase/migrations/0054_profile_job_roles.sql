-- 0054_profile_job_roles.sql
--
-- Multi-role assignment: a profile can now hold more than one job role (an
-- "ed leader" might need both the Educator and Room Leader suites, per Home
-- page item "My Training"). profiles.job_role_id stays in the schema as a
-- "primary" role, kept in sync by setStaffJobRoles() as one of the assigned
-- roles (or null) so any reader not yet migrated to this table still gets a
-- reasonable single value rather than a stale or missing one. This junction
-- table is the source of truth for suite calculation, agreement targeting
-- and anywhere else that needs the full set of roles a person holds.

create table public.profile_job_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  job_role_id uuid not null references public.job_roles(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id),
  primary key (profile_id, job_role_id)
);

create index profile_job_roles_job_role_id_idx on public.profile_job_roles(job_role_id);

-- Backfill: everyone's existing single role becomes their first assigned one.
insert into public.profile_job_roles (profile_id, job_role_id, organisation_id)
select id, job_role_id, organisation_id
from public.profiles
where job_role_id is not null
on conflict do nothing;

alter table public.profile_job_roles enable row level security;

-- Same reach as profiles_select: your own row, or a leader within their reach.
create policy profile_job_roles_select on public.profile_job_roles
for select using (
  profile_id = (select auth.uid())
  or public.is_admin(organisation_id)
  or (
    public.is_manager(organisation_id)
    and exists (
      select 1 from public.profiles pr
      where pr.id = profile_id
        and (pr.service_id is null or pr.service_id = public.current_service())
    )
  )
);

-- Wide enough for BOTH app-level writers of this table: setStaffJobRoles()
-- (admin.staff.[profileId].actions.ts - admin anywhere, or hr_manager at the
-- person's service) AND assignStaffToRole()/removeStaffFromRole()
-- (admin.job-roles.actions.ts's canAssignRoles() - admin anywhere, a content
-- editor anywhere, OR hr_manager at the person's service). Missing the
-- can_edit_content branch here would let a content editor's call pass its
-- app-level check and then silently write zero rows at the database.
--
-- The with-check also independently confirms the row's organisation_id
-- actually matches the referenced profile's and job role's own org - the app
-- layer checks this too before writing, but organisation_id here is a plain
-- caller-supplied column (like everywhere else in this schema), not derived,
-- so RLS holding the same line on its own is what makes it a real boundary
-- rather than a value the app promises never to get wrong.
create policy profile_job_roles_write on public.profile_job_roles
for all using (
  public.is_admin(organisation_id)
  or public.can_edit_content(organisation_id)
  or (
    public.can_verify(organisation_id)
    and exists (
      select 1 from public.profiles pr
      where pr.id = profile_id and pr.service_id = public.current_service()
    )
  )
)
with check (
  exists (
    select 1 from public.profiles pr
    where pr.id = profile_id and pr.organisation_id = organisation_id
  )
  and exists (
    select 1 from public.job_roles jr
    where jr.id = job_role_id and jr.organisation_id = organisation_id
  )
  and (
    public.is_admin(organisation_id)
    or public.can_edit_content(organisation_id)
    or (
      public.can_verify(organisation_id)
      and exists (
        select 1 from public.profiles pr
        where pr.id = profile_id and pr.service_id = public.current_service()
      )
    )
  )
);
