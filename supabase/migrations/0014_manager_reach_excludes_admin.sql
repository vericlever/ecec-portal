-- 0014_manager_reach_excludes_admin.sql
--
-- A manager (manager_staff / manager_policy) should only reach person-scoped
-- records for staff at their own service. Two gaps let them reach further:
--
-- 1. covers_service() treated `target_service is null` as "organisation-wide,
--    visible to any manager". Every caller of covers_service is actually a
--    person record (sign_offs, policy_views, worker_details and the four
--    onboarding document tables), and a null service on those means the person
--    is unassigned - which is exactly the case for an admin account. So a
--    manager could open an admin's record and see their documents, probation
--    and sign-off history. Drop the null branch: a manager's reach is their
--    own non-null service, admins still reach everything.
--
-- 2. profiles_select let a manager see any profile with a null service, so the
--    admin account showed up in their staff list. Exclude admin-tier profiles
--    from the manager view (admins still see every profile).
--
-- Effect on unassigned staff: a staff member with no service_id is now visible
-- only to admins until they are assigned to a service. For the current tenants
-- every real staff member is already assigned, so there is no practical change.

create or replace function public.covers_service(target_org uuid, target_service uuid)
returns boolean language sql stable set search_path = '' as $$
  select public.is_admin(target_org)
      or (public.is_manager(target_org)
          and target_service is not null
          and target_service = public.current_service());
$$;

create or replace function public.can_manage_worker(
  target_org uuid,
  target_service uuid
)
returns boolean language sql stable set search_path = '' as $$
  select public.covers_service(target_org, target_service)
      or (public.can_verify(target_org)
          and target_service is not null
          and target_service = public.current_service());
$$;

drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    id = (select auth.uid())
    or public.is_admin(organisation_id)
    or (public.is_manager(organisation_id)
        and access_tier <> 'admin'
        and (service_id is null or service_id = public.current_service()))
  );
