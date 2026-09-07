-- Step 21: SOP practice observation record. A manager watches a procedure being
-- carried out over a review cycle and records what they saw, plus an outcome
-- tag. A needs-review outcome raises a flag on the SOP that a content editor
-- resolves by publishing a new version or recording a review. The flag also
-- feeds the Step 27 heatmap.

create table if not exists public.sop_observations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  sop_id uuid not null references public.sops(id) on delete cascade,
  observed_by_profile_id uuid references public.profiles(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  evidence text not null,
  outcome text not null check (outcome in ('needs_review', 'continue_as_is')),
  review_clock_reset boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists sop_observations_sop
  on public.sop_observations (sop_id, created_at desc);
create index if not exists sop_observations_org
  on public.sop_observations (organisation_id, created_at desc);

alter table public.sop_observations enable row level security;

-- Any manager tier (and Admin) in the organisation may read observations.
-- Writes are service-role only; the log action gates on is_manager in code.
drop policy if exists sop_observations_read on public.sop_observations;
create policy sop_observations_read on public.sop_observations
  for select using (public.is_manager(organisation_id));

-- The needs-review flag lives on the SOP so the list, editor and heatmap can
-- all read it cheaply.
alter table public.sops
  add column if not exists needs_review boolean not null default false;

comment on column public.sops.needs_review is
  'Raised by a Step 21 practice observation tagged needs_review. Cleared when a new version is published or a review is recorded.';
