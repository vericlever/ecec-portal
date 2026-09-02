-- 0027_hr_manager_role.sql
--
-- Step 16. The per-person HR sign-off flag grows: as well as sighting
-- onboarding documents, an HR manager uploads and replaces contracts and sees
-- the payroll and screening sections (Steps 17 and 18). Rename the flag to
-- match, and tighten the contracts write policy so Manager (policy) can no
-- longer upload, only Admin and an HR manager can.

alter table public.profiles rename column hr_verifier to hr_manager;

comment on column public.profiles.hr_manager is
  'Admin-controlled per-person flag. Grants: sighting onboarding documents, uploading and replacing contracts, and viewing the payroll and screening sections. Not tied to access tier or job role.';

-- can_verify() still gates document sighting; its body referenced the old
-- column name.
create or replace function public.can_verify(target_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.in_org(target_org)
     and (
       public.current_tier() = 'admin'
       or coalesce(
            (select hr_manager from public.profiles where id = (select auth.uid())),
            false)
     );
$$;

-- Contracts: Admin anywhere in the organisation, or an HR manager for staff at
-- their own service. Manager (policy) keeps read (contracts_select) but loses
-- write.
drop policy contracts_write on public.contracts;
create policy contracts_write on public.contracts
  for all
  using (
    public.is_admin(organisation_id)
    or (
      public.can_verify(organisation_id)
      and public.worker_service(profile_id) = public.current_service()
    )
  )
  with check (
    public.is_admin(organisation_id)
    or (
      public.can_verify(organisation_id)
      and public.worker_service(profile_id) = public.current_service()
    )
  );
