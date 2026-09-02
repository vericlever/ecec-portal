-- 0029_hr_agreements.sql
--
-- Step 17. Agreements a staff member reads and signs: Code of Conduct,
-- Confidentiality Agreement, Uniform Receipt, Individual Flexibility Agreement,
-- Training Agreement, and plain attestations. Published and versioned like an
-- SOP: a working body, then a published snapshot; re-publishing makes prior
-- signatures stale. Plus contract signing on the contract row itself.

create table public.hr_agreements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  body text,
  published_version integer,
  published_body text,
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete set null,
  linked_policy_id uuid references public.policies(id) on delete set null,
  all_staff boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, name),
  unique (id, organisation_id)
);

comment on column public.hr_agreements.published_version is
  'Null until first published. Bumped on each publish; a new value makes every prior signature stale so staff must re-sign.';
comment on column public.hr_agreements.all_staff is
  'true: every worker must sign. false: only workers in a listed job role (hr_agreement_job_roles) must sign, e.g. a trainee training agreement.';

create trigger hr_agreements_set_updated_at
  before update on public.hr_agreements
  for each row execute function public.set_updated_at();

-- Which job roles must sign, when all_staff is false.
create table public.hr_agreement_job_roles (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  agreement_id uuid not null,
  job_role_id uuid not null,
  primary key (agreement_id, job_role_id),
  foreign key (agreement_id, organisation_id)
    references public.hr_agreements(id, organisation_id) on delete cascade,
  foreign key (job_role_id, organisation_id)
    references public.job_roles(id, organisation_id) on delete cascade
);

-- One signature per staff member per agreement version.
create table public.hr_agreement_signoffs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  agreement_id uuid not null,
  user_id uuid not null,
  service_id uuid references public.services(id) on delete set null,
  agreement_version integer not null,
  signed_at timestamptz not null default now(),
  foreign key (agreement_id, organisation_id)
    references public.hr_agreements(id, organisation_id) on delete cascade,
  foreign key (user_id, organisation_id)
    references public.profiles(id, organisation_id) on delete cascade,
  unique (agreement_id, user_id, agreement_version)
);

create index hr_agreement_signoffs_user_idx
  on public.hr_agreement_signoffs (user_id);
create index hr_agreement_signoffs_agreement_idx
  on public.hr_agreement_signoffs (agreement_id, agreement_version);

-- Contract signing: the staff member reads the executed document and accepts it
-- in the tool. A superseded contract keeps whatever signature it had; a newly
-- uploaded contract starts unsigned.
alter table public.contracts
  add column signed_at timestamptz,
  add column signed_name text;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.hr_agreements enable row level security;
alter table public.hr_agreement_job_roles enable row level security;
alter table public.hr_agreement_signoffs enable row level security;

-- Templates: readable org-wide (staff need the published ones), authored by
-- content editors, the same as SOPs and policies.
create policy hr_agreements_select on public.hr_agreements
  for select using (public.in_org(organisation_id));
create policy hr_agreements_write on public.hr_agreements
  for all using (public.can_edit_content(organisation_id))
  with check (public.can_edit_content(organisation_id));

create policy hr_agreement_job_roles_select on public.hr_agreement_job_roles
  for select using (public.in_org(organisation_id));
create policy hr_agreement_job_roles_write on public.hr_agreement_job_roles
  for all using (public.can_edit_content(organisation_id))
  with check (public.can_edit_content(organisation_id));

-- Signatures: you see and write your own; managers and HR see their service;
-- admins across the organisation. Only the person signs for themselves.
create policy hr_agreement_signoffs_select on public.hr_agreement_signoffs
  for select using (
    user_id = (select auth.uid())
    or public.covers_service(organisation_id, service_id)
  );
create policy hr_agreement_signoffs_insert on public.hr_agreement_signoffs
  for insert with check (
    public.in_org(organisation_id)
    and user_id = (select auth.uid())
  );
create policy hr_agreement_signoffs_delete on public.hr_agreement_signoffs
  for delete using (public.covers_service(organisation_id, service_id));
