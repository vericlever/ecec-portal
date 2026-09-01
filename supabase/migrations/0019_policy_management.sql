-- 0019_policy_management.sql
--
-- Step 6. Turns the policy inventory (names + flags, imported for RSG with no
-- body) into a managed library: upload a document, extract its text, publish a
-- version, and let staff view it (a view is an open, never a sign-off).

-- ---------------------------------------------------------------------------
-- 1. Generic document store. One row per uploaded file, polymorphic owner, so
--    contracts (Step 11), credential evidence and SOP source docs reuse it.
--    The bytes live in the private Supabase Storage bucket 'documents'.
-- ---------------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  owner_type text not null check (owner_type in ('policy', 'sop', 'contract', 'credential')),
  owner_id uuid not null,
  file_name text not null,
  mime_type text,
  byte_size integer,
  storage_path text not null,
  extracted_text text,
  extraction_note text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index documents_owner_idx on public.documents (owner_type, owner_id);
create index documents_organisation_id_idx on public.documents (organisation_id);

alter table public.documents enable row level security;

-- Metadata is readable org-wide; the file bytes are only ever served through a
-- route that re-checks the caller against the owner. Writes: content editors.
create policy documents_select on public.documents
  for select using (public.in_org(organisation_id));
create policy documents_write on public.documents
  for all using (public.can_edit_content(organisation_id))
  with check (public.can_edit_content(organisation_id));

-- ---------------------------------------------------------------------------
-- 2. Policy publish and versioning. `body` is the working copy an editor
--    changes freely; publishing snapshots it to `published_body` and bumps
--    `published_version`. Staff only ever see the published snapshot.
-- ---------------------------------------------------------------------------

alter table public.policies
  add column published_version integer,
  add column published_at timestamptz,
  add column published_body text,
  add column published_by uuid references public.profiles(id) on delete set null,
  add column source_document_id uuid references public.documents(id) on delete set null,
  add column updated_by uuid references public.profiles(id) on delete set null;

comment on column public.policies.published_version is
  'Null until first published. Bumped on each publish; a new value makes every prior policy_view stale so staff must re-view.';

-- ---------------------------------------------------------------------------
-- 3. Targeting. No audience rows for a policy => every staff member sees it
--    (the current "all staff, all policies" default). Rows present => a staff
--    member sees it if ANY row matches their job role and service. The site
--    scope already on policies.service_id is enforced on top of this.
-- ---------------------------------------------------------------------------

create table public.policy_audiences (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  policy_id uuid not null,
  job_role_id uuid,
  service_id uuid,
  created_at timestamptz not null default now(),
  foreign key (policy_id, organisation_id)
    references public.policies(id, organisation_id) on delete cascade,
  foreign key (job_role_id, organisation_id)
    references public.job_roles(id, organisation_id) on delete cascade,
  foreign key (service_id, organisation_id)
    references public.services(id, organisation_id) on delete cascade,
  unique (policy_id, job_role_id, service_id)
);

create index policy_audiences_policy_id_idx on public.policy_audiences (policy_id);

alter table public.policy_audiences enable row level security;
create policy policy_audiences_select on public.policy_audiences
  for select using (public.in_org(organisation_id));
create policy policy_audiences_write on public.policy_audiences
  for all using (public.can_edit_content(organisation_id))
  with check (public.can_edit_content(organisation_id));

-- Seed audiences from any policy that already carries a site scope, so the
-- targeting table is the single source of truth for "who sees this".
insert into public.policy_audiences (organisation_id, policy_id, job_role_id, service_id)
select organisation_id, id, null, service_id
from public.policies
where service_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Visibility for the current user. SECURITY DEFINER so it can read the
--    caller's profile and the audience rows without recursing through RLS.
-- ---------------------------------------------------------------------------

create or replace function public.policy_visible(p_policy uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select job_role_id, service_id
    from public.profiles
    where id = (select auth.uid())
  ),
  pol as (
    select service_id as pol_service
    from public.policies
    where id = p_policy
  )
  select
    -- site scope on the policy itself
    (
      (select pol_service from pol) is null
      or (select pol_service from pol) = (select service_id from me)
    )
    and
    -- audience targeting
    (
      not exists (
        select 1 from public.policy_audiences where policy_id = p_policy
      )
      or exists (
        select 1
        from public.policy_audiences a
        cross join me
        where a.policy_id = p_policy
          and (a.job_role_id is null or a.job_role_id = me.job_role_id)
          and (a.service_id is null or a.service_id = me.service_id)
      )
    );
$$;

grant execute on function public.policy_visible(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Tighten policies_select: content editors see everything in their org;
--    everyone else sees only published policies that target them.
-- ---------------------------------------------------------------------------

drop policy policies_select on public.policies;
create policy policies_select on public.policies
  for select using (
    public.can_edit_content(organisation_id)
    or (
      public.in_org(organisation_id)
      and published_version is not null
      and public.policy_visible(id)
    )
  );
