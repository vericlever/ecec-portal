-- 0006_policy_views.sql
-- A lightweight "I have viewed this policy" record, deliberately weaker than SOP
-- sign-off.
--
-- SOPs are trained on and signed off (sign_offs: comprehension checks, optional
-- supervisor verification). Policies are not signed off. But staff still need to
-- be shown policies, especially parent-facing ones and updated ones, and an
-- auditor may ask for evidence that they were. policy_views is that evidence:
-- a record that a given policy version was opened, nothing more.
--
-- Versioned like sign_offs. A policy edit bumps policies.current_version, which
-- makes an earlier view stale and a re-view due.

create table public.policy_views (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  user_id uuid not null,
  policy_id uuid not null,
  policy_version integer not null,
  viewed_at timestamptz not null default now(),
  foreign key (user_id, organisation_id)
    references public.profiles(id, organisation_id) on delete cascade,
  foreign key (policy_id, organisation_id)
    references public.policies(id, organisation_id) on delete cascade,
  -- One view record per staff member per policy version. Re-viewing a new
  -- version adds a row.
  unique (user_id, policy_id, policy_version)
);

create index policy_views_organisation_id_idx on public.policy_views (organisation_id);
create index policy_views_policy_id_idx on public.policy_views (policy_id);
create index policy_views_user_id_idx on public.policy_views (user_id);
create index policy_views_site_id_idx on public.policy_views (site_id);

-- RLS: same shape as sign_offs. Any organisation member reads their
-- organisation's view records; a staff member records their own view; admins may
-- act for anyone in the organisation; only admins delete.
alter table public.policy_views enable row level security;

create policy policy_views_select on public.policy_views
  for select using (public.has_org_access(organisation_id));

create policy policy_views_insert on public.policy_views
  for insert
  with check (
    public.has_org_access(organisation_id)
    and (user_id = (select auth.uid()) or public.has_org_admin_access(organisation_id))
  );

create policy policy_views_update on public.policy_views
  for update
  using (public.has_org_access(organisation_id))
  with check (
    public.has_org_access(organisation_id)
    and (user_id = (select auth.uid()) or public.has_org_admin_access(organisation_id))
  );

create policy policy_views_delete on public.policy_views
  for delete using (public.has_org_admin_access(organisation_id));
