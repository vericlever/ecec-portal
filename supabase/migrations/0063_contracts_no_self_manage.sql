-- 0063_contracts_no_self_manage.sql
--
-- Raised while making Admin accounts visible as full staff members (they now
-- appear on /admin/staff with their own row, so an Admin can reach their own
-- staff record the same way anyone else's is reached). contracts_write
-- (migration 0027) grants any HR-manager-flagged account write access to
-- contracts at their own service with no check that the contract being
-- written is their own - an HR manager (or an Admin) could already upload or
-- replace their own employment contract before this fix, admins included.
--
-- Zeke's instruction: only an Admin may manage their own contract (there is
-- no higher tier to do it for them); every other tier is locked out of
-- self-management, HR-manager flag or not. Signing (sign_own_contract) is
-- unaffected - that is the contract owner accepting terms someone else
-- uploaded, not managing the record, and already has its own dedicated
-- SECURITY DEFINER path (migration 0044).

drop policy contracts_write on public.contracts;
create policy contracts_write on public.contracts
  for all
  using (
    public.is_admin(organisation_id)
    or (
      public.can_verify(organisation_id)
      and public.worker_service(profile_id) = public.current_service()
      and profile_id <> (select auth.uid())
    )
  )
  with check (
    public.is_admin(organisation_id)
    or (
      public.can_verify(organisation_id)
      and public.worker_service(profile_id) = public.current_service()
      and profile_id <> (select auth.uid())
    )
  );
