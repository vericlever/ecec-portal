-- 0093_multi_service_reach.sql
--
-- A manager or HR manager's reach was a single nullable profiles.service_id,
-- which cannot express "every service, including ones added later" or "these
-- two services, not just one" - it also cannot be null for that purpose,
-- since migration 0014 already gave service_id = null its own meaning
-- (unassigned, admin-only-visible). That gap is why an HR manager whose job
-- covers both Ready Set Go services could still only see staff at one of
-- them: the "all services" option in the staff form just set service_id to
-- null, which profiles_select and covers_service both treat as "unassigned",
-- not "everywhere".
--
-- This adds an explicit, additive way to grant broader reach without
-- overloading service_id again:
--   * profiles.all_services - true for someone whose reach spans every
--     service in their organisation, including ones added later.
--   * staff_service_assignments - explicit extra services (beyond
--     profiles.service_id) a person is assigned to, for the "these specific
--     services, not all" case.
-- Both apply uniformly to every access tier, but only feed into manager/HR
-- reach over OTHER people's records (covers_service, reaches_service) for
-- manager_staff/manager_policy/admin tiers, exactly as before - a plain
-- staff-tier account with several assigned services only ever gets the
-- training/policy content for those services, never visibility into anyone
-- else's record. profiles.service_id is unchanged as the "home service" used
-- for badges and as the default single-service case.

alter table public.profiles
  add column all_services boolean not null default false;

comment on column public.profiles.all_services is
  'Reach spans every service in the organisation, including ones added later. Independent of job role and of the hr_manager flag - set by an admin on the staff record.';

create table public.staff_service_assignments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  profile_id uuid not null,
  service_id uuid not null,
  created_at timestamptz not null default now(),
  unique (profile_id, service_id),
  foreign key (profile_id, organisation_id)
    references public.profiles(id, organisation_id) on delete cascade,
  foreign key (service_id, organisation_id)
    references public.services(id, organisation_id) on delete cascade
);

comment on table public.staff_service_assignments is
  'Explicit extra services a person is assigned to, beyond profiles.service_id (their home service). Lets a person''s reach or applicable content span a named subset of services without setting all_services.';

create index staff_service_assignments_organisation_id_idx
  on public.staff_service_assignments (organisation_id);
create index staff_service_assignments_profile_id_idx
  on public.staff_service_assignments (profile_id);

alter table public.staff_service_assignments enable row level security;

-- Which service(s) someone is assigned to is not sensitive HR content (unlike
-- payroll or screening) - any manager in the organisation may read it, the
-- same bar profiles.service_id itself is shown at elsewhere. Writing it is
-- admin-only, matching setHrManager/setStaffAccessTier's own gate for this
-- kind of account-configuration change.
create policy staff_service_assignments_select on public.staff_service_assignments
  for select using (
    profile_id = (select auth.uid())
    or public.is_manager(organisation_id)
  );
create policy staff_service_assignments_write on public.staff_service_assignments
  for all using (public.is_admin(organisation_id))
  with check (public.is_admin(organisation_id));

-- A person's full reach set: their home service, every service if
-- all_services is set, or an explicit extra assignment - used both for a
-- manager's reach into OTHER people's records (via covers_service) and,
-- separately in application code, for which site-scoped policies apply to
-- the person themselves.
create or replace function public.reaches_service(target_service uuid)
returns boolean language sql stable set search_path = '' as $$
  select target_service is not null
     and exists (
       select 1 from public.profiles p
       where p.id = (select auth.uid())
         and (
           p.all_services
           or p.service_id = target_service
           or exists (
             select 1 from public.staff_service_assignments a
             where a.profile_id = p.id and a.service_id = target_service
           )
         )
     );
$$;

grant execute on function public.reaches_service(uuid) to authenticated, anon;

-- covers_service and can_manage_worker now go through reaches_service instead
-- of a bare "= current_service()" comparison, so every existing caller
-- (sign_offs, policy_views, worker_details, the onboarding document tables,
-- contracts, HR agreements, parent portal access, evidence) picks up
-- all_services / staff_service_assignments reach automatically.
create or replace function public.covers_service(target_org uuid, target_service uuid)
returns boolean language sql stable set search_path = '' as $$
  select public.is_admin(target_org)
      or (public.is_manager(target_org) and public.reaches_service(target_service));
$$;

create or replace function public.can_manage_worker(
  target_org uuid,
  target_service uuid
)
returns boolean language sql stable set search_path = '' as $$
  select public.covers_service(target_org, target_service)
      or (public.can_verify(target_org) and public.reaches_service(target_service));
$$;

-- profiles_select's manager branch reused a bare current_service() comparison
-- rather than covers_service - bring it onto the same, now reach-aware, check.
-- Unassigned target rows (service_id is null) keep their existing behaviour:
-- visible to a manager, same as before this migration.
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    id = (select auth.uid())
    or public.is_admin(organisation_id)
    or (public.is_manager(organisation_id)
        and access_tier <> 'admin'
        and (service_id is null or public.covers_service(organisation_id, service_id)))
  );

-- profiles_insert/profiles_update (migration 0053) had the same bare
-- "service_id = current_service()" comparison, for both the manager and the
-- can_verify (HR manager) branch - an HR manager granted all_services or an
-- extra assignment could still only create or edit staff-tier accounts at
-- their single home service. Every other clause is unchanged from 0053.
drop policy profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
for insert
with check (
  is_admin(organisation_id)
  or (can_edit_content(organisation_id) and access_tier <> 'admin')
  or (public.covers_service(organisation_id, service_id) and access_tier = 'staff')
  or (can_verify(organisation_id) and public.reaches_service(service_id) and access_tier = 'staff')
);

drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles
for update
using (
  is_admin(organisation_id)
  or can_edit_content(organisation_id)
  or public.covers_service(organisation_id, service_id)
  or (can_verify(organisation_id) and public.reaches_service(service_id))
)
with check (
  is_admin(organisation_id)
  or (can_edit_content(organisation_id) and access_tier <> 'admin')
  or (public.covers_service(organisation_id, service_id) and access_tier = 'staff')
  or (can_verify(organisation_id) and public.reaches_service(service_id) and access_tier = 'staff')
);

-- contracts_write's can_verify branch (last redefined in migration 0063, for
-- the self-management lockout - preserved unchanged below) had its own
-- inline "= current_service()" check, bypassing covers_service/
-- can_manage_worker entirely - an HR manager granted all_services or an
-- extra assignment could still only manage contracts at their single home
-- service.
drop policy contracts_write on public.contracts;
create policy contracts_write on public.contracts
  for all
  using (
    public.is_admin(organisation_id)
    or (
      public.can_verify(organisation_id)
      and public.reaches_service(public.worker_service(profile_id))
      and profile_id <> (select auth.uid())
    )
  )
  with check (
    public.is_admin(organisation_id)
    or (
      public.can_verify(organisation_id)
      and public.reaches_service(public.worker_service(profile_id))
      and profile_id <> (select auth.uid())
    )
  );

-- can_manage_hr (migration 0030) gates worker_payroll/worker_screening/
-- worker_referees - the sensitive tail of onboarding. Same bare
-- "= current_service()" comparison as can_manage_worker had; every policy
-- built on this function picks up the fix automatically, same as
-- covers_service's callers above.
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
      or (public.can_verify(target_org) and public.reaches_service(target_service));
$$;

-- profile_job_roles (migration 0054) is written by two different app-level
-- gates (setStaffJobRoles, and assignStaffToRole/removeStaffFromRole) that
-- both now use reachesService - this RLS policy is what actually enforces
-- it, and had the same bare current_service() comparisons. An over-permissive
-- app check here would otherwise pass and then silently write zero rows, the
-- same failure shape this table's own migration comment already calls out.
drop policy profile_job_roles_select on public.profile_job_roles;
create policy profile_job_roles_select on public.profile_job_roles
for select using (
  profile_id = (select auth.uid())
  or public.is_admin(organisation_id)
  or (
    public.is_manager(organisation_id)
    and exists (
      select 1 from public.profiles pr
      where pr.id = profile_id
        and (pr.service_id is null or public.covers_service(organisation_id, pr.service_id))
    )
  )
);

drop policy profile_job_roles_write on public.profile_job_roles;
create policy profile_job_roles_write on public.profile_job_roles
for all using (
  public.is_admin(organisation_id)
  or public.can_edit_content(organisation_id)
  or (
    public.can_verify(organisation_id)
    and exists (
      select 1 from public.profiles pr
      where pr.id = profile_id and public.reaches_service(pr.service_id)
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
        where pr.id = profile_id and public.reaches_service(pr.service_id)
      )
    )
  )
);

-- documents_write (last redefined in migration 0082) has its own inline
-- "= current_service()" checks for the 'contract' and 'signature'/
-- 'signed_copy' owner types, bypassing can_verify/reaches_service same as
-- contracts_write did above. documents_select already goes through
-- covers_service/can_manage_worker and needs no change.
drop policy documents_write on public.documents;
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
            or (can_verify(c.organisation_id) and public.reaches_service(worker_service(c.profile_id)))
          )
      )
    )
    or (
      owner_type in ('signature', 'signed_copy')
      and exists (
        select 1 from public.contracts c
        where c.id = documents.owner_id
          and (
            c.profile_id = (select auth.uid())
            or is_admin(c.organisation_id)
            or (can_verify(c.organisation_id) and public.reaches_service(worker_service(c.profile_id)))
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
            or (can_verify(c.organisation_id) and public.reaches_service(worker_service(c.profile_id)))
          )
      )
    )
    or (
      owner_type in ('signature', 'signed_copy')
      and exists (
        select 1 from public.contracts c
        where c.id = documents.owner_id
          and (
            c.profile_id = (select auth.uid())
            or is_admin(c.organisation_id)
            or (can_verify(c.organisation_id) and public.reaches_service(worker_service(c.profile_id)))
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

-- countersign_contract (last redefined in migration 0082, the 4-argument
-- version the app actually calls) had the same inline check as
-- contracts_write/documents_write above.
create or replace function public.countersign_contract(
  p_contract_id uuid,
  p_signed_name text,
  p_signed_content_hash text,
  p_signature_document_id uuid default null
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
  if v_profile_id = v_uid then
    raise exception 'You cannot countersign your own contract.';
  end if;
  if not (public.is_admin(v_org) or (public.can_verify(v_org) and public.reaches_service(public.worker_service(v_profile_id)))) then
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
      countersigned_content_hash = p_signed_content_hash,
      countersigned_signature_document_id = p_signature_document_id
  where id = p_contract_id;
end;
$$;

-- set_contract_signed_copy (migration 0083) had the same inline check.
create or replace function public.set_contract_signed_copy(
  p_contract_id uuid,
  p_signed_copy_document_id uuid,
  p_signed_copy_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_profile_id uuid;
begin
  select organisation_id, profile_id into v_org, v_profile_id
  from public.contracts
  where id = p_contract_id
  for update;

  if v_org is null then
    raise exception 'Contract not found.';
  end if;
  if not (
    v_profile_id = (select auth.uid())
    or public.is_admin(v_org)
    or (public.can_verify(v_org) and public.reaches_service(public.worker_service(v_profile_id)))
  ) then
    raise exception 'Not allowed.';
  end if;

  update public.contracts
  set signed_copy_document_id = p_signed_copy_document_id,
      signed_copy_hash = p_signed_copy_hash,
      signed_copy_generated_at = now()
  where id = p_contract_id;
end;
$$;
