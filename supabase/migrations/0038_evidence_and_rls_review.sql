-- 0038: Step 22 (outcome-evidence capture) plus the comprehensive RLS review
-- Zeke asked for after the many layers added in Steps 16 to 21.
--
-- Cross-tenant isolation was verified clean first: scripts/rls-check.mjs
-- assumes each of six identities (RSG admin / manager / staff, SK admin / staff,
-- and anon) and counts visible rows in all 38 public tables - no identity sees
-- any row outside its own organisation, and anon sees nothing. The changes
-- below close within-organisation over-exposure the review found.

-- ---------------------------------------------------------------------------
-- Step 22 schema
-- ---------------------------------------------------------------------------

-- A per-SOP hint shown to the manager at review time: what evidence would show
-- this procedure is working. Editable and removable. Content editors set it.
alter table public.sops
  add column if not exists suggested_evidence text;

-- An observation may carry one uploaded file as evidence. Stored in the same
-- locked-down documents store, owner_type 'sop_evidence'.
alter table public.sop_observations
  add column if not exists evidence_document_id uuid
    references public.documents(id) on delete set null;

alter table public.documents
  drop constraint if exists documents_owner_type_check;
alter table public.documents
  add constraint documents_owner_type_check
  check (owner_type in ('policy', 'sop', 'contract', 'credential', 'identity', 'sop_evidence'));

-- ---------------------------------------------------------------------------
-- RLS review fixes
-- ---------------------------------------------------------------------------

-- 1. documents_select was in_org for every owner_type, so any staff member
--    could read the extracted text, file name and storage path of colleagues'
--    contracts and identity documents. Policy and SOP documents stay
--    organisation-wide (their content is meant to be readable); the sensitive
--    owner types now match the visibility of the record they belong to.
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select using (
    public.in_org(organisation_id)
    and (
      owner_type in ('policy', 'sop')
      or (owner_type = 'contract' and exists (
        select 1 from public.contracts c
        where c.id = documents.owner_id
          and (c.profile_id = (select auth.uid())
               or public.covers_service(c.organisation_id,
                                        public.worker_service(c.profile_id)))
      ))
      or (owner_type = 'identity' and exists (
        select 1 from public.identity_documents d
        where d.id = documents.owner_id
          and (d.profile_id = (select auth.uid())
               or public.can_manage_worker(d.organisation_id,
                                           public.worker_service(d.profile_id)))
      ))
      or (owner_type in ('credential', 'sop_evidence')
          and public.is_manager(organisation_id))
    )
  );

-- 2. sign_offs_insert allowed a manager (covers_service) to create a sign-off
--    row for any staff member at their service - i.e. forge a staff member's
--    SOP sign-off, the core audit record. The app only ever inserts a person's
--    own sign-off; the manager countersignature is a separate UPDATE, which is
--    unchanged. Restrict inserts to the signer themselves.
drop policy if exists sign_offs_insert on public.sign_offs;
create policy sign_offs_insert on public.sign_offs
  for insert with check (
    public.in_org(organisation_id)
    and user_id = (select auth.uid())
  );

-- 3. Same reasoning for policy_views: a person records their own view. Update
--    and delete keep covers_service so a manager can still correct or clear one.
drop policy if exists policy_views_insert on public.policy_views;
create policy policy_views_insert on public.policy_views
  for insert with check (
    public.in_org(organisation_id)
    and user_id = (select auth.uid())
  );

-- 4. credentials is a schema-ready table with no rows and no UI. Its policy let
--    any manager read or write any credential in the organisation. Bring it in
--    line with the worker_* tables so it is already scoped if switched on.
drop policy if exists credentials_select on public.credentials;
drop policy if exists credentials_write on public.credentials;
create policy credentials_select on public.credentials
  for select using (
    user_id = (select auth.uid())
    or public.can_manage_worker(organisation_id, public.worker_service(user_id))
  );
create policy credentials_write on public.credentials
  for all using (
    public.can_manage_worker(organisation_id, public.worker_service(user_id))
  ) with check (
    public.can_manage_worker(organisation_id, public.worker_service(user_id))
  );

-- 5. notification_rules is also schema-ready with no UI. Writing rules should be
--    an admin action; reading stays open to managers.
drop policy if exists notification_rules_all on public.notification_rules;
create policy notification_rules_select on public.notification_rules
  for select using (public.is_manager(organisation_id));
create policy notification_rules_write on public.notification_rules
  for all using (public.is_admin(organisation_id))
  with check (public.is_admin(organisation_id));
