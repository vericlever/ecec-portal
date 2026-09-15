-- 0067_parent_portal_access.sql
--
-- One shared access code per service, gating a new public (no-login) page
-- that lists that service's parent-facing policies as downloads. The code is
-- deliberately a low-friction shared secret (a "door code" any parent at that
-- centre is given), not a per-parent credential - so it is stored in plain
-- text, unlike a password, because Managers and Admins need to be able to
-- look it up and read it back at any time, not just at creation.
--
-- The parent-facing read path (verifying the code, listing policies,
-- issuing a download) is NOT implemented as anon-role RLS on policies/
-- documents - see the app-code comments in src/lib/parent-access.ts for why.
-- This table's own RLS is the real, ordinary RLS: it protects the *staff*
-- side (who may view or reset a service's code), the same way every other
-- admin-facing table in this schema is protected.

create table public.service_parent_access (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  unique (service_id),
  unique (id, organisation_id)
);

comment on table public.service_parent_access is
  'One shared access code per service, gating the public /parent/[serviceId] page. A low-friction shared secret (like a noticeboard door code), not a per-parent login - staff can view it at any time, so it is plain text rather than hashed. Do not treat it as a password.';
comment on column public.service_parent_access.code is
  'The code parents enter. Viewable by any Manager or Admin covering this service; only an Admin may generate or reset it.';
comment on column public.service_parent_access.updated_by is
  'Who last generated or reset this code, for the admin UI''s "last changed" line.';

create index service_parent_access_organisation_id_idx
  on public.service_parent_access (organisation_id);

create trigger service_parent_access_set_updated_at
  before update on public.service_parent_access
  for each row execute function public.set_updated_at();

alter table public.service_parent_access enable row level security;

-- View: a Manager (either kind) covering this service, or an Admin (any
-- service in the org). Write: Admin only, per Zeke's explicit instruction -
-- viewing is Manager+Admin, resetting is Admin only.
create policy service_parent_access_select on public.service_parent_access
  for select using (public.covers_service(organisation_id, service_id));
create policy service_parent_access_write on public.service_parent_access
  for all using (public.is_admin(organisation_id))
  with check (public.is_admin(organisation_id));
