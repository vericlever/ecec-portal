-- 0044_rls_for_app_write_paths.sql
--
-- Every Server Action so far has done its own tier check in TypeScript and then
-- written through the service-role client, which bypasses RLS entirely -
-- meaning nothing in the database actually enforces the boundary the app
-- believes it is enforcing. This migration brings the policies up to the real
-- shape of the app's write paths so the Server Actions can be switched to the
-- caller's own RLS-scoped client instead. Three real gaps found along the way:
--
-- 1. documents_write only allowed content editors, but the same table also
--    takes contract, identity and sop_evidence uploads from HR managers,
--    plain managers and staff uploading their own ID - none of them content
--    editors. Replaced with a per-owner-type policy that mirrors the write
--    gate each of those document kinds already has on its own table.
-- 2. sop_history and sop_observations had a read policy but no write policy
--    at all - every insert into them has only ever worked because of the
--    service-role bypass.
-- 3. profiles_write didn't recognise a content editor acting org-wide, or an
--    hr_manager-flagged account without a manager access_tier, both of which
--    the app already allows for job-role assignment.
--
-- Contract self-sign/countersign and the SOP-observation review flag are each
-- a narrow, single-purpose write on an otherwise locked-down row (a staff
-- member may sign their own contract but not edit its terms; a manager may
-- flag a SOP for review but not edit its content) - not something a blanket
-- table policy can express, so those go through a SECURITY DEFINER function
-- instead, same pattern as the existing visible_published_policies function.

-- 1. documents_write: per-owner-type, mirroring each owner table's own write
-- policy rather than a single organisation-wide content-editor check.
drop policy if exists documents_write on public.documents;

create policy documents_write on public.documents
for all
using (
  in_org(organisation_id) and (
    (owner_type in ('policy', 'sop') and can_edit_content(organisation_id))
    or (
      owner_type = 'contract'
      and exists (
        select 1 from public.contracts c
        where c.id = documents.owner_id
          and (
            is_admin(c.organisation_id)
            or (can_verify(c.organisation_id) and worker_service(c.profile_id) = current_service())
          )
      )
    )
    or (
      owner_type = 'identity'
      and exists (
        select 1 from public.identity_documents d
        where d.id = documents.owner_id
          and (
            d.profile_id = (select auth.uid())
            or can_manage_worker(d.organisation_id, worker_service(d.profile_id))
          )
      )
    )
    or (owner_type in ('credential', 'sop_evidence') and is_manager(organisation_id))
  )
)
with check (
  in_org(organisation_id) and (
    (owner_type in ('policy', 'sop') and can_edit_content(organisation_id))
    or (
      owner_type = 'contract'
      and exists (
        select 1 from public.contracts c
        where c.id = documents.owner_id
          and (
            is_admin(c.organisation_id)
            or (can_verify(c.organisation_id) and worker_service(c.profile_id) = current_service())
          )
      )
    )
    or (
      owner_type = 'identity'
      and exists (
        select 1 from public.identity_documents d
        where d.id = documents.owner_id
          and (
            d.profile_id = (select auth.uid())
            or can_manage_worker(d.organisation_id, worker_service(d.profile_id))
          )
      )
    )
    or (owner_type in ('credential', 'sop_evidence') and is_manager(organisation_id))
  )
);

-- 2. Write policies for sop_history and sop_observations (read-only before).
-- sop_history takes rows from two different privilege levels: content editors
-- logging an edit/period_change/review event (sops/actions.ts), and any
-- manager logging the "review" event that comes from a procedure outcome
-- (observations/actions.ts) - so this allows either, not just content editors.
create policy sop_history_write on public.sop_history
for insert
with check (can_edit_content(organisation_id) or is_manager(organisation_id));

create policy sop_observations_write on public.sop_observations
for insert
with check (is_manager(organisation_id));

-- 3. profiles_write: recognise a content editor acting org-wide (matches
-- canAssignRoles in job-roles/actions.ts) and an hr_manager-flagged account
-- without a manager access_tier, at their own service (matches canManageContractFor
-- and friends). The access_tier <> 'admin' / = 'staff' guards mirror the
-- original policy's intent: nobody but an admin can create or touch an admin
-- account through this path.
drop policy if exists profiles_write on public.profiles;

create policy profiles_write on public.profiles
for all
using (
  is_admin(organisation_id)
  or can_edit_content(organisation_id)
  or (is_manager(organisation_id) and service_id = current_service())
  or (can_verify(organisation_id) and service_id = current_service())
)
with check (
  is_admin(organisation_id)
  or (can_edit_content(organisation_id) and access_tier <> 'admin')
  or (is_manager(organisation_id) and service_id = current_service() and access_tier = 'staff')
  or (can_verify(organisation_id) and service_id = current_service() and access_tier = 'staff')
);

-- A staff member signs their own contract: sets the signature fields only,
-- never the terms. Mirrors signOwnContract's own checks (own contract, not
-- superseded, not a deed, not already signed) so the same rule holds even if
-- called some other way in future.
create or replace function public.sign_own_contract(
  p_contract_id uuid,
  p_signed_name text,
  p_signed_content_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile_id uuid;
  v_superseded_at timestamptz;
  v_is_deed boolean;
  v_signed_at timestamptz;
begin
  select profile_id, superseded_at, is_deed, signed_at
    into v_profile_id, v_superseded_at, v_is_deed, v_signed_at
  from public.contracts
  where id = p_contract_id
  for update;

  if v_profile_id is null or v_profile_id <> v_uid then
    raise exception 'Contract not found.';
  end if;
  if v_superseded_at is not null then
    raise exception 'This contract has been replaced.';
  end if;
  if v_is_deed then
    raise exception 'This contract is a deed and is signed on paper, not in the portal.';
  end if;
  if v_signed_at is not null then
    return;
  end if;

  update public.contracts
  set signed_at = now(),
      signed_name = p_signed_name,
      signed_by = v_uid,
      signed_content_hash = p_signed_content_hash
  where id = p_contract_id;
end;
$$;

grant execute on function public.sign_own_contract(uuid, text, text) to authenticated;

-- An HR manager or admin countersigns, independent of the employee slot -
-- gated the same as contracts_write (admin anywhere, or an hr_manager at the
-- worker's own service).
create or replace function public.countersign_contract(
  p_contract_id uuid,
  p_signed_name text,
  p_signed_content_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_profile_id uuid;
  v_superseded_at timestamptz;
  v_is_deed boolean;
  v_countersigned_at timestamptz;
begin
  select organisation_id, profile_id, superseded_at, is_deed, countersigned_at
    into v_org, v_profile_id, v_superseded_at, v_is_deed, v_countersigned_at
  from public.contracts
  where id = p_contract_id
  for update;

  if v_org is null then
    raise exception 'Contract not found.';
  end if;
  if not (public.is_admin(v_org) or (public.can_verify(v_org) and public.worker_service(v_profile_id) = public.current_service())) then
    raise exception 'You are not allowed to countersign contracts.';
  end if;
  if v_superseded_at is not null then
    raise exception 'This contract has been replaced.';
  end if;
  if v_is_deed then
    raise exception 'This contract is a deed and is signed on paper, not in the portal.';
  end if;
  if v_countersigned_at is not null then
    return;
  end if;

  update public.contracts
  set countersigned_at = now(),
      countersigned_name = p_signed_name,
      countersigned_by = v_uid,
      countersigned_content_hash = p_signed_content_hash
  where id = p_contract_id;
end;
$$;

grant execute on function public.countersign_contract(uuid, text, text) to authenticated;

-- A manager flags (or clears) a SOP's needs_review state and optionally resets
-- the review clock, without gaining the ability to edit its content - that
-- stays behind can_edit_content() on sops_write. Mirrors logSopObservation's
-- own isManager() gate.
create or replace function public.flag_sop_needs_review(
  p_sop_id uuid,
  p_needs_review boolean,
  p_next_review_date date,
  p_updated_by uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organisation_id into v_org from public.sops where id = p_sop_id for update;
  if v_org is null then
    raise exception 'Procedure not found.';
  end if;
  if not public.is_manager(v_org) then
    raise exception 'Only a manager can update this.';
  end if;

  update public.sops
  set needs_review = p_needs_review,
      next_review_date = coalesce(p_next_review_date, next_review_date),
      updated_by = p_updated_by
  where id = p_sop_id;
end;
$$;

grant execute on function public.flag_sop_needs_review(uuid, boolean, date, uuid) to authenticated;
