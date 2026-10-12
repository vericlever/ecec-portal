-- Step 59, B2: managers gain full discretion over review dates, reversing
-- Review cycle v2's rule that the date is only ever calculated. Procedures
-- and policies work identically - same column, same permissions, same log.
--
-- Also B7: trigger and reason on sop_reviews, set automatically and shown at
-- the top of the review form.

alter table public.sops add column review_date_override date;
alter table public.policies add column review_date_override date;

-- sop_review_status (0046, extended by 0049 with latest_decision) must
-- prefer the override when set. Reproduces 0049's exact shape (including the
-- lateral join for latest_decision) since CREATE OR REPLACE VIEW cannot drop
-- or reorder existing output columns - only next_review_date's definition
-- changes here. security_invoker kept, same reasoning as the original view.
create or replace view public.sop_review_status
with (security_invoker = true)
as
select
  s.id as sop_id,
  s.organisation_id,
  s.last_reviewed_at,
  coalesce(
    s.review_date_override,
    (coalesce(s.last_reviewed_at, s.published_at) + make_interval(months => s.review_period_months))::date
  ) as next_review_date,
  latest.decision as latest_decision
from public.sops s
left join lateral (
  select r.decision
  from public.sop_reviews r
  where r.sop_id = s.id
  order by r.reviewed_at desc
  limit 1
) latest on true;

create type public.review_date_item_type as enum ('sop', 'policy');

-- Every change writes a row here, shown to nobody - it exists purely so
-- "why did this review move?" always has an answer (B2).
create table public.review_date_changes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  item_type public.review_date_item_type not null,
  item_id uuid not null,
  old_date date,
  new_date date,
  changed_by uuid not null references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index review_date_changes_org_idx on public.review_date_changes (organisation_id, changed_at desc);
create index review_date_changes_item_idx on public.review_date_changes (item_type, item_id, changed_at desc);

alter table public.review_date_changes enable row level security;

-- Read: managers/admin only - this is an audit log, not user-facing (B2:
-- "Nothing is shown to the user").
create policy review_date_changes_select on public.review_date_changes
  for select using (public.is_admin(organisation_id) or public.is_manager(organisation_id));

-- Insert: the app writes one row per date change, attributed to whoever made
-- it - same manager-or-above gate as the change itself (anyone who can
-- complete a review can change the date, per B2).
create policy review_date_changes_insert on public.review_date_changes
  for insert with check (
    (public.is_admin(organisation_id) or public.is_manager(organisation_id))
    and changed_by = (select auth.uid())
  );

-- B7: trigger and reason on sop_reviews. Both nullable so existing rows are
-- untouched; every new review the app writes fills them.
alter table public.sop_reviews add column trigger text;
alter table public.sop_reviews add column reason text;
alter table public.sop_reviews add constraint sop_reviews_trigger_check
  check (trigger is null or trigger in ('scheduled', 'outcome_data', 'staff_feedback', 'management_decision'));

-- B7, action effectiveness: each action from the previous review gets a
-- one-tap verdict at the next review. effectiveness_review_id is the review
-- that GAVE the verdict (distinct from sop_review_actions.review_id, the
-- review that RAISED the action).
create type public.sop_review_action_effectiveness as enum ('worked', 'did_not_work', 'too_early');

alter table public.sop_review_actions add column effectiveness public.sop_review_action_effectiveness;
alter table public.sop_review_actions add column effectiveness_review_id uuid references public.sop_reviews(id) on delete set null;
alter table public.sop_review_actions add column effectiveness_by uuid references public.profiles(id) on delete set null;
alter table public.sop_review_actions add column effectiveness_at timestamptz;

-- B8: review_id on the 0055 staff flag table - sop_outcome_flags already has
-- resolved_review_id from 0055, which is the same thing, so no column needed.
comment on column public.sop_outcome_flags.resolved_review_id is
  'Doubles as Step 59''s "review_id on the staff flag table" (spec B8) - already present since 0055, no new column needed.';
