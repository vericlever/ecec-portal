-- 0055_sop_outcome_flags.sql
--
-- Build addendum, "My Outcomes": a staff member can flag one of their
-- assigned procedures with a reflection on child outcomes, for a manager to
-- see. Per Zeke's direction this feeds into the existing review cycle
-- (migration 0046) rather than standing as its own inbox: a flag is pending
-- until the next review of that procedure is submitted, at which point
-- submitReview() (review/actions.ts) marks it resolved and links it to that
-- review. Managers see pending flags both on the procedure's own review page
-- and as a standing count on the admin overview, so a flag is never only
-- visible if a manager happens to already be looking at that one procedure.

create table public.sop_outcome_flags (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  sop_id uuid not null references public.sops(id) on delete cascade,
  flagged_by uuid not null references public.profiles(id) on delete cascade,
  reflection text not null,
  created_at timestamptz not null default now(),
  resolved_review_id uuid references public.sop_reviews(id) on delete set null,
  resolved_at timestamptz
);

create index sop_outcome_flags_sop_id_idx on public.sop_outcome_flags(sop_id);
create index sop_outcome_flags_org_open_idx on public.sop_outcome_flags(organisation_id)
  where resolved_at is null;

alter table public.sop_outcome_flags enable row level security;

-- Read: the person who raised it, or any manager/admin in the org - reviews
-- are organisation-level (migration 0046), not per-service, so this is not
-- scoped to a service the way most staff-record tables are.
create policy sop_outcome_flags_select on public.sop_outcome_flags
for select using (
  flagged_by = (select auth.uid())
  or public.is_admin(organisation_id)
  or public.is_manager(organisation_id)
);

-- Write: any org member raises a flag as themselves - this is feedback, not
-- a privileged action, so the gate is "you're in this org", not a tier
-- check. The app layer additionally confirms the procedure is one of the
-- caller's own assigned procedures before calling this.
create policy sop_outcome_flags_insert on public.sop_outcome_flags
for insert
with check (
  flagged_by = (select auth.uid())
  and public.in_org(organisation_id)
  and exists (select 1 from public.sops s where s.id = sop_id and s.organisation_id = organisation_id)
);

-- Resolve (set resolved_review_id/resolved_at): manager or admin only - this
-- is submitReview()'s job, not the person who raised the flag.
create policy sop_outcome_flags_update on public.sop_outcome_flags
for update using (
  public.is_admin(organisation_id) or public.is_manager(organisation_id)
)
with check (
  public.is_admin(organisation_id) or public.is_manager(organisation_id)
);
