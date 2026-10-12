-- Step 59, B7a: policy flags close the loop back to policy - the "back to
-- policy" (PDCA Act) stage, never called a policy outcome ("Outcomes" means
-- Kirkpatrick level 4). Cleared by a policy version publish (see BUILD_LOG.md,
-- Step 59 B2 confirmation: policies have no review event to complete instead).

create type public.policy_flag_source as enum ('manager', 'procedure_review');

create table public.policy_flags (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  policy_id uuid not null references public.policies(id) on delete cascade,
  note text not null,
  source public.policy_flag_source not null,
  sop_review_id uuid references public.sop_reviews(id) on delete set null,
  outcome_record_id uuid references public.outcome_records(id) on delete set null,
  raised_by uuid not null references public.profiles(id) on delete set null,
  raised_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_by_version int
);

create index policy_flags_policy_open_idx on public.policy_flags (policy_id) where cleared_at is null;
create index policy_flags_org_idx on public.policy_flags (organisation_id, raised_at desc);

alter table public.policy_flags enable row level security;

-- Staff never see policy flags (B7a) - manager/admin only, both read and write.
create policy policy_flags_select on public.policy_flags
  for select using (public.is_admin(organisation_id) or public.is_manager(organisation_id));

create policy policy_flags_insert on public.policy_flags
  for insert with check (
    (public.is_admin(organisation_id) or public.is_manager(organisation_id))
    and raised_by = (select auth.uid())
  );

-- Update: clearing a flag on publish, or on a procedure review's checkbox
-- flow attaching sop_review_id - always a manager/admin action.
create policy policy_flags_update on public.policy_flags
  for update using (public.is_admin(organisation_id) or public.is_manager(organisation_id))
  with check (public.is_admin(organisation_id) or public.is_manager(organisation_id));
